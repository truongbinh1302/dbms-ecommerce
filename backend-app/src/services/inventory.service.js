const { getPool, sql } = require('../config/db.sql');

/*
  Sổ kho.
  - Mọi thay đổi tồn kho đi qua changeStock / setStock để luôn có một dòng StockMovements
    ghi lý do (nhập, bán, huỷ đơn trả kho, điều chỉnh tay, hàng trả về, xuất đổi hàng) và tồn sau thay đổi.
  - Phiếu nhập kho: khoá các sản phẩm theo thứ tự ProductID (tránh deadlock với đơn hàng
    đang trừ kho), ghi phiếu + từng dòng + cộng tồn trong một transaction.
*/

const MOVEMENT_REASONS = ['opening', 'receipt', 'sale', 'cancel', 'adjust', 'return', 'exchange'];
const MAX_RECEIPT_LINES = 100;
const MAX_LINE_QUANTITY = 100000;
const MAX_UNIT_COST = 1e12;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const nullableInt = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * Cộng/trừ tồn kho một sản phẩm và ghi nhật ký trong cùng câu lệnh.
 * Chạy trong transaction của hàm gọi. Trả về tồn sau thay đổi (null nếu không có sản phẩm).
 * Tồn âm bị CHECK constraint CK_Products_Stock chặn.
 */
const changeStock = async (transaction, { productId, change, reason, orderId = null, receiptId = null, note = null, userId = null }) => {
  const result = await new sql.Request(transaction)
    .input('productId', sql.Int, Number(productId))
    .input('change', sql.Int, Number(change))
    .input('reason', sql.NVarChar(20), reason)
    .input('orderId', sql.Int, nullableInt(orderId))
    .input('receiptId', sql.Int, nullableInt(receiptId))
    .input('note', sql.NVarChar(300), note)
    .input('userId', sql.Int, nullableInt(userId))
    .query(`
      DECLARE @after TABLE (Stock INT);
      UPDATE Products
      SET Stock = Stock + @change,
          Version = Version + 1,
          UpdatedAt = GETDATE()
      OUTPUT INSERTED.Stock INTO @after
      WHERE ProductID = @productId;
      INSERT INTO StockMovements (ProductID, Change, StockAfter, Reason, OrderID, ReceiptID, Note, CreatedBy)
      SELECT @productId, @change, Stock, @reason, @orderId, @receiptId, @note, @userId FROM @after;
      SELECT Stock FROM @after;
    `);
  const row = result.recordset[0];
  return row ? Number(row.Stock) : null;
};

const cleanText = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

const validateReceipt = (payload) => {
  const supplier = cleanText(payload.supplier, 200);
  const note = cleanText(payload.note, 500) || null;
  if (!supplier) throw createHttpError(400, 'Vui lòng nhập tên nhà cung cấp');

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) throw createHttpError(400, 'Phiếu nhập cần ít nhất một sản phẩm');
  if (rawItems.length > MAX_RECEIPT_LINES) throw createHttpError(400, `Mỗi phiếu tối đa ${MAX_RECEIPT_LINES} dòng`);

  const seen = new Set();
  const items = rawItems.map((item, index) => {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    const unitCost = Number(item?.unitCost);
    const line = index + 1;
    if (!Number.isInteger(productId) || productId <= 0) throw createHttpError(400, `Dòng ${line}: chưa chọn sản phẩm`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw createHttpError(400, `Dòng ${line}: số lượng phải từ 1 đến ${MAX_LINE_QUANTITY}`);
    }
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > MAX_UNIT_COST) {
      throw createHttpError(400, `Dòng ${line}: giá nhập không hợp lệ`);
    }
    if (seen.has(productId)) throw createHttpError(400, `Dòng ${line}: sản phẩm bị lặp, hãy gộp số lượng vào một dòng`);
    seen.add(productId);
    return { productId, quantity, unitCost: Math.round(unitCost * 100) / 100 };
  });

  items.sort((a, b) => a.productId - b.productId);
  return { supplier, note, items };
};

const formatReceipt = (row) => ({
  id: row.ReceiptID,
  code: row.ReceiptCode,
  supplier: row.Supplier,
  note: row.Note,
  totalQuantity: Number(row.TotalQuantity),
  totalCost: Number(row.TotalCost),
  lineCount: row.LineCount === undefined ? undefined : Number(row.LineCount),
  createdBy: row.CreatedByName || null,
  createdAt: row.CreatedAt,
});

