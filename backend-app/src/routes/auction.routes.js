const express = require('express');
const rateLimit = require('express-rate-limit');
const auctionController = require('../controllers/auction.controller');
const { authenticate, authorize, optionalAuthenticate } = require('../middlewares/auth');

const router = express.Router();

// Trả giá: mỗi tài khoản tối đa 30 lượt mỗi phút (đủ cho người thật, chặn script bấm liên tục).
const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user ? req.user.id : req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bạn trả giá hơi nhanh, chờ một chút rồi thử lại.' },
});

// Quản trị.
router.get('/admin/list', authenticate, authorize('admin'), auctionController.adminList);
router.post('/admin', authenticate, authorize('admin'), auctionController.create);
router.post('/admin/:id/cancel', authenticate, authorize('admin'), auctionController.cancel);

// Công khai (đăng nhập thì biết phiên nào mình đang dẫn đầu).
router.get('/', optionalAuthenticate, auctionController.list);
router.get('/:id', optionalAuthenticate, auctionController.get);
router.get('/:id/events', auctionController.stream);

// Cần đăng nhập.
router.post('/:id/bids', authenticate, bidLimiter, auctionController.bid);
router.post('/:id/buy-now', authenticate, bidLimiter, auctionController.buyNow);
router.get('/:id/checkout', authenticate, auctionController.checkout);

module.exports = router;
