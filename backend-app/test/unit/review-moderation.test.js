/*
  Test đơn vị: kiểm tra yêu cầu kiểm duyệt đánh giá của admin (không cần cơ sở dữ liệu).
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateModeration, HIDE_REASONS, moderateReview } = require('../../src/services/review.service');

test('ẩn đánh giá phải kèm lý do trong danh sách cho phép', () => {
  assert.deepEqual(validateModeration({ hidden: true, reason: 'spam' }), { hidden: true, reason: 'spam' });
  assert.throws(() => validateModeration({ hidden: true }), (err) => err.status === 400 && /lý do/.test(err.message));
  assert.throws(() => validateModeration({ hidden: true, reason: 'toString' }), (err) => err.status === 400);
  assert.throws(() => validateModeration({ hidden: 'yes', reason: 'spam' }), (err) => err.status === 400);
  assert.deepEqual(validateModeration({ hidden: false }), { hidden: false });
  assert.deepEqual(Object.keys(HIDE_REASONS), ['spam', 'offensive', 'personal_info', 'off_topic']);
});

test('phản hồi: làm gọn khoảng trắng, chuỗi rỗng hoặc null là xoá, giới hạn độ dài', () => {
  assert.deepEqual(validateModeration({ reply: '  Cảm ơn   bạn \r\n\r\n\r\n\r\nđã góp ý  ' }), { reply: 'Cảm ơn bạn \n\nđã góp ý' });
  assert.deepEqual(validateModeration({ reply: '' }), { reply: '' });
  assert.deepEqual(validateModeration({ reply: null }), { reply: '' });
  assert.throws(() => validateModeration({ reply: 'a' }), (err) => err.status === 400);
  assert.throws(() => validateModeration({ reply: 'x'.repeat(1001) }), (err) => err.status === 400 && /1000/.test(err.message));
  assert.deepEqual(validateModeration({ hidden: false, reply: 'Đã xử lý' }), { hidden: false, reply: 'Đã xử lý' });
});

test('yêu cầu trống hoặc mã đánh giá sai bị từ chối trước khi chạm cơ sở dữ liệu', async () => {
  assert.throws(() => validateModeration({}), (err) => err.status === 400);
  await assert.rejects(moderateReview('not-an-id', { hidden: false }), (err) => err.status === 400);
});
