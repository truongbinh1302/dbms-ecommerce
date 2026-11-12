const { getPool, sql } = require('../config/db.sql');
const { EFFECTIVE_PRICE_SQL } = require('./promotionSql');

/*
  Thông báo trong tài khoản và theo dõi giá.
  - notify(): ghi một thông báo, chạy được trong transaction của nơi gọi (đơn hàng, yêu cầu dịch vụ).
  - sweepPriceWatches(): so giá hiện tại (giá niêm yết hoặc giá Hot Deal đang chạy) với các lượt theo dõi,
    ghi thông báo và LastNotifiedPrice trong cùng một câu lệnh, nên chạy song song hai lần không báo trùng.
    Server chạy định kỳ và ngay sau khi admin đổi giá hoặc tạo Hot Deal.
*/

const ORDER_STATUS_LABELS = {
  pending: 'Chờ xử lý',
  pending_payment: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  processing: 'Đang chuẩn bị hàng',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
};

const MAX_WATCHES = 50;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const notify = async (runner, { userId, type, title, body = null, link = null }) => {
  await new sql.Request(runner || getPool())
    .input('userId', sql.Int, Number(userId))
    .input('type', sql.NVarChar(30), type)
    .input('title', sql.NVarChar(200), String(title).slice(0, 200))
    .input('body', sql.NVarChar(500), body ? String(body).slice(0, 500) : null)
    .input('link', sql.NVarChar(200), link)
    .query('INSERT INTO Notifications (UserID, Type, Title, Body, Link) VALUES (@userId, @type, @title, @body, @link)');
};

const listMine = async (userId, { limit = 30 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@limit) NotificationID, Type, Title, Body, Link, IsRead, CreatedAt
      FROM Notifications WHERE UserID = @userId ORDER BY NotificationID DESC;
      SELECT COUNT(*) AS Unread FROM Notifications WHERE UserID = @userId AND IsRead = 0;
    `);
  return {
    unread: Number(result.recordsets[1][0].Unread),
    items: result.recordsets[0].map((row) => ({
      id: Number(row.NotificationID),
      type: row.Type,
      title: row.Title,
      body: row.Body,
      link: row.Link,
      read: Boolean(row.IsRead),
      createdAt: row.CreatedAt,
    })),
  };
};

const markRead = async (userId, notificationId = null) => {
  const request = new sql.Request(getPool()).input('userId', sql.Int, Number(userId));
  if (notificationId !== null) request.input('id', sql.BigInt, Number(notificationId));
  const result = await request.query(`
    UPDATE Notifications SET IsRead = 1
    WHERE UserID = @userId AND IsRead = 0 ${notificationId !== null ? 'AND NotificationID = @id' : ''};
    SELECT @@ROWCOUNT AS Changed;
  `);
  return { updated: Number(result.recordset[0]?.Changed || 0) };
};

// ---------- Theo dõi giá ----------

const currentPrice = async (productId) => {
  const result = await new sql.Request(getPool())
    .input('productId', sql.Int, Number(productId))
    .query(`SELECT * FROM (${EFFECTIVE_PRICE_SQL}) cur WHERE cur.ProductID = @productId`);
  return result.recordset[0] || null;
};

const watchProduct = async (userId, { productId, targetPrice = null } = {}) => {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(400, 'Sản phẩm không hợp lệ');
  const product = await currentPrice(id);
  if (!product) throw createHttpError(404, 'Không tìm thấy sản phẩm');
  const effective = Number(product.EffectivePrice);
  let target = null;
  if (targetPrice !== null && targetPrice !== undefined && targetPrice !== '') {
    target = Math.round(Number(targetPrice));
    if (!Number.isFinite(target) || target <= 0) throw createHttpError(400, 'Giá mong muốn không hợp lệ');
    if (target >= effective) {
      throw createHttpError(400, `Giá mong muốn phải thấp hơn giá hiện tại ${effective.toLocaleString('vi-VN')}đ`);
    }
  }

  const existing = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('productId', sql.Int, id)
    .query('SELECT COUNT(*) AS Total FROM PriceWatches WHERE UserID = @userId AND ProductID <> @productId');
  if (Number(existing.recordset[0].Total) >= MAX_WATCHES) {
    throw createHttpError(409, `Bạn đang theo dõi ${MAX_WATCHES} sản phẩm, hãy bỏ bớt trước khi thêm`, { code: 'too_many_watches' });
  }

  await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('productId', sql.Int, id)
    .input('price', sql.Decimal(18, 2), effective)
    .input('target', sql.Decimal(18, 2), target)
    .query(`
      MERGE PriceWatches WITH (HOLDLOCK) AS w
      USING (SELECT @userId AS UserID, @productId AS ProductID) AS src
        ON w.UserID = src.UserID AND w.ProductID = src.ProductID
      WHEN MATCHED THEN
        UPDATE SET PriceAtWatch = @price, TargetPrice = @target, LastNotifiedPrice = NULL, LastNotifiedAt = NULL, CreatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (UserID, ProductID, PriceAtWatch, TargetPrice) VALUES (@userId, @productId, @price, @target);
    `);
  return { productId: id, priceAtWatch: effective, targetPrice: target };
};

const unwatchProduct = async (userId, productId) => {
  await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('productId', sql.Int, Number(productId) || 0)
    .query('DELETE FROM PriceWatches WHERE UserID = @userId AND ProductID = @productId');
  return { productId: Number(productId), watching: false };
};

const listWatches = async (userId) => {
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT w.ProductID, cur.Name, w.PriceAtWatch, w.TargetPrice, w.LastNotifiedPrice, w.CreatedAt,
             cur.Price AS ListPrice, cur.EffectivePrice
      FROM PriceWatches w
      JOIN (${EFFECTIVE_PRICE_SQL}) cur ON cur.ProductID = w.ProductID
      WHERE w.UserID = @userId
      ORDER BY w.CreatedAt DESC
    `);
  return result.recordset.map((row) => ({
    productId: row.ProductID,
    name: row.Name,
    priceAtWatch: Number(row.PriceAtWatch),
    targetPrice: row.TargetPrice === null ? null : Number(row.TargetPrice),
    currentPrice: Number(row.EffectivePrice),
    listPrice: Number(row.ListPrice),
    createdAt: row.CreatedAt,
  }));
};

