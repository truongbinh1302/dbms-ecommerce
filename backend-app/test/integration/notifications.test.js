/*
  Test tích hợp: theo dõi giá và thông báo (giá giảm, Hot Deal, đơn hàng đổi trạng thái).
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const ProductLog = require('../../src/models/productLog.model');
const notificationService = require('../../src/services/notification.service');
const productService = require('../../src/services/product.service');
const promotionService = require('../../src/services/promotion.service');
const orderService = require('../../src/services/order.service');
const inventoryService = require('../../src/services/inventory.service');

const tag = `nt${Date.now()}`;
const ctx = { userIds: [], productId: null, promotionIds: [], extraProductIds: [], receiptIds: [] };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const newUser = async (suffix) => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Thông báo Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`] });
  ctx.userIds.push(user.UserID);
  return user.UserID;
};

const priceDrops = async (userId) => query(
  "SELECT Title, Body, Link FROM Notifications WHERE UserID = @userId AND Type = N'price_drop' ORDER BY NotificationID",
  { userId: [sql.Int, userId] },
);

const setPrice = (price) => productService.updateProduct(ctx.productId, { price });
const iso = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const { productId } = await productService.createProduct({
    name: `Theo dõi giá ${tag}`, slug: `${tag}-product`, price: 1000000, stock: 20, categoryId: category.CategoryID,
  }, null);
  ctx.productId = productId;
});

test.after(async () => {
  const users = ctx.userIds.join(',') || '0';
  const promotions = ctx.promotionIds.join(',') || '0';
  const extra = ctx.extraProductIds.join(',') || '0';
  const receipts = ctx.receiptIds.join(',') || '0';
  await query(`
    DELETE FROM StockWatches WHERE UserID IN (${users});
    DELETE FROM StockReceiptItems WHERE ReceiptID IN (${receipts});
    DELETE FROM StockReceipts WHERE ReceiptID IN (${receipts});
    DELETE FROM StockMovements WHERE ProductID IN (${extra});
    DELETE FROM PriceHistory WHERE ProductID IN (${extra});
    DELETE FROM Products WHERE ProductID IN (${extra});
    DELETE FROM Notifications WHERE UserID IN (${users});
    DELETE FROM PriceWatches WHERE UserID IN (${users});
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${users});
    DELETE FROM Orders WHERE UserID IN (${users});
    DELETE FROM CartItems WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM PromotionItems WHERE PromotionID IN (${promotions});
    DELETE FROM Promotions WHERE PromotionID IN (${promotions});
    DELETE FROM StockMovements WHERE ProductID = @productId;
    DELETE FROM PriceHistory WHERE ProductID = @productId;
    DELETE FROM Products WHERE ProductID = @productId;
  `, { productId: [sql.Int, ctx.productId] });
  await ProductLog.deleteMany({ productId: { $in: [ctx.productId, ...ctx.extraProductIds] } });
  // Chờ lượt quét sweepSoon cuối cùng (do updateProduct) chạy xong trước khi đóng kết nối.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mongoose.disconnect();
  await getPool().close();
});

test('theo dõi giá: báo khi giá giảm, không báo trùng, báo lại khi giảm tiếp', async () => {
  const anna = await newUser('anna');
  const watch = await notificationService.watchProduct(anna, { productId: ctx.productId });
  assert.deepEqual(watch, { productId: ctx.productId, priceAtWatch: 1000000, targetPrice: null });
  await notificationService.sweepPriceWatches();
  assert.equal((await priceDrops(anna)).length, 0, 'giá chưa đổi thì không báo');

  await setPrice(900000);
  await notificationService.sweepPriceWatches();
  let drops = await priceDrops(anna);
  assert.equal(drops.length, 1);
  assert.match(drops[0].Title, new RegExp(`Giá giảm: Theo dõi giá ${tag}`));
  assert.match(drops[0].Body, /900\.000đ/);
  assert.equal(drops[0].Link, `/san-pham/${ctx.productId}`);

  // Hai lượt quét chạy cùng lúc vẫn chỉ một thông báo cho mỗi mức giá.
  await Promise.all([notificationService.sweepPriceWatches(), notificationService.sweepPriceWatches()]);
  assert.equal((await priceDrops(anna)).length, 1);

  // Giá nhích lên mà vẫn dưới giá lúc bắt đầu theo dõi: không báo "giá giảm".
  await setPrice(950000);
  await notificationService.sweepPriceWatches();
  assert.equal((await priceDrops(anna)).length, 1);
  // Về lại giá cũ rồi giảm lần nữa thì báo.
  await setPrice(1000000);
  await notificationService.sweepPriceWatches();
  await setPrice(980000);
  await notificationService.sweepPriceWatches();
  drops = await priceDrops(anna);
  assert.equal(drops.length, 2);
  assert.match(drops[1].Body, /980\.000đ/);

  await setPrice(850000);
  await notificationService.sweepPriceWatches();
  drops = await priceDrops(anna);
  assert.equal(drops.length, 3);

  const list = await notificationService.listWatches(anna);
  assert.deepEqual([list[0].productId, list[0].currentPrice, list[0].priceAtWatch], [ctx.productId, 850000, 1000000]);
});

test('giá mong muốn và Hot Deal: báo khi giá khuyến mãi chạm mức, báo lại ở đợt Hot Deal sau', async () => {
  const binh = await newUser('binh');
  await assert.rejects(notificationService.watchProduct(binh, { productId: ctx.productId, targetPrice: 900000 }), (err) => err.status === 400);
  await notificationService.watchProduct(binh, { productId: ctx.productId, targetPrice: 700000 });

  await setPrice(800000);
  await notificationService.sweepPriceWatches();
  assert.equal((await priceDrops(binh)).length, 0, 'chưa tới giá mong muốn');

  const deal = await promotionService.createPromotion({ name: `Deal ${tag}`, startsAt: iso(-1), endsAt: iso(60), items: [{ productId: ctx.productId, salePrice: 690000 }] }, null);
  ctx.promotionIds.push(deal.id);
  await notificationService.sweepPriceWatches();
  let drops = await priceDrops(binh);
  assert.equal(drops.length, 1);
  assert.match(drops[0].Body, /690\.000đ/);

  // Hết Hot Deal: giá về 800.000, không báo; đợt Hot Deal sau cùng mức giá thì báo lại.
  await promotionService.stopPromotion(deal.id);
  await notificationService.sweepPriceWatches();
  assert.equal((await priceDrops(binh)).length, 1);
  const again = await promotionService.createPromotion({ name: `Deal 2 ${tag}`, startsAt: iso(-1), endsAt: iso(60), items: [{ productId: ctx.productId, salePrice: 690000 }] }, null);
  ctx.promotionIds.push(again.id);
  await notificationService.sweepPriceWatches();
  drops = await priceDrops(binh);
  assert.equal(drops.length, 2);

  await notificationService.unwatchProduct(binh, ctx.productId);
  assert.deepEqual(await notificationService.listWatches(binh), []);
  await promotionService.stopPromotion(again.id);
});

test('tài khoản đã khoá không nhận thông báo giá', async () => {
  const locked = await newUser('locked');
  await notificationService.watchProduct(locked, { productId: ctx.productId });
  await query('UPDATE Users SET IsActive = 0 WHERE UserID = @id', { id: [sql.Int, locked] });
  await setPrice(600000);
  await notificationService.sweepPriceWatches();
  assert.equal((await priceDrops(locked)).length, 0);
});

test('đơn đổi trạng thái: khách nhận thông báo, ghi chú của khách không bị ghi đè; đánh dấu đã đọc', async () => {
  const chi = await newUser('chi');
  const order = await orderService.createOrder(chi, {
    items: [{ productId: ctx.productId, quantity: 1 }],
    note: 'Giao giờ hành chính',
    shippingAddress: { recipientName: 'Chi', phone: '0901234567', province: 'TP. Hồ Chí Minh', ward: 'Phường Bến Thành', street: '1 Lê Lợi' },
  });
  await orderService.updateOrderStatus(order.orderId, 'confirmed', 'Admin cập nhật trạng thái sang confirmed');
  await orderService.updateOrderStatus(order.orderId, 'confirmed', 'Lặp lại');
  const [{ Note }] = await query('SELECT Note FROM Orders WHERE OrderID = @id', { id: [sql.Int, order.orderId] });
  assert.equal(Note, 'Giao giờ hành chính');

  let mine = await notificationService.listMine(chi);
  assert.equal(mine.unread, 1, 'đặt lại cùng trạng thái không báo lần nữa');
  assert.match(mine.items[0].title, /Đã xác nhận/);
  assert.equal(mine.items[0].link, `/don-hang/${order.orderId}`);

  await orderService.updateOrderStatus(order.orderId, 'cancelled', 'Hết hàng nhà cung cấp');
  mine = await notificationService.listMine(chi);
  assert.equal(mine.unread, 2);
  assert.match(mine.items[0].title, /đã bị huỷ/);
  assert.equal(mine.items[0].body, 'Hết hàng nhà cung cấp');

  assert.deepEqual(await notificationService.markRead(chi, mine.items[0].id), { updated: 1 });
  assert.equal((await notificationService.listMine(chi)).unread, 1);
  // Không đánh dấu được thông báo của người khác.
  assert.deepEqual(await notificationService.markRead(ctx.userIds[0], mine.items[1].id), { updated: 0 });
  await notificationService.markRead(chi);
  assert.equal((await notificationService.listMine(chi)).unread, 0);
});

test('báo khi có hàng: chỉ cho sản phẩm đang hết, báo một lần khi hàng về rồi xoá lượt chờ', async () => {
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  const { productId: soldOut } = await productService.createProduct({
    name: `Hết hàng ${tag}`, slug: `${tag}-sold-out`, price: 2500000, stock: 0, categoryId: category.CategoryID,
  }, null);
  ctx.extraProductIds.push(soldOut);
  const ben = await newUser('ben');
  const backInStock = () => query(
    "SELECT Title, Body, Link FROM Notifications WHERE UserID = @userId AND Type = N'back_in_stock'",
    { userId: [sql.Int, ben] },
  );

  await assert.rejects(notificationService.watchStock(ben, ctx.productId), (err) => err.status === 400 && err.data.code === 'in_stock');
  await assert.rejects(notificationService.watchStock(ben, 0), (err) => err.status === 400);
  assert.deepEqual(await notificationService.watchStock(ben, soldOut), { productId: soldOut, waiting: true });
  await notificationService.watchStock(ben, soldOut); // bấm lại không tạo trùng
  const waiting = await notificationService.listStockWatches(ben);
  assert.deepEqual(waiting.map((item) => [item.productId, item.stock]), [[soldOut, 0]]);

  await notificationService.sweepStockWatches();
  assert.equal((await backInStock()).length, 0, 'còn hết hàng thì chưa báo');
  const low = await inventoryService.listLowStock({ threshold: 0, limit: 100 });
  assert.equal(low.items.find((item) => item.productId === soldOut)?.waiting, 1, 'admin thấy số khách đang chờ hàng');

  const receipt = await inventoryService.createReceipt({ supplier: 'NCC báo có hàng', items: [{ productId: soldOut, quantity: 4, unitCost: 2000000 }] }, admin.UserID);
  ctx.receiptIds.push(receipt.id);
  await notificationService.sweepStockWatches();
  await notificationService.sweepStockWatches();
  const sent = await backInStock();
  assert.equal(sent.length, 1, 'báo đúng một lần');
  assert.match(sent[0].Title, new RegExp(`Đã có hàng: Hết hàng ${tag}`));
  assert.match(sent[0].Body, /Hiện còn 4 sản phẩm, giá 2\.500\.000đ/);
  assert.equal(sent[0].Link, `/san-pham/${soldOut}`);
  assert.equal((await notificationService.listStockWatches(ben)).length, 0, 'lượt chờ đã xoá');

  await assert.rejects(notificationService.watchStock(ben, soldOut), (err) => err.data?.code === 'in_stock');
  assert.deepEqual(await notificationService.unwatchStock(ben, soldOut), { productId: soldOut, waiting: false });
});
