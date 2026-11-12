const { getPool, sql } = require('../config/db.sql');
const { EFFECTIVE_PRICE_SQL } = require('./promotionSql');
const { normalizeBuildItems } = require('./builder.service');

/*
  Theo dõi giá cả một cấu hình: khách lưu danh sách linh kiện cần mua, khi tổng giá khách trả được
  (giá Hot Deal nếu có) thấp hơn lúc bắt đầu theo dõi thì báo trong tài khoản.
  Chống báo trùng giống PriceWatches: chỉ báo lại khi tổng xuống thấp hơn lần báo trước, hoặc khi cả bộ đã về lại
  mức lúc bắt đầu theo dõi rồi giảm lần nữa.
*/

const MAX_BUILD_WATCHES = 10;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

// Tổng hiện tại của một lượt theo dõi (alias w). Missing > 0: có linh kiện đã ngừng bán, không so được.
const CURRENT_TOTAL_APPLY = `
  CROSS APPLY (
    SELECT SUM(cur.EffectivePrice * j.Quantity) AS Total,
           SUM(CASE WHEN cur.ProductID IS NULL THEN 1 ELSE 0 END) AS Missing,
           COUNT(*) AS Lines
    FROM OPENJSON(w.ItemsJson) WITH (ProductID INT '$.productId', Quantity INT '$.quantity') j
    LEFT JOIN (${EFFECTIVE_PRICE_SQL}) cur ON cur.ProductID = j.ProductID
  ) t`;

/** Danh sách linh kiện cần mua, gộp theo sản phẩm và sắp theo mã để hai cấu hình giống nhau có cùng JSON. */
const canonicalItems = (rawItems) => {
  const merged = new Map();
  for (const item of normalizeBuildItems(rawItems)) {
    if (item.owned) continue;
    merged.set(item.productId, (merged.get(item.productId) || 0) + item.quantity);
  }
  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([productId, quantity]) => ({ productId, quantity }));
};

const toWatch = (row) => ({
  id: row.BuildWatchID,
  title: row.Title,
  items: JSON.parse(row.ItemsJson),
  totalAtWatch: Number(row.TotalAtWatch),
  currentTotal: row.Missing > 0 || row.Total === null ? null : Number(row.Total),
  unavailable: Number(row.Missing) || 0,
  lastNotifiedTotal: row.LastNotifiedTotal === null ? null : Number(row.LastNotifiedTotal),
  createdAt: row.CreatedAt,
});

