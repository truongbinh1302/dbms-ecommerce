const { getPool, sql } = require('../config/db.sql');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const toUserPayload = (user) => ({ id: user.UserID, email: user.Email, role: user.Role });

const register = async ({ fullName, email, password, phone }) => {
  const pool = getPool();

  const existing = await pool.request()
    .input('email', sql.NVarChar, email)
    .query('SELECT UserID FROM Users WHERE Email = @email');

  if (existing.recordset.length > 0) {
    const err = new Error('Email already exists');
    err.status = 409;
    throw err;
  }

  const hashedPassword = await hashPassword(password);
  const result = await pool.request()
    .input('fullName', sql.NVarChar, fullName)
    .input('email', sql.NVarChar, email)
    .input('password', sql.NVarChar, hashedPassword)
    .input('phone', sql.NVarChar, phone || null)
    .query(`
      INSERT INTO Users (FullName, Email, Password, Phone, Role)
      OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.Email, INSERTED.Role
      VALUES (@fullName, @email, @password, @phone, 'customer')
    `);

  const user = result.recordset[0];
  const payload = toUserPayload(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await pool.request()
    .input('userId', sql.Int, user.UserID)
    .input('refreshToken', sql.NVarChar, refreshToken)
    .query('UPDATE Users SET RefreshToken = @refreshToken WHERE UserID = @userId');

  return { user, accessToken, refreshToken };
};

const login = async ({ email, password }) => {
  const pool = getPool();
  const result = await pool.request()
    .input('email', sql.NVarChar, email)
    .query(`
      SELECT UserID, FullName, Email, Password, Role, IsActive
      FROM Users
      WHERE Email = @email
    `);

  const user = result.recordset[0];
  if (!user || !user.IsActive || !(await comparePassword(password, user.Password))) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const payload = toUserPayload(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await pool.request()
    .input('userId', sql.Int, user.UserID)
    .input('refreshToken', sql.NVarChar, refreshToken)
    .query('UPDATE Users SET RefreshToken = @refreshToken WHERE UserID = @userId');

  return { user, accessToken, refreshToken };
};

const refresh = async (refreshToken) => {
  const decoded = verifyRefreshToken(refreshToken);
  const pool = getPool();

  const result = await pool.request()
    .input('userId', sql.Int, decoded.id)
    .input('refreshToken', sql.NVarChar, refreshToken)
    .query(`
      SELECT UserID, FullName, Email, Role
      FROM Users
      WHERE UserID = @userId AND RefreshToken = @refreshToken AND IsActive = 1
    `);

  const user = result.recordset[0];
  if (!user) {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }

  const payload = toUserPayload(user);
  const accessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  await pool.request()
    .input('userId', sql.Int, user.UserID)
    .input('refreshToken', sql.NVarChar, newRefreshToken)
    .query('UPDATE Users SET RefreshToken = @refreshToken WHERE UserID = @userId');

  return { accessToken, refreshToken: newRefreshToken };
};

const logout = async (userId) => {
  await getPool().request()
    .input('userId', sql.Int, userId)
    .query('UPDATE Users SET RefreshToken = NULL WHERE UserID = @userId');
};

module.exports = { register, login, refresh, logout };
