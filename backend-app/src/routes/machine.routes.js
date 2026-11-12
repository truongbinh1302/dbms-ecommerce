const express = require('express');
const machineController = require('../controllers/machine.controller');

const router = express.Router();

// "Máy này chạy được gì?" và nâng cấp laptop: không cần đăng nhập, không lưu gì.
router.get('/laptops', machineController.listLaptops);
router.post('/analyze', machineController.analyze);
router.post('/build', machineController.forBuild);
router.get('/products/:id', machineController.forProduct);

module.exports = router;
