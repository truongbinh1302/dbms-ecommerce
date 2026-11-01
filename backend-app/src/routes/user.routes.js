const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const {
  getMe,
  updateProfile,
  changePassword,
  updateAddress,
  exportMyData,
  deleteMyAccount
} = require('../controllers/user.controller');

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateProfile);
router.patch('/me/password', authenticate, changePassword);
router.patch('/me/address', authenticate, updateAddress);
router.get('/me/export', authenticate, exportMyData);
router.delete('/me', authenticate, deleteMyAccount);

module.exports = router;