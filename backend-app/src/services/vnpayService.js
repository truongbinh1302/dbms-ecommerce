const crypto = require('crypto');
const querystring = require('querystring');
const config = require('../config/env');

const pad = (value, length = 2) => String(value).padStart(length, '0');

// VNPay đọc vnp_CreateDate / vnp_ExpireDate theo giờ Việt Nam (GMT+7).
// Định dạng theo GMT+7 cố định để server chạy ở múi giờ nào (ví dụ Docker UTC) cũng đúng.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const formatDate = (date) => {
  const vn = new Date(date.getTime() + VN_OFFSET_MS);
  const year = vn.getUTCFullYear();
  const month = pad(vn.getUTCMonth() + 1);
  const day = pad(vn.getUTCDate());
  const hour = pad(vn.getUTCHours());
  const minute = pad(vn.getUTCMinutes());
  const second = pad(vn.getUTCSeconds());

  return `${year}${month}${day}${hour}${minute}${second}`;
};

const buildQuery = (params) => {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
};

const buildHashString = (params) => {
  const cleanParams = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${key}=${params[key]}`);

  return cleanParams.join('&');
};

const createPaymentUrl = ({
  orderId,
  amount,
  orderInfo,
  ipAddr,
  expireMinutes = config.vnpay.linkExpireMinutes,
  now = new Date(),
}) => {
  if (
    !config.vnpay.tmnCode ||
    !config.vnpay.hashSecret ||
    !config.vnpay.returnUrl
  ) {
    throw new Error('VNPay configuration is incomplete');
  }

  // Định dạng "<orderId>_<timestamp>": order.service dựa vào đây để tìm lại đơn khi nhận IPN.
  const txnRef = `${orderId}_${now.getTime()}`;
  const createDate = formatDate(now);

  const params = {
    vnp_Amount: String(Math.round(Number(amount) * 100)),
    vnp_Command: 'pay',
    vnp_CreateDate: createDate,
    vnp_CurrCode: 'VND',
    vnp_ExpireDate: formatDate(new Date(now.getTime() + expireMinutes * 60 * 1000)),
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_Locale: 'vn',
    vnp_OrderInfo: orderInfo || `Thanh toan don hang ${orderId}`,
    vnp_OrderType: 'other',
    vnp_ReturnUrl: config.vnpay.returnUrl,
    vnp_TmnCode: config.vnpay.tmnCode,
    vnp_TxnRef: txnRef,
    vnp_Version: '2.1.0',
  };

  const rawHash = buildHashString(params);
  const secureHash = crypto
    .createHmac('sha512', config.vnpay.hashSecret)
    .update(Buffer.from(rawHash, 'utf-8'))
    .digest('hex')
    .toUpperCase();

  const requestParams = {
    ...params,
    vnp_SecureHashType: 'HMACSHA512',
    vnp_SecureHash: secureHash,
  };

  const url = `${config.vnpay.url}?${buildQuery(requestParams)}`;

  return { url, txnRef };
};

const verifySecureHash = (payload = {}) => {
  const secureHash = String(payload.vnp_SecureHash || '').toLowerCase();

  // Thiếu secret thì ai cũng tự ký được callback giả, nên coi như chữ ký sai.
  if (!config.vnpay.hashSecret || !secureHash) {
    return false;
  }

  const raw = { ...payload };
  delete raw.vnp_SecureHash;
  delete raw.vnp_SecureHashType;

  const hashData = buildHashString(raw);
  const generatedHash = crypto
    .createHmac('sha512', config.vnpay.hashSecret)
    .update(Buffer.from(hashData, 'utf-8'))
    .digest('hex')
    .toLowerCase();

  if (process.env.VNPAY_DEBUG === 'true' && generatedHash !== secureHash) {
    console.debug('[VNPay] signature mismatch', {
      secureHash,
      generatedHash,
      hashData,
      raw,
    });
  }

  return generatedHash === secureHash;
};

module.exports = {
  createPaymentUrl,
  verifySecureHash,
};