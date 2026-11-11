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
    DELETE FROM Notifications WHERE UserID IN (${ids});
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${ids});
    DELETE FROM Orders WHERE UserID IN (${ids});
    DELETE FROM Users WHERE UserID IN (${ids});
    DELETE FROM PriceHistory WHERE ProductID = @id;
    DELETE FROM StockMovements WHERE ProductID = @id;
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

test('kiểm duyệt: ẩn đánh giá thì không hiện, không tính điểm, khách được báo lý do; hiện lại và phản hồi công khai', async () => {
  const third = await createBuyer('third', 'delivered');
  const created = await reviewService.addReview(ctx.productId, third, { rating: 1, title: 'Tệ', content: 'Nội dung có lời lẽ không phù hợp' });
  const id = String(created._id);
  assert.deepEqual(await productRating(), { rating: 2.5, count: 2 });

  const needs = await reviewService.listForAdmin({ filter: 'needs_reply' });
  const listed = needs.items.find((item) => item.id === id);
  assert.ok(listed && needs.needsReply >= 1, 'đánh giá 1 sao chưa phản hồi nằm trong danh sách cần trả lời');
  assert.equal(listed.productName, 'Review test product');
  assert.equal(listed.author.email, `${tag}-third@btstore.test`);

  const hidden = await reviewService.moderateReview(id, { hidden: true, reason: 'offensive' });
  assert.deepEqual([hidden.hidden, hidden.hiddenReason], [true, 'offensive']);
  assert.deepEqual(await productRating(), { rating: 4, count: 1 }, 'điểm sao không tính đánh giá bị ẩn');
  const publicList = await reviewService.getProductReviews(ctx.productId, 1, 10);
  assert.equal(publicList.total, 1);
  assert.ok(!publicList.reviews.some((item) => String(item._id) === id));
  assert.equal((await reviewService.getReviewStatistics(ctx.productId)).total_reviews, 1);
  assert.equal(await reviewService.syncAllProductRatings() >= 0, true);
  assert.deepEqual(await productRating(), { rating: 4, count: 1 }, 'đồng bộ toàn bộ cũng bỏ qua đánh giá bị ẩn');
  const eligibility = await reviewService.getReviewEligibility(ctx.productId, third);
  assert.deepEqual([eligibility.reason, eligibility.hidden, eligibility.hiddenReason], ['already_reviewed', true, 'offensive']);
  assert.ok((await reviewService.listForAdmin({ filter: 'hidden' })).items.some((item) => item.id === id));
  assert.ok(!(await reviewService.listForAdmin({ filter: 'needs_reply' })).items.some((item) => item.id === id), 'đánh giá đã ẩn không cần trả lời');

  const shown = await reviewService.moderateReview(id, { hidden: false, reply: 'Cửa hàng xin lỗi, đã liên hệ để đổi máy cho bạn.' });
  assert.equal(shown.hidden, false);
  assert.equal(shown.storeReply.content, 'Cửa hàng xin lỗi, đã liên hệ để đổi máy cho bạn.');
  assert.deepEqual(await productRating(), { rating: 2.5, count: 2 });
  const withReply = (await reviewService.getProductReviews(ctx.productId, 1, 10)).reviews.find((item) => String(item._id) === id);
  assert.equal(withReply.storeReply.content, 'Cửa hàng xin lỗi, đã liên hệ để đổi máy cho bạn.');
  assert.equal(withReply.hiddenReason, undefined, 'trang công khai không trả thông tin kiểm duyệt');

  await reviewService.moderateReview(id, { reply: 'Cửa hàng xin lỗi, đã đổi máy mới cho bạn.' });
  const notes = await query("SELECT Title, Body FROM Notifications WHERE UserID = @id AND Type = N'review' ORDER BY NotificationID", { id: [sql.Int, third] });
  assert.equal(notes.length, 2, 'một thông báo khi bị ẩn, một khi được phản hồi lần đầu; sửa phản hồi không báo lại');
  assert.match(notes[0].Title, /đã bị ẩn/);
  assert.match(notes[0].Body, /ngôn từ xúc phạm/);
  assert.match(notes[1].Title, /phản hồi/);
  assert.ok(!(await reviewService.listForAdmin({ filter: 'needs_reply' })).items.some((item) => item.id === id), 'đã phản hồi thì không còn trong danh sách cần trả lời');

  const cleared = await reviewService.moderateReview(id, { reply: '' });
  assert.equal(cleared.storeReply, null);
  await assert.rejects(reviewService.moderateReview(new mongoose.Types.ObjectId().toString(), { hidden: false }), (err) => err.status === 404);
  await assert.rejects(reviewService.listForAdmin({ filter: 'lost' }), (err) => err.status === 400);
});

test('lọc theo số sao; bấm hữu ích: không tự bấm, mỗi người một lần kể cả bấm dồn, đánh giá bị ẩn thì không bấm được', async () => {
  const oneStar = await reviewService.getProductReviews(ctx.productId, 1, 10, 1);
  assert.equal(oneStar.total, 1);
  assert.ok(oneStar.reviews.every((item) => item.rating === 1));
  assert.equal((await reviewService.getProductReviews(ctx.productId, 1, 10, 'x')).total, 2, 'giá trị lọc sai thì bỏ qua');

  const [target] = (await reviewService.getProductReviews(ctx.productId, 1, 10, 4)).reviews;
  const id = String(target._id);
  await assert.rejects(reviewService.markHelpful(id, target.userId), (err) => err.status === 400);

  const [voter, burst] = ctx.userIds.filter((userId) => userId !== target.userId);
  assert.equal((await reviewService.markHelpful(id, voter)).helpful_count, 1);
  await assert.rejects(reviewService.markHelpful(id, voter), (err) => err.status === 409);

  const results = await Promise.allSettled(Array.from({ length: 5 }, () => reviewService.markHelpful(id, burst)));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1, 'bấm dồn 5 lần chỉ tính 1');
  assert.ok(results.filter((item) => item.status === 'rejected').every((item) => item.reason.status === 409));
  assert.equal((await Review.findById(id).lean()).helpful_count, 2);

  await reviewService.moderateReview(id, { hidden: true, reason: 'spam' });
  const third = ctx.userIds.find((userId) => ![target.userId, voter, burst].includes(userId));
  await assert.rejects(reviewService.markHelpful(id, third), (err) => err.status === 404);
  await reviewService.moderateReview(id, { hidden: false });
});
