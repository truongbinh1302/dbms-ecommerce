const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const {
  getMe,
  updateProfile,
  changePassword,
  updateAddress
} = require('../controllers/user.controller');

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfile);
router.patch('/me/password', authenticate, changePassword);
router.patch('/me/address', authenticate, updateAddress);

module.exports = router;