const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpires });
};

// jti ngẫu nhiên: hai lần cấp trong cùng một giây vẫn ra token khác nhau, nên token cũ bị thu hồi thật khi đổi mới.
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpires, jwtid: crypto.randomUUID() });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.accessSecret);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};