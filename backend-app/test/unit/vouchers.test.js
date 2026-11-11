const test = require('node:test');
const assert = require('node:assert/strict');
const { validateVoucherInput } = require('../../src/services/voucher.service');

const base = { code: ' sale-11 ', discountType: 'percent', discountValue: 10, maxDiscount: '500000', minOrderAmount: '2000000', usageLimit: '100' };

test('mã giảm giá: chuẩn hoá dữ liệu admin nhập', () => {
  const result = validateVoucherInput({ ...base, startDate: '2026-11-12T08:00:00+07:00', endDate: '2026-11-20T23:59:00+07:00' });
  assert.equal(result.code, 'SALE-11');
  assert.deepEqual([result.discountValue, result.maxDiscount, result.minOrderAmount, result.usageLimit], [10, 500000, 2000000, 100]);
  assert.equal(result.startDate.toISOString(), '2026-11-12T01:00:00.000Z');
  const amount = validateVoucherInput({ code: 'GIAM50K', discountType: 'amount', discountValue: 50000, maxDiscount: 999, minOrderAmount: 500000 });
  assert.equal(amount.maxDiscount, null, 'giảm theo số tiền không cần mức tối đa');
  assert.equal(validateVoucherInput({ code: 'KHONGGIOIHAN', discountType: 'amount', discountValue: 20000 }).usageLimit, null);
});

test('mã giảm giá: từ chối dữ liệu sai', () => {
  const bad = [
    [{ code: 'có dấu' }, /Mã gồm/],
    [{ code: 'AB' }, /Mã gồm/],
    [{ discountType: 'gift' }, /Loại giảm giá/],
    [{ discountValue: 0 }, /Phần trăm/],
    [{ discountValue: 95 }, /Phần trăm/],
    [{ discountValue: 12.5 }, /Phần trăm/],
    [{ discountType: 'amount', discountValue: 500, maxDiscount: null }, /tối thiểu 1.000đ/],
    [{ discountType: 'amount', discountValue: 3000000 }, /không được lớn hơn giá trị đơn tối thiểu/],
    [{ maxDiscount: 0 }, /Mức giảm tối đa/],
    [{ usageLimit: 0 }, /lượt dùng/],
    [{ usageLimit: 2.5 }, /lượt dùng/],
    [{ startDate: 'hôm nay' }, /bắt đầu/],
    [{ startDate: '2026-11-20T00:00:00Z', endDate: '2026-11-19T00:00:00Z' }, /kết thúc phải sau/],
  ];
  for (const [patch, pattern] of bad) {
    assert.throws(() => validateVoucherInput({ ...base, ...patch }), (err) => err.status === 400 && pattern.test(err.message), JSON.stringify(patch));
  }
});
