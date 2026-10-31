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

module.exports = {
  normalizeVoucherCode,
  findVoucherByCode,
  toPublicVoucher,
};
