const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const analyticsController = require('../controllers/analytics.controller');
const inventoryController = require('../controllers/inventory.controller');

const router = express.Router();

router.get('/dashboard', authenticate, authorize('admin'), analyticsController.getDashboard);
// Báo cáo theo ngày (giờ Việt Nam): ?from=YYYY-MM-DD&to=YYYY-MM-DD, mặc định 30 ngày gần nhất.
router.get('/daily', authenticate, authorize('admin'), inventoryController.getDailyReport);

module.exports = router;