/**
 * Ghi thông báo giá giảm cho mọi lượt theo dõi đạt điều kiện. Trả về số thông báo mới.
 * Điều kiện: giá hiện tại <= giá mong muốn (hoặc < giá lúc bắt đầu theo dõi nếu không đặt),
 * và thấp hơn lần báo trước. Giá lên lại trên giá mong muốn (hoặc về giá lúc bắt đầu theo dõi) thì xoá mốc
 * để lần giảm sau lại được báo.
 */
const sweepPriceWatches = async () => {
  const result = await new sql.Request(getPool()).query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @hits TABLE (UserID INT, ProductID INT, Name NVARCHAR(220), Price DECIMAL(18,2), PriceAtWatch DECIMAL(18,2));

    -- Mở lại lượt báo khi giá đã hết "giảm" (lên trên giá mong muốn, hoặc về lại giá lúc bắt đầu theo dõi).
    -- Giá chỉ nhích lên mà vẫn dưới mức đó thì không mở lại, để không báo "giá giảm" khi giá đang tăng.
    UPDATE w
    SET LastNotifiedPrice = NULL, LastNotifiedAt = NULL
    FROM PriceWatches w WITH (UPDLOCK)
    JOIN (${EFFECTIVE_PRICE_SQL}) cur ON cur.ProductID = w.ProductID
    WHERE w.LastNotifiedPrice IS NOT NULL
      AND ((w.TargetPrice IS NOT NULL AND cur.EffectivePrice > w.TargetPrice)
        OR (w.TargetPrice IS NULL AND cur.EffectivePrice >= w.PriceAtWatch));

    UPDATE w
    SET LastNotifiedPrice = cur.EffectivePrice, LastNotifiedAt = SYSDATETIME()
    OUTPUT INSERTED.UserID, INSERTED.ProductID, cur.Name, cur.EffectivePrice, INSERTED.PriceAtWatch INTO @hits
    FROM PriceWatches w WITH (UPDLOCK)
    JOIN (${EFFECTIVE_PRICE_SQL}) cur ON cur.ProductID = w.ProductID
    JOIN Users u ON u.UserID = w.UserID AND u.IsActive = 1
    WHERE ((w.TargetPrice IS NOT NULL AND cur.EffectivePrice <= w.TargetPrice)
        OR (w.TargetPrice IS NULL AND cur.EffectivePrice < w.PriceAtWatch))
      AND (w.LastNotifiedPrice IS NULL OR cur.EffectivePrice < w.LastNotifiedPrice);

    INSERT INTO Notifications (UserID, Type, Title, Body, Link)
    SELECT UserID, N'price_drop',
           LEFT(N'Giá giảm: ' + Name, 200),
           N'Giá hiện tại ' + FORMAT(Price, N'#,0', 'vi-VN') + N'đ (lúc bắt đầu theo dõi ' + FORMAT(PriceAtWatch, N'#,0', 'vi-VN') + N'đ).',
           N'/san-pham/' + CAST(ProductID AS NVARCHAR(12))
    FROM @hits;

    COMMIT TRANSACTION;
    SELECT COUNT(*) AS Sent FROM @hits;
  `);
  return Number(result.recordset[0]?.Sent || 0);
};

// ---------- Báo khi có hàng ----------

const watchStock = async (userId, productId) => {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(400, 'Sản phẩm không hợp lệ');
  const product = await new sql.Request(getPool())
    .input('productId', sql.Int, id)
    .query('SELECT ProductID, Stock FROM Products WHERE ProductID = @productId AND IsDeleted = 0');
  if (!product.recordset[0]) throw createHttpError(404, 'Không tìm thấy sản phẩm');
  if (Number(product.recordset[0].Stock) > 0) {
    throw createHttpError(400, 'Sản phẩm đang còn hàng, bạn có thể đặt ngay', { code: 'in_stock' });
  }

  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('productId', sql.Int, id)
    .input('max', sql.Int, MAX_WATCHES)
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @total INT = (SELECT COUNT(*) FROM StockWatches WITH (UPDLOCK, HOLDLOCK) WHERE UserID = @userId AND ProductID <> @productId);
      IF @total < @max AND NOT EXISTS (SELECT 1 FROM StockWatches WHERE UserID = @userId AND ProductID = @productId)
        INSERT INTO StockWatches (UserID, ProductID) VALUES (@userId, @productId);
      COMMIT TRANSACTION;
      SELECT @total AS Others;
    `);
  if (Number(result.recordset[0].Others) >= MAX_WATCHES) {
    throw createHttpError(409, `Bạn đang chờ ${MAX_WATCHES} sản phẩm, hãy bỏ bớt trước khi thêm`, { code: 'too_many_watches' });
  }
  return { productId: id, waiting: true };
};

