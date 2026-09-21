const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const analyticsController = require('../controllers/analytics.controller');

const router = express.Router();

router.get('/dashboard', authenticate, authorize('admin'), analyticsController.getDashboard);

module.exports = router;
