const express = require('express');
const { validateCart, quoteCart, getMyCart, replaceMyCart } = require('../controllers/cart.controller');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

router.post('/validate', authenticate, validateCart);
router.post('/quote', quoteCart);
router.get('/', authenticate, getMyCart);
router.put('/', authenticate, replaceMyCart);

module.exports = router;