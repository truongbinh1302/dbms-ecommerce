const rateLimit = require('express-rate-limit');

// Trang web gọi nhiều API cho mỗi lần xem (sản phẩm, giỏ, báo giá, gợi ý tìm kiếm, Build PC),
// nên 100 request/15 phút cũ làm khách đang mua bình thường bị chặn. Đặt qua RATE_LIMIT_MAX.
const generalMax = Number.parseInt(process.env.RATE_LIMIT_MAX, 10);
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.isInteger(generalMax) && generalMax > 0 ? generalMax : 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts, please try again later' }
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many order requests, please slow down' }
});

module.exports = { generalLimiter, authLimiter, orderLimiter };