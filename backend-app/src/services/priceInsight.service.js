const { getPool, sql } = require('../config/db.sql');
const { promoApply } = require('./promotionSql');
const { WINDOW_DAYS, classifyPrice } = require('../utils/priceInsight');

/*
  "Nên mua lúc nào?" - số liệu giá lấy từ PriceHistory bằng hàm cửa sổ:
  - mỗi sản phẩm: chia cửa sổ 90 ngày thành các đoạn giữ giá (LEAD lấy thời điểm đổi giá kế tiếp),
    giá trung bình tính theo thời gian giữ giá, thấp nhất/cao nhất, số lần đổi giá, giá 30 ngày trước;
  - cả cấu hình: tổng giá cuối mỗi ngày (giờ Việt Nam) trong 90 ngày.
  Ngày chia theo giờ Việt Nam như report.service: đọc độ lệch múi giờ của máy chủ SQL rồi đổi sang +07.
*/

const VN_OFFSET_MINUTES = 7 * 60;
const MAX_IDS = 200;

const cleanIds = (ids) => [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, MAX_IDS);

/**
 * Số liệu giá của nhiều sản phẩm trong một lần đọc. Trả về Map productId → insight (utils/priceInsight).
 * Sản phẩm đã xoá hoặc không có lịch sử giá thì không có trong Map.
 */
const getInsights = async (productIds, { days = WINDOW_DAYS } = {}) => {
  const ids = cleanIds(productIds);
  if (ids.length === 0) return new Map();
  const windowDays = Math.min(Math.max(Number.parseInt(days, 10) || WINDOW_DAYS, 30), 365);

  const result = await new sql.Request(getPool())
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
    .input('days', sql.Int, windowDays)
    .query(`
      DECLARE @now DATETIME2 = SYSDATETIME();
      DECLARE @from DATETIME2 = DATEADD(DAY, -@days, @now);
      DECLARE @ago30 DATETIME2 = DATEADD(DAY, -30, @now);
      DECLARE @idt TABLE (ProductID INT PRIMARY KEY);
      INSERT INTO @idt (ProductID) SELECT DISTINCT CAST([value] AS INT) FROM OPENJSON(@ids);

      WITH pts AS (
        -- Giá đang có hiệu lực lúc bắt đầu cửa sổ (lần đổi giá gần nhất trước đó), tính từ đầu cửa sổ.
        SELECT i.ProductID, b.Price, @from AS StartAt, CAST(0 AS BIT) AS InWindow, b.PriceHistoryID
        FROM @idt i
        CROSS APPLY (
          SELECT TOP (1) h.Price, h.PriceHistoryID
          FROM PriceHistory h
          WHERE h.ProductID = i.ProductID AND h.ChangedAt < @from
          ORDER BY h.ChangedAt DESC, h.PriceHistoryID DESC
        ) b
        UNION ALL
        SELECT h.ProductID, h.Price, h.ChangedAt, CAST(1 AS BIT), h.PriceHistoryID
        FROM PriceHistory h
        JOIN @idt i ON i.ProductID = h.ProductID
        WHERE h.ChangedAt >= @from AND h.ChangedAt <= @now
      ),
      seg AS (
        SELECT ProductID, Price, StartAt, InWindow,
               LEAD(StartAt, 1, @now) OVER (PARTITION BY ProductID ORDER BY StartAt, PriceHistoryID) AS EndAt
        FROM pts
      )
      SELECT ProductID,
             MIN(Price) AS Lowest,
             MAX(Price) AS Highest,
             SUM(Price * CAST(DATEDIFF_BIG(SECOND, StartAt, EndAt) AS DECIMAL(38, 0)))
               / NULLIF(SUM(CAST(DATEDIFF_BIG(SECOND, StartAt, EndAt) AS DECIMAL(38, 0))), 0) AS AveragePrice,
             SUM(CASE WHEN InWindow = 1 THEN 1 ELSE 0 END) AS PointsInWindow,
             MAX(CASE WHEN InWindow = 0 THEN 1 ELSE 0 END) AS HasPrior,
             DATEDIFF_BIG(SECOND, MIN(StartAt), @now) / 86400.0 AS CoveredDays
      FROM seg
      GROUP BY ProductID;

      SELECT p.ProductID, p.Price, promo.PromoSalePrice AS DealPrice, a30.Price AS PriceAgo30
      FROM Products p
      JOIN @idt i ON i.ProductID = p.ProductID
      ${promoApply('p')}
      OUTER APPLY (
        SELECT TOP (1) h.Price
        FROM PriceHistory h
        WHERE h.ProductID = p.ProductID AND h.ChangedAt <= @ago30
        ORDER BY h.ChangedAt DESC, h.PriceHistoryID DESC
      ) a30
      WHERE p.IsDeleted = 0;
    `);

  const stats = new Map(result.recordsets[0].map((row) => [row.ProductID, row]));
  const insights = new Map();
  for (const row of result.recordsets[1]) {
    const history = stats.get(row.ProductID);
    if (!history) continue;
    const points = Number(history.PointsInWindow) || 0;
    insights.set(row.ProductID, classifyPrice({
      current: Number(row.Price),
      dealPrice: row.DealPrice === null ? null : Number(row.DealPrice),
      lowest: Number(history.Lowest),
      highest: Number(history.Highest),
      average: Number(history.AveragePrice),
      // Không có giá trước cửa sổ thì điểm đầu tiên trong cửa sổ là lúc lên kệ, không phải lần đổi giá.
      changes: Number(history.HasPrior) ? points : Math.max(points - 1, 0),
      coveredDays: Number(history.CoveredDays),
      priceDaysAgo30: row.PriceAgo30 === null ? null : Number(row.PriceAgo30),
    }, windowDays));
  }
  return insights;
};

