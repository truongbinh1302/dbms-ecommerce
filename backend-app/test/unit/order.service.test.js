const test = require('node:test');
const assert = require('node:assert/strict');
const { loadOrderServiceWithFakeDb } = require('../helpers/fakeDb');

const ADDRESS = {
  recipientName: 'Nguyễn Văn A',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Diên Hồng',
  street: '268 Lý Thường Kiệt',
};

const setup = () => {
  const { orderService, cartService, db } = loadOrderServiceWithFakeDb();
  db.store.products.push(
    { ProductID: 10, Name: 'Chuột', Price: 1000000, Stock: 5, IsDeleted: false },
    { ProductID: 20, Name: 'Màn hình', Price: 9000000, Stock: 1, IsDeleted: false },
  );
  db.store.vouchers.push({
    VoucherID: 7,
    Code: 'SV10',
    DiscountType: 'percent',
    DiscountValue: 10,
    MinOrderAmount: 0,
    MaxDiscount: 500000,
    UsageLimit: 1,
    UsedCount: 0,
    IsActive: true,
  });
  return { orderService, cartService, db };
};

test('normalizeItems gộp sản phẩm trùng và sắp theo ProductID', () => {
  const { orderService } = setup();
  assert.deepEqual(
    orderService.normalizeItems([
      { productId: 20, quantity: 1 },
      { productId: 10, quantity: 1 },
      { productId: 10, quantity: 2 },
    ]),
    [{ productId: 10, quantity: 3 }, { productId: 20, quantity: 1 }],
  );
  assert.throws(() => orderService.normalizeItems([{ productId: 1, quantity: 0 }]), /valid productId/);
});

test('createOrder bỏ qua discount/shippingFee/total do client gửi lên', async () => {
  const { orderService, db } = setup();
  const result = await orderService.createOrder(1, {
    shippingAddress: ADDRESS,
    items: [{ productId: 10, quantity: 2 }],
    paymentMethod: 'cod',
    discount: 1999999,
    shippingFee: 0,
    total: 1,
  });

  // 2.000.000đ: dưới mốc ưu đãi, dưới mốc free ship → 30.000đ phí ship, không giảm.
  assert.equal(result.subtotal, 2000000);
  assert.equal(result.discount, 0);
  assert.equal(result.shippingFee, 30000);
  assert.equal(result.total, 2030000);

  const order = db.store.orders[0];
  assert.equal(order.Discount, 0);
  assert.equal(order.Total, 2030000);
  assert.equal(db.store.products[0].Stock, 3);
  // Sổ kho ghi một dòng bán hàng gắn với đơn, kèm tồn sau khi trừ.
  assert.deepEqual(
    db.store.stockMovements.map((m) => [m.ProductID, m.Change, m.StockAfter, m.Reason, m.OrderID]),
    [[10, -2, 3, 'sale', result.orderId]],
  );
});

test('createOrder áp voucher, tăng UsedCount và ghi VoucherUsages trong cùng transaction', async () => {
  const { orderService, db } = setup();
  const result = await orderService.createOrder(1, {
    shippingAddress: ADDRESS,
    items: [{ productId: 20, quantity: 1 }],
    paymentMethod: 'cod',
    voucherCode: ' sv10 ',
  });

  assert.equal(result.voucherCode, 'SV10');
  assert.equal(result.voucherDiscount, 500000); // 10% của 9tr = 900k, chặn còn 500k
  assert.equal(result.total, 9000000 - 500000);
  assert.equal(db.store.vouchers[0].UsedCount, 1);
  assert.deepEqual(db.store.voucherUsages, [{ VoucherID: 7, UserID: 1, OrderID: result.orderId }]);
});

test('voucher hết lượt thì rollback: không tạo đơn, không trừ kho', async () => {
  const { orderService, db } = setup();
  db.store.vouchers[0].UsedCount = 1;

  await assert.rejects(
    orderService.createOrder(1, {
    shippingAddress: ADDRESS, items: [{ productId: 10, quantity: 1 }], voucherCode: 'SV10' }),
    (err) => err.status === 400 && err.data.code === 'voucher_used_up',
  );

  assert.equal(db.store.orders.length, 0);
  assert.equal(db.store.products[0].Stock, 5);
  assert.equal(db.store.stockMovements.length, 0, 'rollback cũng bỏ dòng sổ kho');
});

