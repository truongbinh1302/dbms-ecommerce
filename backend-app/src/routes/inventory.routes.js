const express = require('express');
const inventoryController = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middlewares/auth');

// Sổ kho: chỉ admin.
const router = express.Router();
router.use(authenticate, authorize('admin'));

router.get('/receipts', inventoryController.listReceipts);
router.post('/receipts', inventoryController.createReceipt);
router.get('/receipts/:id', inventoryController.getReceipt);
router.get('/movements', inventoryController.listMovements);
router.get('/low-stock', inventoryController.listLowStock);

module.exports = router;
