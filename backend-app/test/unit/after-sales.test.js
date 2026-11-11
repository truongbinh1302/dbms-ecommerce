const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateTradeIn, vietnamDate } = require('../../src/services/afterSales.service');

test('ước tính thu cũ: giảm theo tuổi máy và tình trạng, làm tròn 50.000đ', () => {
  const fresh = estimateTradeIn({ category: 'laptop', purchasePrice: 20000000, ageMonths: 0, condition: 'like_new' });
  const old = estimateTradeIn({ category: 'laptop', purchasePrice: 20000000, ageMonths: 36, condition: 'like_new' });
  const broken = estimateTradeIn({ category: 'laptop', purchasePrice: 20000000, ageMonths: 0, condition: 'broken' });
  // 20tr x 0.95 x 0.8 = 15.2tr; khoảng 90%–105%.
  assert.deepEqual([fresh.low, fresh.high], [13700000, 15950000]);
  assert.ok(old.high < fresh.low);
  assert.ok(broken.high < old.high);
  for (const value of [fresh.low, fresh.high, old.low, broken.high]) assert.equal(value % 50000, 0);
  assert.match(fresh.explanation, /72%/);
});

test('ước tính thu cũ: từ chối dữ liệu sai', () => {
  const base = { category: 'gpu', purchasePrice: 8000000, ageMonths: 12, condition: 'good' };
  assert.throws(() => estimateTradeIn({ ...base, category: 'phone' }), /loại máy/);
  assert.throws(() => estimateTradeIn({ ...base, condition: 'perfect' }), /tình trạng/);
  assert.throws(() => estimateTradeIn({ ...base, purchasePrice: 5000 }), /Giá mua mới/);
  assert.throws(() => estimateTradeIn({ ...base, ageMonths: 1.5 }), /tháng/);
  assert.throws(() => estimateTradeIn({ ...base, ageMonths: 200 }), /tháng/);
});

test('ngày theo giờ Việt Nam: 17:00 UTC đã là ngày hôm sau', () => {
  assert.equal(vietnamDate(0, new Date('2026-11-11T16:59:00Z')), '2026-11-11');
  assert.equal(vietnamDate(0, new Date('2026-11-11T17:00:00Z')), '2026-11-12');
  assert.equal(vietnamDate(1, new Date('2026-11-11T17:00:00Z')), '2026-11-13');
});
