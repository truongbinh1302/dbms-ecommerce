const express = require('express');
const { authenticate } = require('../middlewares/auth');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

router.post('/vnpay/create', authenticate, paymentController.createVNPayLink);
router.get('/vnpay/return', paymentController.vnpayReturn);

// Hỗ trợ cả GET và POST để tiện test sandbox/IPN.
router.get('/vnpay/ipn', paymentController.vnpayIpn);
router.post('/vnpay/ipn', paymentController.vnpayIpn);

module.exports = router;