test('hết hàng trả 409 và không ghi gì', async () => {
  const { orderService, db } = setup();
  await assert.rejects(
    orderService.createOrder(1, {
    shippingAddress: ADDRESS, items: [{ productId: 20, quantity: 2 }] }),
    (err) => err.status === 409,
  );
  assert.equal(db.store.orders.length, 0);
});

test('phương thức thanh toán lạ bị từ chối', async () => {
  const { orderService } = setup();
  await assert.rejects(
    orderService.createOrder(1, {
    shippingAddress: ADDRESS, items: [{ productId: 10, quantity: 1 }], paymentMethod: 'free' }),
    (err) => err.status === 400,
  );
});

test('huỷ đơn hoàn kho và trả lại lượt voucher', async () => {
  const { orderService, db } = setup();
  const created = await orderService.createOrder(1, {
    shippingAddress: ADDRESS,
    items: [{ productId: 20, quantity: 1 }],
    voucherCode: 'SV10',
  });

  await orderService.cancelOrder(created.orderId, 1, 'đổi ý');

  assert.equal(db.store.orders[0].Status, 'cancelled');
  assert.equal(db.store.products[1].Stock, 1);
  assert.equal(db.store.vouchers[0].UsedCount, 0);
  assert.equal(db.store.voucherUsages.length, 0);
  assert.deepEqual(
    db.store.stockMovements.map((m) => [m.ProductID, m.Change, m.StockAfter, m.Reason, m.Note]),
    [[20, -1, 0, 'sale', null], [20, 1, 1, 'cancel', 'đổi ý']],
  );
});

test('admin chuyển đơn sang cancelled cũng hoàn kho', async () => {
  const { orderService, db } = setup();
  const created = await orderService.createOrder(1, {
    shippingAddress: ADDRESS, items: [{ productId: 10, quantity: 4 }] });
  await orderService.updateOrderStatus(created.orderId, 'cancelled', 'hết hàng nhà cung cấp');
  assert.equal(db.store.products[0].Stock, 5);
});

test('quoteCart dùng cùng quy tắc và báo lỗi voucher mà không ném lỗi', async () => {
  const { orderService } = setup();
  const quote = await orderService.quoteCart([{ productId: 10, quantity: 1 }], 'KHONGCO');
  assert.equal(quote.subtotal, 1000000);
  assert.equal(quote.shippingFee, 30000);
  assert.equal(quote.voucherError.code, 'voucher_not_found');
  assert.equal(quote.total, 1030000);
});

const createVNPayOrder = async (orderService, db) => {
  const created = await orderService.createOrder(1, {
    shippingAddress: ADDRESS, items: [{ productId: 10, quantity: 2 }], paymentMethod: 'vnpay' });
  const txnRef = `${created.orderId}_1700000000000`;
  db.store.orders.find((o) => o.OrderID === created.orderId).VNPayTxnRef = txnRef;
  return { created, txnRef, amount: String(created.total * 100) };
};

test('VNPay: sai số tiền trả 04 và không đổi đơn', async () => {
  const { orderService, db } = setup();
  const { created, txnRef } = await createVNPayOrder(orderService, db);

  const result = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount: '100' });
  assert.equal(result.code, '04');
  assert.equal(db.store.orders[0].PaymentStatus, 'unpaid');
  assert.equal(db.store.orders[0].Status, 'pending_payment');
  assert.ok(created.orderId);
});

test('VNPay: thành công xác nhận đơn, callback lặp lại trả 02', async () => {
  const { orderService, db } = setup();
  const { txnRef, amount } = await createVNPayOrder(orderService, db);

  const first = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount });
  assert.equal(first.code, '00');
  assert.equal(db.store.orders[0].PaymentStatus, 'paid');
  assert.equal(db.store.orders[0].Status, 'confirmed');

  const again = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount });
  assert.equal(again.code, '02');
});

test('VNPay: thất bại ở lần thanh toán mới nhất thì huỷ đơn và hoàn kho', async () => {
  const { orderService, db } = setup();
  const { txnRef, amount } = await createVNPayOrder(orderService, db);

  const result = await orderService.applyVNPayResult({ txnRef, responseCode: '24', transactionStatus: '02', amount });
  assert.equal(result.code, '00');
  assert.equal(db.store.orders[0].Status, 'cancelled');
  assert.equal(db.store.orders[0].PaymentStatus, 'failed');
  assert.equal(db.store.products[0].Stock, 5);
});

