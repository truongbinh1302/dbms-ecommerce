/*
  Test tích hợp: khuyến mãi có thời hạn (Hot Deal) trên SQL Server thật.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const promotionService = require('../../src/services/promotion.service');
const productService = require('../../src/services/product.service');
const orderService = require('../../src/services/order.service');

const ADDRESS = {
  recipientName: 'Promo Test',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Diên Hồng',
  street: '268 Lý Thường Kiệt',
};

const tag = `pr${Date.now()}`;
const ctx = { userIds: [], productIds: [], promotionIds: [], adminId: null };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const iso = (offsetMinutes) => new Date(Date.now() + offsetMinutes * 60000).toISOString();

const newUser = async (suffix) => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Promo Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`] });
  ctx.userIds.push(user.UserID);
  return user.UserID;
};

const newProduct = async (suffix, price, stock = 50) => {
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [row] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (@name, @slug, @price, @stock, @categoryId)
  `, {
    name: [sql.NVarChar, `Promo ${tag} ${suffix}`],
    slug: [sql.NVarChar, `${tag}-${suffix}`],
    price: [sql.Decimal(18, 2), price],
    stock: [sql.Int, stock],
    categoryId: [sql.Int, category.CategoryID],
  });
  ctx.productIds.push(row.ProductID);
  return row.ProductID;
};

const createPromotion = async (payload) => {
  const promo = await promotionService.createPromotion(payload, ctx.adminId);
  ctx.promotionIds.push(promo.id);
  return promo;
};

const soldCount = async (promotionId, productId) => (await query(
  'SELECT SoldCount FROM PromotionItems WHERE PromotionID = @promotionId AND ProductID = @productId',
  { promotionId: [sql.Int, promotionId], productId: [sql.Int, productId] },
))[0].SoldCount;

test.before(async () => {
  await connectSQL();
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  ctx.adminId = admin.UserID;
});

test.after(async () => {
  const users = ctx.userIds.join(',') || '0';
  const products = ctx.productIds.join(',') || '0';
  const promotions = ctx.promotionIds.join(',') || '0';
  await query(`
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${users});
    DELETE FROM Orders WHERE UserID IN (${users});
    DELETE FROM CartItems WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM PromotionItems WHERE PromotionID IN (${promotions});
    DELETE FROM Promotions WHERE PromotionID IN (${promotions});
    DELETE FROM StockMovements WHERE ProductID IN (${products});
    DELETE FROM PriceHistory WHERE ProductID IN (${products});
    DELETE FROM Products WHERE ProductID IN (${products});
  `);
  await getPool().close();
});

test('tạo chương trình: kiểm tra giờ, giá thấp hơn niêm yết, không trùng khung giờ', async () => {
  const keyboard = await newProduct('keyboard', 1000000);
  const base = { name: 'Hot Deal test', startsAt: iso(-5), endsAt: iso(60) };

  await assert.rejects(promotionService.createPromotion({ ...base, startsAt: '2026-11-12 20:00', items: [{ productId: keyboard, salePrice: 900000 }] }, ctx.adminId), (err) => err.status === 400 && /bắt đầu/.test(err.message));
  await assert.rejects(promotionService.createPromotion({ ...base, endsAt: iso(-10), items: [{ productId: keyboard, salePrice: 900000 }] }, ctx.adminId), (err) => err.status === 400);
  await assert.rejects(promotionService.createPromotion({ ...base, items: [{ productId: keyboard, salePrice: 1000000 }] }, ctx.adminId), (err) => err.status === 400 && /thấp hơn giá niêm yết/.test(err.message));
  await assert.rejects(promotionService.createPromotion({ ...base, items: [{ productId: keyboard, salePrice: 900000, quantityLimit: 0 }] }, ctx.adminId), (err) => err.status === 400);

  const promo = await createPromotion({ ...base, items: [{ productId: keyboard, salePrice: 900000, quantityLimit: 10, perOrderLimit: 2 }] });
  assert.equal(promo.status, 'running');
  assert.equal(promo.items[0].salePrice, 900000);

  // Cùng sản phẩm, khung giờ chồng lên → từ chối; khung giờ sau đó → được.
  await assert.rejects(
    promotionService.createPromotion({ name: 'Trùng', startsAt: iso(30), endsAt: iso(90), items: [{ productId: keyboard, salePrice: 850000 }] }, ctx.adminId),
    (err) => err.status === 400 && /trùng khung giờ/.test(err.message),
  );
  const later = await createPromotion({ name: 'Ca sau', startsAt: iso(61), endsAt: iso(120), items: [{ productId: keyboard, salePrice: 850000 }] });
  assert.equal(later.status, 'upcoming');

  // Sản phẩm trả về kèm khuyến mãi đang chạy (không phải ca sắp tới); giá niêm yết giữ nguyên.
  const product = await productService.getProductById(keyboard);
  assert.equal(product.price, 1000000);
  assert.equal(product.promotion.id, promo.id);
  assert.equal(product.promotion.salePrice, 900000);
  assert.equal(product.promotion.remaining, 10);

  const active = await promotionService.getActivePromotions();
  assert.ok(active.running.some((item) => item.id === promo.id && item.items[0].id === keyboard));
  assert.ok(active.upcoming.some((item) => item.id === later.id));
  assert.ok(new Date(active.serverNow).getTime() > 0);

  // Dừng chương trình: sản phẩm về giá niêm yết ngay.
  const stopped = await promotionService.stopPromotion(promo.id);
  assert.equal(stopped.status, 'stopped');
  assert.equal((await productService.getProductById(keyboard)).promotion, null);
  const quote = await orderService.quoteCart([{ productId: keyboard, quantity: 1 }]);
  assert.equal(quote.items[0].unitPrice, 1000000);
});

test('nhiều khách tranh 2 suất cuối: đúng 2 đơn được giá Hot Deal, không bán lố', async () => {
  const mouse = await newProduct('mouse', 500000);
  const promo = await createPromotion({ name: 'Flash mouse', startsAt: iso(-1), endsAt: iso(30), items: [{ productId: mouse, salePrice: 300000, quantityLimit: 2 }] });
  const buyers = await Promise.all([1, 2, 3, 4, 5].map((index) => newUser(`race${index}`)));

  const quote = await orderService.quoteCart([{ productId: mouse, quantity: 1 }]);
  assert.equal(quote.items[0].unitPrice, 300000);

  // Ai cũng gửi tổng tiền đã thấy (giá Hot Deal): người đến sau nhận 409 thay vì bị tính giá khác.
  const results = await Promise.allSettled(buyers.map((userId) => orderService.createOrder(userId, {
    shippingAddress: ADDRESS,
    items: [{ productId: mouse, quantity: 1 }],
    expectedTotal: quote.total,
  })));
  const ok = results.filter((result) => result.status === 'fulfilled');
  const refused = results.filter((result) => result.status === 'rejected');
  assert.equal(ok.length, 2);
  assert.ok(refused.every((result) => result.reason.status === 409 && result.reason.data.code === 'price_changed'));
  assert.ok(ok.every((result) => result.value.subtotal === 300000));
  assert.equal(await soldCount(promo.id, mouse), 2);

  const [{ Stock: stock }] = await query('SELECT Stock FROM Products WHERE ProductID = @id', { id: [sql.Int, mouse] });
  assert.equal(stock, 48, 'chỉ 2 đơn thành công trừ kho');

  // Hết suất: đặt không kèm tổng tiền thì tính giá niêm yết.
  const fullPrice = await orderService.createOrder(buyers[2], { shippingAddress: ADDRESS, items: [{ productId: mouse, quantity: 1 }] });
  assert.equal(fullPrice.subtotal, 500000);
  const [line] = await query('SELECT UnitPrice, PromotionID FROM OrderItems WHERE OrderID = @id', { id: [sql.Int, fullPrice.orderId] });
  assert.deepEqual([Number(line.UnitPrice), line.PromotionID], [500000, null]);

  // Huỷ một đơn Hot Deal: trả suất, khách sau mua lại được giá khuyến mãi.
  const winner = results.findIndex((result) => result.status === 'fulfilled');
  await orderService.cancelOrder(results[winner].value.orderId, buyers[winner], 'Đổi ý');
  assert.equal(await soldCount(promo.id, mouse), 1);
  const again = await orderService.quoteCart([{ productId: mouse, quantity: 1 }]);
  assert.equal(again.items[0].unitPrice, 300000);
});

test('giới hạn mỗi đơn: mua quá giới hạn thì cả dòng tính giá niêm yết, có lý do', async () => {
  const ssd = await newProduct('ssd', 2000000);
  await createPromotion({ name: 'SSD deal', startsAt: iso(-1), endsAt: iso(30), items: [{ productId: ssd, salePrice: 1500000, perOrderLimit: 2 }] });
  const quote = await orderService.quoteCart([{ productId: ssd, quantity: 3 }]);
  assert.equal(quote.items[0].unitPrice, 2000000);
  assert.match(quote.items[0].promotionNote, /tối đa 2/);
  const okQuote = await orderService.quoteCart([{ productId: ssd, quantity: 2 }]);
  assert.equal(okQuote.subtotal, 3000000);
});
