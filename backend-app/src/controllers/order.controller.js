const config = require('../config/env');
const orderService = require('../services/order.service');
const returnService = require('../services/return.service');
const { success, error } = require('../utils/response');

const createOrder = async (req, res) => {
  // Luật TMĐT 2025, Điều 12: người mua phải đồng ý điều khoản trước khi đặt; đơn ghi phiên bản điều khoản.
  if (!req.body || req.body.acceptTerms !== true) {
    return error(res, 'Vui lòng đồng ý với điều khoản mua hàng trước khi đặt hàng', 400, { code: 'terms_required' });
  }
  try {
    const userId = req.user.id;
    const result = await orderService.createOrder(userId, { ...req.body, termsVersion: config.store.termsVersion });
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
    const { status, page = 1, limit = 20, q = '', payment = '', from = '', to = '' } = req.query;
    const result = await orderService.getAdminOrders(status, page, limit, q, payment, from, to);
    return success(res, result, 'Admin orders retrieved successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
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
    const { status, note, carrier, trackingCode } = req.body || {};
    const result = await orderService.updateOrderStatus(id, status, note, { carrier, trackingCode });
    return success(res, result, 'Order status updated successfully');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

// ---------- Đổi trả ----------

const handle = (fn, message, status = 200) => async (req, res) => {
  try {
    return success(res, await fn(req), message, status);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

const createReturn = handle((req) => returnService.createReturn(req.user.id, req.params.id, req.body || {}), 'Return request created', 201);
const cancelMyReturn = handle((req) => returnService.cancelMyReturn(req.user.id, req.params.returnId), 'Return request cancelled');
const listReturns = handle((req) => returnService.listReturns(req.query), 'Return requests retrieved');
const recordRefund = handle((req) => orderService.recordRefund(req.params.id, req.body || {}), 'Refund recorded');
const updateReturn = handle((req) => returnService.updateReturn(req.user.id, req.params.returnId, req.body || {}), 'Return request updated');

module.exports = {
  createOrder,
  getUserOrders,
  getAdminOrders,
  getOrderById,
  getOrderPaymentStatus,
  cancelOrder,
  updateOrderStatus,
  recordRefund,
  createReturn,
  cancelMyReturn,
  listReturns,
  updateReturn,
};
