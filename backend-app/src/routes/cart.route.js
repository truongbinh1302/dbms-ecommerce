const express = require('express');
const { validateCart, quoteCart } = require('../controllers/cart.controller');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.post('/validate', authenticate, validateCart);
router.post('/quote', quoteCart);

module.exports = router;