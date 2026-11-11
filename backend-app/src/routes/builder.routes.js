const express = require('express');
const builderController = require('../controllers/builder.controller');
const { optionalAuthenticate } = require('../middlewares/auth');

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

module.exports = router;
