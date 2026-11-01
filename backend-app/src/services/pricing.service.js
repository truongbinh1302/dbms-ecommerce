const config = require('../config/env');

/*
  Toàn bộ quy tắc tính tiền của đơn hàng nằm ở file này.
  Cả API báo giá (/cart/quote), API kiểm tra voucher và lúc tạo đơn đều gọi
  chung các hàm dưới đây, nên số tiền khách thấy luôn khớp số tiền lưu vào DB.
  Client không bao giờ được gửi lên phí ship hay số tiền giảm giá.
*/

const roundMoney = (value) => Math.round(Number(value) || 0);

const calcShippingFee = (subtotal, rules = config.pricing) => {
  if (subtotal <= 0) return 0;
  return subtotal >= rules.freeShippingThreshold ? 0 : rules.shippingFee;
};

const calcPromoDiscount = (subtotal, rules = config.pricing) => {
  const tier = rules.tierDiscounts.find((item) => subtotal >= item.minSubtotal);
  return tier ? tier.amount : 0;
};

/**
 * Kiểm tra voucher có dùng được cho đơn này không.
 * `voucher.IsInDateRange` được tính sẵn bằng SQL (so với giờ của DB server).
 * Trả về null nếu hợp lệ, hoặc { code, message } nếu không.
 */
const checkVoucher = (voucher, subtotal) => {
  if (!voucher) {
    return { code: 'voucher_not_found', message: 'Mã giảm giá không tồn tại' };
  }
  if (!voucher.IsActive) {
    return { code: 'voucher_inactive', message: 'Mã giảm giá đã ngừng áp dụng' };
  }
  if (!voucher.IsInDateRange) {
    return { code: 'voucher_out_of_date', message: 'Mã giảm giá chưa đến hạn hoặc đã hết hạn' };
  }
  if (voucher.UsageLimit !== null && voucher.UsageLimit !== undefined
    && Number(voucher.UsedCount) >= Number(voucher.UsageLimit)) {
    return { code: 'voucher_used_up', message: 'Mã giảm giá đã hết lượt sử dụng' };
  }
  if (subtotal < Number(voucher.MinOrderAmount || 0)) {
    return {
      code: 'voucher_min_order',
      message: `Đơn hàng cần tối thiểu ${Number(voucher.MinOrderAmount).toLocaleString('vi-VN')}đ để dùng mã này`,
    };
  }
  return null;
};

const calcVoucherDiscount = (voucher, subtotal) => {
  if (!voucher) return 0;
  const value = Number(voucher.DiscountValue || 0);
  const raw = voucher.DiscountType === 'percent' ? (subtotal * value) / 100 : value;
  const capped = voucher.MaxDiscount !== null && voucher.MaxDiscount !== undefined
    ? Math.min(raw, Number(voucher.MaxDiscount))
    : raw;
  return roundMoney(Math.max(0, Math.min(capped, subtotal)));
};

/**
 * Tính toàn bộ số tiền của một đơn từ tạm tính (đã lấy giá từ DB) và voucher (nếu có).
 * Tổng giảm giá không vượt quá tạm tính, nên tổng thanh toán không bao giờ âm.
 */
const buildQuote = (subtotal, voucher = null, rules = config.pricing) => {
  const safeSubtotal = roundMoney(subtotal);
  const shippingFee = calcShippingFee(safeSubtotal, rules);
  const promoDiscount = Math.min(calcPromoDiscount(safeSubtotal, rules), safeSubtotal);
  const voucherDiscount = Math.min(calcVoucherDiscount(voucher, safeSubtotal), safeSubtotal - promoDiscount);
  const discount = promoDiscount + voucherDiscount;

  return {
    subtotal: safeSubtotal,
    shippingFee,
    promoDiscount,
    voucherDiscount,
    discount,
    total: safeSubtotal - discount + shippingFee,
  };
};

/**
 * Áp giá đã giữ theo báo giá cấu hình.
 * Mỗi dòng được tính theo giá thấp hơn giữa giá hiện tại và giá trong báo giá,
 * chỉ khi số lượng mua không vượt số lượng đã báo giá. Khách không bao giờ trả cao hơn giá hiện tại.
 * @param {Array<{productId, quantity, unitPrice}>} lines giá hiện tại lấy từ DB
 * @param {Map<number, {unitPrice, quantity}>} lockedPrices giá trong báo giá
 */
const applyLockedPrices = (lines, lockedPrices) => lines.map((line) => {
  const listPrice = roundMoney(line.unitPrice);
  const locked = lockedPrices ? lockedPrices.get(Number(line.productId)) : null;
  const canLock = locked && line.quantity <= locked.quantity && roundMoney(locked.unitPrice) < listPrice;
  const unitPrice = canLock ? roundMoney(locked.unitPrice) : listPrice;
  return {
    ...line,
    listPrice,
    unitPrice,
    priceLocked: Boolean(canLock),
    lineTotal: unitPrice * line.quantity,
  };
});

module.exports = {
  applyLockedPrices,
  calcShippingFee,
  calcPromoDiscount,
  checkVoucher,
  calcVoucherDiscount,
  buildQuote,
};
