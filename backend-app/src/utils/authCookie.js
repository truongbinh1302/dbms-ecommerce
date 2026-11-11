const config = require('../config/env');

/*
  Refresh token nằm trong cookie httpOnly (JavaScript trên trang không đọc được), chỉ gửi kèm các request
  tới /api/v1/auth, SameSite=Strict. Access token sống ngắn (JWT_ACCESS_EXPIRES) vẫn do trang giữ.
  Express có sẵn res.cookie/res.clearCookie; đọc cookie thì tự tách header, không cần thêm thư viện.
*/

const COOKIE_NAME = 'bt_refresh';
const COOKIE_PATH = '/api/v1/auth';
const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

/** "7d", "12h", "30m", "45s" → mili giây. Giá trị lạ dùng 7 ngày. */
const durationMs = (value) => {
  const match = /^(\d+)\s*([smhd])$/.exec(String(value || '').trim());
  return match ? Number(match[1]) * UNIT_MS[match[2]] : 7 * UNIT_MS.d;
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.auth.cookieSecure,
  path: COOKIE_PATH,
});

const setRefreshCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: durationMs(config.jwt.refreshExpires) });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
};

const readRefreshCookie = (req) => {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};

module.exports = { COOKIE_NAME, COOKIE_PATH, durationMs, setRefreshCookie, clearRefreshCookie, readRefreshCookie };
