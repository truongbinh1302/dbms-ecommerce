const express = require('express');
const promotionController = require('../controllers/promotion.controller');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Công khai: chương trình Hot Deal đang chạy / sắp chạy cho trang chủ.
router.get('/active', promotionController.getActive);

// Quản trị.
router.get('/admin', authenticate, authorize('admin'), promotionController.list);
router.post('/admin', authenticate, authorize('admin'), promotionController.create);
router.get('/admin/:id', authenticate, authorize('admin'), promotionController.get);
router.patch('/admin/:id/stop', authenticate, authorize('admin'), promotionController.stop);

module.exports = router;
