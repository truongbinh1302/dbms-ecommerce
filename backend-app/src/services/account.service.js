const crypto = require('crypto');
const { getPool, sql } = require('../config/db.sql');
const Review = require('../models/review.model');
const { hashPassword, comparePassword } = require('../utils/hash');
const { parseStoredAddress } = require('./address.service');

/*
  Quyền của chủ thể dữ liệu (Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15):
  - Tải bản sao dữ liệu cá nhân cửa hàng đang giữ (exportMyData).
  - Xoá tài khoản (deleteAccount): hồ sơ bị thay bằng giá trị vô danh, giỏ hàng và đánh giá bị xoá,
    báo giá bỏ liên kết. Đơn hàng giữ lại vì là chứng từ bán hàng phải lưu theo pháp luật kế toán, thuế.
*/

// Đơn chưa xong thì chưa cho xoá: cửa hàng còn cần liên lạc để giao hàng hoặc hoàn tiền.
const OPEN_ORDER_STATUSES = ['pending', 'pending_payment', 'confirmed', 'processing', 'shipped'];
const DELETED_NAME = 'Tài khoản đã xoá';

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/** Toàn bộ dữ liệu gắn với tài khoản, dạng JSON để khách tải về. Không gồm mật khẩu và token. */
const exportMyData = async (userId) => {
  const id = Number(userId);
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, id)
    .query(`
      SELECT UserID, FullName, Email, Phone, Address, Role, CreatedAt, UpdatedAt
      FROM Users WHERE UserID = @userId AND IsActive = 1;

      SELECT o.OrderID, o.OrderCode, o.Status, o.PaymentMethod, o.PaymentStatus, o.Subtotal, o.Discount,
             o.ShippingFee, o.Total, o.ShippingAddress, o.Note, o.QuoteCode, o.CreatedAt
      FROM Orders o WHERE o.UserID = @userId ORDER BY o.CreatedAt;

      SELECT oi.OrderID, oi.ProductID, p.Name AS ProductName, oi.Quantity, oi.UnitPrice
      FROM OrderItems oi
      JOIN Orders o ON o.OrderID = oi.OrderID
      JOIN Products p ON p.ProductID = oi.ProductID
      WHERE o.UserID = @userId
      ORDER BY oi.OrderID, oi.ProductID;

      SELECT ci.ProductID, p.Name AS ProductName, ci.Quantity, ci.UpdatedAt
      FROM CartItems ci JOIN Products p ON p.ProductID = ci.ProductID
      WHERE ci.UserID = @userId;

      SELECT Code, Title, ItemsJson, Subtotal, CreatedAt, ExpiresAt
      FROM BuildQuotes WHERE UserID = @userId ORDER BY CreatedAt;

      SELECT w.SerialNumber, w.ProductID, w.OrderID, w.StartDate, w.EndDate
      FROM Warranties w JOIN Orders o ON o.OrderID = w.OrderID
      WHERE o.UserID = @userId;

      SELECT vu.OrderID, v.Code AS VoucherCode, vu.UsedAt
      FROM VoucherUsages vu JOIN Vouchers v ON v.VoucherID = vu.VoucherID
      WHERE vu.UserID = @userId;

      SELECT Code, Type, Status, ServiceKind, OrderID, SerialNumber, ScheduledDate, TimeSlot, Address, ContactPhone,
             Description, DeviceInfo, EstimateLow, EstimateHigh, FinalPrice, CreatedAt, UpdatedAt
      FROM ServiceRequests WHERE UserID = @userId ORDER BY CreatedAt;

      SELECT w.ProductID, p.Name AS ProductName, w.PriceAtWatch, w.TargetPrice, w.CreatedAt
      FROM PriceWatches w JOIN Products p ON p.ProductID = w.ProductID WHERE w.UserID = @userId;

      SELECT Type, Title, Body, Link, IsRead, CreatedAt FROM Notifications WHERE UserID = @userId ORDER BY NotificationID;
    `);

  const [users, orders, orderItems, cart, quotes, warranties, vouchers, serviceRequests = [], priceWatches = [], notifications = []] = result.recordsets;
  const user = users[0];
  if (!user) throw createHttpError(404, 'Không tìm thấy tài khoản');

  let reviews = [];
  try {
    reviews = await Review.find({ userId: id }).select('productId rating title content createdAt').lean();
  } catch {
    reviews = null; // MongoDB không sẵn sàng: báo rõ trong file thay vì bỏ trống im lặng
  }

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.UserID,
      fullName: user.FullName,
      email: user.Email,
      phone: user.Phone,
      defaultShippingAddress: parseStoredAddress(user.Address),
      role: user.Role,
      createdAt: user.CreatedAt,
      updatedAt: user.UpdatedAt,
    },
    orders: orders.map((order) => ({
      ...order,
      ShippingAddress: parseJson(order.ShippingAddress),
      items: orderItems.filter((item) => item.OrderID === order.OrderID),
    })),
    cart,
    buildQuotes: quotes.map((quote) => ({ ...quote, ItemsJson: undefined, items: parseJson(quote.ItemsJson) })),
    warranties,
    voucherUsages: vouchers,
    serviceRequests: serviceRequests.map((request) => ({
      ...request,
      Address: parseJson(request.Address),
      DeviceInfo: parseJson(request.DeviceInfo),
    })),
    priceWatches,
    notifications,
    reviews: reviews === null ? 'Không đọc được đánh giá lúc xuất dữ liệu, vui lòng thử lại sau' : reviews,
  };
};

