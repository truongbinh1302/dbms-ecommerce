/*
  Test tích hợp: sổ kho (phiếu nhập, bán, huỷ, điều chỉnh) và báo cáo theo ngày.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const ProductLog = require('../../src/models/productLog.model');
const inventoryService = require('../../src/services/inventory.service');
const productService = require('../../src/services/product.service');
const orderService = require('../../src/services/order.service');
const reportService = require('../../src/services/report.service');

const ADDRESS = {
  recipientName: 'Inventory Test',
  phone: '0901234567',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Diên Hồng',
  street: '268 Lý Thường Kiệt',
};

const tag = `inv${Date.now()}`;
const ctx = { adminId: null, userId: null, productIds: [], receiptIds: [] };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const stockOf = async (productId) => (await query('SELECT Stock FROM Products WHERE ProductID = @id', { id: [sql.Int, productId] }))[0].Stock;

const ledger = async (productId) => query(`
  SELECT Change, StockAfter, Reason, OrderID, ReceiptID, Note FROM StockMovements
  WHERE ProductID = @id ORDER BY MovementID
`, { id: [sql.Int, productId] });

const ledgerSum = async (productId) => (await query(
  'SELECT ISNULL(SUM(Change), 0) AS Total FROM StockMovements WHERE ProductID = @id',
  { id: [sql.Int, productId] },
))[0].Total;

const newProduct = async (suffix, stock) => {
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const { productId } = await productService.createProduct({
    name: `Inventory ${tag} ${suffix}`,
    slug: `${tag}-${suffix}`,
    price: 1000000,
    stock,
    categoryId: category.CategoryID,
  }, ctx.adminId);
  ctx.productIds.push(productId);
  return productId;
};

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  ctx.adminId = admin.UserID;
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Inventory Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}@btstore.test`] });
  ctx.userId = user.UserID;
});

test.after(async () => {
  const ids = ctx.productIds.join(',') || '0';
  const receipts = ctx.receiptIds.join(',') || '0';
  await query(`
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID = @userId;
    DELETE FROM Orders WHERE UserID = @userId;
    DELETE FROM CartItems WHERE UserID = @userId;
    DELETE FROM Users WHERE UserID = @userId;
    DELETE FROM StockMovements WHERE ProductID IN (${ids});
    DELETE FROM StockReceiptItems WHERE ReceiptID IN (${receipts});
    DELETE FROM StockReceipts WHERE ReceiptID IN (${receipts});
    DELETE FROM PriceHistory WHERE ProductID IN (${ids});
    DELETE FROM Products WHERE ProductID IN (${ids});
  `, { userId: [sql.Int, ctx.userId] });
  await ProductLog.deleteMany({ productId: { $in: ctx.productIds } });
  await mongoose.disconnect();
  await getPool().close();
});

test('phiếu nhập cộng tồn, ghi sổ kho; mọi thay đổi tồn đều có dòng sổ kho', async () => {
  const cpu = await newProduct('cpu', 2);
  const ram = await newProduct('ram', 0);
  assert.deepEqual(await ledger(cpu), [{ Change: 2, StockAfter: 2, Reason: 'opening', OrderID: null, ReceiptID: null, Note: 'Tồn khi tạo sản phẩm' }]);

  const receipt = await inventoryService.createReceipt({
    supplier: '  Công ty  Phân phối Test ',
    note: 'Lô tháng 11',
    items: [
      { productId: ram, quantity: 10, unitCost: 650000 },
      { productId: cpu, quantity: 5, unitCost: 4200000.5 },
    ],
  }, ctx.adminId);
  ctx.receiptIds.push(receipt.id);

  assert.match(receipt.code, /^NK\d{6}$/);
  assert.equal(receipt.supplier, 'Công ty Phân phối Test');
  assert.equal(receipt.totalQuantity, 15);
  assert.equal(receipt.totalCost, 10 * 650000 + 5 * 4200000.5);
  assert.equal(receipt.items.length, 2);
  assert.equal(await stockOf(cpu), 7);
  assert.equal(await stockOf(ram), 10);
  const cpuReceipt = (await ledger(cpu)).at(-1);
  assert.deepEqual([cpuReceipt.Change, cpuReceipt.StockAfter, cpuReceipt.Reason, cpuReceipt.ReceiptID], [5, 7, 'receipt', receipt.id]);

  // Bán 3, huỷ đơn → trả 3 về kho.
  const order = await orderService.createOrder(ctx.userId, {
    shippingAddress: ADDRESS,
    items: [{ productId: cpu, quantity: 3 }],
    acceptTerms: true,
  });
  assert.equal(await stockOf(cpu), 4);
  await orderService.cancelOrder(order.orderId, ctx.userId, 'Khách đổi ý');
  assert.equal(await stockOf(cpu), 7);

  // Admin đặt tồn tuyệt đối → sổ kho ghi chênh lệch.
  const adjusted = await productService.updateStock(cpu, 6, 'Kiểm kê: 1 hộp móp', ctx.adminId);
  assert.deepEqual(adjusted, { productId: cpu, oldStock: 7, newStock: 6 });
  // Đặt lại đúng giá trị cũ: không ghi thêm dòng.
  await productService.updateStock(cpu, 6, 'Kiểm kê lại', ctx.adminId);
  // Sửa tồn trong form sản phẩm cũng ghi sổ.
  await productService.updateProduct(cpu, { stock: 8 }, ctx.adminId);

  const rows = await ledger(cpu);
  assert.deepEqual(rows.map((row) => [row.Reason, row.Change, row.StockAfter]), [
    ['opening', 2, 2],
    ['receipt', 5, 7],
    ['sale', -3, 4],
    ['cancel', 3, 7],
    ['adjust', -1, 6],
    ['adjust', 2, 8],
  ]);
  assert.equal(rows[2].OrderID, order.orderId);
  assert.equal(rows[3].Note, 'Khách đổi ý');
  assert.equal(rows[4].Note, 'Kiểm kê: 1 hộp móp');

  for (const id of [cpu, ram]) {
    assert.equal(await ledgerSum(id), await stockOf(id), 'tổng thay đổi trong sổ kho phải bằng tồn hiện tại');
  }

  const movements = await inventoryService.listMovements({ productId: cpu, limit: 10 });
  assert.equal(movements[0].reason, 'adjust');
  assert.equal(movements.find((m) => m.reason === 'receipt').receiptCode, receipt.code);
  assert.ok(movements.find((m) => m.reason === 'sale').orderCode);
});

test('phiếu nhập sai không ghi gì: thiếu nhà cung cấp, dòng lặp, sản phẩm đã ẩn', async () => {
  const gpu = await newProduct('gpu', 1);
  const hidden = await newProduct('hidden', 0);
  await productService.deleteProduct(hidden, ctx.adminId);
  const before = (await query('SELECT COUNT(*) AS Total FROM StockReceipts'))[0].Total;

  await assert.rejects(
    inventoryService.createReceipt({ supplier: ' ', items: [{ productId: gpu, quantity: 1, unitCost: 1 }] }, ctx.adminId),
    (err) => err.status === 400 && /nhà cung cấp/.test(err.message),
  );
  await assert.rejects(
    inventoryService.createReceipt({ supplier: 'NCC', items: [{ productId: gpu, quantity: 1, unitCost: 1 }, { productId: gpu, quantity: 2, unitCost: 1 }] }, ctx.adminId),
    (err) => err.status === 400 && /lặp/.test(err.message),
  );
  await assert.rejects(
    inventoryService.createReceipt({ supplier: 'NCC', items: [{ productId: gpu, quantity: 0, unitCost: 1 }] }, ctx.adminId),
    (err) => err.status === 400,
  );
  await assert.rejects(
    inventoryService.createReceipt({ supplier: 'NCC', items: [{ productId: gpu, quantity: 4, unitCost: 1 }, { productId: hidden, quantity: 1, unitCost: 1 }] }, ctx.adminId),
    (err) => err.status === 400 && err.data.productIds.includes(hidden),
  );
  await assert.rejects(productService.updateStock(gpu, -1, 'âm', ctx.adminId), (err) => err.status === 400);

  assert.equal(await stockOf(gpu), 1, 'phiếu lỗi không được cộng tồn dở dang');
  assert.equal((await query('SELECT COUNT(*) AS Total FROM StockReceipts'))[0].Total, before);
  assert.equal(await ledgerSum(gpu), 1);
});

test('nhiều phiếu nhập cùng lúc cho một sản phẩm: cộng đủ, không mất lượt', async () => {
  const ssd = await newProduct('ssd', 0);
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => inventoryService.createReceipt({
    supplier: `NCC song song ${index}`,
    items: [{ productId: ssd, quantity: index + 1, unitCost: 100000 }],
  }, ctx.adminId)));
  ctx.receiptIds.push(...results.map((receipt) => receipt.id));
  assert.equal(await stockOf(ssd), 21);
  assert.equal(await ledgerSum(ssd), 21);
  // Tồn sau mỗi lần nhập tăng dần đúng thứ tự ghi sổ: không có hai phiếu cùng đọc một tồn cũ.
  const rows = (await ledger(ssd)).filter((row) => row.Reason === 'receipt');
  assert.equal(rows.length, 6);
  let running = 0;
  for (const row of rows) {
    running += row.Change;
    assert.equal(row.StockAfter, running);
  }
  assert.equal(running, 21);
});

test('báo cáo theo ngày: chia ngày theo giờ Việt Nam, có số liệu nhập kho hôm nay', async () => {
  const today = reportService.vietnamToday();
  const report = await reportService.getDailyReport({ from: today, to: today });
  assert.equal(report.days.length, 1);
  assert.equal(report.days[0].date, today);
  assert.ok(report.days[0].receipts >= 7, 'gồm các phiếu nhập test vừa tạo');
  assert.ok(report.days[0].unitsReceived >= 15 + 21);
  assert.ok(report.days[0].orders >= 1);
  assert.ok(report.days[0].cancelledOrders >= 1);
  assert.deepEqual(report.totals.receipts, report.days[0].receipts);

  // 23:30 ngày 11/11 giờ Việt Nam là 16:30 UTC: vẫn tính là ngày 11/11.
  assert.equal(reportService.vietnamToday(new Date('2026-11-11T16:30:00Z')), '2026-11-11');
  assert.equal(reportService.vietnamToday(new Date('2026-11-11T17:00:00Z')), '2026-11-12');

  const month = await reportService.getDailyReport({}, new Date('2026-11-12T03:00:00Z'));
  assert.equal(month.from, '2026-10-14');
  assert.equal(month.to, '2026-11-12');
  assert.equal(month.days.length, 30);

  await assert.rejects(reportService.getDailyReport({ from: '2026-01-01', to: '2026-12-31' }), (err) => err.status === 400);
  await assert.rejects(reportService.getDailyReport({ from: '2026-02-30', to: '2026-03-01' }), (err) => err.status === 400);
  await assert.rejects(reportService.getDailyReport({ from: '2026-11-12', to: '2026-11-01' }), (err) => err.status === 400);
});
