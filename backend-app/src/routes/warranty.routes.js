const express = require('express');
const rateLimit = require('express-rate-limit');
const warrantyController = require('../controllers/warranty.controller');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Tra cứu công khai theo serial: giới hạn chặt hơn để khó dò serial hàng loạt.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bạn tra cứu quá nhiều lần, vui lòng thử lại sau ít phút' },
});

router.get('/me', authenticate, warrantyController.getMyWarranties);
router.post('/admin', authenticate, authorize('admin'), warrantyController.registerWarranty);
router.get('/:serial', lookupLimiter, warrantyController.lookupWarranty);

module.exports = router;