test('VNPay: thất bại từ link cũ thì bỏ qua, đơn vẫn chờ thanh toán', async () => {
  const { orderService, db } = setup();
  const { created, amount } = await createVNPayOrder(orderService, db);

  const oldRef = `${created.orderId}_1600000000000`;
  const result = await orderService.applyVNPayResult({ txnRef: oldRef, responseCode: '24', amount });
  assert.equal(result.code, '00');
  assert.equal(result.ignored, true);
  assert.equal(db.store.orders[0].Status, 'pending_payment');
});

test('VNPay: mã giao dịch không đúng định dạng hoặc không có đơn trả 01', async () => {
  const { orderService } = setup();
  assert.equal((await orderService.applyVNPayResult({ txnRef: 'abc', responseCode: '00', amount: '1' })).code, '01');
  assert.equal((await orderService.applyVNPayResult({ txnRef: '999_1', responseCode: '00', amount: '1' })).code, '01');
});

test('đơn quá hạn bị huỷ, tiền về sau đó được đánh dấu refund_required', async () => {
  const { orderService, db } = setup();
  const { txnRef, amount } = await createVNPayOrder(orderService, db);
  db.store.orders[0].ageMinutes = 45;

  const expired = await orderService.expireStalePayments(30);
  assert.equal(expired, 1);
  assert.equal(db.store.orders[0].Status, 'cancelled');
  assert.equal(db.store.orders[0].PaymentStatus, 'expired');
  assert.equal(db.store.products[0].Stock, 5);

  const late = await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount });
  assert.equal(late.code, '00');
  assert.equal(db.store.orders[0].PaymentStatus, 'refund_required');
  assert.equal(db.store.orders[0].Status, 'cancelled');
});

test('khách huỷ đơn đã thanh toán thì chuyển sang refund_required', async () => {
  const { orderService, db } = setup();
  const { created, txnRef, amount } = await createVNPayOrder(orderService, db);
  await orderService.applyVNPayResult({ txnRef, responseCode: '00', transactionStatus: '00', amount });

  const result = await orderService.cancelOrder(created.orderId, 1, 'đặt nhầm');
  assert.equal(result.paymentStatus, 'refund_required');
});

test('đơn hàng thiếu hoặc sai địa chỉ bị từ chối kèm lỗi từng trường', async () => {
  const { orderService, db } = setup();
  await assert.rejects(
    orderService.createOrder(1, {
      items: [{ productId: 10, quantity: 1 }],
      shippingAddress: { ...ADDRESS, phone: '12345', province: 'Sao Hỏa' },
    }),
    (err) => err.status === 400 && Boolean(err.data.fields.phone) && Boolean(err.data.fields.province),
  );
  await assert.rejects(
    orderService.createOrder(1, { items: [{ productId: 10, quantity: 1 }] }),
    (err) => err.status === 400 && err.data.code === 'invalid_address',
  );
  assert.equal(db.store.orders.length, 0);
});

test('địa chỉ được chuẩn hoá trước khi lưu vào đơn', async () => {
  const { orderService, db } = setup();
  await orderService.createOrder(1, {
    items: [{ productId: 10, quantity: 1 }],
    shippingAddress: { ...ADDRESS, phone: '+84 90 123 4567', province: 'thành phố hồ chí minh' },
  });
  const saved = JSON.parse(db.store.orders[0].ShippingAddress);
  assert.deepEqual(saved, {
    recipientName: 'Nguyễn Văn A',
    phone: '0901234567',
    province: 'TP. Hồ Chí Minh',
    ward: 'Phường Diên Hồng',
    street: '268 Lý Thường Kiệt',
  });
});

test('đặt hàng xong thì sản phẩm đã mua bị bỏ khỏi giỏ server, sản phẩm khác giữ nguyên', async () => {
  const { orderService, cartService, db } = setup();
  await cartService.replaceCart(1, [{ productId: 10, quantity: 2 }, { productId: 20, quantity: 1 }]);
  assert.equal(db.store.cartItems.length, 2);

  await orderService.createOrder(1, { shippingAddress: ADDRESS, items: [{ productId: 10, quantity: 2 }] });

  assert.deepEqual(db.store.cartItems.map((c) => c.ProductID), [20]);
});

