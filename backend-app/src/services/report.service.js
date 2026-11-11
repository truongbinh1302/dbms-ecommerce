const { getPool, sql } = require('../config/db.sql');

/*
  Báo cáo theo ngày cho admin, chia ngày theo giờ Việt Nam (UTC+7).
  Cột thời gian lưu theo giờ của máy chủ SQL (SYSDATETIME / GETDATE): trên máy cài ở Việt Nam
  là giờ +07, trong container Docker thường là UTC. Vì vậy câu lệnh đọc độ lệch của máy chủ
  (DATEPART(TZOFFSET, SYSDATETIMEOFFSET())) rồi đổi sang +07:00 trước khi lấy ngày.
*/

const VN_OFFSET_MINUTES = 7 * 60;
const MAX_RANGE_DAYS = 92;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
const vietnamToday = (now = new Date()) => new Date(now.getTime() + VN_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);

const parseDate = (value) => {
  if (!DATE_PATTERN.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Khoảng ngày hợp lệ: mặc định 30 ngày gần nhất, tối đa MAX_RANGE_DAYS ngày. */
const resolveRange = ({ from, to } = {}, now = new Date()) => {
  const end = to || vietnamToday(now);
  const start = from || addDays(end, -29);
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) throw createHttpError(400, 'Ngày phải có dạng YYYY-MM-DD');
  if (startDate > endDate) throw createHttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
  const days = Math.round((endDate - startDate) / 86400000) + 1;
  if (days > MAX_RANGE_DAYS) throw createHttpError(400, `Mỗi lần xem tối đa ${MAX_RANGE_DAYS} ngày`);
  return { from: start, to: end, days };
};

const emptyDay = (date) => ({
  date,
  orders: 0,
  cancelledOrders: 0,
  netSales: 0,
  paidAmount: 0,
  unitsSold: 0,
  newCustomers: 0,
  receipts: 0,
  unitsReceived: 0,
  receiptCost: 0,
});

const toIsoDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

const getDailyReport = async (query = {}, now = new Date()) => {
  const range = resolveRange(query, now);
  const result = await new sql.Request(getPool())
    .input('from', sql.NVarChar(10), range.from)
    .input('to', sql.NVarChar(10), range.to)
    .input('vn', sql.Int, VN_OFFSET_MINUTES)
    .query(`
      DECLARE @tz INT = DATEPART(TZOFFSET, SYSDATETIMEOFFSET());
      DECLARE @start DATETIME2 = CAST(SWITCHOFFSET(TODATETIMEOFFSET(CAST(@from AS DATETIME2), @vn), @tz) AS DATETIME2);
      DECLARE @end DATETIME2 = CAST(SWITCHOFFSET(TODATETIMEOFFSET(DATEADD(DAY, 1, CAST(@to AS DATETIME2)), @vn), @tz) AS DATETIME2);

      SELECT CAST(SWITCHOFFSET(TODATETIMEOFFSET(o.CreatedAt, @tz), @vn) AS DATE) AS Day,
             COUNT(*) AS Orders,
             SUM(CASE WHEN o.Status = N'cancelled' THEN 1 ELSE 0 END) AS CancelledOrders,
             SUM(CASE WHEN o.Status <> N'cancelled' THEN o.Total ELSE 0 END) AS NetSales,
             SUM(CASE WHEN o.Status <> N'cancelled' AND o.PaymentStatus = N'paid' THEN o.Total ELSE 0 END) AS PaidAmount,
             SUM(CASE WHEN o.Status <> N'cancelled' THEN ISNULL(items.Units, 0) ELSE 0 END) AS UnitsSold
      FROM Orders o
      OUTER APPLY (SELECT SUM(oi.Quantity) AS Units FROM OrderItems oi WHERE oi.OrderID = o.OrderID) items
      WHERE o.CreatedAt >= @start AND o.CreatedAt < @end
      GROUP BY CAST(SWITCHOFFSET(TODATETIMEOFFSET(o.CreatedAt, @tz), @vn) AS DATE);

      SELECT CAST(SWITCHOFFSET(TODATETIMEOFFSET(u.CreatedAt, @tz), @vn) AS DATE) AS Day,
             COUNT(*) AS NewCustomers
      FROM Users u
      WHERE u.Role = N'customer' AND u.CreatedAt >= @start AND u.CreatedAt < @end
      GROUP BY CAST(SWITCHOFFSET(TODATETIMEOFFSET(u.CreatedAt, @tz), @vn) AS DATE);

      SELECT CAST(SWITCHOFFSET(TODATETIMEOFFSET(r.CreatedAt, @tz), @vn) AS DATE) AS Day,
             COUNT(*) AS Receipts,
             SUM(r.TotalQuantity) AS UnitsReceived,
             SUM(r.TotalCost) AS ReceiptCost
      FROM StockReceipts r
      WHERE r.CreatedAt >= @start AND r.CreatedAt < @end
      GROUP BY CAST(SWITCHOFFSET(TODATETIMEOFFSET(r.CreatedAt, @tz), @vn) AS DATE);
    `);

  const days = new Map();
  for (let i = 0; i < range.days; i += 1) {
    const date = addDays(range.from, i);
    days.set(date, emptyDay(date));
  }
  const [orderRows = [], userRows = [], receiptRows = []] = result.recordsets || [];
  for (const row of orderRows) {
    const day = days.get(toIsoDate(row.Day));
    if (!day) continue;
    day.orders = Number(row.Orders);
    day.cancelledOrders = Number(row.CancelledOrders);
    day.netSales = Number(row.NetSales);
    day.paidAmount = Number(row.PaidAmount);
    day.unitsSold = Number(row.UnitsSold);
  }
  for (const row of userRows) {
    const day = days.get(toIsoDate(row.Day));
    if (day) day.newCustomers = Number(row.NewCustomers);
  }
  for (const row of receiptRows) {
    const day = days.get(toIsoDate(row.Day));
    if (!day) continue;
    day.receipts = Number(row.Receipts);
    day.unitsReceived = Number(row.UnitsReceived);
    day.receiptCost = Number(row.ReceiptCost);
  }

  const list = [...days.values()];
  const totals = list.reduce((sum, day) => {
    for (const key of Object.keys(sum)) sum[key] += day[key];
    return sum;
  }, { orders: 0, cancelledOrders: 0, netSales: 0, paidAmount: 0, unitsSold: 0, newCustomers: 0, receipts: 0, unitsReceived: 0, receiptCost: 0 });

  return { from: range.from, to: range.to, timezone: 'Asia/Ho_Chi_Minh', days: list, totals };
};

module.exports = { getDailyReport, resolveRange, vietnamToday, MAX_RANGE_DAYS };
