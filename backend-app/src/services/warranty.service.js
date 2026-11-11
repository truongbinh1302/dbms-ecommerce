const { getPool, sql } = require('../config/db.sql');

/*
  Bảo hành theo số serial.
  - Admin đăng ký serial cho một sản phẩm trong đơn đã giao/đang giao.
  - Ai cũng tra cứu được bằng serial, nhưng chỉ thấy tên sản phẩm và thời hạn,
    không thấy thông tin người mua.
  - Khách đăng nhập xem được danh sách bảo hành của các đơn của mình.
*/

const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,59}$/;
const WARRANTY_ORDER_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const normalizeSerial = (value) => {
  const serial = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return SERIAL_PATTERN.test(serial) ? serial : null;
};

/** Ngày dạng YYYY-MM-DD theo lịch (không giờ) để không lệch múi giờ khi lưu cột DATE. */
const toDateOnly = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const formatWarranty = (row) => {
  const endDate = toDateOnly(row.EndDate);
  const daysLeft = Number(row.DaysLeft);
  return {
    serialNumber: row.SerialNumber,
    productId: row.ProductID,
    productName: row.ProductName,
    productSlug: row.ProductSlug,
    startDate: toDateOnly(row.StartDate),
    endDate,
    status: daysLeft >= 0 ? 'active' : 'expired',
    daysLeft: Math.max(daysLeft, 0),
    ...(row.OrderCode !== undefined ? { orderId: row.OrderID, orderCode: row.OrderCode } : {}),
  };
};

const SELECT_WARRANTY = `
  SELECT w.SerialNumber, w.ProductID, w.StartDate, w.EndDate,
         p.Name AS ProductName, p.Slug AS ProductSlug,
         DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), w.EndDate) AS DaysLeft
  FROM Warranties w
  JOIN Products p ON p.ProductID = w.ProductID
`;

const lookupWarranty = async (rawSerial) => {
  const serial = normalizeSerial(rawSerial);
  if (!serial) throw createHttpError(400, 'Số serial không hợp lệ');

  const result = await new sql.Request(getPool())
    .input('serial', sql.NVarChar(60), serial)
    .query(`${SELECT_WARRANTY} WHERE w.SerialNumber = @serial`);

  const row = result.recordset[0];
  if (!row) throw createHttpError(404, 'Không tìm thấy thông tin bảo hành cho số serial này');
  return formatWarranty(row);
};

const getMyWarranties = async (userId) => {
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT w.SerialNumber, w.ProductID, w.StartDate, w.EndDate, w.OrderID,
             p.Name AS ProductName, p.Slug AS ProductSlug, o.OrderCode,
             DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), w.EndDate) AS DaysLeft
      FROM Warranties w
      JOIN Orders o ON o.OrderID = w.OrderID
      JOIN Products p ON p.ProductID = w.ProductID
      WHERE o.UserID = @userId
      ORDER BY w.EndDate DESC, w.SerialNumber
    `);
  return result.recordset.map(formatWarranty);
};

/**
 * Admin đăng ký bảo hành. Sản phẩm phải nằm trong đơn và đơn chưa huỷ;
 * số serial đăng ký cho một sản phẩm không vượt quá số lượng đã mua.
 */
const registerWarranty = async ({ serialNumber, orderId, productId, months, startDate, note } = {}) => {
  const serial = normalizeSerial(serialNumber);
  const order = Number(orderId);
  const product = Number(productId);
  const warrantyMonths = Number(months);

  if (!serial) throw createHttpError(400, 'Số serial gồm 4–60 ký tự chữ, số hoặc dấu gạch ngang');
  if (!Number.isInteger(order) || order <= 0 || !Number.isInteger(product) || product <= 0) {
    throw createHttpError(400, 'Cần orderId và productId hợp lệ');
  }
  if (!Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 120) {
    throw createHttpError(400, 'Thời hạn bảo hành từ 1 đến 120 tháng');
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
    throw createHttpError(400, 'startDate có dạng YYYY-MM-DD');
  }

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const check = await new sql.Request(transaction)
      .input('orderId', sql.Int, order)
      .input('productId', sql.Int, product)
      .query(`
        SELECT o.Status,
               (SELECT SUM(Quantity) FROM OrderItems WHERE OrderID = @orderId AND ProductID = @productId) AS Quantity,
               (SELECT COUNT(*) FROM Warranties WITH (UPDLOCK, HOLDLOCK)
                 WHERE OrderID = @orderId AND ProductID = @productId) AS Registered
        FROM Orders o
        WHERE o.OrderID = @orderId
      `);

    const row = check.recordset[0];
    if (!row) throw createHttpError(404, 'Không tìm thấy đơn hàng');
    if (!WARRANTY_ORDER_STATUSES.includes(row.Status)) {
      throw createHttpError(409, 'Chỉ đăng ký bảo hành cho đơn đã xác nhận và chưa huỷ');
    }
    if (!row.Quantity) throw createHttpError(400, 'Sản phẩm này không có trong đơn');
    if (Number(row.Registered) >= Number(row.Quantity)) {
      throw createHttpError(409, `Đơn chỉ có ${row.Quantity} sản phẩm này và đã đăng ký đủ serial`);
    }

    const result = await new sql.Request(transaction)
      .input('serial', sql.NVarChar(60), serial)
      .input('orderId', sql.Int, order)
      .input('productId', sql.Int, product)
      .input('months', sql.Int, warrantyMonths)
      .input('startDate', sql.NVarChar(10), startDate || null)
      .input('note', sql.NVarChar(300), note ? String(note).trim().slice(0, 300) : null)
      .query(`
        DECLARE @start DATE = COALESCE(TRY_CONVERT(DATE, @startDate, 23), CAST(SYSDATETIME() AS DATE));
        INSERT INTO Warranties (SerialNumber, ProductID, OrderID, StartDate, EndDate, Note)
        VALUES (@serial, @productId, @orderId, @start, DATEADD(DAY, -1, DATEADD(MONTH, @months, @start)), @note);
        ${SELECT_WARRANTY} WHERE w.SerialNumber = @serial;
      `);

    await transaction.commit();
    return formatWarranty(result.recordset[0]);
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // transaction đã kết thúc
    }
    if (/PK_Warranties|duplicate key/i.test(err.message)) {
      throw createHttpError(409, 'Số serial này đã được đăng ký');
    }
    throw err;
  }
};

module.exports = {
  normalizeSerial,
  lookupWarranty,
  getMyWarranties,
  registerWarranty,
};
