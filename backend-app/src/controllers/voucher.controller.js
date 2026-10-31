const { getPool, sql } = require('../config/db.sql');
const pricing = require('../services/pricing.service');
const voucherService = require('../services/voucher.service');
const { success, error } = require('../utils/response');

// Dùng chung quy tắc với lúc tạo đơn (pricing.service), nên kết quả kiểm tra luôn khớp số tiền thật.
const validateVoucher = async (req, res) => {
  const { code, subtotal = 0 } = req.body;

  if (!voucherService.normalizeVoucherCode(code)) {
    return error(res, 'Voucher code is required', 400);
  }

  try {
    const amount = Number(subtotal) || 0;
    const voucher = await voucherService.findVoucherByCode(getPool(), code);
    const problem = pricing.checkVoucher(voucher, amount);

    if (problem) {
      return error(res, problem.message, 400, { code: problem.code });
    }

    const discount = pricing.calcVoucherDiscount(voucher, amount);
    return success(res, { voucher: voucherService.toPublicVoucher(voucher), discount }, 'Voucher validated successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const createVoucher = async (req, res) => {
  const {
    code,
    discountType = 'amount',
    discountValue,
    discount,
    quantity,
    minOrderAmount = 0,
    maxDiscount = null,
    startDate = null,
    endDate = null,
  } = req.body;

  if (!code) {
    return error(res, 'Voucher code is required', 400);
  }

  const resolvedDiscountValue = Number(discountValue ?? discount ?? 0);
  if (resolvedDiscountValue <= 0) {
    return error(res, 'Discount value must be greater than 0', 400);
  }

  try {
    const result = await getPool().request()
      .input('code', sql.NVarChar, String(code).trim().toUpperCase())
      .input('discountType', sql.NVarChar, discountType)
      .input('discountValue', sql.Decimal(18, 2), resolvedDiscountValue)
      .input('minOrderAmount', sql.Decimal(18, 2), Number(minOrderAmount) || 0)
      .input('maxDiscount', sql.Decimal(18, 2), maxDiscount === null ? null : Number(maxDiscount))
      .input('usageLimit', sql.Int, Number(quantity || req.body.usageLimit || 1))
      .input('startDate', sql.DateTime2, startDate ? new Date(startDate) : null)
      .input('endDate', sql.DateTime2, endDate ? new Date(endDate) : null)
      .query(`
        INSERT INTO Vouchers (Code, DiscountType, DiscountValue, MinOrderAmount, MaxDiscount, UsageLimit, StartDate, EndDate)
        OUTPUT INSERTED.VoucherID AS id, INSERTED.Code AS code
        VALUES (@code, @discountType, @discountValue, @minOrderAmount, @maxDiscount, @usageLimit, @startDate, @endDate)
      `);

    return success(res, result.recordset[0], 'Voucher created', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { validateVoucher, createVoucher };
