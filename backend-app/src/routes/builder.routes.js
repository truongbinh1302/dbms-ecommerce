const express = require('express');
const builderController = require('../controllers/builder.controller');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');

const router = express.Router();

// Build PC: không cần đăng nhập. Báo giá gắn với tài khoản nếu khách đã đăng nhập.
router.get('/components', builderController.listComponents);
router.get('/presets', builderController.listPresets);
router.post('/check', builderController.checkBuild);
router.post('/auto', builderController.autoBuild);
router.post('/advise', builderController.advise);
router.post('/upgrade', builderController.suggestUpgrades);
router.post('/quotes', optionalAuthenticate, builderController.createQuote);
router.get('/quotes/:code', builderController.getQuote);
// "Nên mua lúc nào?" cho cả cấu hình: tổng giá theo ngày, và theo dõi khi cả bộ rẻ đi (cần đăng nhập).
router.post('/price-trend', builderController.priceTrend);
router.get('/watches', authenticate, builderController.listWatches);
router.post('/watches', authenticate, builderController.watch);
router.delete('/watches/:id', authenticate, builderController.unwatch);

module.exports = router;
