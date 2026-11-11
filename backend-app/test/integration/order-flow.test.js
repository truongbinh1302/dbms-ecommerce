/*
  Test tích hợp chạy trên SQL Server thật (docker compose trong dbms-env).
  Chạy:  cd backend-app && npm run test:db
  Test tự tạo user, sản phẩm, voucher riêng (gắn tag thời gian) và xoá sạch khi xong.
  Lưu ý: expireStalePayments huỷ MỌI đơn VNPay quá hạn trong DB, giống server làm mỗi phút.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const orderService = require('../../src/services/order.service');
const cartService = require('../../src/services/cart.service');
const productService = require('../../src/services/product.service');
const { refreshSearchText } = require('../../src/services/searchIndex.service');

const ADDRESS = {
  recipientName: 'Integration Test',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Diên Hồng',
  street: '268 Lý Thường Kiệt',
};

const tag = `it${Date.now()}`;
const ctx = { userId: null, categoryId: null, productCount: 0, voucherCount: 0 };

const createProduct = async ({ stock, price, name = null }) => {
  ctx.productCount += 1;
  const result = await new sql.Request(getPool())
    .input('name', sql.NVarChar, name || `Test product ${tag}-${ctx.productCount}`)
    .input('slug', sql.NVarChar, `${tag}-product-${ctx.productCount}`)
    .input('price', sql.Decimal(18, 2), price)
    .input('stock', sql.Int, stock)
    .input('categoryId', sql.Int, ctx.categoryId)
    .query(`
      INSERT INTO Products (Name, Slug, Price, Stock, CategoryID)
      OUTPUT INSERTED.ProductID
      VALUES (@name, @slug, @price, @stock, @categoryId)
    `);
  return result.recordset[0].ProductID;
};

const createVoucher = async ({ usageLimit, value = 10, type = 'percent', maxDiscount = null }) => {
  ctx.voucherCount += 1;
  const code = `${tag}V${ctx.voucherCount}`.toUpperCase();
  const result = await new sql.Request(getPool())
    .input('code', sql.NVarChar, code)
    .input('type', sql.NVarChar, type)
    .input('value', sql.Decimal(18, 2), value)
    .input('maxDiscount', sql.Decimal(18, 2), maxDiscount)
    .input('usageLimit', sql.Int, usageLimit)
    .query(`
      INSERT INTO Vouchers (Code, DiscountType, DiscountValue, MinOrderAmount, MaxDiscount, UsageLimit)
      OUTPUT INSERTED.VoucherID
      VALUES (@code, @type, @value, 0, @maxDiscount, @usageLimit)
    `);
  return { code, voucherId: result.recordset[0].VoucherID };
};

const readStock = async (productId) => {
  const result = await new sql.Request(getPool())
    .input('productId', sql.Int, productId)
    .query('SELECT Stock FROM Products WHERE ProductID = @productId');
  return result.recordset[0].Stock;
};

const readOrder = async (orderId) => {
  const result = await new sql.Request(getPool())
    .input('orderId', sql.Int, orderId)
    .query('SELECT Status, PaymentStatus, Total, Discount, ShippingFee FROM Orders WHERE OrderID = @orderId');
  return result.recordset[0];
};

const readVoucherUsage = async (voucherId) => {
  const result = await new sql.Request(getPool())
    .input('voucherId', sql.Int, voucherId)
    .query(`
      SELECT v.UsedCount,
             (SELECT COUNT(*) FROM VoucherUsages vu WHERE vu.VoucherID = v.VoucherID) AS Usages
      FROM Vouchers v
      WHERE v.VoucherID = @voucherId
    `);
  return result.recordset[0];
};

const setTxnRef = async (orderId, txnRef) => {
  await orderService.updateOrderPayment(orderId, 'pending', txnRef);
};

test.before(async () => {
  await connectSQL();
  const pool = getPool();

  const user = await new sql.Request(pool)
    .input('email', sql.NVarChar, `${tag}@btstore.test`)
    .query(`
      INSERT INTO Users (FullName, Email, Password, Role)
      OUTPUT INSERTED.UserID
      VALUES (N'Integration Test', @email, N'not-a-real-hash', N'customer')
    `);
  ctx.userId = user.recordset[0].UserID;

  const category = await new sql.Request(pool).query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  assert.ok(category.recordset[0], 'Cần có ít nhất 1 danh mục (chạy run-seed.js trước)');
  ctx.categoryId = category.recordset[0].CategoryID;
});

test.after(async () => {
  const pool = getPool();
  await new sql.Request(pool)
    .input('userId', sql.Int, ctx.userId)
    .input('slugLike', sql.NVarChar, `${tag}-product-%`)
    .input('codeLike', sql.NVarChar, `${tag.toUpperCase()}V%`)
    .query(`
      DELETE FROM CartItems WHERE UserID = @userId;
      DELETE ci FROM CartItems ci JOIN Products p ON p.ProductID = ci.ProductID WHERE p.Slug LIKE @slugLike;
      DELETE vu FROM VoucherUsages vu JOIN Orders o ON o.OrderID = vu.OrderID WHERE o.UserID = @userId;
      DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID = @userId;
      DELETE FROM Orders WHERE UserID = @userId;
      DELETE ph FROM PriceHistory ph JOIN Products p ON p.ProductID = ph.ProductID WHERE p.Slug LIKE @slugLike;
      DELETE FROM Products WHERE Slug LIKE @slugLike;
      DELETE FROM Vouchers WHERE Code LIKE @codeLike;
      DELETE FROM Users WHERE UserID = @userId;
    `);
  await pool.close();
});

test('hai đơn tranh món cuối cùng: chỉ một đơn thành công, kho không âm', async () => {
  const productId = await createProduct({ stock: 1, price: 500000 });
  const order = () => orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS, items: [{ productId, quantity: 1 }] });

  const results = await Promise.allSettled([order(), order()]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409);
  assert.equal(await readStock(productId), 0);
});

test('server tự tính tiền, bỏ qua discount do client gửi', async () => {
  const productId = await createProduct({ stock: 5, price: 1000000 });
  const result = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId, quantity: 1 }],
    discount: 999999,
    shippingFee: 0,
  });
  const saved = await readOrder(result.orderId);
  assert.equal(Number(saved.Discount), 0);
  assert.equal(Number(saved.ShippingFee), 30000);
  assert.equal(Number(saved.Total), 1030000);
});

test('voucher còn 1 lượt, hai đơn dùng cùng lúc: chỉ một đơn được giảm', async () => {
  const p1 = await createProduct({ stock: 5, price: 2000000 });
  const p2 = await createProduct({ stock: 5, price: 2000000 });
  const { code, voucherId } = await createVoucher({ usageLimit: 1 });

  const results = await Promise.allSettled([
    orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS, items: [{ productId: p1, quantity: 1 }], voucherCode: code }),
    orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS, items: [{ productId: p2, quantity: 1 }], voucherCode: code }),
  ]);

  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.data.code, 'voucher_used_up');
  assert.deepEqual(await readVoucherUsage(voucherId), { UsedCount: 1, Usages: 1 });
});

test('huỷ đơn hoàn kho và trả lượt voucher', async () => {
  const productId = await createProduct({ stock: 3, price: 4000000 });
  const { code, voucherId } = await createVoucher({ usageLimit: 5 });

  const created = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId, quantity: 2 }],
    voucherCode: code,
  });
  assert.equal(await readStock(productId), 1);

  await orderService.cancelOrder(created.orderId, ctx.userId, 'test');
  assert.equal(await readStock(productId), 3);
  assert.deepEqual(await readVoucherUsage(voucherId), { UsedCount: 0, Usages: 0 });
  assert.equal((await readOrder(created.orderId)).Status, 'cancelled');
});

test('VNPay: sai số tiền → 04; đúng → 00; gọi lại → 02', async () => {
  const productId = await createProduct({ stock: 2, price: 750000 });
  const created = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId, quantity: 1 }],
    paymentMethod: 'vnpay',
  });
  const txnRef = `${created.orderId}_${Date.now()}`;
  await setTxnRef(created.orderId, txnRef);
  const amount = String(Math.round(created.total * 100));

  const wrong = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount: '100' });
  assert.equal(wrong.code, '04');
  assert.equal((await readOrder(created.orderId)).Status, 'pending_payment');

  const ok = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount });
  assert.equal(ok.code, '00');
  const paid = await readOrder(created.orderId);
  assert.equal(paid.PaymentStatus, 'paid');
  assert.equal(paid.Status, 'confirmed');

  const again = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount });
  assert.equal(again.code, '02');
});

test('VNPay thất bại thì huỷ đơn và hoàn kho', async () => {
  const productId = await createProduct({ stock: 2, price: 750000 });
  const created = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId, quantity: 2 }],
    paymentMethod: 'vnpay',
  });
  const txnRef = `${created.orderId}_${Date.now()}`;
  await setTxnRef(created.orderId, txnRef);

  const result = await orderService.applyVNPayResult({
    txnRef,
    responseCode: '24',
    transactionStatus: '02',
    amount: String(Math.round(created.total * 100)),
  });
  assert.equal(result.code, '00');
  const saved = await readOrder(created.orderId);
  assert.equal(saved.Status, 'cancelled');
  assert.equal(saved.PaymentStatus, 'failed');
  assert.equal(await readStock(productId), 2);
});

test('đơn VNPay quá hạn tự huỷ; tiền về muộn thì đánh dấu cần hoàn', async () => {
  const productId = await createProduct({ stock: 1, price: 600000 });
  const created = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId, quantity: 1 }],
    paymentMethod: 'vnpay',
  });
  const txnRef = `${created.orderId}_${Date.now()}`;
  await setTxnRef(created.orderId, txnRef);

  const fresh = await orderService.getPaymentWindow(created.orderId, ctx.userId, 30);
  assert.ok(fresh.SecondsLeft > 0);

  await new sql.Request(getPool())
    .input('orderId', sql.Int, created.orderId)
    .query('UPDATE Orders SET CreatedAt = DATEADD(MINUTE, -90, SYSDATETIME()) WHERE OrderID = @orderId');

  const expired = await orderService.expireStalePayments(30);
  assert.ok(expired >= 1);
  const saved = await readOrder(created.orderId);
  assert.equal(saved.Status, 'cancelled');
  assert.equal(saved.PaymentStatus, 'expired');
  assert.equal(await readStock(productId), 1);

  const late = await orderService.applyVNPayResult({
    txnRef,
    responseCode: '00',
    transactionStatus: '00',
    amount: String(Math.round(created.total * 100)),
  });
  assert.equal(late.code, '00');
  assert.equal((await readOrder(created.orderId)).PaymentStatus, 'refund_required');
});

test('báo giá giỏ hàng khớp số tiền lúc tạo đơn', async () => {
  const productId = await createProduct({ stock: 5, price: 6000000 });
  const { code } = await createVoucher({ usageLimit: 5, type: 'amount', value: 100000 });
  const items = [{ productId, quantity: 2 }];

  const quote = await orderService.quoteCart(items, code);
  const created = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS, items, voucherCode: code });

  assert.equal(quote.voucherError, null);
  assert.equal(created.total, quote.total);
  assert.equal(created.discount, quote.discount);
});

test('giỏ server: lưu, đọc lại, và đặt hàng xong thì bỏ sản phẩm đã mua', async () => {
  const p1 = await createProduct({ stock: 5, price: 1500000 });
  const p2 = await createProduct({ stock: 5, price: 2500000 });

  const saved = await cartService.replaceCart(ctx.userId, [
    { productId: p1, quantity: 2 },
    { productId: p2, quantity: 1 },
    { productId: p1, quantity: 1 },
  ]);
  assert.deepEqual(saved.items.map((i) => [i.productId, i.quantity]).sort((a, b) => a[0] - b[0]), [[p1, 3], [p2, 1]]);

  await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId: p1, quantity: 3 }],
  });

  const after = await cartService.getCart(ctx.userId);
  assert.deepEqual(after.items.map((i) => i.productId), [p2]);
});

test('địa chỉ giao hàng được lưu dạng JSON đã chuẩn hoá', async () => {
  const productId = await createProduct({ stock: 2, price: 500000 });
  const created = await orderService.createOrder(ctx.userId, {
    shippingAddress: { ...ADDRESS, phone: '+84 901 234 567', province: 'thành phố hồ chí minh' },
    items: [{ productId, quantity: 1 }],
  });
  const order = await orderService.getOrderById(created.orderId, ctx.userId);
  assert.equal(order.shippingAddress.phone, '0901234567');
  assert.equal(order.shippingAddress.province, 'TP. Hồ Chí Minh');
  assert.equal(order.orderCode, created.orderCode);
});

test('tìm kiếm không dấu trên toàn catalog', async () => {
  const productId = await createProduct({ stock: 3, price: 7000000, name: `Màn hình Đồ họa ${tag}` });
  await refreshSearchText(getPool(), [productId]);

  const result = await productService.getProducts({ q: `man hinh do hoa ${tag}`, limit: 5 });
  assert.equal(result.pagination.totalItems, 1);
  assert.equal(result.items[0].id, productId);

  const byIds = await productService.getProducts({ ids: String(productId), limit: 5 });
  assert.deepEqual(byIds.items.map((p) => p.id), [productId]);
});