/** Gắn priceInsight vào danh sách sản phẩm đã định dạng (formatProduct). Lỗi chỉ ghi log: đây là thông tin phụ. */
const attachInsights = async (items) => {
  if (!Array.isArray(items) || items.length === 0) return items;
  try {
    const insights = await getInsights(items.map((item) => item.id));
    for (const item of items) {
      const insight = insights.get(Number(item.id));
      item.priceInsight = insight ? { label: insight.label, tone: insight.tone, text: insight.text } : null;
    }
  } catch (err) {
    console.warn('Price insight skipped:', err.message);
  }
  return items;
};

const toIsoDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

/**
 * Tổng giá cả cấu hình (giá niêm yết × số lượng) cuối mỗi ngày trong `days` ngày, theo giờ Việt Nam.
 * Ngày nào còn linh kiện chưa lên kệ thì total = null (không so được).
 * @param items [{ productId, quantity }] linh kiện cần mua
 */
const getBuildPriceTrend = async (items, { days = WINDOW_DAYS } = {}) => {
  const windowDays = Math.min(Math.max(Number.parseInt(days, 10) || WINDOW_DAYS, 7), 180);
  const result = await new sql.Request(getPool())
    .input('items', sql.NVarChar(sql.MAX), JSON.stringify(items.map((item) => ({ productId: item.productId, quantity: item.quantity }))))
    .input('days', sql.Int, windowDays)
    .input('vn', sql.Int, VN_OFFSET_MINUTES)
    .query(`
      DECLARE @tz INT = DATEPART(TZOFFSET, SYSDATETIMEOFFSET());
      DECLARE @today DATE = CAST(DATEADD(MINUTE, @vn - @tz, SYSDATETIME()) AS DATE);
      DECLARE @lines TABLE (ProductID INT PRIMARY KEY, Quantity INT NOT NULL);
      INSERT INTO @lines (ProductID, Quantity)
      SELECT j.ProductID, SUM(j.Quantity)
      FROM OPENJSON(@items) WITH (ProductID INT '$.productId', Quantity INT '$.quantity') j
      JOIN Products p ON p.ProductID = j.ProductID AND p.IsDeleted = 0
      GROUP BY j.ProductID;

      WITH days AS (
        SELECT 0 AS N
        UNION ALL
        SELECT N + 1 FROM days WHERE N < @days
      )
      SELECT DATEADD(DAY, -d.N, @today) AS Day,
             SUM(px.Price * l.Quantity) AS Total,
             COUNT(px.Price) AS Priced
      FROM days d
      CROSS JOIN @lines l
      OUTER APPLY (
        -- Giá cuối ngày: lần đổi giá gần nhất trước 0 giờ (giờ Việt Nam) ngày hôm sau.
        SELECT TOP (1) h.Price
        FROM PriceHistory h
        WHERE h.ProductID = l.ProductID
          AND h.ChangedAt < DATEADD(MINUTE, @tz - @vn, CAST(DATEADD(DAY, 1 - d.N, @today) AS DATETIME2))
        ORDER BY h.ChangedAt DESC, h.PriceHistoryID DESC
      ) px
      GROUP BY d.N
      ORDER BY d.N DESC
      OPTION (MAXRECURSION 400);

      SELECT COUNT(*) AS Lines FROM @lines;
    `);

  const lines = Number(result.recordsets[1][0].Lines);
  const points = result.recordsets[0].map((row) => ({
    date: toIsoDate(row.Day),
    total: lines > 0 && Number(row.Priced) === lines ? Number(row.Total) : null,
  }));
  const known = points.filter((point) => point.total !== null);
  if (lines === 0 || known.length === 0) return { days: windowDays, lines, points, insight: null, current: null };

  const current = known[known.length - 1].total;
  const lowest = known.reduce((best, point) => (point.total < best.total ? point : best), known[0]);
  const highest = known.reduce((best, point) => (point.total > best.total ? point : best), known[0]);
  const average = known.reduce((sum, point) => sum + point.total, 0) / known.length;
  const changes = known.filter((point, index) => index > 0 && point.total !== known[index - 1].total).length;
  const ago30 = points.length > 30 ? points[points.length - 31].total : null;

  const insight = classifyPrice({
    current,
    dealPrice: null,
    lowest: lowest.total,
    highest: highest.total,
    average,
    changes,
    coveredDays: known.length - 1,
    priceDaysAgo30: ago30,
  }, windowDays, {
    watchHint: 'Chưa cần gấp thì bật "Báo khi cả bộ rẻ hơn".',
    newText: 'Cấu hình có linh kiện mới lên kệ, chưa đủ dữ liệu giá để so.',
  });

  return {
    days: windowDays,
    lines,
    points,
    current,
    lowest: { total: lowest.total, date: lowest.date },
    highest: { total: highest.total, date: highest.date },
    average: Math.round(average),
    insight,
  };
};

module.exports = { MAX_IDS, getInsights, attachInsights, getBuildPriceTrend };