const getReceipt = async (receiptId) => {
  const id = Number(receiptId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(404, 'Không tìm thấy phiếu nhập');
  const pool = getPool();
  const head = await new sql.Request(pool)
    .input('id', sql.Int, id)
    .query(`
      SELECT r.ReceiptID, r.ReceiptCode, r.Supplier, r.Note, r.TotalQuantity, r.TotalCost, r.CreatedAt,
             u.FullName AS CreatedByName
      FROM StockReceipts r
      LEFT JOIN Users u ON u.UserID = r.CreatedBy
      WHERE r.ReceiptID = @id
    `);
  if (!head.recordset[0]) throw createHttpError(404, 'Không tìm thấy phiếu nhập');

  const lines = await new sql.Request(pool)
    .input('id', sql.Int, id)
    .query(`
      SELECT i.ProductID, p.Name, i.Quantity, i.UnitCost
      FROM StockReceiptItems i
      JOIN Products p ON p.ProductID = i.ProductID
      WHERE i.ReceiptID = @id
      ORDER BY p.Name
    `);

  return {
    ...formatReceipt(head.recordset[0]),
    items: lines.recordset.map((line) => ({
      productId: line.ProductID,
      productName: line.Name,
      quantity: Number(line.Quantity),
      unitCost: Number(line.UnitCost),
      lineTotal: Number(line.Quantity) * Number(line.UnitCost),
    })),
  };
};

/** Tạo phiếu nhập kho và cộng tồn cho từng sản phẩm, tất cả trong một transaction. */
const createReceipt = async (payload, adminId) => {
  const { supplier, note, items } = validateReceipt(payload || {});
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  const transaction = new sql.Transaction(getPool());
  await transaction.begin();
  let receiptId;
  try {
    const locked = await new sql.Request(transaction)
      .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(items.map((item) => item.productId)))
      .query(`
        SELECT p.ProductID, p.Name, p.IsDeleted
        FROM Products p WITH (UPDLOCK, ROWLOCK)
        WHERE p.ProductID IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))
        ORDER BY p.ProductID
      `);
    const found = new Map(locked.recordset.map((row) => [row.ProductID, row]));
    const missing = items.filter((item) => !found.has(item.productId) || found.get(item.productId).IsDeleted);
    if (missing.length) {
      throw createHttpError(400, 'Có sản phẩm không tồn tại hoặc đã ngừng bán', { productIds: missing.map((item) => item.productId) });
    }

    const head = await new sql.Request(transaction)
      .input('supplier', sql.NVarChar(200), supplier)
      .input('note', sql.NVarChar(500), note)
      .input('totalQuantity', sql.Int, totalQuantity)
      .input('totalCost', sql.Decimal(18, 2), totalCost)
      .input('userId', sql.Int, nullableInt(adminId))
      .query(`
        INSERT INTO StockReceipts (Supplier, Note, TotalQuantity, TotalCost, CreatedBy)
        OUTPUT INSERTED.ReceiptID
        VALUES (@supplier, @note, @totalQuantity, @totalCost, @userId)
      `);
    receiptId = head.recordset[0].ReceiptID;

    for (const item of items) {
      await new sql.Request(transaction)
        .input('receiptId', sql.Int, receiptId)
        .input('productId', sql.Int, item.productId)
        .input('quantity', sql.Int, item.quantity)
        .input('unitCost', sql.Decimal(18, 2), item.unitCost)
        .query(`
          INSERT INTO StockReceiptItems (ReceiptID, ProductID, Quantity, UnitCost)
          VALUES (@receiptId, @productId, @quantity, @unitCost)
        `);
      await changeStock(transaction, {
        productId: item.productId,
        change: item.quantity,
        reason: 'receipt',
        receiptId,
        userId: adminId,
      });
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }

  return getReceipt(receiptId);
};

const listReceipts = async ({ page = 1, limit = 20 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const result = await new sql.Request(getPool())
    .input('offset', sql.Int, (safePage - 1) * safeLimit)
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT r.ReceiptID, r.ReceiptCode, r.Supplier, r.Note, r.TotalQuantity, r.TotalCost, r.CreatedAt,
             u.FullName AS CreatedByName,
             (SELECT COUNT(*) FROM StockReceiptItems i WHERE i.ReceiptID = r.ReceiptID) AS LineCount,
             COUNT(*) OVER () AS TotalRows
      FROM StockReceipts r
      LEFT JOIN Users u ON u.UserID = r.CreatedBy
      ORDER BY r.ReceiptID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
  const total = Number(result.recordset[0]?.TotalRows || 0);
  return {
    receipts: result.recordset.map(formatReceipt),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  };
};

/** Nhật ký kho gần nhất, lọc theo sản phẩm và/hoặc lý do. */
const listMovements = async ({ productId = null, reason = null, limit = 50 } = {}) => {
  const id = productId === null || productId === undefined || productId === '' ? null : Number(productId);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) throw createHttpError(400, 'Mã sản phẩm không hợp lệ');
  if (reason && !MOVEMENT_REASONS.includes(reason)) throw createHttpError(400, 'Lý do không hợp lệ');
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const result = await new sql.Request(getPool())
    .input('productId', sql.Int, id)
    .input('reason', sql.NVarChar(20), reason || null)
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@limit) m.MovementID, m.ProductID, p.Name AS ProductName, m.Change, m.StockAfter, m.Reason,
             m.OrderID, o.OrderCode, m.ReceiptID, r.ReceiptCode, m.Note, m.CreatedAt, u.FullName AS CreatedByName
      FROM StockMovements m
      JOIN Products p ON p.ProductID = m.ProductID
      LEFT JOIN Orders o ON o.OrderID = m.OrderID
      LEFT JOIN StockReceipts r ON r.ReceiptID = m.ReceiptID
      LEFT JOIN Users u ON u.UserID = m.CreatedBy
      WHERE (@productId IS NULL OR m.ProductID = @productId)
        AND (@reason IS NULL OR m.Reason = @reason)
      ORDER BY m.MovementID DESC
    `);

  return result.recordset.map((row) => ({
    id: Number(row.MovementID),
    productId: row.ProductID,
    productName: row.ProductName,
    change: Number(row.Change),
    stockAfter: Number(row.StockAfter),
    reason: row.Reason,
    orderId: row.OrderID,
    orderCode: row.OrderCode,
    receiptId: row.ReceiptID,
    receiptCode: row.ReceiptCode,
    note: row.Note,
    createdBy: row.CreatedByName || null,
    createdAt: row.CreatedAt,
  }));
};

/**
 * Sản phẩm sắp hết (tồn <= threshold), kèm số đã bán 30 ngày qua và giá nhập gần nhất
 * để admin quyết định nhập thêm bao nhiêu.
 */
const listLowStock = async ({ threshold = 5, limit = 20 } = {}) => {
  const safeThreshold = Math.min(Math.max(Number.parseInt(threshold, 10) || 5, 0), 1000);
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const result = await new sql.Request(getPool())
    .input('threshold', sql.Int, safeThreshold)
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@limit) p.ProductID, p.Name, p.Brand, p.Stock, p.Price,
             ISNULL(sold.Units, 0) AS Sold30,
             lastReceipt.UnitCost AS LastUnitCost
      FROM Products p
      OUTER APPLY (
        SELECT SUM(oi.Quantity) AS Units
        FROM OrderItems oi
        JOIN Orders o ON o.OrderID = oi.OrderID
        WHERE oi.ProductID = p.ProductID
          AND o.Status <> N'cancelled'
          AND o.CreatedAt >= DATEADD(DAY, -30, SYSDATETIME())
      ) sold
      OUTER APPLY (
        SELECT TOP 1 i.UnitCost FROM StockReceiptItems i
        WHERE i.ProductID = p.ProductID ORDER BY i.ReceiptID DESC
      ) lastReceipt
      WHERE p.IsDeleted = 0 AND p.Stock <= @threshold
      ORDER BY p.Stock, ISNULL(sold.Units, 0) DESC, p.Name
    `);
  return {
    threshold: safeThreshold,
    items: result.recordset.map((row) => ({
      productId: row.ProductID,
      name: row.Name,
      brand: row.Brand,
      stock: Number(row.Stock),
      price: Number(row.Price),
      sold30: Number(row.Sold30),
      lastUnitCost: row.LastUnitCost === null || row.LastUnitCost === undefined ? null : Number(row.LastUnitCost),
    })),
  };
};

module.exports = {
  MOVEMENT_REASONS,
  listLowStock,
  changeStock,
  validateReceipt,
  createReceipt,
  getReceipt,
  listReceipts,
  listMovements,
};
