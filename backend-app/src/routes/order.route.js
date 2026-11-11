const express = require('express');
const orderController = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

// Admin routes must be declared before /:id to avoid route shadowing.
router.get('/admin', authenticate, authorize('admin'), orderController.getAdminOrders);
router.get('/admin/returns', authenticate, authorize('admin'), orderController.listReturns);
router.patch('/admin/returns/:returnId', authenticate, authorize('admin'), orderController.updateReturn);
router.patch('/admin/:id/status', authenticate, authorize('admin'), orderController.updateOrderStatus);
router.post('/admin/:id/refund', authenticate, authorize('admin'), orderController.recordRefund);

// Customer routes
router.post('/', authenticate, orderController.createOrder);
router.get('/my-orders', authenticate, orderController.getUserOrders);
router.get('/:id/payment-status', authenticate, orderController.getOrderPaymentStatus);
router.get('/:id', authenticate, orderController.getOrderById);
router.patch('/:id/cancel', authenticate, orderController.cancelOrder);
router.post('/:id/returns', authenticate, orderController.createReturn);
router.patch('/returns/:returnId/cancel', authenticate, orderController.cancelMyReturn);

module.exports = router;
