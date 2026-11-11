const { sql } = require('../config/db.sql');

const normalizeVoucherCode = (code) => {
  const value = String(code || '').trim().toUpperCase();
  return value || null;
};

/**
 * Đọc voucher theo mã. `executor` là pool (chỉ đọc) hoặc transaction (khi đặt hàng).
 * Khi `lock` = true, dòng voucher bị khoá UPDLOCK để hai đơn đồng thời
 * không cùng dùng được lượt cuối cùng của một mã.
 */
const findVoucherByCode = async (executor, code, { lock = false } = {}) => {
  const normalized = normalizeVoucherCode(code);
  if (!normalized) return null;

  const lockHint = lock ? 'WITH (UPDLOCK, ROWLOCK)' : '';
  const result = await new sql.Request(executor)
    .input('code', sql.NVarChar, normalized)
    .query(`
      SELECT VoucherID, Code, DiscountType, DiscountValue, MinOrderAmount,
             MaxDiscount, UsageLimit, UsedCount, StartDate, EndDate, IsActive,
             CAST(CASE
                    WHEN (StartDate IS NULL OR StartDate <= GETDATE())
                     AND (EndDate IS NULL OR EndDate >= GETDATE())
                    THEN 1 ELSE 0
                  END AS BIT) AS IsInDateRange
      FROM Vouchers ${lockHint}
      WHERE Code = @code
    `);

  return result.recordset[0] || null;
};

const toPublicVoucher = (voucher) => (voucher
  ? {
    id: voucher.VoucherID,
    code: voucher.Code,
    discountType: voucher.DiscountType,
    discountValue: Number(voucher.DiscountValue),
    minOrderAmount: Number(voucher.MinOrderAmount || 0),
    maxDiscount: voucher.MaxDiscount === null ? null : Number(voucher.MaxDiscount),
  }
  : null);

// ---------- Quản lý mã giảm giá (admin) ----------

const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;
const MAX_USAGE_LIMIT = 1000000;
const MAX_MONEY = 1e10;
const VOUCHER_STATES = ['active', 'scheduled', 'expired', 'used_up', 'disabled'];

const httpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const optionalMoney = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 0 || number > MAX_MONEY) throw httpError(400, `${label} không hợp lệ`);
  return number;
};

const optionalDate = (value, label) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(400, `${label} không hợp lệ`);
  return date;
};

/** Kiểm tra dữ liệu admin nhập khi tạo mã. Thời điểm nhận dạng ISO có múi giờ (trình duyệt gửi lên). */
const validateVoucherInput = (payload = {}) => {
  const code = normalizeVoucherCode(payload.code);
  if (!code || !CODE_PATTERN.test(code)) throw httpError(400, 'Mã gồm 3–30 ký tự: chữ không dấu, số, gạch ngang hoặc gạch dưới');
  const discountType = String(payload.discountType || '');
  if (!['amount', 'percent'].includes(discountType)) throw httpError(400, 'Loại giảm giá phải là số tiền hoặc phần trăm');
  const discountValue = Number(payload.discountValue);
  if (discountType === 'percent' && !(Number.isInteger(discountValue) && discountValue >= 1 && discountValue <= 90)) {
    throw httpError(400, 'Phần trăm giảm từ 1 đến 90');
  }
  if (discountType === 'amount' && !(Number.isFinite(discountValue) && discountValue >= 1000 && discountValue <= MAX_MONEY)) {
    throw httpError(400, 'Số tiền giảm tối thiểu 1.000đ');
  }
  const minOrderAmount = optionalMoney(payload.minOrderAmount, 'Giá trị đơn tối thiểu') || 0;
  const maxDiscount = optionalMoney(payload.maxDiscount, 'Mức giảm tối đa');
  if (maxDiscount === 0) throw httpError(400, 'Mức giảm tối đa phải lớn hơn 0');
  if (discountType === 'amount' && minOrderAmount && discountValue > minOrderAmount) {
    throw httpError(400, 'Số tiền giảm không được lớn hơn giá trị đơn tối thiểu');
  }
  let usageLimit = null;
  if (payload.usageLimit !== undefined && payload.usageLimit !== null && payload.usageLimit !== '') {
    usageLimit = Number(payload.usageLimit);
    if (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > MAX_USAGE_LIMIT) throw httpError(400, 'Số lượt dùng không hợp lệ');
  }
  const startDate = optionalDate(payload.startDate, 'Thời điểm bắt đầu');
  const endDate = optionalDate(payload.endDate, 'Thời điểm kết thúc');
  if (startDate && endDate && endDate <= startDate) throw httpError(400, 'Thời điểm kết thúc phải sau thời điểm bắt đầu');
  return {
    code,
    discountType,
    discountValue: discountType === 'amount' ? Math.round(discountValue) : discountValue,
    minOrderAmount,
    maxDiscount: discountType === 'amount' ? null : maxDiscount,
    usageLimit,
    startDate,
    endDate,
  };
};

// StartDate/EndDate là DATETIME2 theo giờ máy chủ SQL (so với GETDATE()), nên đổi mốc giờ admin nhập
// (có múi giờ) sang độ lệch của máy chủ trước khi lưu, và đổi ngược khi đọc.
const SERVER_TZ = 'DATEPART(TZOFFSET, SYSDATETIMEOFFSET())';

