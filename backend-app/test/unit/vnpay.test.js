const test = require('node:test');
const assert = require('node:assert/strict');

process.env.VNPAY_TMN_CODE = 'TESTCODE';
process.env.VNPAY_HASH_SECRET = 'test_secret';

const config = require('../../src/config/env');
const vnpay = require('../../src/services/vnpayService');

const paramsFromUrl = (url) => Object.fromEntries(new URL(url).searchParams.entries());

test('ngày gửi VNPay luôn theo giờ Việt Nam (GMT+7), không phụ thuộc múi giờ server', () => {
  const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)); // 07:00 ngày 01/01/2026 giờ VN
  const { url, txnRef } = vnpay.createPaymentUrl({ orderId: 42, amount: 150000, now, expireMinutes: 15 });
  const params = paramsFromUrl(url);

  assert.equal(params.vnp_CreateDate, '20260101070000');
  assert.equal(params.vnp_ExpireDate, '20260101071500');
  assert.equal(params.vnp_Amount, '15000000');
  assert.equal(txnRef, `42_${now.getTime()}`);
});

test('chữ ký hợp lệ được chấp nhận, sửa số tiền thì bị từ chối', () => {
  const { url } = vnpay.createPaymentUrl({ orderId: 7, amount: 99000, orderInfo: 'Thanh toan don 7' });
  const params = paramsFromUrl(url);
  assert.equal(vnpay.verifySecureHash(params), true);
  assert.equal(vnpay.verifySecureHash({ ...params, vnp_Amount: '100' }), false);
  assert.equal(vnpay.verifySecureHash({ ...params, vnp_SecureHash: '' }), false);
});

test('thiếu hash secret thì mọi chữ ký đều bị coi là sai', () => {
  const { url } = vnpay.createPaymentUrl({ orderId: 8, amount: 1000 });
  const params = paramsFromUrl(url);
  const saved = config.vnpay.hashSecret;
  config.vnpay.hashSecret = '';
  try {
    assert.equal(vnpay.verifySecureHash(params), false);
  } finally {
    config.vnpay.hashSecret = saved;
  }
});
