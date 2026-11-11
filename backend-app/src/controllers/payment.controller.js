const config = require('../config/env');
const orderService = require('../services/order.service');
const vnpayService = require('../services/vnpayService');
const { success, error } = require('../utils/response');

// Thông điệp trả về cho VNPay theo mã RspCode của IPN.
const IPN_MESSAGES = {
  '00': 'Confirm Success',
  '01': 'Order not found',
  '02': 'Order already confirmed',
  '04': 'Invalid amount',
  '97': 'Invalid signature',
  '99': 'Unknown error',
};

const ipnResponse = (res, code) => res.status(200).json({ RspCode: code, Message: IPN_MESSAGES[code] });

const readVNPayResult = (payload) => ({
  txnRef: payload.vnp_TxnRef,
  responseCode: payload.vnp_ResponseCode,
  transactionStatus: payload.vnp_TransactionStatus,
  amount: payload.vnp_Amount,
});

const createVNPayLink = async (req, res) => {
  try {
    const { orderId, orderInfo } = req.body;

    if (!orderId) {
      return error(res, 'orderId is required', 400);
    }

    const order = await orderService.getPaymentWindow(orderId, req.user.id);

    if (!order) {
      return error(res, 'Order not found', 404);
    }

    if (String(order.PaymentMethod).toLowerCase() !== 'vnpay') {
      return error(res, 'Order payment method is not VNPay', 400);
    }

    if (String(order.PaymentStatus).toLowerCase() === 'paid') {
      return error(res, 'Order is already paid', 400);
    }

    if (order.Status !== 'pending_payment') {
      return error(res, 'Order is no longer waiting for payment', 409);
    }

    // Link VNPay không được sống lâu hơn thời hạn thanh toán còn lại của đơn.
    const minutesLeft = Math.floor(Number(order.SecondsLeft) / 60);
    if (minutesLeft < 1) {
      return error(res, 'Payment window for this order has expired', 409);
    }

    const { url, txnRef } = vnpayService.createPaymentUrl({
      orderId: Number(orderId),
      amount: Number(order.Total),
      orderInfo,
      ipAddr: req.ip || req.connection?.remoteAddress,
      expireMinutes: Math.min(config.vnpay.linkExpireMinutes, minutesLeft),
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

/**
 * Trang khách được VNPay chuyển về sau khi thanh toán.
 * Production: chỉ hiển thị trạng thái đã lưu (IPN mới là nguồn đáng tin).
 * Dev (VNPAY_UPDATE_ON_RETURN=true): ghi nhận kết quả bằng đúng logic của IPN,
 * vì VNPay sandbox không gọi IPN về localhost được.
 */
const vnpayReturn = async (req, res) => {
  try {
    const payload = { ...req.query };

    if (!vnpayService.verifySecureHash(payload)) {
      return error(res, 'Invalid VNPay signature', 400);
    }

    const vnpResult = readVNPayResult(payload);
    let applied = null;
    if (config.vnpay.updateOnReturn) {
      applied = await orderService.applyVNPayResult(vnpResult);
      if (applied.code === '01') {
        return error(res, 'Order not found for VNPay transaction', 404);
      }
      if (applied.code === '04') {
        return error(res, 'Payment amount does not match order total', 400);
      }
    }

    const orderId = applied ? applied.orderId : orderService.parseOrderIdFromTxnRef(vnpResult.txnRef);
    const order = orderId ? await orderService.getOrderPaymentStatus(orderId) : null;

    if (!order) {
      return error(res, 'Order not found for VNPay transaction', 404);
    }

    return success(
      res,
      {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        vnpResponseCode: vnpResult.responseCode,
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
      return ipnResponse(res, '97');
    }

    const result = await orderService.applyVNPayResult(readVNPayResult(payload));

    if (result.code === '04') {
      console.warn('[VNPay] IPN amount mismatch', {
        orderId: result.orderId,
        expected: result.expectedAmount,
        received: result.receivedAmount,
      });
    }

    return ipnResponse(res, result.code);
  } catch (err) {
    console.error('[VNPay] IPN error:', err.message);
    return ipnResponse(res, '99');
  }
};

module.exports = {
  createVNPayLink,
  vnpayReturn,
  vnpayIpn,
};