const ADMIN_SELECT = `
  SELECT v.VoucherID, v.Code, v.DiscountType, v.DiscountValue, v.MinOrderAmount, v.MaxDiscount,
         v.UsageLimit, v.UsedCount, v.IsActive,
         TODATETIMEOFFSET(v.StartDate, ${SERVER_TZ}) AS StartsAt,
         TODATETIMEOFFSET(v.EndDate, ${SERVER_TZ}) AS EndsAt,
         CASE
           WHEN v.IsActive = 0 THEN N'disabled'
           WHEN v.EndDate IS NOT NULL AND v.EndDate < GETDATE() THEN N'expired'
           WHEN v.UsageLimit IS NOT NULL AND v.UsedCount >= v.UsageLimit THEN N'used_up'
           WHEN v.StartDate IS NOT NULL AND v.StartDate > GETDATE() THEN N'scheduled'
           ELSE N'active'
         END AS State,
         ISNULL(stats.Orders, 0) AS Orders, ISNULL(stats.Revenue, 0) AS Revenue
  FROM Vouchers v
  OUTER APPLY (
    SELECT COUNT(*) AS Orders, SUM(o.Total) AS Revenue
    FROM VoucherUsages vu JOIN Orders o ON o.OrderID = vu.OrderID
    WHERE vu.VoucherID = v.VoucherID AND o.Status <> N'cancelled'
  ) stats`;

const formatAdminVoucher = (row) => ({
  id: row.VoucherID,
  code: row.Code,
  discountType: row.DiscountType,
  discountValue: Number(row.DiscountValue),
  minOrderAmount: Number(row.MinOrderAmount || 0),
  maxDiscount: row.MaxDiscount === null ? null : Number(row.MaxDiscount),
  usageLimit: row.UsageLimit === null ? null : Number(row.UsageLimit),
  usedCount: Number(row.UsedCount),
  isActive: Boolean(row.IsActive),
  startsAt: row.StartsAt,
  endsAt: row.EndsAt,
  state: row.State,
  orders: Number(row.Orders),
  revenue: Number(row.Revenue),
});

const getAdminVoucher = async (executor, voucherId) => {
  const result = await new sql.Request(executor)
    .input('id', sql.Int, Number(voucherId))
    .query(`${ADMIN_SELECT} WHERE v.VoucherID = @id`);
  return result.recordset[0] ? formatAdminVoucher(result.recordset[0]) : null;
};

const createVoucher = async (executor, payload) => {
  const data = validateVoucherInput(payload);
  const existing = await new sql.Request(executor)
    .input('code', sql.NVarChar(50), data.code)
    .query('SELECT VoucherID FROM Vouchers WHERE Code = @code');
  if (existing.recordset[0]) throw httpError(409, `Mã ${data.code} đã tồn tại`, { code: 'voucher_exists' });
  try {
    const result = await new sql.Request(executor)
      .input('code', sql.NVarChar(50), data.code)
      .input('discountType', sql.NVarChar(20), data.discountType)
      .input('discountValue', sql.Decimal(18, 2), data.discountValue)
      .input('minOrderAmount', sql.Decimal(18, 2), data.minOrderAmount)
      .input('maxDiscount', sql.Decimal(18, 2), data.maxDiscount)
      .input('usageLimit', sql.Int, data.usageLimit)
      .input('startDate', sql.DateTimeOffset, data.startDate)
      .input('endDate', sql.DateTimeOffset, data.endDate)
      .query(`
        INSERT INTO Vouchers (Code, DiscountType, DiscountValue, MinOrderAmount, MaxDiscount, UsageLimit, StartDate, EndDate)
        OUTPUT INSERTED.VoucherID
        VALUES (@code, @discountType, @discountValue, @minOrderAmount, @maxDiscount, @usageLimit,
                CAST(SWITCHOFFSET(@startDate, ${SERVER_TZ}) AS DATETIME2),
                CAST(SWITCHOFFSET(@endDate, ${SERVER_TZ}) AS DATETIME2))
      `);
    return getAdminVoucher(executor, result.recordset[0].VoucherID);
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) throw httpError(409, `Mã ${data.code} đã tồn tại`, { code: 'voucher_exists' });
    throw err;
  }
};

const listAdminVouchers = async (executor, { state = '' } = {}) => {
  const filter = String(state || '');
  if (filter && !VOUCHER_STATES.includes(filter)) throw httpError(400, 'Trạng thái không hợp lệ');
  const result = await new sql.Request(executor).query(`${ADMIN_SELECT} ORDER BY v.VoucherID DESC`);
  const items = result.recordset.map(formatAdminVoucher);
  return filter ? items.filter((item) => item.state === filter) : items;
};

/** Bật hoặc tắt một mã. Tắt không ảnh hưởng đơn đã đặt bằng mã đó. */
const setVoucherActive = async (executor, voucherId, isActive) => {
  if (typeof isActive !== 'boolean') throw httpError(400, 'isActive phải là true hoặc false');
  const result = await new sql.Request(executor)
    .input('id', sql.Int, Number(voucherId) || 0)
    .input('active', sql.Bit, isActive ? 1 : 0)
    .query('UPDATE Vouchers SET IsActive = @active OUTPUT INSERTED.VoucherID WHERE VoucherID = @id');
  if (!result.recordset[0]) throw httpError(404, 'Không tìm thấy mã giảm giá');
  return getAdminVoucher(executor, voucherId);
};

module.exports = {
  normalizeVoucherCode,
  findVoucherByCode,
  toPublicVoucher,
  VOUCHER_STATES,
  validateVoucherInput,
  createVoucher,
  listAdminVouchers,
  setVoucherActive,
};