test('đặt hàng lỗi thì giỏ server không bị xoá (rollback)', async () => {
  const { orderService, cartService, db } = setup();
  await cartService.replaceCart(1, [{ productId: 20, quantity: 1 }]);
  await assert.rejects(orderService.createOrder(1, { shippingAddress: ADDRESS, items: [{ productId: 20, quantity: 5 }] }));
  assert.equal(db.store.cartItems.length, 1);
});

// --- Giá giữ theo báo giá Build PC ---

const addQuote = (db, { code = 'BQABCDEFGH', expired = false, items }) => {
  db.store.buildQuotes.push({
    QuoteID: db.store.buildQuotes.length + 1,
    Code: code,
    ItemsJson: JSON.stringify({ items, owned: [] }),
    Subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    ExpiresAt: new Date(),
    expired,
  });
};

test('createOrder theo báo giá còn hạn: dùng giá đã giữ khi giá hiện tại cao hơn', async () => {
  const { orderService, db } = setup();
  // Báo giá chuột 800k (giá hiện tại 1tr), màn hình 9.5tr (giá hiện tại 9tr → giữ giá thấp hơn là 9tr).
  addQuote(db, { items: [{ productId: 10, quantity: 1, unitPrice: 800000 }, { productId: 20, quantity: 1, unitPrice: 9500000 }] });

  const result = await orderService.createOrder(1, {
    shippingAddress: ADDRESS,
    items: [{ productId: 10, quantity: 1 }, { productId: 20, quantity: 1 }],
    quoteCode: 'bqabcdefgh',
  });

  assert.equal(result.quoteCode, 'BQABCDEFGH');
  assert.equal(result.subtotal, 800000 + 9000000);
  assert.deepEqual(db.store.orderItems.map((item) => [item.ProductID, item.UnitPrice]), [[10, 800000], [20, 9000000]]);
  assert.equal(db.store.orders[0].QuoteCode, 'BQABCDEFGH');
});

test('createOrder theo báo giá: mua nhiều hơn số lượng báo giá thì tính giá hiện tại', async () => {
  const { orderService, db } = setup();
  addQuote(db, { items: [{ productId: 10, quantity: 1, unitPrice: 800000 }] });

  const result = await orderService.createOrder(1, {
    shippingAddress: ADDRESS,
    items: [{ productId: 10, quantity: 2 }],
    quoteCode: 'BQABCDEFGH',
  });
  assert.equal(result.subtotal, 2000000);
});

test('createOrder theo báo giá hết hạn: báo lỗi 410, không tạo đơn, không trừ kho', async () => {
  const { orderService, db } = setup();
  addQuote(db, { expired: true, items: [{ productId: 10, quantity: 1, unitPrice: 800000 }] });

  await assert.rejects(
    orderService.createOrder(1, { shippingAddress: ADDRESS, items: [{ productId: 10, quantity: 1 }], quoteCode: 'BQABCDEFGH' }),
    (err) => Boolean(err.status === 410 && err.data.code === 'quote_expired'),
  );
  assert.equal(db.store.orders.length, 0);
  assert.equal(db.store.products[0].Stock, 5);
});

test('quoteCart với mã báo giá sai: vẫn báo giá theo giá hiện tại, kèm priceLockError', async () => {
  const { orderService, db } = setup();
  addQuote(db, { items: [{ productId: 10, quantity: 1, unitPrice: 800000 }] });

  const ok = await orderService.quoteCart([{ productId: 10, quantity: 1 }], null, 'BQABCDEFGH');
  assert.equal(ok.subtotal, 800000);
  assert.equal(ok.items[0].priceLocked, true);
  assert.equal(ok.items[0].listPrice, 1000000);
  assert.equal(ok.priceLock.code, 'BQABCDEFGH');

  const missing = await orderService.quoteCart([{ productId: 10, quantity: 1 }], null, 'BQZZZZZZZZ');
  assert.equal(missing.subtotal, 1000000);
  assert.equal(missing.priceLock, null);
  assert.equal(missing.priceLockError.code, 'quote_not_found');
});

test('quoteCart: giỏ không có sản phẩm nào của báo giá thì không hiện giữ giá', async () => {
  const { orderService, db } = setup();
  addQuote(db, { items: [{ productId: 10, quantity: 1, unitPrice: 800000 }] });
  const result = await orderService.quoteCart([{ productId: 20, quantity: 1 }], null, 'BQABCDEFGH');
  assert.equal(result.priceLock, null);
  assert.equal(result.priceLockError, null);
  assert.equal(result.subtotal, 9000000);
});
