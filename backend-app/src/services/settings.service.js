const crypto = require('crypto');
const config = require('../config/env');
const { getPool, sql } = require('../config/db.sql');

/*
  Cài đặt do admin chỉnh trên trang quản trị (bảng AppSettings, migration 021). Hiện dùng cho trợ lý mua hàng:
  khoá OpenAI, mô hình, bật/tắt, giới hạn câu hỏi.
  - Khoá API mã hoá AES-256-GCM trước khi lưu. Khoá mã hoá lấy từ SETTINGS_SECRET, không có thì suy ra từ
    JWT_ACCESS_SECRET. Đổi secret thì khoá cũ không giải mã được: trang quản trị báo cần nhập lại.
  - API không bao giờ trả khoá ra ngoài, chỉ 4 ký tự cuối để admin nhận ra.
  - Khoá nhập trên trang quản trị được ưu tiên; không có thì dùng OPENAI_API_KEY trong .env.
*/

const KEYS = {
  apiKey: 'assistant.openaiApiKey',
  model: 'assistant.model',
  enabled: 'assistant.enabled',
  perHour: 'assistant.perHour',
  dailyLimit: 'assistant.dailyLimit',
};
const CACHE_MS = 30000;
const MODEL_PATTERN = /^[A-Za-z0-9._:-]{2,80}$/;
const API_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,300}$/;

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const encryptionKey = () => crypto.createHash('sha256')
  .update(process.env.SETTINGS_SECRET || `${config.jwt.accessSecret}:app-settings`)
  .digest();

const encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
};

