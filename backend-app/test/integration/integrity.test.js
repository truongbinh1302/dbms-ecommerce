/*
  Test tích hợp: kiểm tra toàn vẹn dữ liệu bắt đúng các dòng bị sửa thẳng trong DB.
  Các file test chạy song song nên mỗi kiểm tra được đối chiếu theo đúng ID do test này tạo.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const integrityService = require('../../src/services/integrity.service');
const orderService = require('../../src/services/order.service');

const tag = `ig${Date.now()}`;
const ctx = { userId: null, productId: null, voucherId: null };
const ADDRESS = { recipientName: 'Integrity Test', phone: '0901234567', province: 'TP. Hồ Chí Minh', ward: 'Phường Bến Thành', street: '1 Lê Lợi' };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

/** Dòng sai của một kiểm tra, chỉ lấy dòng có id cho trước. */
const flagged = async (key, id) => {
  const check = integrityService.CHECKS.find((item) => item.key === key);
  return query(`SELECT * FROM (${check.sql}) x WHERE id = @id`, { id: [sql.Int, id] });
};

test.before(async () => {
  await connectSQL();
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Integrity Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}@btstore.test`] });
  ctx.userId = user.UserID;
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (N'Integrity product', @slug, 1000000, 7, @categoryId)
  `, { slug: [sql.NVarChar, `${tag}-product`], categoryId: [sql.Int, category.CategoryID] });
  ctx.productId = product.ProductID;
});

test.after(async () => {
  await query(`
    DELETE FROM Notifications WHERE UserID = @userId;
    DELETE vu FROM VoucherUsages vu JOIN Orders o ON o.OrderID = vu.OrderID WHERE o.UserID = @userId;
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID = @userId;
    DELETE FROM Orders WHERE UserID = @userId;
    DELETE FROM CartItems WHERE UserID = @userId;
    DELETE FROM StockMovements WHERE ProductID = @productId;
    DELETE FROM PriceHistory WHERE ProductID = @productId;
    DELETE FROM Products WHERE ProductID = @productId;
    DELETE FROM Vouchers WHERE Code LIKE @code;
    DELETE FROM Users WHERE UserID = @userId;
  `, { userId: [sql.Int, ctx.userId], productId: [sql.Int, ctx.productId], code: [sql.NVarChar, `${tag.toUpperCase()}%`] });
  await getPool().close();
});

test('báo cáo có đủ các kiểm tra, mỗi kiểm tra có số dòng sai và mẫu', async () => {
  const report = await integrityService.runChecks();
  assert.deepEqual(report.checks.map((item) => item.key), ['stock_ledger', 'order_total', 'order_lines', 'voucher_usage', 'status_history']);
  for (const item of report.checks) {
    assert.equal(item.ok, item.problems === 0);
    assert.ok(item.sample.length <= 20 && item.sample.length <= item.problems);
  }
  assert.equal(report.ok, report.checks.every((item) => item.ok));
});

test('tồn kho thêm thẳng vào bảng (không qua sổ kho) bị bắt; ghi tồn đầu vào sổ thì hết', async () => {
  const [row] = await flagged('stock_ledger', ctx.productId);
  assert.deepEqual([row.stock, row.ledger], [7, 0]);
  await query("INSERT INTO StockMovements (ProductID, Change, StockAfter, Reason) VALUES (@id, 7, 7, N'opening')", { id: [sql.Int, ctx.productId] });
  assert.equal((await flagged('stock_ledger', ctx.productId)).length, 0);
});

test('đơn đặt qua API đúng mọi kiểm tra; sửa tổng tiền hay trạng thái thẳng trong DB thì bị bắt', async () => {
  const [voucher] = await query(`
    INSERT INTO Vouchers (Code, DiscountType, DiscountValue, MinOrderAmount, UsageLimit) OUTPUT INSERTED.VoucherID
    VALUES (@code, N'amount', 50000, 0, 10)
  `, { code: [sql.NVarChar, `${tag.toUpperCase()}V`] });
  const order = await orderService.createOrder(ctx.userId, { shippingAddress: ADDRESS, items: [{ productId: ctx.productId, quantity: 2 }], voucherCode: `${tag.toUpperCase()}V` });
  await orderService.updateOrderStatus(order.orderId, 'confirmed');
  for (const key of ['order_total', 'order_lines', 'status_history']) {
    assert.equal((await flagged(key, order.orderId)).length, 0, `${key} không báo sai cho đơn đặt qua API`);
  }
  assert.equal((await flagged('voucher_usage', voucher.VoucherID)).length, 0);
  assert.equal((await flagged('stock_ledger', ctx.productId)).length, 0, 'bán hàng ghi sổ kho');

  await query('UPDATE Orders SET Total = Total + 1000, Status = N\'shipped\' WHERE OrderID = @id', { id: [sql.Int, order.orderId] });
  await query('UPDATE Vouchers SET UsedCount = UsedCount + 1 WHERE VoucherID = @id', { id: [sql.Int, voucher.VoucherID] });
  assert.equal((await flagged('order_total', order.orderId)).length, 1);
  const [history] = await flagged('status_history', order.orderId);
  assert.deepEqual([history.status, history.lastHistory], ['shipped', 'confirmed']);
  const [usage] = await flagged('voucher_usage', voucher.VoucherID);
  assert.deepEqual([usage.usedCount, usage.usages], [2, 1]);
});