/**
 * Xoá tài khoản theo yêu cầu của chính khách hàng (cần nhập lại mật khẩu).
 * @returns {{ deleted: true, retainedOrders: number, reviewsDeleted: number|null }}
 */
const deleteAccount = async (userId, password) => {
  const id = Number(userId);
  if (!password) throw createHttpError(400, 'Vui lòng nhập mật khẩu để xác nhận');

  const pool = getPool();
  const userResult = await new sql.Request(pool)
    .input('userId', sql.Int, id)
    .query('SELECT UserID, Password, Role, IsActive FROM Users WHERE UserID = @userId');
  const user = userResult.recordset[0];
  if (!user || !user.IsActive) throw createHttpError(404, 'Không tìm thấy tài khoản');
  if (String(user.Role).toLowerCase() === 'admin') {
    throw createHttpError(403, 'Tài khoản quản trị không tự xoá được; hãy nhờ quản trị viên khác');
  }
  if (!(await comparePassword(String(password), user.Password))) {
    throw createHttpError(400, 'Mật khẩu không đúng');
  }

  // Mật khẩu ngẫu nhiên không ai biết, để tài khoản không thể đăng nhập lại.
  const unusableHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  const anonymousEmail = `deleted-${id}-${crypto.randomBytes(6).toString('hex')}@deleted.invalid`;

  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  let retainedOrders = 0;
  try {
    // Khoá dòng Users trước rồi mới đếm đơn đang mở. createOrder cũng khoá UPDLOCK dòng này,
    // nên đơn đặt cùng lúc hoặc đã xong trước (và bị đếm), hoặc chờ rồi thấy tài khoản đã khoá.
    const locked = await new sql.Request(transaction)
      .input('userId', sql.Int, id)
      .query(`
        SELECT UserID FROM Users WITH (UPDLOCK, ROWLOCK) WHERE UserID = @userId AND IsActive = 1;
        SELECT
          SUM(CASE WHEN Status IN (${OPEN_ORDER_STATUSES.map((status) => `'${status}'`).join(', ')}) THEN 1 ELSE 0 END) AS OpenOrders,
          COUNT(*) AS AllOrders
        FROM Orders WHERE UserID = @userId;
      `);
    if (!locked.recordsets[0][0]) throw createHttpError(404, 'Không tìm thấy tài khoản');
    const counts = locked.recordsets[1][0];
    if (Number(counts.OpenOrders) > 0) {
      throw createHttpError(
        409,
        `Bạn còn ${counts.OpenOrders} đơn hàng chưa hoàn tất. Hãy chờ giao xong hoặc huỷ đơn trước khi xoá tài khoản.`,
        { code: 'open_orders', openOrders: Number(counts.OpenOrders) },
      );
    }
    retainedOrders = Number(counts.AllOrders);

    await new sql.Request(transaction)
      .input('userId', sql.Int, id)
      .input('name', sql.NVarChar(200), DELETED_NAME)
      .input('email', sql.NVarChar(200), anonymousEmail)
      .input('password', sql.NVarChar(255), unusableHash)
      .query(`
        DELETE FROM CartItems WHERE UserID = @userId;
        DELETE FROM PriceWatches WHERE UserID = @userId;
        DELETE FROM Notifications WHERE UserID = @userId;
        UPDATE BuildQuotes SET UserID = NULL WHERE UserID = @userId;
        -- Yêu cầu dịch vụ: huỷ yêu cầu đang mở, xoá địa chỉ, số điện thoại và mô tả (giữ mã và ngày để đối soát).
        INSERT INTO ServiceRequestEvents (RequestID, Status, Note, CreatedBy)
        SELECT RequestID, N'cancelled', N'Khách xoá tài khoản', @userId
        FROM ServiceRequests WHERE UserID = @userId AND Status IN (N'new', N'confirmed', N'in_progress');
        UPDATE ServiceRequests
        SET Status = CASE WHEN Status IN (N'new', N'confirmed', N'in_progress') THEN N'cancelled' ELSE Status END,
            Address = NULL, ContactPhone = NULL, Description = NULL, DeviceInfo = NULL, UpdatedAt = SYSDATETIME()
        WHERE UserID = @userId;
        UPDATE Users
        SET FullName = @name,
            Email = @email,
            Password = @password,
            Phone = NULL,
            Address = NULL,
            RefreshToken = NULL,
            IsActive = 0,
            DeletedAt = SYSDATETIME(),
            UpdatedAt = SYSDATETIME()
        WHERE UserID = @userId;
      `);

    await transaction.commit();
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      // transaction đã kết thúc
    }
    throw err;
  }

  // Đánh giá nằm ở MongoDB, không chung transaction với SQL Server: xoá sau khi SQL đã xong.
  let reviewsDeleted = null;
  try {
    const removed = await Review.deleteMany({ userId: id });
    reviewsDeleted = removed.deletedCount;
  } catch (err) {
    console.warn(`Reviews of deleted user ${id} not removed:`, err.message);
  }

  return { deleted: true, retainedOrders, reviewsDeleted };
};

module.exports = { OPEN_ORDER_STATUSES, exportMyData, deleteAccount };
