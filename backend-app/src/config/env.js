require('dotenv').config();

const sqlServerRaw = process.env.SQL_SERVER || 'localhost';
const [sqlHost, sqlPortFromHost] = sqlServerRaw.split(',');

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  vnpay: {
    tmnCode: process.env.VNPAY_TMN_CODE || '',
    hashSecret: process.env.VNPAY_HASH_SECRET || '',
    returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:3000/api/v1/payments/vnpay/return',
    ipnUrl: process.env.VNPAY_IPN_URL || 'http://localhost:3000/api/v1/payments/vnpay/ipn',
    url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
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
