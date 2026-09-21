const express = require('express');
const { validateCart } = require('../controllers/cart.controller');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.post('/validate', authenticate, validateCart);

module.exports = router;