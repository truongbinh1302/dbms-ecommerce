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

// Chỉ các tham số vnp_* nằm trong chữ ký của VNPay; bỏ tham số khác (ví dụ ?format=json) trước khi kiểm tra.
const pickVNPayParams = (source = {}) => Object.fromEntries(
  Object.entries(source).filter(([key]) => key.startsWith('vnp_')),
);

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
 * Production: chỉ đọc trạng thái đã lưu (IPN mới là nguồn đáng tin).
 * Dev (VNPAY_UPDATE_ON_RETURN=true): ghi nhận kết quả bằng đúng logic của IPN,
 * vì VNPay sandbox không gọi IPN về localhost được.
 * Trình duyệt được chuyển về trang đơn hàng trên frontend; gọi kèm ?format=json
 * hoặc header Accept: application/json thì nhận JSON như trước.
 */
const vnpayReturn = async (req, res) => {
  const wantsJson = req.query.format === 'json'
    || String((req.headers && req.headers.accept) || '').includes('application/json');

  const respond = ({ status = 200, message, data = null, orderId = null, result }) => {
    if (wantsJson) {
      return status === 200 ? success(res, data, message) : error(res, message, status);
    }
    const target = orderId ? `/don-hang/${orderId}` : '/don-hang';
    return res.redirect(302, `${config.clientUrl}/#${target}?ket-qua=${encodeURIComponent(result)}`);
  };

  try {
    const payload = pickVNPayParams(req.query);

    if (!vnpayService.verifySecureHash(payload)) {
      return respond({ status: 400, message: 'Invalid VNPay signature', result: 'chu-ky-sai' });
    }

    const vnpResult = readVNPayResult(payload);
    let applied = null;
    if (config.vnpay.updateOnReturn) {
      applied = await orderService.applyVNPayResult(vnpResult);
      if (applied.code === '01') {
        return respond({ status: 404, message: 'Order not found for VNPay transaction', result: 'khong-tim-thay' });
      }
      if (applied.code === '04') {
        return respond({
          status: 400,
          message: 'Payment amount does not match order total',
          orderId: applied.orderId,
          result: 'sai-so-tien',
        });
      }
    }

    const orderId = applied ? applied.orderId : orderService.parseOrderIdFromTxnRef(vnpResult.txnRef);
    const order = orderId ? await orderService.getOrderPaymentStatus(orderId) : null;

    if (!order) {
      return respond({ status: 404, message: 'Order not found for VNPay transaction', result: 'khong-tim-thay' });
    }

    return respond({
      message: 'VNPay return callback processed successfully',
      data: {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        vnpResponseCode: vnpResult.responseCode,
      },
      orderId: order.id,
      result: vnpResult.responseCode || '',
    });
  } catch (err) {
    if (wantsJson) return error(res, err.message);
    return res.redirect(302, `${config.clientUrl}/#/don-hang?ket-qua=loi`);
  }
};

const vnpayIpn = async (req, res) => {
  try {
    const payload = pickVNPayParams({ ...req.body, ...req.query });

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
