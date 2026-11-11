const { getPool } = require('../config/db.sql');
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

const handle = (fn, message, statusCode = 200) => async (req, res) => {
  try {
    return success(res, await fn(req), message, statusCode);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

// Nhận cả tên trường cũ (discount, quantity) của API trước đây.
const createVoucher = handle((req) => {
  const body = req.body || {};
  return voucherService.createVoucher(getPool(), {
    ...body,
    discountValue: body.discountValue ?? body.discount,
    usageLimit: body.usageLimit ?? body.quantity,
  });
}, 'Voucher created', 201);
const listAdminVouchers = handle((req) => voucherService.listAdminVouchers(getPool(), req.query), 'Vouchers retrieved');
const setVoucherActive = handle((req) => voucherService.setVoucherActive(getPool(), req.params.id, (req.body || {}).isActive), 'Voucher updated');

module.exports = { validateVoucher, createVoucher, listAdminVouchers, setVoucherActive };
