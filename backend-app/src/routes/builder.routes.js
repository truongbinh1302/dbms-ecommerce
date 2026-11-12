const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const builderController = require('../controllers/builder.controller');
const buildAgentController = require('../controllers/buildAgent.controller');
const assistantService = require('../services/assistant.service');
const { authenticate, optionalAuthenticate } = require('../middlewares/auth');

const router = express.Router();

// Trợ lý AI ráp máy gọi OpenAI nhiều lượt cho mỗi yêu cầu: mỗi IP tối đa một nửa số câu/giờ của trợ lý mua hàng.
const agentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: async () => {
    try {
      return Math.max(1, Math.floor((await assistantService.loadSettings()).perHour / 2));
    } catch {
      return Math.max(1, Math.floor(config.assistant.perHour / 2));
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bạn nhờ ráp hơi nhiều, nghỉ một lát rồi thử lại nhé.' },
});

// Build PC: không cần đăng nhập. Báo giá gắn với tài khoản nếu khách đã đăng nhập.
router.get('/components', builderController.listComponents);
router.get('/presets', builderController.listPresets);
router.post('/check', builderController.checkBuild);
router.post('/auto', builderController.autoBuild);
router.post('/advise', builderController.advise);
router.post('/upgrade', builderController.suggestUpgrades);
router.post('/agent', agentLimiter, buildAgentController.streamAgent);
router.post('/quotes', optionalAuthenticate, builderController.createQuote);
router.get('/quotes/:code', builderController.getQuote);
// "Nên mua lúc nào?" cho cả cấu hình: tổng giá theo ngày, và theo dõi khi cả bộ rẻ đi (cần đăng nhập).
router.post('/price-trend', builderController.priceTrend);
router.get('/watches', authenticate, builderController.listWatches);
router.post('/watches', authenticate, builderController.watch);
router.delete('/watches/:id', authenticate, builderController.unwatch);

module.exports = router;
