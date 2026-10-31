const test = require('node:test');
const assert = require('node:assert/strict');
const pricing = require('../../src/services/pricing.service');

const rules = {
  shippingFee: 30000,
  freeShippingThreshold: 3000000,
  tierDiscounts: [
    { minSubtotal: 30000000, amount: 500000 },
    { minSubtotal: 10000000, amount: 200000 },
  ],
};

const voucher = (overrides = {}) => ({
  VoucherID: 1,
  Code: 'GIAM10',
  DiscountType: 'percent',
  DiscountValue: 10,
  MinOrderAmount: 0,
  MaxDiscount: null,
  UsageLimit: 5,
  UsedCount: 0,
  IsActive: true,
  IsInDateRange: true,
  ...overrides,
});

test('phí ship: dưới 3 triệu tính 30.000đ, từ 3 triệu miễn phí, giỏ trống 0đ', () => {
  assert.equal(pricing.calcShippingFee(0, rules), 0);
  assert.equal(pricing.calcShippingFee(2999999, rules), 30000);
  assert.equal(pricing.calcShippingFee(3000000, rules), 0);
});

test('ưu đãi theo giá trị đơn lấy mốc cao nhất đạt được', () => {
  assert.equal(pricing.calcPromoDiscount(9999999, rules), 0);
  assert.equal(pricing.calcPromoDiscount(10000000, rules), 200000);
  assert.equal(pricing.calcPromoDiscount(45000000, rules), 500000);
});

test('voucher phần trăm bị chặn bởi MaxDiscount', () => {
  assert.equal(pricing.calcVoucherDiscount(voucher(), 2000000), 200000);
  assert.equal(pricing.calcVoucherDiscount(voucher({ MaxDiscount: 150000 }), 2000000), 150000);
});

test('voucher số tiền không vượt quá tạm tính', () => {
  assert.equal(pricing.calcVoucherDiscount(voucher({ DiscountType: 'amount', DiscountValue: 500000 }), 300000), 300000);
});

test('checkVoucher trả đúng lý do từ chối', () => {
  assert.equal(pricing.checkVoucher(null, 100).code, 'voucher_not_found');
  assert.equal(pricing.checkVoucher(voucher({ IsActive: false }), 100).code, 'voucher_inactive');
  assert.equal(pricing.checkVoucher(voucher({ IsInDateRange: false }), 100).code, 'voucher_out_of_date');
  assert.equal(pricing.checkVoucher(voucher({ UsageLimit: 2, UsedCount: 2 }), 100).code, 'voucher_used_up');
  assert.equal(pricing.checkVoucher(voucher({ MinOrderAmount: 500000 }), 499999).code, 'voucher_min_order');
  assert.equal(pricing.checkVoucher(voucher({ UsageLimit: null }), 100), null);
});

test('buildQuote cộng đủ các khoản và tổng không âm', () => {
  const quote = pricing.buildQuote(12000000, voucher({ MaxDiscount: 300000 }), rules);
  assert.deepEqual(quote, {
    subtotal: 12000000,
    shippingFee: 0,
    promoDiscount: 200000,
    voucherDiscount: 300000,
    discount: 500000,
    total: 11500000,
  });

  const small = pricing.buildQuote(100000, voucher({ DiscountType: 'amount', DiscountValue: 999999 }), rules);
  assert.equal(small.discount, 100000);
  assert.equal(small.total, 30000);
});
