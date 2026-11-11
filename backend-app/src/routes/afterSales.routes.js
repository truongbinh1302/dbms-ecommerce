const express = require('express');
const controller = require('../controllers/afterSales.controller');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Công khai: loại dịch vụ, lịch còn trống, bảng ước tính thu cũ.
router.get('/options', controller.getOptions);
router.post('/trade-in/estimate', controller.estimateTradeIn);

// Khách đã đăng nhập.
router.get('/requests', authenticate, controller.listMine);
router.post('/requests', authenticate, controller.createRequest);
router.get('/requests/:id', authenticate, controller.getMine);
router.patch('/requests/:id/cancel', authenticate, controller.cancelMine);

// Quản trị.
router.get('/admin/requests', authenticate, authorize('admin'), controller.listAll);
router.patch('/admin/requests/:id', authenticate, authorize('admin'), controller.update);

module.exports = router;
