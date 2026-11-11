/*
  Test tích hợp: mã vận đơn và đổi trả (hạn đổi trả, số lượng, sổ kho, số tiền hoàn) trên SQL Server thật.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const config = require('../../src/config/env');
const orderService = require('../../src/services/order.service');
const returnService = require('../../src/services/return.service');
const inventoryService = require('../../src/services/inventory.service');
const accountService = require('../../src/services/account.service');
const reportService = require('../../src/services/report.service');
const { hashPassword } = require('../../src/utils/hash');

const ADDRESS = {
  recipientName: 'Đổi Trả Test',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Bến Thành',
  street: '12 Lê Lợi',
};
const PASSWORD = 'Return-test-123';

const tag = `rt${Date.now()}`;
const ctx = { adminId: null, userIds: [], productIds: [], receiptIds: [], customer: null, stranger: null, order: null, gpu: null, fan: null };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const stockOf = async (productId) => (await query('SELECT Stock FROM Products WHERE ProductID = @id', { id: [sql.Int, productId] }))[0].Stock;
const ledger = async (productId) => query(
  'SELECT Change, StockAfter, Reason, OrderID, Note FROM StockMovements WHERE ProductID = @id ORDER BY MovementID',
  { id: [sql.Int, productId] },
);
const ledgerSum = async (productId) => (await query(
  'SELECT ISNULL(SUM(Change), 0) AS Total FROM StockMovements WHERE ProductID = @id',
  { id: [sql.Int, productId] },
))[0].Total;
const lastNotification = async (userId) => (await query(
  'SELECT TOP 1 Title, Body, Link FROM Notifications WHERE UserID = @id ORDER BY NotificationID DESC',
  { id: [sql.Int, userId] },
))[0];

const newUser = async (suffix) => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Đổi Trả Test', @email, @password, N'customer')
  `, { email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`], password: [sql.NVarChar, await hashPassword(PASSWORD)] });
  ctx.userIds.push(user.UserID);
  return user.UserID;
};

const newProduct = async (suffix, price, stock) => {
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (@name, @slug, @price, @stock, @categoryId)
  `, {
    name: [sql.NVarChar, `Return ${tag} ${suffix}`],
    slug: [sql.NVarChar, `${tag}-${suffix}`],
    price: [sql.Decimal(18, 2), price],
    stock: [sql.Int, stock],
    categoryId: [sql.Int, category.CategoryID],
  });
  await query(`
    INSERT INTO StockMovements (ProductID, Change, StockAfter, Reason, Note) VALUES (@id, @stock, @stock, N'opening', N'Tồn đầu test')
  `, { id: [sql.Int, product.ProductID], stock: [sql.Int, stock] });
  ctx.productIds.push(product.ProductID);
  return product.ProductID;
};

const deliveredOrder = async (userId, items) => {
  const order = await orderService.createOrder(userId, { shippingAddress: ADDRESS, items, acceptTerms: true });
  await orderService.updateOrderStatus(order.orderId, 'confirmed');
  await orderService.updateOrderStatus(order.orderId, 'shipped', null, { carrier: 'GHTK', trackingCode: `S${order.orderId}X` });
  await orderService.updateOrderStatus(order.orderId, 'delivered');
  return order;
};

const refundPayload = (items, overrides = {}) => ({
  kind: 'refund',
  reason: 'defective',
  description: 'Card không lên hình sau hai ngày dùng',
  items,
  ...overrides,
});

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  ctx.adminId = admin.UserID;
  ctx.customer = await newUser('customer');
  ctx.stranger = await newUser('stranger');
  ctx.gpu = await newProduct('gpu', 1000000, 10);
  ctx.fan = await newProduct('fan', 500000, 1);
});

test.after(async () => {
  const users = ctx.userIds.join(',') || '0';
  const products = ctx.productIds.join(',') || '0';
  const receipts = ctx.receiptIds.join(',') || '0';
  await query(`
    DELETE ri FROM ReturnRequestItems ri JOIN ReturnRequests r ON r.ReturnID = ri.ReturnID WHERE r.UserID IN (${users});
    DELETE FROM ReturnRequests WHERE UserID IN (${users});
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${users});
    DELETE FROM Orders WHERE UserID IN (${users});
    DELETE FROM CartItems WHERE UserID IN (${users});
    DELETE FROM Notifications WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM StockMovements WHERE ProductID IN (${products});
    DELETE FROM StockReceiptItems WHERE ReceiptID IN (${receipts});
    DELETE FROM StockReceipts WHERE ReceiptID IN (${receipts});
    DELETE FROM PriceHistory WHERE ProductID IN (${products});
    DELETE FROM Products WHERE ProductID IN (${products});
  `);
  await mongoose.disconnect();
  await getPool().close();
});

test('giao vận: lưu đơn vị vận chuyển, mã vận đơn, báo cho khách; đổi trả chỉ mở sau khi giao', async () => {
  const order = await orderService.createOrder(ctx.customer, {
    shippingAddress: ADDRESS,
    items: [{ productId: ctx.gpu, quantity: 2 }, { productId: ctx.fan, quantity: 1 }],
    acceptTerms: true,
  });
  ctx.order = order;
  await assert.rejects(
    returnService.createReturn(ctx.customer, order.orderId, refundPayload([{ productId: ctx.gpu, quantity: 1 }])),
    (err) => err.status === 422 && err.data.code === 'not_delivered',
  );

  await orderService.updateOrderStatus(order.orderId, 'confirmed');
  await assert.rejects(
    orderService.updateOrderStatus(order.orderId, 'shipped', null, { carrier: 'GHN', trackingCode: 'có dấu cách' }),
    (err) => err.status === 400,
  );
  const shipped = await orderService.updateOrderStatus(order.orderId, 'shipped', 'Giao GHN', { carrier: ' GHN ', trackingCode: 'GHN123456' });
  assert.deepEqual([shipped.status, shipped.shippingCarrier, shipped.trackingCode], ['shipped', 'GHN', 'GHN123456']);
  assert.match((await lastNotification(ctx.customer)).Body, /GHN.*GHN123456/);

  // Sửa mã vận đơn khi đã giao cho vận chuyển: khách được báo lại.
  await orderService.updateOrderStatus(order.orderId, 'shipped', null, { carrier: 'GHN', trackingCode: 'GHN654321' });
  assert.match((await lastNotification(ctx.customer)).Body, /GHN654321/);

  await orderService.updateOrderStatus(order.orderId, 'delivered');
  const detail = await orderService.getOrderById(order.orderId, ctx.customer);
  assert.equal(detail.trackingCode, 'GHN654321');
  assert.ok(detail.shippedAt && detail.deliveredAt);
  assert.equal(detail.returnWindow.open, true);
  assert.equal(detail.returnWindow.days, config.store.returnDays);
  const days = (new Date(detail.returnWindow.deadline) - new Date(detail.deliveredAt)) / 86400000;
  assert.equal(Math.round(days), config.store.returnDays);
  assert.deepEqual(detail.returnWindow.items.map((item) => item.remaining).sort(), [1, 2]);
});

test('trả hàng hoàn tiền: không vượt số đã mua, nhận hàng nhập lại kho, hoàn không quá số khách đã trả', async () => {
  const orderId = ctx.order.orderId;
  await assert.rejects(
    returnService.createReturn(ctx.customer, orderId, refundPayload([{ productId: ctx.gpu, quantity: 3 }])),
    (err) => err.status === 409 && err.data.code === 'return_quantity_exceeded' && err.data.available === 2,
  );
  await assert.rejects(
    returnService.createReturn(ctx.stranger, orderId, refundPayload([{ productId: ctx.gpu, quantity: 1 }])),
    (err) => err.status === 404,
  );
  await assert.rejects(
    returnService.createReturn(ctx.customer, orderId, refundPayload([{ productId: ctx.gpu + 999999, quantity: 1 }])),
    (err) => err.status === 400,
  );

  // Khách tự huỷ yêu cầu đang chờ: số lượng được trả lại để gửi yêu cầu khác.
  const first = await returnService.createReturn(ctx.customer, orderId, refundPayload([{ productId: ctx.gpu, quantity: 1 }]));
  assert.match(first.code, /^TH\d{6}$/);
  assert.equal(first.status, 'pending');
  assert.deepEqual(first.items.map((item) => [item.productId, item.quantity, item.unitPrice]), [[ctx.gpu, 1, 1000000]]);
  await assert.rejects(returnService.cancelMyReturn(ctx.stranger, first.id), (err) => err.status === 404);
  assert.equal((await returnService.cancelMyReturn(ctx.customer, first.id)).status, 'cancelled');
  await assert.rejects(returnService.cancelMyReturn(ctx.customer, first.id), (err) => err.status === 422);

  const request = await returnService.createReturn(ctx.customer, orderId, refundPayload([{ productId: ctx.gpu, quantity: 2 }]));
  await assert.rejects(returnService.updateReturn(ctx.adminId, request.id, { status: 'completed' }), (err) => err.status === 422);
  await assert.rejects(orderService.updateOrderStatus(orderId, 'shipped'), (err) => err.status === 422 && err.data.code === 'has_returns');

  const approved = await returnService.updateReturn(ctx.adminId, request.id, { status: 'approved' });
  assert.equal(approved.status, 'approved');
  assert.match((await lastNotification(ctx.customer)).Title, new RegExp(`${request.code}.*duyệt`));
  await assert.rejects(returnService.cancelMyReturn(ctx.customer, request.id), (err) => err.status === 422);

  const stockBefore = await stockOf(ctx.gpu);
  const received = await returnService.updateReturn(ctx.adminId, request.id, { status: 'received', restock: true });
  assert.equal(received.restocked, true);
  assert.equal(await stockOf(ctx.gpu), stockBefore + 2);
  const back = (await ledger(ctx.gpu)).at(-1);
  assert.deepEqual([back.Reason, back.Change, back.OrderID], ['return', 2, orderId]);
  assert.match(back.Note, new RegExp(request.code));

  const [order] = await query('SELECT Total FROM Orders WHERE OrderID = @id', { id: [sql.Int, orderId] });
  await assert.rejects(
    returnService.updateReturn(ctx.adminId, request.id, { status: 'completed', refundAmount: Number(order.Total) + 1 }),
    (err) => err.status === 400 && err.data.code === 'refund_too_large',
  );
  const completed = await returnService.updateReturn(ctx.adminId, request.id, { status: 'completed' });
  assert.equal(completed.refundAmount, Math.min(2000000, Number(order.Total)));
  assert.ok(completed.resolvedAt);
  assert.match((await lastNotification(ctx.customer)).Body, /Đã hoàn/);

  // Báo cáo ngày: tiền hoàn tính vào ngày hoàn tất.
  const today = reportService.vietnamToday();
  const report = await reportService.getDailyReport({ from: today, to: today });
  assert.ok(report.days[0].refunds >= completed.refundAmount);
  assert.ok(report.days[0].returnRequests >= 2);
  assert.equal(report.totals.refunds, report.days[0].refunds);

  // Đã yêu cầu hết số card mua: không gửi thêm được.
  await assert.rejects(
    returnService.createReturn(ctx.customer, orderId, refundPayload([{ productId: ctx.gpu, quantity: 1 }])),
    (err) => err.status === 409 && err.data.available === 0,
  );
  assert.equal(await ledgerSum(ctx.gpu), await stockOf(ctx.gpu), 'sổ kho khớp tồn');
});

test('đổi hàng: xuất hàng mới từ kho; hết hàng thì báo, nhập thêm rồi mới hoàn tất được', async () => {
  const orderId = ctx.order.orderId;
  assert.equal(await stockOf(ctx.fan), 0);
  const request = await returnService.createReturn(ctx.customer, orderId, {
    kind: 'exchange', reason: 'wrong_item', description: 'Giao quạt 120mm, đơn đặt 140mm', items: [{ productId: ctx.fan, quantity: 1 }],
  });
  await returnService.updateReturn(ctx.adminId, request.id, { status: 'approved' });
  // Hàng giao sai còn mới nhưng admin chưa nhập lại kho: tồn không đổi.
  const received = await returnService.updateReturn(ctx.adminId, request.id, { status: 'received' });
  assert.equal(received.restocked, false);
  assert.equal(await stockOf(ctx.fan), 0);
  await assert.rejects(
    returnService.updateReturn(ctx.adminId, request.id, { status: 'completed' }),
    (err) => err.status === 409 && err.data.code === 'out_of_stock',
  );

  const receipt = await inventoryService.createReceipt({ supplier: 'NCC test đổi trả', items: [{ productId: ctx.fan, quantity: 3, unitCost: 300000 }] }, ctx.adminId);
  ctx.receiptIds.push(receipt.id);
  const completed = await returnService.updateReturn(ctx.adminId, request.id, { status: 'completed' });
  assert.equal(completed.refundAmount, null);
  assert.equal(await stockOf(ctx.fan), 2);
  const out = (await ledger(ctx.fan)).at(-1);
  assert.deepEqual([out.Reason, out.Change, out.StockAfter], ['exchange', -1, 2]);
  assert.equal(await ledgerSum(ctx.fan), await stockOf(ctx.fan), 'sổ kho khớp tồn');

  const detail = await orderService.getOrderById(orderId, ctx.customer);
  assert.deepEqual(detail.returns.map((item) => item.status), ['completed', 'completed', 'cancelled']);
  assert.equal(detail.returnWindow.open, false, 'đã yêu cầu hết mọi sản phẩm');
});

test('năm yêu cầu gửi cùng lúc cho một sản phẩm mua 1 cái: chỉ một yêu cầu được nhận', async () => {
  const order = await deliveredOrder(ctx.customer, [{ productId: ctx.gpu, quantity: 1 }]);
  ctx.secondOrder = order;
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => returnService.createReturn(ctx.customer, order.orderId, refundPayload([{ productId: ctx.gpu, quantity: 1 }]))),
  );
  const ok = results.filter((result) => result.status === 'fulfilled');
  assert.equal(ok.length, 1);
  for (const result of results.filter((item) => item.status === 'rejected')) {
    assert.equal(result.reason.status, 409, result.reason.message);
  }
  const [count] = await query(
    "SELECT COUNT(*) AS Total FROM ReturnRequests WHERE OrderID = @id AND Status <> N'cancelled'",
    { id: [sql.Int, order.orderId] },
  );
  assert.equal(count.Total, 1);

  const list = await returnService.listReturns({ status: 'pending' });
  assert.ok(list.items.some((item) => item.id === ok[0].value.id && item.orderId === order.orderId));
  await assert.rejects(returnService.listReturns({ status: 'lost' }), (err) => err.status === 400);
});

test('quá hạn đổi trả thì từ chối và gợi ý bảo hành', async () => {
  const order = await deliveredOrder(ctx.customer, [{ productId: ctx.gpu, quantity: 1 }]);
  await query('UPDATE Orders SET DeliveredAt = DATEADD(day, -(@days + 1), SYSDATETIME()) WHERE OrderID = @id', {
    days: [sql.Int, config.store.returnDays], id: [sql.Int, order.orderId],
  });
  await assert.rejects(
    returnService.createReturn(ctx.customer, order.orderId, refundPayload([{ productId: ctx.gpu, quantity: 1 }])),
    (err) => err.status === 422 && err.data.code === 'return_window_closed' && /bảo hành/.test(err.message),
  );
  assert.equal((await orderService.getOrderById(order.orderId, ctx.customer)).returnWindow.open, false);
});

test('xoá tài khoản chờ yêu cầu đổi trả đang xử lý; dữ liệu tải về có yêu cầu đổi trả', async () => {
  const exported = await accountService.exportMyData(ctx.customer);
  const pending = exported.returnRequests.find((item) => item.Status === 'pending');
  assert.ok(pending);
  assert.equal(pending.items[0].ProductID, ctx.gpu);
  await assert.rejects(
    accountService.deleteAccount(ctx.customer, PASSWORD),
    (err) => err.status === 409 && err.data.code === 'open_returns' && err.data.openReturns === 1,
  );
});

test('đơn đã thanh toán rồi bị huỷ: admin lọc đơn chờ hoàn tiền, ghi nhận hoàn, khách được báo', async () => {
  const [order] = await query(`
    INSERT INTO Orders (UserID, PaymentMethod, PaymentStatus, Status, Subtotal, Discount, ShippingFee, Total, CancelReason)
    OUTPUT INSERTED.OrderID
    VALUES (@userId, N'vnpay', N'refund_required', N'cancelled', 1500000, 0, 0, 1500000, N'Khách huỷ sau khi đã thanh toán')
  `, { userId: [sql.Int, ctx.customer] });

  const waiting = await orderService.getAdminOrders('', 1, 50, '', 'refund_required');
  assert.ok(waiting.items.some((item) => item.id === order.OrderID));
  assert.ok(waiting.refundRequired >= 1);
  await assert.rejects(orderService.getAdminOrders('', 1, 20, '', 'lost'), (err) => err.status === 400);

  await assert.rejects(orderService.recordRefund(order.OrderID, { reference: ' ' }), (err) => err.status === 400);
  await assert.rejects(orderService.recordRefund(order.OrderID, { reference: 'VNP123', amount: 1500001 }), (err) => err.status === 400);
  const refunded = await orderService.recordRefund(order.OrderID, { reference: 'VNP-REFUND-123' });
  assert.deepEqual([refunded.paymentStatus, refunded.refundAmount, refunded.refundReference], ['refunded', 1500000, 'VNP-REFUND-123']);
  await assert.rejects(orderService.recordRefund(order.OrderID, { reference: 'VNP-REFUND-123' }), (err) => err.status === 422);
  assert.match((await lastNotification(ctx.customer)).Body, /1\.500\.000đ.*VNP-REFUND-123/);

  const detail = await orderService.getOrderById(order.OrderID, ctx.customer);
  assert.deepEqual([detail.PaymentStatus, Number(detail.refundAmount)], ['refunded', 1500000]);
  assert.ok(!(await orderService.getAdminOrders('', 1, 50, '', 'refund_required')).items.some((item) => item.id === order.OrderID));

  const today = reportService.vietnamToday();
  const report = await reportService.getDailyReport({ from: today, to: today });
  assert.ok(report.days[0].refunds >= 1500000, 'tiền hoàn đơn huỷ có trong báo cáo ngày');
});
