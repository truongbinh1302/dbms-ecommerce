const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const src = path.join(__dirname, '..', '..', 'src');
const config = require(path.join(src, 'config', 'env'));

// Thay order.service và vnpayService bằng bản giả để chỉ kiểm tra logic của controller.
const fakeOrderService = {};
const fakeVnpay = {};
const stub = (relative, exportsObject) => {
  const file = require.resolve(path.join(src, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsObject };
};
stub('services/order.service', fakeOrderService);
stub('services/vnpayService', fakeVnpay);

const controller = require(path.join(src, 'controllers', 'payment.controller'));

const createRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

test.beforeEach(() => {
  Object.keys(fakeOrderService).forEach((key) => delete fakeOrderService[key]);
  Object.keys(fakeVnpay).forEach((key) => delete fakeVnpay[key]);
});

test('IPN chữ ký sai trả RspCode 97 với HTTP 200', async () => {
  fakeVnpay.verifySecureHash = () => false;
  const res = createRes();
  await controller.vnpayIpn({ query: { vnp_TxnRef: '1_1' }, body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { RspCode: '97', Message: 'Invalid signature' });
});

test('IPN chuyển nguyên mã kết quả của service cho VNPay', async () => {
  fakeVnpay.verifySecureHash = () => true;
  let received = null;
  fakeOrderService.applyVNPayResult = async (input) => {
    received = input;
    return { code: '04', orderId: 1, expectedAmount: 100, receivedAmount: 5 };
  };

  const res = createRes();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await controller.vnpayIpn({
      query: { vnp_TxnRef: '1_1', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_Amount: '5' },
      body: {},
    }, res);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(received, { txnRef: '1_1', responseCode: '00', transactionStatus: '00', amount: '5' });
  assert.deepEqual(res.body, { RspCode: '04', Message: 'Invalid amount' });
});

test('IPN lỗi bất ngờ trả RspCode 99', async () => {
  fakeVnpay.verifySecureHash = () => true;
  fakeOrderService.applyVNPayResult = async () => {
    throw new Error('db down');
  };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};
  try {
    await controller.vnpayIpn({ query: {}, body: {} }, res);
  } finally {
    console.error = originalError;
  }
  assert.equal(res.body.RspCode, '99');
});

test('trang return ở production chỉ đọc trạng thái, không ghi DB', async () => {
  config.vnpay.updateOnReturn = false;
  fakeVnpay.verifySecureHash = () => true;
  fakeOrderService.applyVNPayResult = async () => {
    throw new Error('must not be called');
  };
  fakeOrderService.parseOrderIdFromTxnRef = () => 5;
  fakeOrderService.getOrderPaymentStatus = async () => ({ id: 5, paymentStatus: 'pending', orderStatus: 'pending_payment' });

  const res = createRes();
  await controller.vnpayReturn({ query: { vnp_TxnRef: '5_1', vnp_ResponseCode: '00' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.paymentStatus, 'pending');
});

test('trang return ở dev ghi nhận kết quả bằng cùng logic với IPN', async () => {
  config.vnpay.updateOnReturn = true;
  fakeVnpay.verifySecureHash = () => true;
  let called = false;
  fakeOrderService.applyVNPayResult = async () => {
    called = true;
    return { code: '00', orderId: 5 };
  };
  fakeOrderService.getOrderPaymentStatus = async () => ({ id: 5, paymentStatus: 'paid', orderStatus: 'confirmed' });

  const res = createRes();
  await controller.vnpayReturn({ query: { vnp_TxnRef: '5_1', vnp_ResponseCode: '00' } }, res);
  assert.equal(called, true);
  assert.equal(res.body.data.orderStatus, 'confirmed');
});

test('không tạo link VNPay cho đơn đã huỷ', async () => {
  fakeOrderService.getPaymentWindow = async () => ({
    PaymentMethod: 'vnpay', PaymentStatus: 'expired', Status: 'cancelled', Total: 1000, SecondsLeft: 600,
  });
  const res = createRes();
  await controller.createVNPayLink({ body: { orderId: 3 }, user: { id: 1 } }, res);
  assert.equal(res.statusCode, 409);
});

test('link VNPay không sống lâu hơn thời hạn thanh toán còn lại', async () => {
  fakeOrderService.getPaymentWindow = async () => ({
    PaymentMethod: 'vnpay', PaymentStatus: 'unpaid', Status: 'pending_payment', Total: 1000, SecondsLeft: 300,
  });
  let usedExpire = null;
  fakeVnpay.createPaymentUrl = ({ expireMinutes }) => {
    usedExpire = expireMinutes;
    return { url: 'https://example.test/pay', txnRef: '3_1' };
  };
  fakeOrderService.updateOrderPayment = async () => ({});

  const res = createRes();
  await controller.createVNPayLink({ body: { orderId: 3 }, user: { id: 1 }, ip: '127.0.0.1' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(usedExpire, 5);
});
