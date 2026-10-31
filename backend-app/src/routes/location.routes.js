const express = require('express');
const { PROVINCES } = require('../services/address.service');
const { success } = require('../utils/response');

const router = express.Router();

// Danh sách 34 tỉnh/thành sau sắp xếp đơn vị hành chính (01/7/2025) cho form địa chỉ.
router.get('/provinces', (req, res) => success(res, PROVINCES, 'Provinces retrieved'));

module.exports = router;
