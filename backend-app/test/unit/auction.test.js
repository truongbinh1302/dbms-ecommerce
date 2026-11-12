/*
  Test đơn vị quy tắc đấu giá (đặt giá tự động, gia hạn phút chót, ẩn tên, kiểm tra dữ liệu phiên).
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const auction = require('../../src/utils/auction');

const at = (minutes) => new Date(Date.UTC(2026, 10, 12, 10, minutes));

test('giá tối thiểu: chưa ai trả thì bằng giá khởi điểm, có rồi thì cộng một bước', () => {
  assert.equal(auction.minimumBid({ bidCount: 0, currentPrice: null, startingPrice: 2000000, bidIncrement: 50000 }), 2000000);
  assert.equal(auction.minimumBid({ bidCount: 3, currentPrice: 2350000, startingPrice: 2000000, bidIncrement: 50000 }), 2400000);
});

test('đặt giá tự động: một người thì ở giá khởi điểm, hai người thì min(cao nhất, cao nhì + bước)', () => {
  const base = { startingPrice: 2000000, bidIncrement: 50000 };
  assert.equal(auction.resolveLeader({ ...base, maxBids: [] }), null);
  assert.deepEqual(auction.resolveLeader({ ...base, maxBids: [{ userId: 1, maxAmount: 3000000, since: at(0) }] }), { leaderUserId: 1, price: 2000000 });
  assert.deepEqual(
    auction.resolveLeader({ ...base, maxBids: [{ userId: 1, maxAmount: 2300000, since: at(0) }, { userId: 2, maxAmount: 2600000, since: at(5) }] }),
    { leaderUserId: 2, price: 2350000 },
  );
  // Cao nhì + bước vượt cao nhất: dừng ở giá tối đa của người dẫn đầu.
  assert.deepEqual(
    auction.resolveLeader({ ...base, maxBids: [{ userId: 3, maxAmount: 2800000, since: at(0) }, { userId: 4, maxAmount: 2780000, since: at(5) }] }),
    { leaderUserId: 3, price: 2800000 },
  );
});

test('hai giá tối đa bằng nhau: người đặt trước dẫn đầu, giá bằng mức đó', () => {
  const result = auction.resolveLeader({
    startingPrice: 1000000,
    bidIncrement: 50000,
    maxBids: [{ userId: 9, maxAmount: 1500000, since: at(10) }, { userId: 5, maxAmount: 1500000, since: at(3) }, { userId: 7, maxAmount: 1200000, since: at(1) }],
  });
  assert.deepEqual(result, { leaderUserId: 5, price: 1500000 });
  assert.deepEqual(auction.rankMaxBids([{ userId: 2, maxAmount: 10, since: at(1) }, { userId: 1, maxAmount: 10, since: at(1) }]).map((bid) => bid.userId), [1, 2]);
});

test('gia hạn phút chót: trả giá trong khoảng gia hạn thì kết thúc lùi tới now + khoảng gia hạn', () => {
  assert.deepEqual(auction.extendedEnd(at(30), at(20), 120), at(30));
  assert.deepEqual(auction.extendedEnd(at(30), at(29), 120), at(31));
  assert.deepEqual(auction.extendedEnd(at(30), at(29), 0), at(30));
});

test('ẩn tên người trả giá', () => {
  assert.equal(auction.maskName('Trương Bình'), 'T***h');
  assert.equal(auction.maskName('An'), 'A***');
  assert.equal(auction.maskName(''), 'Ẩn danh');
});

test('kiểm tra dữ liệu mở phiên', () => {
  const now = at(0);
  const ok = auction.validateAuctionInput({ productId: 5, startingPrice: 2000000, bidIncrement: 50000, buyNowPrice: 3500000, endsAt: at(60) }, now);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.extendSeconds, 120);
  assert.equal(ok.value.buyNowPrice, 3500000);

  const bad = auction.validateAuctionInput({ productId: 0, startingPrice: 500, bidIncrement: 0, buyNowPrice: 100, startsAt: at(-10), endsAt: at(-8), extendSeconds: 900 }, now);
  assert.equal(bad.errors.length, 7);
  assert.match(auction.validateAuctionInput({ productId: 1, startingPrice: 2000000, bidIncrement: 50000, endsAt: new Date(at(0).getTime() + 31 * 86400000) }, now).errors[0], /30 ngày/);
});
