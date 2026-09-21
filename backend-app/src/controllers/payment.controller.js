const orderService = require('../services/order.service');
const vnpayService = require('../services/vnpayService');
const { success, error } = require('../utils/response');

const createVNPayLink = async (req, res) => {
  try {
    const { orderId, orderInfo } = req.body;

    if (!orderId) {
      return error(res, 'orderId is required', 400);
    }

    const order = await orderService.getOrderById(orderId, req.user.id);

    if (!order) {
      return error(res, 'Order not found', 404);
    }

    if (String(order.PaymentMethod || order.paymentMethod).toLowerCase() !== 'vnpay') {
      return error(res, 'Order payment method is not VNPay', 400);
    }

    if (String(order.PaymentStatus || order.paymentStatus).toLowerCase() === 'paid') {
      return error(res, 'Order is already paid', 400);
    }

    const { url, txnRef } = vnpayService.createPaymentUrl({
      orderId: Number(orderId),
      amount: Number(order.Total || order.total),
      orderInfo,
      ipAddr: req.ip || req.connection?.remoteAddress,
    });

    await orderService.updateOrderPayment(orderId, 'pending', txnRef);

    return success(
      res,
      { paymentUrl: url, txnRef },
      'VNPay payment link created successfully'
    );
  } catch (err) {
    return error(res, err.message);
  }
};

const vnpayReturn = async (req, res) => {
  try {
    const payload = { ...req.query };

    if (!vnpayService.verifySecureHash(payload)) {
      return error(res, 'Invalid VNPay signature', 400);
    }

    const txnRef = payload.vnp_TxnRef;
    const responseCode = payload.vnp_ResponseCode;

    const order = await orderService.getOrderByVNPayTxnRef(txnRef);

    if (!order) {
      return error(res, 'Order not found for VNPay transaction', 404);
    }

    const paymentStatus = responseCode === '00' ? 'paid' : 'failed';
    const orderStatus =
      responseCode === '00'
        ? order.status === 'pending_payment'
          ? 'confirmed'
          : order.status
        : order.status;

    await orderService.updateOrderPayment(order.id, paymentStatus, txnRef, orderStatus);

    return success(
      res,
      {
        orderId: order.id,
        paymentStatus,
        orderStatus,
        vnpResponseCode: responseCode,
      },
      'VNPay return callback processed successfully'
    );
  } catch (err) {
    return error(res, err.message);
  }
};

const vnpayIpn = async (req, res) => {
  try {
    const payload = { ...req.body, ...req.query };

    if (!vnpayService.verifySecureHash(payload)) {
      return res.status(400).json({
        RspCode: '97',
        Message: 'Invalid signature',
      });
    }

    const txnRef = payload.vnp_TxnRef;
    const responseCode = payload.vnp_ResponseCode;

    const order = await orderService.getOrderByVNPayTxnRef(txnRef);

    if (!order) {
      return res.status(404).json({
        RspCode: '01',
        Message: 'Order not found',
      });
    }

    const paymentStatus = responseCode === '00' ? 'paid' : 'failed';
    const orderStatus =
      responseCode === '00'
        ? order.status === 'pending_payment'
          ? 'confirmed'
          : order.status
        : order.status;

    await orderService.updateOrderPayment(order.id, paymentStatus, txnRef, orderStatus);

    return res.json({
      RspCode: '00',
      Message: 'IPN processed',
    });
  } catch (err) {
    return res.status(500).json({
      RspCode: '99',
      Message: err.message,
    });
  }
};

module.exports = {
  createVNPayLink,
  vnpayReturn,
  vnpayIpn,
};