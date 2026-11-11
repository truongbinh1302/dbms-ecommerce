/*
  Test tích hợp: điểm sao trong Products luôn khớp với review thật trong MongoDB.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const Review = require('../../src/models/review.model');
const reviewService = require('../../src/services/review.service');

const tag = `rv${Date.now()}`;
const ctx = { productId: null, userIds: [] };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const createBuyer = async (suffix, status) => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Review Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`] });
  ctx.userIds.push(user.UserID);
  const [order] = await query(`
    INSERT INTO Orders (UserID, PaymentMethod, Status, Subtotal, Discount, ShippingFee, Total)
    OUTPUT INSERTED.OrderID
    VALUES (@userId, N'cod', @status, 100000, 0, 0, 100000)
  `, { userId: [sql.Int, user.UserID], status: [sql.NVarChar, status] });
  await query('INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice) VALUES (@orderId, @productId, 1, 100000)', {
    orderId: [sql.Int, order.OrderID],
    productId: [sql.Int, ctx.productId],
  });
  return user.UserID;
};

const productRating = async () => {
  const [row] = await query('SELECT Rating, ReviewsCount FROM Products WHERE ProductID = @id', { id: [sql.Int, ctx.productId] });
  return { rating: Number(row.Rating), count: row.ReviewsCount };
};

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID, Rating, ReviewsCount)
    OUTPUT INSERTED.ProductID
    VALUES (N'Review test product', @slug, 100000, 10, @categoryId, 4.80, 120)
  `, { slug: [sql.NVarChar, `${tag}-product`], categoryId: [sql.Int, category.CategoryID] });
  ctx.productId = product.ProductID;
});

test.after(async () => {
  await Review.deleteMany({ productId: ctx.productId });
  const ids = ctx.userIds.join(',') || '0';
  await query(`
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${ids});
    DELETE FROM Orders WHERE UserID IN (${ids});
    DELETE FROM Users WHERE UserID IN (${ids});
    DELETE FROM PriceHistory WHERE ProductID = @id;
    DELETE FROM Products WHERE ProductID = @id;
  `, { id: [sql.Int, ctx.productId] });
  await mongoose.disconnect();
  await getPool().close();
});

test('điểm seed giả được thay bằng điểm thật (chưa có review → 0)', async () => {
  const changed = await reviewService.syncAllProductRatings();
  assert.ok(changed >= 1);
  assert.deepEqual(await productRating(), { rating: 0, count: 0 });
});

test('chỉ người đã nhận hàng mới đánh giá được; điểm cập nhật khi thêm, sửa, xoá', async () => {
  const pending = await createBuyer('pending', 'shipped');
  assert.deepEqual(await reviewService.getReviewEligibility(ctx.productId, pending), { canReview: false, reason: 'not_purchased' });
  await assert.rejects(
    reviewService.addReview(ctx.productId, pending, { rating: 5, title: 'Tốt', content: 'Chưa nhận hàng mà đánh giá' }),
    /đã nhận hàng/,
  );

  const first = await createBuyer('first', 'delivered');
  const second = await createBuyer('second', 'delivered');
  assert.deepEqual(await reviewService.getReviewEligibility(ctx.productId, first), { canReview: true, reason: null });

  const review = await reviewService.addReview(ctx.productId, first, { rating: 5, title: 'Rất tốt', content: 'Máy chạy êm, giao nhanh' });
  assert.deepEqual(await productRating(), { rating: 5, count: 1 });

  await reviewService.addReview(ctx.productId, second, { rating: 4, title: 'Ổn', content: 'Đóng gói kỹ, giá hợp lý' });
  assert.deepEqual(await productRating(), { rating: 4.5, count: 2 });

  const again = await reviewService.getReviewEligibility(ctx.productId, first);
  assert.equal(again.reason, 'already_reviewed');
  await assert.rejects(
    reviewService.addReview(ctx.productId, first, { rating: 1, title: 'Lần hai', content: 'Đánh giá lần thứ hai' }),
    /đã đánh giá/,
  );
  await assert.rejects(
    reviewService.addReview(ctx.productId, second, { rating: 6, title: 'Sai', content: 'Số sao không hợp lệ' }),
    /1 đến 5/,
  );

  await reviewService.updateReview(String(review._id), first, { rating: 3 });
  assert.deepEqual(await productRating(), { rating: 3.5, count: 2 });

  await reviewService.deleteReview(String(review._id), first);
  assert.deepEqual(await productRating(), { rating: 4, count: 1 });
});
