require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { connectSQL } = require('./config/db.sql');
const connectMongo = require('./config/db.mongo');
const { generalLimiter } = require('./middlewares/rateLimiter');
const errorHandler = require('./middlewares/errorHandler');
const config = require('./config/env');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const categoryRoutes = require('./routes/category.routes');
const voucherRoutes = require('./routes/voucher.routes');
const productRoutes = require('./routes/product.route');
const cartRoutes = require('./routes/cart.route');
const orderRoutes = require('./routes/order.route');
const paymentRoutes = require('./routes/payment.route');
const reviewRoutes = require('./routes/review.route');
const analyticsRoutes = require('./routes/analytics.route');
const locationRoutes = require('./routes/location.routes');
const builderRoutes = require('./routes/builder.routes');
const warrantyRoutes = require('./routes/warranty.routes');

const app = express();

// Chạy sau reverse proxy (nginx trong docker-compose): tin header X-Forwarded-For của proxy
// để giới hạn request theo IP thật của khách, không gộp mọi khách vào IP của proxy.
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(generalLimiter);

// Serve uploaded files as static
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'BinhTinhStore DBMS API',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/vouchers', voucherRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/builder', builderRoutes);
app.use('/api/v1/warranties', warrantyRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

// Định kỳ huỷ đơn VNPay quá hạn chưa thanh toán để trả hàng về kho.
const startPaymentExpirySweeper = () => {
  const orderService = require('./services/order.service');
  const timer = setInterval(async () => {
    try {
      const expired = await orderService.expireStalePayments();
      if (expired > 0) {
        console.log(`[payments] Expired ${expired} unpaid VNPay order(s)`);
      }
    } catch (err) {
      console.error('[payments] Expiry sweep failed:', err.message);
    }
  }, config.payment.sweepIntervalMs);
  timer.unref();
};

// Điền SearchText cho sản phẩm chưa có (dữ liệu seed). Chạy nền, lỗi chỉ ghi log.
const backfillSearchIndex = async () => {
  try {
    const { backfillSearchText } = require('./services/searchIndex.service');
    const { getPool } = require('./config/db.sql');
    const updated = await backfillSearchText(getPool());
    if (updated > 0) {
      console.log(`[search] Filled search text for ${updated} product(s)`);
    }
  } catch (err) {
    console.error('[search] Backfill failed (did you run migration 006?):', err.message);
  }
};

const startServer = async () => {
  try {
    await connectSQL();
    await connectMongo();

    startPaymentExpirySweeper();
    backfillSearchIndex();

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;
