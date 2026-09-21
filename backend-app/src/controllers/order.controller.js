const orderService = require('../services/order.service');
const { success, error } = require('../utils/response');

const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await orderService.createOrder(userId, req.body);
    return success(res, result, 'Order created successfully', 201);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;
    const result = await orderService.getUserOrders(userId, status, page, limit);
    return success(res, result, 'Orders retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const getAdminOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await orderService.getAdminOrders(status, page, limit);
    return success(res, result, 'Admin orders retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.role === 'admin' ? null : req.user.id;
    const order = await orderService.getOrderById(id, userId);

    if (!order) {
      return error(res, 'Order not found', 404);
    }

    return success(res, order, 'Order retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const result = await orderService.cancelOrder(id, userId, reason);
    return success(res, result, 'Order cancelled successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    return error(res, err.message);
  }
};

const getOrderPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.role === 'admin' ? null : req.user.id;

    const result = await orderService.getOrderPaymentStatus(id, userId);

    if (!result) {
      return error(res, 'Order not found', 404);
    }

    return success(res, result, 'Payment status retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const result = await orderService.updateOrderStatus(id, status, note);
    return success(res, result, 'Order status updated successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    return error(res, err.message);
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getAdminOrders,
  getOrderById,
  getOrderPaymentStatus,
  cancelOrder,
  updateOrderStatus,
};