const listBuildWatches = async (userId) => {
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT w.BuildWatchID, w.Title, w.ItemsJson, w.TotalAtWatch, w.LastNotifiedTotal, w.CreatedAt, t.Total, t.Missing
      FROM BuildWatches w
      ${CURRENT_TOTAL_APPLY}
      WHERE w.UserID = @userId
      ORDER BY w.BuildWatchID DESC
    `);
  return result.recordset.map(toWatch);
};

/**
 * Bắt đầu theo dõi một cấu hình. Cùng danh sách linh kiện đã theo dõi thì đặt lại mốc giá.
 * Khoá dòng Users của khách (UPDLOCK, ROWLOCK) trước khi đếm và ghi, như đặt hàng và xoá tài khoản:
 * các lần bấm cùng lúc của một khách chạy lần lượt nên không vượt giới hạn, và không khoá theo dải
 * trên BuildWatches (khoá dải với nhiều lệnh INSERT cùng lúc dễ gây deadlock).
 */
const watchBuild = async (userId, { items, title } = {}) => {
  const lines = canonicalItems(items);
  if (lines.length === 0) throw createHttpError(400, 'Cấu hình chưa có linh kiện cần mua');
  const cleanTitle = String(title || '').trim().slice(0, 120) || null;
  const itemsJson = JSON.stringify(lines);

  const transaction = new sql.Transaction(getPool());
  await transaction.begin();
  try {
    const priced = await new sql.Request(transaction)
      .input('items', sql.NVarChar(sql.MAX), itemsJson)
      .query(`
        SELECT SUM(cur.EffectivePrice * j.Quantity) AS Total,
               SUM(CASE WHEN cur.ProductID IS NULL THEN 1 ELSE 0 END) AS Missing
        FROM OPENJSON(@items) WITH (ProductID INT '$.productId', Quantity INT '$.quantity') j
        LEFT JOIN (${EFFECTIVE_PRICE_SQL}) cur ON cur.ProductID = j.ProductID
      `);
    const { Total, Missing } = priced.recordset[0];
    if (Number(Missing) > 0 || Total === null) throw createHttpError(400, 'Cấu hình có linh kiện đã ngừng bán');
    const total = Number(Total);

    const saved = await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .input('items', sql.NVarChar(sql.MAX), itemsJson)
      .input('title', sql.NVarChar(120), cleanTitle)
      .input('total', sql.Decimal(18, 2), total)
      .input('max', sql.Int, MAX_BUILD_WATCHES)
      .query(`
        DECLARE @existing INT, @count INT, @active INT;
        SELECT @active = UserID FROM Users WITH (UPDLOCK, ROWLOCK) WHERE UserID = @userId AND IsActive = 1;
        SELECT @count = COUNT(*), @existing = MAX(CASE WHEN ItemsJson = @items THEN BuildWatchID END)
        FROM BuildWatches
        WHERE UserID = @userId;

        IF @active IS NULL
          SELECT CAST(NULL AS INT) AS BuildWatchID, CAST(0 AS BIT) AS IsFull, CAST(1 AS BIT) AS Inactive;
        ELSE IF @existing IS NOT NULL
        BEGIN
          UPDATE BuildWatches
          SET TotalAtWatch = @total, Title = COALESCE(@title, Title), LastNotifiedTotal = NULL, LastNotifiedAt = NULL, CreatedAt = SYSDATETIME()
          WHERE BuildWatchID = @existing;
          SELECT @existing AS BuildWatchID, CAST(0 AS BIT) AS IsFull;
        END
        ELSE IF @count >= @max
          SELECT CAST(NULL AS INT) AS BuildWatchID, CAST(1 AS BIT) AS IsFull;
        ELSE
        BEGIN
          INSERT INTO BuildWatches (UserID, Title, ItemsJson, TotalAtWatch) VALUES (@userId, @title, @items, @total);
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS BuildWatchID, CAST(0 AS BIT) AS IsFull;
        END
      `);
    const row = saved.recordset[0];
    if (row.Inactive) throw createHttpError(404, 'Không tìm thấy tài khoản');
    if (row.IsFull) {
      throw createHttpError(409, `Bạn đang theo dõi ${MAX_BUILD_WATCHES} cấu hình, hãy bỏ bớt trước khi thêm`, { code: 'too_many_build_watches' });
    }
    await transaction.commit();
    return { id: row.BuildWatchID, title: cleanTitle, items: lines, totalAtWatch: total };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
};

const unwatchBuild = async (userId, watchId) => {
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('id', sql.Int, Number(watchId) || 0)
    .query('DELETE FROM BuildWatches WHERE BuildWatchID = @id AND UserID = @userId; SELECT @@ROWCOUNT AS Deleted;');
  if (!Number(result.recordset[0].Deleted)) throw createHttpError(404, 'Không tìm thấy cấu hình đang theo dõi');
  return { id: Number(watchId), watching: false };
};

/**
 * Ghi thông báo cho mọi cấu hình có tổng giá thấp hơn lúc bắt đầu theo dõi và thấp hơn lần báo trước.
 * Tổng về lại mức lúc bắt đầu theo dõi thì xoá mốc để lần giảm sau lại được báo. Trả về số thông báo mới.
 */
const sweepBuildWatches = async () => {
  const result = await new sql.Request(getPool()).query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @cur TABLE (BuildWatchID INT PRIMARY KEY, Total DECIMAL(18,2) NOT NULL);
    INSERT INTO @cur (BuildWatchID, Total)
    SELECT w.BuildWatchID, t.Total
    FROM BuildWatches w WITH (UPDLOCK)
    ${CURRENT_TOTAL_APPLY}
    WHERE t.Missing = 0 AND t.Total IS NOT NULL;

    -- Cả bộ về lại mức lúc bắt đầu theo dõi (hoặc cao hơn): mở lại lượt báo cho lần giảm sau.
    UPDATE w
    SET LastNotifiedTotal = NULL, LastNotifiedAt = NULL
    FROM BuildWatches w
    JOIN @cur c ON c.BuildWatchID = w.BuildWatchID
    WHERE w.LastNotifiedTotal IS NOT NULL AND c.Total >= w.TotalAtWatch;

    DECLARE @hits TABLE (UserID INT, Title NVARCHAR(120), Total DECIMAL(18,2), TotalAtWatch DECIMAL(18,2));
    UPDATE w
    SET LastNotifiedTotal = c.Total, LastNotifiedAt = SYSDATETIME()
    OUTPUT INSERTED.UserID, INSERTED.Title, c.Total, INSERTED.TotalAtWatch INTO @hits
    FROM BuildWatches w
    JOIN @cur c ON c.BuildWatchID = w.BuildWatchID
    JOIN Users u ON u.UserID = w.UserID AND u.IsActive = 1
    WHERE c.Total < w.TotalAtWatch
      AND (w.LastNotifiedTotal IS NULL OR c.Total < w.LastNotifiedTotal);

    INSERT INTO Notifications (UserID, Type, Title, Body, Link)
    SELECT UserID, N'build_price_drop',
           LEFT(N'Cấu hình rẻ hơn: ' + COALESCE(Title, N'cấu hình đang theo dõi'), 200),
           N'Tổng hiện tại ' + FORMAT(Total, N'#,0', 'vi-VN') + N'đ, giảm ' + FORMAT(TotalAtWatch - Total, N'#,0', 'vi-VN')
             + N'đ so với lúc bắt đầu theo dõi.',
           N'/build-pc/theo-doi'
    FROM @hits;

    COMMIT TRANSACTION;
    SELECT COUNT(*) AS Sent FROM @hits;
  `);
  return Number(result.recordset[0]?.Sent || 0);
};

module.exports = {
  MAX_BUILD_WATCHES,
  canonicalItems,
  listBuildWatches,
  watchBuild,
  unwatchBuild,
  sweepBuildWatches,
};
