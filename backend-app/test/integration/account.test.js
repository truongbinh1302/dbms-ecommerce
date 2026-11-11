/*
  Test tích hợp giai đoạn 3: tải dữ liệu cá nhân và xoá tài khoản trên SQL Server + MongoDB thật.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const Review = require('../../src/models/review.model');
const accountService = require('../../src/services/account.service');
const orderService = require('../../src/services/order.service');
const cartService = require('../../src/services/cart.service');
const authService = require('../../src/services/auth.service');

const ADDRESS = {
  recipientName: 'Integration Test',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Diên Hồng',
  street: '268 Lý Thường Kiệt',
};
const PASSWORD = 'Test-password-123';

const tag = `ac${Date.now()}`;
const ctx = { categoryId: null, productId: null, userIds: [] };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordsets;
};

const createUser = async (suffix) => {
  const { user } = await authService.register({
    fullName: `Khách ${suffix}`,
    email: `${tag}-${suffix}@btstore.test`,
    password: PASSWORD,
    phone: '0901234567',
  });
  const id = user.UserID ?? user.id;
  ctx.userIds.push(id);
  return id;
};

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  ctx.categoryId = category[0].CategoryID;
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID)
    OUTPUT INSERTED.ProductID
    VALUES (N'Sản phẩm test xoá tài khoản', @slug, 500000, 100, @categoryId)
  `, { slug: [sql.NVarChar, `${tag}-product`], categoryId: [sql.Int, ctx.categoryId] });
  ctx.productId = product[0].ProductID;
});

test.after(async () => {
  const ids = ctx.userIds.join(',') || '0';
  await query(`
    DELETE FROM CartItems WHERE UserID IN (${ids});
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${ids});
    DELETE FROM Orders WHERE UserID IN (${ids});
    DELETE FROM Users WHERE UserID IN (${ids});
    DELETE FROM PriceHistory WHERE ProductID = @productId;
    DELETE FROM StockMovements WHERE ProductID = @productId;
    DELETE FROM Products WHERE ProductID = @productId;
  `, { productId: [sql.Int, ctx.productId] });
  await Review.deleteMany({ userId: { $in: ctx.userIds } });
  await mongoose.disconnect();
  await getPool().close();
});

test('tải dữ liệu cá nhân: có hồ sơ, đơn, giỏ, đánh giá; không lộ mật khẩu', async () => {
  const userId = await createUser('export');
  await cartService.replaceCart(userId, [{ productId: ctx.productId, quantity: 2 }]);
  const order = await orderService.createOrder(userId, { shippingAddress: ADDRESS, items: [{ productId: ctx.productId, quantity: 1 }] });
  await Review.create({ productId: ctx.productId, userId, rating: 5, title: 'Tốt', content: 'Sản phẩm dùng ổn định' });

  const data = await accountService.exportMyData(userId);
  assert.equal(data.profile.email, `${tag}-export@btstore.test`);
  assert.equal(data.orders.length, 1);
  assert.equal(data.orders[0].OrderID, order.orderId);
  assert.equal(data.orders[0].ShippingAddress.recipientName, ADDRESS.recipientName);
  assert.equal(data.orders[0].items.length, 1);
  assert.deepEqual(data.orders[0].statusHistory.map((item) => [item.FromStatus, item.ToStatus, item.ChangedBy]), [[null, 'pending', 'customer']], 'dữ liệu tải về có lịch sử trạng thái đơn');
  assert.equal(data.reviews.length, 1);
  const text = JSON.stringify(data);
  assert.ok(!/Password|RefreshToken|\$2[aby]\$/.test(text), 'không có mật khẩu hay token trong file tải về');
});

test('xoá tài khoản: chặn khi còn đơn chưa xong, sai mật khẩu, hoặc là admin', async () => {
  const userId = await createUser('open');
  const order = await orderService.createOrder(userId, { shippingAddress: ADDRESS, items: [{ productId: ctx.productId, quantity: 1 }] });

  await assert.rejects(accountService.deleteAccount(userId, 'sai-mat-khau'), (err) => Boolean(err.status === 400));
  await assert.rejects(
    accountService.deleteAccount(userId, PASSWORD),
    (err) => Boolean(err.status === 409 && err.data.openOrders === 1),
  );

  const [admins] = await query("SELECT TOP 1 UserID FROM Users WHERE Role = N'admin' AND IsActive = 1");
  await assert.rejects(accountService.deleteAccount(admins[0].UserID, 'password'), (err) => Boolean(err.status === 403));

  // Huỷ đơn xong thì xoá được.
  await orderService.cancelOrder(order.orderId, userId, 'Khách huỷ để xoá tài khoản');
  const result = await accountService.deleteAccount(userId, PASSWORD);
  assert.equal(result.deleted, true);
});

test('xoá tài khoản: ẩn danh hồ sơ, xoá giỏ và đánh giá, giữ đơn, không đăng nhập lại được, đăng ký lại được', async () => {
  const userId = await createUser('delete');
  const order = await orderService.createOrder(userId, { shippingAddress: ADDRESS, items: [{ productId: ctx.productId, quantity: 1 }] });
  await query("UPDATE Orders SET Status = 'delivered' WHERE OrderID = @orderId", { orderId: [sql.Int, order.orderId] });
  await cartService.replaceCart(userId, [{ productId: ctx.productId, quantity: 1 }]);
  await Review.create({ productId: ctx.productId, userId, rating: 4, title: 'Ổn', content: 'Giao hàng nhanh, đóng gói kỹ' });

  const result = await accountService.deleteAccount(userId, PASSWORD);
  assert.deepEqual(result, { deleted: true, retainedOrders: 1, reviewsDeleted: 1 });

  const [users] = await query('SELECT FullName, Email, Phone, Address, RefreshToken, IsActive, DeletedAt FROM Users WHERE UserID = @id', { id: [sql.Int, userId] });
  const user = users[0];
  assert.equal(user.FullName, 'Tài khoản đã xoá');
  assert.match(user.Email, /^deleted-\d+-[0-9a-f]{12}@deleted\.invalid$/);
  assert.equal(user.Phone, null);
  assert.equal(user.Address, null);
  assert.equal(user.RefreshToken, null);
  assert.equal(user.IsActive, false);
  assert.ok(user.DeletedAt);

  const [cart] = await query('SELECT COUNT(*) AS n FROM CartItems WHERE UserID = @id', { id: [sql.Int, userId] });
  assert.equal(cart[0].n, 0);
  const [orders] = await query('SELECT COUNT(*) AS n FROM Orders WHERE UserID = @id', { id: [sql.Int, userId] });
  assert.equal(orders[0].n, 1, 'đơn hàng được giữ làm chứng từ');
  assert.equal(await Review.countDocuments({ userId }), 0);

  await assert.rejects(authService.login({ email: `${tag}-delete@btstore.test`, password: PASSWORD }));
  await assert.rejects(accountService.deleteAccount(userId, PASSWORD), (err) => Boolean(err.status === 404));
  await assert.rejects(
    orderService.createOrder(userId, { shippingAddress: ADDRESS, items: [{ productId: ctx.productId, quantity: 1 }] }),
    (err) => Boolean(err.status === 401),
  );

  // Email đã được giải phóng: khách có thể đăng ký lại bằng email cũ.
  await createUser('delete');
});

test('xoá tài khoản và đặt hàng cùng lúc: không có đơn mở nào lọt vào tài khoản đã xoá', async () => {
  for (let round = 0; round < 5; round += 1) {
    const userId = await createUser(`race${round}`);
    const results = await Promise.allSettled([
      orderService.createOrder(userId, { shippingAddress: ADDRESS, items: [{ productId: ctx.productId, quantity: 1 }] }),
      accountService.deleteAccount(userId, PASSWORD),
    ]);
    const [orderResult, deleteResult] = results;
    const [rows] = await query(`
      SELECT u.IsActive,
             (SELECT COUNT(*) FROM Orders o WHERE o.UserID = u.UserID AND o.Status IN ('pending', 'pending_payment', 'confirmed', 'processing', 'shipped')) AS OpenOrders
      FROM Users u WHERE u.UserID = @id
    `, { id: [sql.Int, userId] });

    // Đúng một bên thắng: hoặc đơn được tạo và tài khoản còn, hoặc tài khoản bị xoá và không có đơn mở.
    assert.notEqual(orderResult.status === 'fulfilled', deleteResult.status === 'fulfilled', `round ${round}`);
    if (deleteResult.status === 'fulfilled') {
      assert.equal(rows[0].IsActive, false);
      assert.equal(rows[0].OpenOrders, 0);
    } else {
      assert.equal(deleteResult.reason.status, 409);
      assert.equal(rows[0].IsActive, true);
    }
  }
});
