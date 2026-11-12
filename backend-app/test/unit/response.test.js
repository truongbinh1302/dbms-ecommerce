/*
  Test đơn vị: lỗi 5xx ở production không lộ chi tiết, trừ thông báo viết sẵn cho khách (expose).
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { error } = require('../../src/utils/response');

const fakeRes = () => {
  const res = { req: { method: 'POST', originalUrl: '/api/v1/assistant/chat' } };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test('production: 5xx bị thay bằng thông báo chung, trừ khi expose', (t) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.mock.method(console, 'error', () => {});
  try {
    const hidden = error(fakeRes(), 'connect ECONNREFUSED 10.0.0.5:1433', 500);
    assert.equal(hidden.body.message, 'Hệ thống đang gặp lỗi, vui lòng thử lại sau');
    assert.match(hidden.body.errorId, /^[0-9a-f]{8}$/);

    const shown = error(fakeRes(), 'Trợ lý đang bận, bạn thử lại sau ít phút nhé.', 503, { code: 'assistant_unavailable' }, { expose: true });
    assert.equal(shown.statusCode, 503);
    assert.equal(shown.body.message, 'Trợ lý đang bận, bạn thử lại sau ít phút nhé.');
    assert.deepEqual(shown.body.errors, { code: 'assistant_unavailable' });

    assert.equal(error(fakeRes(), 'Sai dữ liệu', 400).body.message, 'Sai dữ liệu', '4xx giữ nguyên như trước');
  } finally {
    process.env.NODE_ENV = previous;
  }
});
