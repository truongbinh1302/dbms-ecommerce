/*
  Test tích hợp: chạy lại migration không đặt lại mật khẩu admin; đổi mật khẩu qua HTTP thu hồi phiên cũ.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const { hashPassword, comparePassword } = require('../../src/utils/hash');
const app = require('../../src/app');

const run = promisify(execFile);
const tag = `sec${Date.now()}`;
const ctx = { server: null, base: '', userIds: [] };

const api = async (method, url, body, token) => {
  const res = await fetch(`${ctx.base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test.before(async () => {
  await connectSQL();
  await connectMongo();
  await new Promise((resolve) => {
    ctx.server = app.listen(0, '127.0.0.1', resolve);
  });
  ctx.base = `http://127.0.0.1:${ctx.server.address().port}/api/v1`;
});

test.after(async () => {
  if (ctx.userIds.length) {
    await new sql.Request(getPool()).query(`DELETE FROM Users WHERE UserID IN (${ctx.userIds.join(',')})`);
  }
  await new Promise((resolve) => ctx.server.close(resolve));
  await mongoose.disconnect();
  await getPool().close();
});

test('chạy lại migration không đặt lại mật khẩu admin đã đổi', async () => {
  const before = await new sql.Request(getPool())
    .query("SELECT UserID, Password FROM Users WHERE Email = N'admin@btstore.local'");
  const admin = before.recordset[0];
  assert.ok(admin, 'cần admin demo (chạy migration trước)');

  const changedHash = await hashPassword(`Changed-${tag}`);
  await new sql.Request(getPool())
    .input('id', sql.Int, admin.UserID)
    .input('hash', sql.NVarChar, changedHash)
    .query('UPDATE Users SET Password = @hash WHERE UserID = @id');

  try {
    const { stdout } = await run(process.execPath, ['run-migration.js'], {
      cwd: path.join(__dirname, '..', '..'),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.match(stdout, /Bỏ qua 001_create_schema\.sql/);

    const after = await new sql.Request(getPool())
      .input('id', sql.Int, admin.UserID)
      .query('SELECT Password FROM Users WHERE UserID = @id');
    assert.equal(after.recordset[0].Password, changedHash, 'mật khẩu admin phải giữ nguyên sau khi migrate lại');
  } finally {
    await new sql.Request(getPool())
      .input('id', sql.Int, admin.UserID)
      .input('hash', sql.NVarChar, admin.Password)
      .query('UPDATE Users SET Password = @hash WHERE UserID = @id');
  }
});

test('đổi mật khẩu: kiểm tra đầu vào, thu hồi refresh token cũ, đăng nhập được bằng mật khẩu mới', async () => {
  const email = `${tag}@btstore.test`;
  const oldPassword = 'Old-password-1';
  const newPassword = 'New-password-2';

  const registered = await api('POST', '/auth/register', { fullName: 'Security Test', email, password: oldPassword, acceptPrivacy: true });
  assert.equal(registered.status, 201);
  ctx.userIds.push(registered.body.data.user.id);
  const { accessToken, refreshToken } = registered.body.data;

  assert.equal((await api('PATCH', '/users/me/password', { oldPassword, newPassword: 'short' }, accessToken)).status, 400);
  assert.equal((await api('PATCH', '/users/me/password', { oldPassword: 'wrong-password', newPassword }, accessToken)).status, 400);
  assert.equal((await api('PATCH', '/users/me/password', { oldPassword, newPassword: oldPassword }, accessToken)).status, 400);

  const changed = await api('PATCH', '/users/me/password', { oldPassword, newPassword }, accessToken);
  assert.equal(changed.status, 200);

  const refreshed = await api('POST', '/auth/refresh', { refreshToken });
  assert.notEqual(refreshed.status, 200, 'refresh token cũ phải bị thu hồi');

  assert.notEqual((await api('POST', '/auth/login', { email, password: oldPassword })).status, 200);
  assert.equal((await api('POST', '/auth/login', { email, password: newPassword })).status, 200);

  const stored = await new sql.Request(getPool())
    .input('email', sql.NVarChar, email)
    .query('SELECT Password FROM Users WHERE Email = @email');
  assert.ok(await comparePassword(newPassword, stored.recordset[0].Password));
});

test('đặt hàng qua API: bắt buộc đồng ý điều khoản, đơn ghi phiên bản điều khoản', async () => {
  const email = `${tag}-terms@btstore.test`;
  const registered = await api('POST', '/auth/register', { fullName: 'Terms Test', email, password: 'Terms-password-1', acceptPrivacy: true });
  assert.equal(registered.status, 201);
  const userId = registered.body.data.user.id;
  ctx.userIds.push(userId);
  const token = registered.body.data.accessToken;

  const category = await new sql.Request(getPool()).query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const product = await new sql.Request(getPool())
    .input('slug', sql.NVarChar, `${tag}-terms-product`)
    .input('categoryId', sql.Int, category.recordset[0].CategoryID)
    .query(`INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID VALUES (N'Terms test', @slug, 100000, 5, @categoryId)`);
  const productId = product.recordset[0].ProductID;

  const order = {
    items: [{ productId, quantity: 1 }],
    shippingAddress: { recipientName: 'Terms Test', phone: '0901234567', province: 'TP. Hồ Chí Minh', ward: 'Phường Diên Hồng', street: '268 Lý Thường Kiệt' },
  };
  try {
    const refused = await api('POST', '/orders', order, token);
    assert.equal(refused.status, 400);
    assert.equal(refused.body.errors.code, 'terms_required');

    const created = await api('POST', '/orders', { ...order, acceptTerms: true }, token);
    assert.equal(created.status, 201);
    const info = await api('GET', '/store/info');
    const stored = await new sql.Request(getPool())
      .input('orderId', sql.Int, created.body.data.orderId)
      .query('SELECT TermsVersion FROM Orders WHERE OrderID = @orderId');
    assert.equal(stored.recordset[0].TermsVersion, info.body.data.termsVersion);
  } finally {
    await new sql.Request(getPool())
      .input('userId', sql.Int, userId)
      .input('productId', sql.Int, productId)
      .query(`
        DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID = @userId;
        DELETE FROM Orders WHERE UserID = @userId;
        DELETE FROM CartItems WHERE UserID = @userId;
        DELETE FROM PriceHistory WHERE ProductID = @productId;
        DELETE FROM Products WHERE ProductID = @productId;
      `);
  }
});
