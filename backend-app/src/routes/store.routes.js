const express = require('express');
const config = require('../config/env');
const { success } = require('../utils/response');

const router = express.Router();

// Số liệu cho trang Chính sách, chân trang và trang thanh toán, lấy từ cấu hình thật của hệ thống
// để chính sách công bố không lệch với cách tính tiền trong code.
router.get('/info', (req, res) => {
  const { store, pricing, payment } = config;
  return success(res, {
    seller: {
      legalName: store.legalName,
      taxCode: store.taxCode,
      address: store.address,
      phone: store.phone,
      email: store.email,
      representative: store.representative,
    },
    termsVersion: store.termsVersion,
    pricesIncludeTax: store.pricesIncludeTax,
    shipping: {
      fee: pricing.shippingFee,
      freeThreshold: pricing.freeShippingThreshold,
      province: store.province,
      deliveryDaysLocal: store.deliveryDaysLocal,
      deliveryDaysOther: store.deliveryDaysOther,
    },
    tierDiscounts: pricing.tierDiscounts,
    payment: {
      methods: ['cod', 'vnpay'],
      vnpayExpireMinutes: payment.expireMinutes,
    },
    quoteValidHours: pricing.quoteValidHours,
    returnDays: store.returnDays,
    complaintResponseDays: store.complaintResponseDays,
  }, 'Store info retrieved');
});

module.exports = router;
