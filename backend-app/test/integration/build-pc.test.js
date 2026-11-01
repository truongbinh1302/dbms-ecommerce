/*
  Test tích hợp giai đoạn 2 trên SQL Server thật: lịch sử giá, báo giá giữ giá, bảo hành, Build PC.
  Chạy:  cd backend-app && npm run test:db   (cần SQL Server và MongoDB, xem README)
  Test tự tạo dữ liệu riêng (gắn tag thời gian) và xoá sạch khi xong.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const ProductLog = require('../../src/models/productLog.model');
const orderService = require('../../src/services/order.service');
const productService = require('../../src/services/product.service');
const builderService = require('../../src/services/builder.service');
const priceQuoteService = require('../../src/services/priceQuote.service');
const warrantyService = require('../../src/services/warranty.service');

const ADDRESS = {
  recipientName: 'Integration Test',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Diên Hồng',
  street: '268 Lý Thường Kiệt',
};

const tag = `bp${Date.now()}`;
const ctx = { userId: null, categoryId: null, productIds: [], quoteCodes: [], serials: [] };

const createComponent = async ({ price, stock = 10, spec }) => {
  const index = ctx.productIds.length + 1;
  const { productId } = await productService.createProduct({
    name: `Linh kiện test ${tag}-${index}`,
    slug: `${tag}-part-${index}`,
    price,
    stock,
    categoryId: ctx.categoryId,
  }, 0);
  ctx.productIds.push(productId);

  await new sql.Request(getPool())
    .input('productId', sql.Int, productId)
    .input('type', sql.NVarChar, spec.type)
    .input('socket', sql.NVarChar, spec.socket || null)
    .input('memoryType', sql.NVarChar, spec.memoryType || null)
    .input('formFactor', sql.NVarChar, spec.formFactor || null)
    .input('powerW', sql.Int, spec.powerW || null)
    .input('memorySlots', sql.Int, spec.memorySlots || null)
    .input('m2Slots', sql.Int, spec.m2Slots ?? null)
    .input('hasIgpu', sql.Bit, spec.hasIntegratedGraphics ?? null)
    .query(`
      INSERT INTO ComponentSpecs (ProductID, ComponentType, Socket, MemoryType, FormFactor, PowerW, MemorySlots, M2Slots, HasIntegratedGraphics)
      VALUES (@productId, @type, @socket, @memoryType, @formFactor, @powerW, @memorySlots, @m2Slots, @hasIgpu)
    `);
  return productId;
};

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

test.before(async () => {
  await connectSQL();
  await connectMongo();

  const user = await query(`
    INSERT INTO Users (FullName, Email, Password, Role)
    OUTPUT INSERTED.UserID
    VALUES (N'Integration Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}@btstore.test`] });
  ctx.userId = user[0].UserID;

  const category = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  assert.ok(category[0], 'Cần có ít nhất 1 danh mục (chạy run-seed.js trước)');
  ctx.categoryId = category[0].CategoryID;
});

test.after(async () => {
  const ids = ctx.productIds.join(',') || '0';
  await query(`
    DELETE w FROM Warranties w JOIN Orders o ON o.OrderID = w.OrderID WHERE o.UserID = @userId;
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID = @userId;
    DELETE FROM Orders WHERE UserID = @userId;
    DELETE FROM BuildQuotes WHERE UserID = @userId OR Code IN (SELECT value FROM STRING_SPLIT(@codes, ','));
    DELETE FROM ComponentSpecs WHERE ProductID IN (${ids});
    DELETE FROM PriceHistory WHERE ProductID IN (${ids});
    DELETE FROM CartItems WHERE ProductID IN (${ids});
    DELETE FROM Products WHERE ProductID IN (${ids});
    DELETE FROM Users WHERE UserID = @userId;
  `, { userId: [sql.Int, ctx.userId], codes: [sql.NVarChar, ctx.quoteCodes.join(',')] });
  await ProductLog.deleteMany({ productId: { $in: ctx.productIds } });
  await mongoose.disconnect();
  await getPool().close();
});

test('lịch sử giá: tạo sản phẩm ghi mốc đầu, chỉ ghi thêm khi giá bán đổi', async () => {
  const productId = await createComponent({ price: 1000000, spec: { type: 'storage' } });

  await productService.updateProduct(productId, { price: 1200000 }, 0);
  await productService.updateProduct(productId, { description: 'Không đổi giá' }, 0);
  await productService.updateProduct(productId, { price: 900000, oldPrice: 1200000 }, 0);

  const history = await productService.getPriceHistory(productId);
  assert.deepEqual(history.points.map((point) => point.price), [1000000, 1200000, 900000]);
  assert.equal(history.points[2].oldPrice, 1200000);
  assert.equal(history.currentPrice, 900000);
  assert.equal(history.lowestPrice, 900000);
  assert.equal(history.highestPrice, 1200000);
  assert.equal(await productService.getPriceHistory(999999999), null);
});

test('Build PC: kiểm tra cấu hình đọc thông số từ DB, linh kiện đã có không tính tiền', async () => {
  const cpu = await createComponent({ price: 5000000, spec: { type: 'cpu', socket: 'AM5', powerW: 88, hasIntegratedGraphics: true } });
  const wrongBoard = await createComponent({ price: 3000000, spec: { type: 'mainboard', socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'mATX', memorySlots: 4, m2Slots: 2 } });

  const result = await builderService.checkConfiguration([
    { productId: cpu },
    { productId: wrongBoard, owned: true },
  ]);
  assert.equal(result.subtotal, 5000000);
  assert.ok(result.check.errors.some((error) => error.code === 'socket_mismatch'));
});

test('báo giá giữ giá: tăng giá sau khi báo giá vẫn đặt được theo giá cũ trong thời hạn', async () => {
  const cpu = await createComponent({ price: 5000000, spec: { type: 'cpu', socket: 'AM5', powerW: 88, hasIntegratedGraphics: true } });
  const board = await createComponent({ price: 3000000, spec: { type: 'mainboard', socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', memorySlots: 4, m2Slots: 2 } });

  const quote = await priceQuoteService.createQuote(ctx.userId, { items: [{ productId: cpu }, { productId: board }], title: 'Test' });
  ctx.quoteCodes.push(quote.code);
  assert.match(quote.code, priceQuoteService.CODE_PATTERN);
  assert.equal(quote.subtotal, 8000000);

  await productService.updateProduct(cpu, { price: 5500000 }, 0);
  await productService.updateProduct(board, { price: 2800000 }, 0);

  const cartQuote = await orderService.quoteCart([{ productId: cpu, quantity: 1 }, { productId: board, quantity: 1 }], null, quote.code);
  assert.equal(cartQuote.subtotal, 5000000 + 2800000);

  const order = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId: cpu, quantity: 1 }, { productId: board, quantity: 1 }],
    quoteCode: quote.code.toLowerCase(),
  });
  assert.equal(order.subtotal, 7800000);
  assert.equal(order.quoteCode, quote.code);

  const saved = await orderService.getOrderById(order.orderId, ctx.userId);
  assert.equal(saved.quoteCode, quote.code);
  assert.deepEqual(
    saved.items.map((item) => [item.ProductID, Number(item.UnitPrice)]).sort((a, b) => a[0] - b[0]),
    [[cpu, 5000000], [board, 2800000]].sort((a, b) => a[0] - b[0]),
  );

  const viewed = await priceQuoteService.getQuote(quote.code);
  assert.equal(viewed.expired, false);
  assert.equal(viewed.items.find((item) => item.productId === cpu).currentPrice, 5500000);
});

test('báo giá hết hạn: đặt hàng báo 410 và không tạo đơn; báo giá giỏ vẫn tính giá hiện tại', async () => {
  const cpu = await createComponent({ price: 4000000, spec: { type: 'cpu', socket: 'AM5', powerW: 88, hasIntegratedGraphics: true } });
  const quote = await priceQuoteService.createQuote(null, { items: [{ productId: cpu }] });
  ctx.quoteCodes.push(quote.code);
  await productService.updateProduct(cpu, { price: 4500000 }, 0);
  await query("UPDATE BuildQuotes SET ExpiresAt = DATEADD(MINUTE, -1, SYSDATETIME()) WHERE Code = @code", { code: [sql.NVarChar, quote.code] });

  const before = await query('SELECT COUNT(*) AS n FROM Orders WHERE UserID = @userId', { userId: [sql.Int, ctx.userId] });
  await assert.rejects(
    orderService.createOrder(ctx.userId, { shippingAddress: ADDRESS, items: [{ productId: cpu, quantity: 1 }], quoteCode: quote.code }),
    (err) => Boolean(err.status === 410 && err.data.code === 'quote_expired'),
  );
  const after = await query('SELECT COUNT(*) AS n FROM Orders WHERE UserID = @userId', { userId: [sql.Int, ctx.userId] });
  assert.equal(after[0].n, before[0].n);

  const cartQuote = await orderService.quoteCart([{ productId: cpu, quantity: 1 }], null, quote.code);
  assert.equal(cartQuote.subtotal, 4500000);
  assert.equal(cartQuote.priceLockError.code, 'quote_expired');
  assert.equal((await priceQuoteService.getQuote(quote.code)).expired, true);
});

test('bảo hành: chỉ đăng ký cho đơn đã xác nhận, không vượt số lượng mua, tra cứu được', async () => {
  const ssd = await createComponent({ price: 1500000, spec: { type: 'storage' } });
  const order = await orderService.createOrder(ctx.userId, { shippingAddress: ADDRESS, items: [{ productId: ssd, quantity: 2 }] });
  const serial = `${tag}A`.toUpperCase();

  await assert.rejects(
    warrantyService.registerWarranty({ serialNumber: serial, orderId: order.orderId, productId: ssd, months: 12 }),
    (err) => Boolean(err.status === 409),
  );

  await query("UPDATE Orders SET Status = 'delivered' WHERE OrderID = @orderId", { orderId: [sql.Int, order.orderId] });
  const first = await warrantyService.registerWarranty({
    serialNumber: serial.toLowerCase(), orderId: order.orderId, productId: ssd, months: 12, startDate: '2026-01-31',
  });
  assert.equal(first.serialNumber, serial);
  assert.equal(first.startDate, '2026-01-31');
  assert.equal(first.endDate, '2027-01-30');

  await assert.rejects(
    warrantyService.registerWarranty({ serialNumber: serial, orderId: order.orderId, productId: ssd, months: 12 }),
    (err) => Boolean(err.status === 409 && /đã được đăng ký/.test(err.message)),
  );

  // Đơn mua 2 cái, còn 1 suất: hai admin đăng ký cùng lúc 2 serial khác nhau → chỉ 1 thành công.
  const results = await Promise.allSettled([
    warrantyService.registerWarranty({ serialNumber: `${tag}B`, orderId: order.orderId, productId: ssd, months: 12 }),
    warrantyService.registerWarranty({ serialNumber: `${tag}C`, orderId: order.orderId, productId: ssd, months: 12 }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);

  const lookup = await warrantyService.lookupWarranty(serial);
  assert.equal(lookup.productId, ssd);
  assert.equal(lookup.status, 'active');
  assert.equal(lookup.orderCode, undefined, 'tra cứu công khai không lộ mã đơn');

  const mine = await warrantyService.getMyWarranties(ctx.userId);
  assert.equal(mine.length, 2);
  assert.ok(mine.every((item) => item.orderId === order.orderId));

  const detail = await orderService.getOrderById(order.orderId, ctx.userId);
  assert.equal(detail.warranties.length, 2);
});
