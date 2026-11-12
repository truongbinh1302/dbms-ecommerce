/*
  Test tích hợp: admin lưu khoá OpenAI và cài đặt trợ lý trên SQL Server thật (không gọi OpenAI).
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const settings = require('../../src/services/settings.service');
const assistant = require('../../src/services/assistant.service');

const KEY = 'sk-test-integration-ABCDEFGHIJKLMNOP';
let adminId = null;
const rows = async () => (await new sql.Request(getPool())
  .query("SELECT SettingKey, SettingValue, IsSecret, UpdatedBy FROM AppSettings WHERE SettingKey LIKE N'assistant.%'")).recordset;

test.before(async () => {
  await connectSQL();
  await new sql.Request(getPool()).query("DELETE FROM AppSettings WHERE SettingKey LIKE N'assistant.%'");
  settings.invalidate();
  const admin = await new sql.Request(getPool()).query("SELECT TOP 1 UserID FROM Users WHERE Role = N'admin' ORDER BY UserID");
  adminId = admin.recordset[0]?.UserID || null;
});

test.after(async () => {
  await new sql.Request(getPool()).query("DELETE FROM AppSettings WHERE SettingKey LIKE N'assistant.%'");
  settings.invalidate();
  await getPool().close();
});

test('lưu khoá: trong DB chỉ có bản mã hoá, trang quản trị chỉ thấy 4 ký tự cuối, trợ lý dùng được khoá', async () => {
  const view = await settings.updateAssistantSettings(adminId, { apiKey: KEY, model: 'gpt-5.4-mini', perHour: 15, dailyLimit: 200 });
  assert.deepEqual([view.hasKey, view.keySource, view.keyHint, view.enabled, view.perHour, view.dailyLimit], [true, 'admin', '…MNOP', true, 15, 200]);
  assert.equal(JSON.stringify(view).includes(KEY), false);

  const stored = await rows();
  const keyRow = stored.find((row) => row.SettingKey === settings.KEYS.apiKey);
  assert.ok(keyRow.SettingValue.startsWith('v1:') && !keyRow.SettingValue.includes(KEY));
  assert.equal(keyRow.IsSecret, true);
  assert.equal(keyRow.UpdatedBy, adminId);

  const effective = await settings.getAssistantSettings({ fresh: true });
  assert.equal(effective.apiKey, KEY);
  assert.deepEqual(await assistant.getStatus(), { enabled: true });
});

test('tắt trợ lý, thử kết nối, xoá khoá', async () => {
  await settings.updateAssistantSettings(adminId, { enabled: false });
  assert.deepEqual(await assistant.getStatus(), { enabled: false });
  await settings.updateAssistantSettings(adminId, { enabled: true });

  const calls = [];
  const fakeFetch = (status) => async (url, options) => {
    calls.push({ url, auth: options.headers.Authorization });
    return { ok: status === 200, status };
  };
  assert.equal((await settings.testAssistantConnection({ fetch: fakeFetch(200) })).ok, true);
  assert.ok(calls[0].url.endsWith('/models/gpt-5.4-mini') && calls[0].auth === `Bearer ${KEY}`);
  assert.match((await settings.testAssistantConnection({ fetch: fakeFetch(401) })).message, /từ chối/);
  const before = calls.length;
  assert.equal((await settings.testAssistantConnection({ candidateKey: 'not-a-key', fetch: fakeFetch(200) })).ok, false);
  assert.equal(calls.length, before, 'khoá sai dạng không gửi đi');

  const removed = await settings.updateAssistantSettings(adminId, { apiKey: '' });
  assert.equal(removed.hasKey, Boolean(process.env.OPENAI_API_KEY));
  assert.equal((await rows()).some((row) => row.SettingKey === settings.KEYS.apiKey), false);
  if (!process.env.OPENAI_API_KEY) assert.deepEqual(await assistant.getStatus(), { enabled: false });
});

test('nhiều admin lưu cùng lúc không lỗi trùng khoá (MERGE HOLDLOCK)', async () => {
  const models = ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5-mini', 'gpt-5.4-nano', 'gpt-5'];
  const results = await Promise.allSettled(models.map((model) => settings.updateAssistantSettings(adminId, { model })));
  assert.ok(results.every((item) => item.status === 'fulfilled'), JSON.stringify(results.filter((item) => item.status === 'rejected').map((item) => item.reason.message)));
  const modelRows = (await rows()).filter((row) => row.SettingKey === settings.KEYS.model);
  assert.equal(modelRows.length, 1);
  assert.ok(models.includes(modelRows[0].SettingValue));
});