/** null nếu không giải mã được (đổi secret hoặc dữ liệu bị sửa). */
const decryptSecret = (stored) => {
  try {
    if (!String(stored || '').startsWith('v1:')) return null;
    const raw = Buffer.from(String(stored).slice(3), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

const keyHint = (key) => (key ? `…${key.slice(-4)}` : null);

/** Kiểm tra dữ liệu admin gửi; trả các thay đổi hợp lệ. apiKey '' hoặc null = xoá khoá đã lưu. */
const validateAssistantUpdate = (payload = {}) => {
  const change = {};
  if (payload.apiKey !== undefined) {
    const key = payload.apiKey === null ? '' : String(payload.apiKey).trim();
    if (key && !API_KEY_PATTERN.test(key)) throw createHttpError(400, 'Khoá API OpenAI không đúng dạng (bắt đầu bằng "sk-")');
    change.apiKey = key;
  }
  if (payload.model !== undefined) {
    const model = String(payload.model || '').trim();
    if (!MODEL_PATTERN.test(model)) throw createHttpError(400, 'Tên mô hình không hợp lệ');
    change.model = model;
  }
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') throw createHttpError(400, 'enabled phải là true hoặc false');
    change.enabled = payload.enabled;
  }
  for (const [field, max, label] of [['perHour', 1000, 'Số câu mỗi giờ'], ['dailyLimit', 100000, 'Số câu mỗi ngày']]) {
    if (payload[field] === undefined) continue;
    const value = Number(payload[field]);
    if (!Number.isInteger(value) || value < 1 || value > max) throw createHttpError(400, `${label} phải từ 1 đến ${max.toLocaleString('vi-VN')}`);
    change[field] = value;
  }
  if (!Object.keys(change).length) throw createHttpError(400, 'Không có thay đổi nào');
  return change;
};

let cache = { at: 0, value: null };
const invalidate = () => {
  cache = { at: 0, value: null };
};

/** Cài đặt trợ lý đang có hiệu lực (gộp trang quản trị và .env), có cache 30 giây. */
const getAssistantSettings = async ({ fresh = false } = {}) => {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const result = await new sql.Request(getPool())
    .query(`
      SELECT s.SettingKey, s.SettingValue, s.UpdatedAt, u.FullName AS UpdatedByName
      FROM AppSettings s LEFT JOIN Users u ON u.UserID = s.UpdatedBy
      WHERE s.SettingKey LIKE N'assistant.%'
    `);
  const rows = Object.fromEntries(result.recordset.map((row) => [row.SettingKey, row]));
  const env = config.assistant;
  const storedKey = rows[KEYS.apiKey]?.SettingValue ? decryptSecret(rows[KEYS.apiKey].SettingValue) : null;
  const keyUnreadable = Boolean(rows[KEYS.apiKey]?.SettingValue) && !storedKey;
  const apiKey = storedKey || env.apiKey || '';
  const toInt = (key, fallback) => (rows[key] ? Number(rows[key].SettingValue) : fallback);
  const updated = result.recordset.reduce((latest, row) => (!latest || row.UpdatedAt > latest.UpdatedAt ? row : latest), null);
  const value = {
    apiKey,
    keySource: storedKey ? 'admin' : env.apiKey ? 'env' : null,
    keyHint: keyHint(apiKey),
    keyUnreadable,
    model: rows[KEYS.model]?.SettingValue || env.model,
    switchedOn: rows[KEYS.enabled] ? rows[KEYS.enabled].SettingValue === 'true' : true,
    perHour: toInt(KEYS.perHour, env.perHour),
    dailyLimit: toInt(KEYS.dailyLimit, env.dailyLimit),
    updatedAt: updated?.UpdatedAt || null,
    updatedByName: updated?.UpdatedByName || null,
  };
  value.enabled = Boolean(value.apiKey) && value.switchedOn;
  cache = { at: Date.now(), value };
  return value;
};

/** Thông tin cho trang quản trị: không có khoá, chỉ 4 ký tự cuối. */
const publicView = (settings) => {
  const { apiKey, ...rest } = settings;
  return { ...rest, hasKey: Boolean(apiKey) };
};

const updateAssistantSettings = async (adminId, payload) => {
  const change = validateAssistantUpdate(payload);
  const rows = [];
  if (change.apiKey !== undefined) rows.push([KEYS.apiKey, change.apiKey ? encryptSecret(change.apiKey) : null, 1]);
  if (change.model !== undefined) rows.push([KEYS.model, change.model, 0]);
  if (change.enabled !== undefined) rows.push([KEYS.enabled, String(change.enabled), 0]);
  if (change.perHour !== undefined) rows.push([KEYS.perHour, String(change.perHour), 0]);
  if (change.dailyLimit !== undefined) rows.push([KEYS.dailyLimit, String(change.dailyLimit), 0]);

  const transaction = new sql.Transaction(getPool());
  await transaction.begin();
  try {
    for (const [key, value, secret] of rows) {
      await new sql.Request(transaction)
        .input('key', sql.NVarChar(100), key)
        .input('value', sql.NVarChar(sql.MAX), value)
        .input('secret', sql.Bit, secret)
        .input('adminId', sql.Int, adminId ? Number(adminId) : null)
        .query(value === null
          ? 'DELETE FROM AppSettings WHERE SettingKey = @key'
          : `
            MERGE AppSettings WITH (HOLDLOCK) AS target
            USING (SELECT @key AS SettingKey) AS source ON target.SettingKey = source.SettingKey
            WHEN MATCHED THEN UPDATE SET SettingValue = @value, IsSecret = @secret, UpdatedBy = @adminId, UpdatedAt = SYSDATETIME()
            WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue, IsSecret, UpdatedBy) VALUES (@key, @value, @secret, @adminId);
          `);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
  invalidate();
  return publicView(await getAssistantSettings({ fresh: true }));
};

/**
 * Thử khoá với OpenAI: hỏi thông tin mô hình đang chọn (không tốn phí). Không trả khoá ra ngoài.
 * Có thể thử khoá mới trước khi lưu (candidateKey).
 */
const testAssistantConnection = async ({ candidateKey = null, fetch: fetchImpl = globalThis.fetch } = {}) => {
  const settings = await getAssistantSettings({ fresh: true });
  const key = candidateKey ? String(candidateKey).trim() : settings.apiKey;
  if (!key) return { ok: false, message: 'Chưa có khoá API' };
  if (candidateKey && !API_KEY_PATTERN.test(key)) return { ok: false, message: 'Khoá API OpenAI không đúng dạng (bắt đầu bằng "sk-")' };
  try {
    const response = await fetchImpl(`${config.assistant.baseUrl}/models/${encodeURIComponent(settings.model)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return { ok: true, message: `Kết nối được, mô hình ${settings.model} dùng được.`, model: settings.model };
    if (response.status === 401) return { ok: false, message: 'OpenAI từ chối khoá này (sai hoặc đã bị thu hồi).' };
    if (response.status === 404) return { ok: false, message: `Khoá hợp lệ nhưng không dùng được mô hình ${settings.model}. Hãy chọn mô hình khác.` };
    if (response.status === 429) return { ok: false, message: 'OpenAI báo hết hạn mức hoặc chưa nạp tiền cho tài khoản.' };
    return { ok: false, message: `OpenAI trả lỗi ${response.status}. Thử lại sau.` };
  } catch {
    return { ok: false, message: 'Không kết nối được tới OpenAI từ máy chủ (mạng hoặc tường lửa).' };
  }
};

module.exports = {
  KEYS,
  encryptSecret,
  decryptSecret,
  validateAssistantUpdate,
  getAssistantSettings,
  updateAssistantSettings,
  testAssistantConnection,
  publicView,
  invalidate,
};
