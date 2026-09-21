const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const {
  validateVoucher,
  createVoucher
} = require('../controllers/voucher.controller');

router.post('/validate', validateVoucher);
router.post('/', authenticate, authorize('admin'), createVoucher);

module.exports = router;