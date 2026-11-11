const test = require('node:test');
const assert = require('node:assert/strict');
const { durationMs, readRefreshCookie } = require('../../src/utils/authCookie');

test('cookie refresh token: đọc thời hạn và đọc cookie từ header', () => {
  assert.equal(durationMs('7d'), 7 * 86400000);
  assert.equal(durationMs('12h'), 12 * 3600000);
  assert.equal(durationMs('30m'), 1800000);
  assert.equal(durationMs('lạ'), 7 * 86400000);
  assert.equal(readRefreshCookie({ headers: { cookie: 'theme=dark; bt_refresh=abc.def%3D; other=1' } }), 'abc.def=');
  assert.equal(readRefreshCookie({ headers: { cookie: 'xbt_refresh=nope' } }), null);
  assert.equal(readRefreshCookie({ headers: {} }), null);
});
