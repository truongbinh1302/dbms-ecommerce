const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const {
  validateVoucher,
  createVoucher,
  listAdminVouchers,
  setVoucherActive,
} = require('../controllers/voucher.controller');

router.post('/validate', validateVoucher);
router.post('/', authenticate, authorize('admin'), createVoucher);
router.get('/admin', authenticate, authorize('admin'), listAdminVouchers);
router.patch('/admin/:id', authenticate, authorize('admin'), setVoucherActive);

module.exports = router;