const unwatchStock = async (userId, productId) => {
  await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('productId', sql.Int, Number(productId) || 0)
    .query('DELETE FROM StockWatches WHERE UserID = @userId AND ProductID = @productId');
  return { productId: Number(productId), waiting: false };
};

const listStockWatches = async (userId) => {
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT w.ProductID, p.Name, p.Price, p.Stock, w.CreatedAt
      FROM StockWatches w JOIN Products p ON p.ProductID = w.ProductID
      WHERE w.UserID = @userId AND p.IsDeleted = 0
      ORDER BY w.CreatedAt DESC
    `);
  return result.recordset.map((row) => ({
    productId: row.ProductID,
    name: row.Name,
    price: Number(row.Price),
    stock: Number(row.Stock),
    createdAt: row.CreatedAt,
  }));
};

/**
 * Báo cho mọi khách đang chờ sản phẩm đã có hàng lại, rồi xoá lượt chờ (mỗi lượt báo một lần).
 * Xoá và ghi thông báo trong cùng transaction nên chạy song song hai lần không báo trùng.
 */
const sweepStockWatches = async () => {
  const result = await new sql.Request(getPool()).query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @hits TABLE (UserID INT, ProductID INT);

    DELETE w
    OUTPUT DELETED.UserID, DELETED.ProductID INTO @hits
    FROM StockWatches w
    JOIN Products p ON p.ProductID = w.ProductID
    JOIN Users u ON u.UserID = w.UserID AND u.IsActive = 1
    WHERE p.Stock > 0 AND p.IsDeleted = 0;

    INSERT INTO Notifications (UserID, Type, Title, Body, Link)
    SELECT h.UserID, N'back_in_stock',
           LEFT(N'Đã có hàng: ' + p.Name, 200),
           N'Hiện còn ' + CAST(p.Stock AS NVARCHAR(12)) + N' sản phẩm, giá ' + FORMAT(p.Price, N'#,0', 'vi-VN') + N'đ.',
           N'/san-pham/' + CAST(h.ProductID AS NVARCHAR(12))
    FROM @hits h JOIN Products p ON p.ProductID = h.ProductID;

    COMMIT TRANSACTION;
    SELECT COUNT(*) AS Sent FROM @hits;
  `);
  return Number(result.recordset[0]?.Sent || 0);
};

/** Chạy quét ngay (không chờ), dùng sau khi giá hoặc tồn kho đổi (đổi giá, Hot Deal, nhập kho, huỷ đơn, trả hàng). Lỗi chỉ ghi log. */
const sweepSoon = () => {
  setImmediate(() => {
    sweepPriceWatches().catch((err) => console.warn('[price-watch] sweep failed:', err.message));
    sweepStockWatches().catch((err) => console.warn('[stock-watch] sweep failed:', err.message));
    // Nạp muộn để tránh vòng require (buildWatch.service dùng notify của file này).
    require('./buildWatch.service').sweepBuildWatches()
      .catch((err) => console.warn('[build-watch] sweep failed:', err.message));
  });
};

module.exports = {
  ORDER_STATUS_LABELS,
  notify,
  listMine,
  markRead,
  watchProduct,
  unwatchProduct,
  listWatches,
  sweepPriceWatches,
  watchStock,
  unwatchStock,
  listStockWatches,
  sweepStockWatches,
  sweepSoon,
};
