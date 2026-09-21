const { getPool } = require('../config/db.sql');
const { success, error } = require('../utils/response');
const { hashPassword, comparePassword } = require('../utils/hash');

const getMe = async (req, res) => {
  try {
    const result = await getPool().request()
      .input('userId', req.user.id)
      .query(`SELECT UserID, FullName, Email, Phone, Address, Role 
              FROM Users WHERE UserID = @userId`);

    return success(res, result.recordset[0]);
  } catch (err) {
    return error(res, err.message);
  }
};

const updateProfile = async (req, res) => {
  const { fullName, phone } = req.body;

  try {
    await getPool().request()
      .input('userId', req.user.id)
      .input('fullName', fullName)
      .input('phone', phone)
      .query(`
        UPDATE Users 
        SET FullName = @fullName, Phone = @phone 
        WHERE UserID = @userId
      `);

    return success(res, null, 'Profile updated');
  } catch (err) {
    return error(res, err.message);
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    const result = await getPool().request()
      .input('userId', req.user.id)
      .query(`SELECT Password FROM Users WHERE UserID = @userId`);

    const user = result.recordset[0];

    const isMatch = await comparePassword(oldPassword, user.Password);
    if (!isMatch) return error(res, 'Wrong password', 400);

    const hashed = await hashPassword(newPassword);

    await getPool().request()
      .input('userId', req.user.id)
      .input('password', hashed)
      .query(`UPDATE Users SET Password = @password WHERE UserID = @userId`);

    return success(res, null, 'Password changed');
  } catch (err) {
    return error(res, err.message);
  }
};

const updateAddress = async (req, res) => {
  const { address } = req.body;

  try {
    await getPool().request()
      .input('userId', req.user.id)
      .input('address', address)
      .query(`UPDATE Users SET Address = @address WHERE UserID = @userId`);

    return success(res, null, 'Address updated');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = {
  getMe,
  updateProfile,
  changePassword,
  updateAddress
};