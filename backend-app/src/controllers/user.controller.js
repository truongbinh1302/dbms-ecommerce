const { getPool, sql } = require('../config/db.sql');
const { success, error } = require('../utils/response');
const { parseStoredAddress, validateShippingAddress } = require('../services/address.service');
const { hashPassword, comparePassword } = require('../utils/hash');

const getMe = async (req, res) => {
  try {
    const result = await getPool().request()
      .input('userId', req.user.id)
      .query(`SELECT UserID, FullName, Email, Phone, Address, Role 
              FROM Users WHERE UserID = @userId`);

    const user = result.recordset[0];
    if (!user) {
      return error(res, 'User not found', 404);
    }

    // Địa chỉ giao hàng mặc định lưu dạng JSON trong cột Address; dữ liệu cũ dạng chữ thì để null.
    return success(res, { ...user, shippingAddress: parseStoredAddress(user.Address) });
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
    // Địa chỉ có cấu trúc (người nhận, SĐT, tỉnh, phường, đường) được kiểm tra rồi lưu JSON.
    // Vẫn nhận chuỗi chữ như trước để không phá client cũ.
    let stored = address;
    let shippingAddress = null;
    if (address && typeof address === 'object') {
      const { address: normalized, errors } = validateShippingAddress(address);
      if (Object.keys(errors).length > 0) {
        return error(res, 'Địa chỉ giao hàng chưa hợp lệ', 400, { code: 'invalid_address', fields: errors });
      }
      shippingAddress = normalized;
      stored = JSON.stringify(normalized);
    }

    await getPool().request()
      .input('userId', sql.Int, req.user.id)
      .input('address', sql.NVarChar, stored === undefined || stored === null ? null : String(stored))
      .query(`UPDATE Users SET Address = @address WHERE UserID = @userId`);

    return success(res, { shippingAddress }, 'Address updated');
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