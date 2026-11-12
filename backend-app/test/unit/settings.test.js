/*
  Test đơn vị cài đặt admin: mã hoá khoá API và kiểm tra dữ liệu nhập (không cần DB).
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../../src/services/settings.service');

test('khoá API mã hoá AES-GCM: không lộ khoá, mỗi lần mã hoá khác nhau, sửa một byte thì không giải mã được', () => {
  const key = 'sk-test-ABCDEFGHIJKLMNOPQRSTUVWX1234';
  const first = settings.encryptSecret(key);
  const second = settings.encryptSecret(key);
  assert.ok(first.startsWith('v1:') && !first.includes(key) && first !== second);
  assert.equal(settings.decryptSecret(first), key);
  const raw = Buffer.from(first.slice(3), 'base64');
  raw[raw.length - 1] ^= 1;
  assert.equal(settings.decryptSecret(`v1:${raw.toString('base64')}`), null);
  assert.equal(settings.decryptSecret('sk-plain-text'), null);
});

test('khoá giải mã bằng secret khác thì coi như không đọc được', () => {
  const stored = settings.encryptSecret('sk-test-ABCDEFGHIJKLMNOPQRSTUVWX1234');
  const previous = process.env.SETTINGS_SECRET;
  process.env.SETTINGS_SECRET = 'another-secret';
  try {
    assert.equal(settings.decryptSecret(stored), null);
  } finally {
    if (previous === undefined) delete process.env.SETTINGS_SECRET; else process.env.SETTINGS_SECRET = previous;
  }
});

test('kiểm tra dữ liệu admin nhập', () => {
  assert.deepEqual(settings.validateAssistantUpdate({ apiKey: '  sk-proj-abcdefghijklmnopqrstuvwxyz  ' }), { apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz' });
  assert.deepEqual(settings.validateAssistantUpdate({ apiKey: '' }), { apiKey: '' });
  assert.deepEqual(settings.validateAssistantUpdate({ apiKey: null }), { apiKey: '' });
  assert.throws(() => settings.validateAssistantUpdate({ apiKey: 'abc' }), (err) => err.status === 400);
  assert.throws(() => settings.validateAssistantUpdate({ apiKey: 'sk-has space inside the key 123' }), (err) => err.status === 400);
  assert.deepEqual(settings.validateAssistantUpdate({ model: 'gpt-5.4-mini', enabled: false, perHour: 30, dailyLimit: 1000 }), { model: 'gpt-5.4-mini', enabled: false, perHour: 30, dailyLimit: 1000 });
  assert.throws(() => settings.validateAssistantUpdate({ model: 'gpt 5; drop' }), (err) => err.status === 400);
  assert.throws(() => settings.validateAssistantUpdate({ enabled: 'yes' }), (err) => err.status === 400);
  assert.throws(() => settings.validateAssistantUpdate({ perHour: 0 }), (err) => err.status === 400);
  assert.throws(() => settings.validateAssistantUpdate({ dailyLimit: 1.5 }), (err) => err.status === 400);
  assert.throws(() => settings.validateAssistantUpdate({}), (err) => err.status === 400);
});

test('thông tin gửi cho trang quản trị không có khoá', () => {
  const view = settings.publicView({ apiKey: 'sk-test-secret-value-1234', keyHint: '…1234', enabled: true, model: 'm' });
  assert.equal(JSON.stringify(view).includes('secret-value'), false);
  assert.deepEqual([view.hasKey, view.keyHint], [true, '…1234']);
});
