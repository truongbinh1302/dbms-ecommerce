require('dotenv').config();

const sqlServerRaw = process.env.SQL_SERVER || 'localhost';
const [sqlHost, sqlPortFromHost] = sqlServerRaw.split(',');

const nodeEnv = process.env.NODE_ENV || 'development';

// Production không được chạy với khoá JWT mặc định (ai đọc mã nguồn cũng biết, giả token được).
if (nodeEnv === 'production' && (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set when NODE_ENV=production');
}

// TRUST_PROXY: số proxy đứng trước API (ví dụ 1 khi chạy sau nginx). Bỏ trống = không có proxy.
const parseTrustProxy = (value) => {
  if (value === undefined || String(value).trim() === '' || value === 'false') return false;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
};

const toNumber = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Ở môi trường dev, VNPay sandbox không gọi được IPN về localhost,
// nên mặc định cho phép trang return cập nhật đơn. Production chỉ tin IPN.
const updateOnReturn = process.env.VNPAY_UPDATE_ON_RETURN
  ? process.env.VNPAY_UPDATE_ON_RETURN === 'true'
  : nodeEnv !== 'production';

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Trang return của VNPay chuyển khách về trang đơn hàng trên frontend này.
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE || '',
    hashSecret: process.env.VNPAY_HASH_SECRET || '',
    returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/v1/payments/vnpay/return',
    ipnUrl: process.env.VNPAY_IPN_URL || 'http://localhost:3000/api/v1/payments/vnpay/ipn',
    url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    linkExpireMinutes: 15,
    updateOnReturn,
  },

  // Quy tắc tính tiền chỉ nằm ở server; frontend chỉ hiển thị kết quả từ API báo giá.
  pricing: {
    shippingFee: toNumber(process.env.SHIPPING_FEE, 30000),
    freeShippingThreshold: toNumber(process.env.FREE_SHIPPING_THRESHOLD, 3000000),
    // Ưu đãi tự động theo giá trị đơn, xếp từ mốc cao xuống thấp.
    tierDiscounts: [
      { minSubtotal: 30000000, amount: 500000 },
      { minSubtotal: 10000000, amount: 200000 },
    ],
    // Báo giá cấu hình Build PC giữ giá trong ngần này giờ.
    quoteValidHours: toNumber(process.env.QUOTE_VALID_HOURS, 48),
  },

  // Thông tin người bán và các con số trong chính sách, hiển thị ở trang Chính sách và chân trang.
  // Thông tin pháp lý để trống cho tới khi cửa hàng đăng ký kinh doanh; trang sẽ ghi "chưa cập nhật".
  store: {
    legalName: process.env.STORE_LEGAL_NAME || null,
    taxCode: process.env.STORE_TAX_CODE || null,
    address: process.env.STORE_ADDRESS || null,
    phone: process.env.STORE_PHONE || null,
    email: process.env.STORE_EMAIL || null,
    representative: process.env.STORE_REPRESENTATIVE || null,
    // Đổi khi sửa nội dung điều khoản: đơn ghi lại phiên bản khách đã đồng ý.
    termsVersion: process.env.STORE_TERMS_VERSION || '2026-11-11',
    province: process.env.STORE_PROVINCE || 'TP. Hồ Chí Minh',
    deliveryDaysLocal: process.env.DELIVERY_DAYS_LOCAL || '1–2',
    deliveryDaysOther: process.env.DELIVERY_DAYS_OTHER || '2–5',
    returnDays: toNumber(process.env.RETURN_DAYS, 7),
    complaintResponseDays: toNumber(process.env.COMPLAINT_RESPONSE_DAYS, 3),
    pricesIncludeTax: process.env.PRICES_INCLUDE_TAX !== 'false',
  },

  payment: {
    // Đơn VNPay chưa thanh toán sau ngần này phút sẽ tự huỷ và hoàn kho.
    expireMinutes: toNumber(process.env.PAYMENT_EXPIRE_MINUTES, 30),
    sweepIntervalMs: toNumber(process.env.PAYMENT_SWEEP_INTERVAL_MS, 60000),
  },

  sql: {
    server: sqlHost,
    port: Number(process.env.SQL_PORT || sqlPortFromHost || 1433),
    database: process.env.SQL_DATABASE || 'ecommerce_dbms',
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_PASSWORD || '123456Aa@',
    options: {
      encrypt: process.env.SQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERT !== 'false',
    },
    pool: {
      max: Number(process.env.SQL_POOL_MAX || 10),
      min: Number(process.env.SQL_POOL_MIN || 0),
      idleTimeoutMillis: Number(process.env.SQL_POOL_IDLE_TIMEOUT || 30000),
    },
  },

  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce_mongo',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'replace_me_access_secret_for_dev_only',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'replace_me_refresh_secret_for_dev_only',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
};
