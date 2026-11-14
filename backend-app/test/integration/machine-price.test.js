/*
  Test tích hợp giai đoạn 5 trên SQL Server thật:
  - "Nên mua lúc nào?": giá trung bình theo thời gian giữ giá (hàm cửa sổ LEAD), tổng giá cấu hình theo ngày;
  - theo dõi giá cả cấu hình: giới hạn 10 cấu hình khi bấm cùng lúc, báo một lần mỗi mức giảm, xoá khi xoá tài khoản;
  - "Máy này chạy được gì?" và nâng cấp laptop với dữ liệu seed 010; sản phẩm sinh tự động không hiện ở trang khách.
  Chạy:  cd backend-app && npm run test:db   (cần đã chạy run-migration.js và run-seed.js)
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const ProductLog = require('../../src/models/productLog.model');
const productService = require('../../src/services/product.service');
const priceInsightService = require('../../src/services/priceInsight.service');
const buildWatchService = require('../../src/services/buildWatch.service');
const machineService = require('../../src/services/machine.service');
const accountService = require('../../src/services/account.service');
const authService = require('../../src/services/auth.service');

const tag = `mp${Date.now()}`;
const ctx = { userIds: [], productIds: [] };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const newUser = async (suffix) => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Giai đoạn 5 Test', @email, N'not-a-real-hash', N'customer')
  `, { email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`] });
  ctx.userIds.push(user.UserID);
  return user.UserID;
};

const newProduct = async (suffix, price) => {
  const [category] = await query("SELECT CategoryID FROM Categories WHERE Slug = N'components'");
  const { productId } = await productService.createProduct({
    name: `Linh kiện ${tag} ${suffix}`, slug: `${tag}-${suffix}`, price, stock: 50, categoryId: category.CategoryID,
  }, null);
  ctx.productIds.push(productId);
  return productId;
};

/** Thay lịch sử giá: [[số ngày trước, giá], ...], mốc cuối là giá hiện tại. */
const setHistory = async (productId, points) => {
  await query('DELETE FROM PriceHistory WHERE ProductID = @id', { id: [sql.Int, productId] });
  for (const [daysAgo, price] of points) {
    await query(
      'INSERT INTO PriceHistory (ProductID, Price, ChangedAt) VALUES (@id, @price, DATEADD(DAY, -@days, SYSDATETIME()))',
      { id: [sql.Int, productId], price: [sql.Decimal(18, 2), price], days: [sql.Int, daysAgo] },
    );
  }
  await query('UPDATE Products SET Price = @price WHERE ProductID = @id', { id: [sql.Int, productId], price: [sql.Decimal(18, 2), points[points.length - 1][1]] });
};

const buildDrops = async (userId) => query(
  "SELECT Title, Body, Link FROM Notifications WHERE UserID = @userId AND Type = N'build_price_drop' ORDER BY NotificationID",
  { userId: [sql.Int, userId] },
);

test.before(async () => {
  await connectSQL();
  await connectMongo();
});

test.after(async () => {
  const users = ctx.userIds.join(',') || '0';
  const products = ctx.productIds.join(',') || '0';
  await query(`
    DELETE FROM Notifications WHERE UserID IN (${users});
    DELETE FROM BuildWatches WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM StockMovements WHERE ProductID IN (${products});
    DELETE FROM PriceHistory WHERE ProductID IN (${products});
    DELETE FROM Products WHERE ProductID IN (${products});
  `);
  await ProductLog.deleteMany({ productId: { $in: ctx.productIds } });
  // Chờ lượt quét sweepSoon cuối cùng (do updateProduct) chạy xong trước khi đóng kết nối.
  await new Promise((resolve) => setTimeout(resolve, 300));
  await mongoose.disconnect();
  await getPool().close();
});

test('nhãn giá 90 ngày: trung bình theo thời gian giữ giá, thấp nhất, giá 30 ngày trước', async () => {
  const id = await newProduct('insight', 1000000);
  // Trước cửa sổ 1,2 triệu; 60 ngày trước 0,9 triệu; 29 ngày trước 1 triệu (hiện tại).
  await setHistory(id, [[100, 1200000], [60, 900000], [29, 1000000]]);
  const insight = (await priceInsightService.getInsights([id])).get(id);
  assert.equal(insight.lowest, 900000);
  assert.equal(insight.highest, 1200000);
  // (1,2 tr × 30 ngày + 0,9 tr × 31 ngày + 1 tr × 29 ngày) / 90 ngày ≈ 1.032.222
  assert.ok(Math.abs(insight.average - 1032222) < 300, `trung bình ${insight.average}`);
  assert.equal(insight.changes, 2, 'mốc trước cửa sổ không tính là lần đổi giá');
  assert.equal(insight.label, 'below_avg');
  assert.equal(insight.vs30, 11.1, 'so với giá 0,9 triệu 30 ngày trước');

  const fresh = await newProduct('fresh', 500000);
  await setHistory(fresh, [[5, 500000]]);
  assert.equal((await priceInsightService.getInsights([fresh])).get(fresh).label, 'new');

  // Danh sách sản phẩm gắn nhãn cho từng thẻ.
  const listed = await productService.getProducts({ ids: String(id) });
  assert.equal(listed.items[0].priceInsight.label, 'below_avg');
});

test('tổng giá cấu hình theo ngày: ngày linh kiện chưa lên kệ không có tổng', async () => {
  const a = await newProduct('trend-a', 1000000);
  const b = await newProduct('trend-b', 300000);
  await setHistory(a, [[40, 900000], [10, 1000000]]);
  await setHistory(b, [[5, 300000]]);
  const trend = await priceInsightService.getBuildPriceTrend([{ productId: a, quantity: 2 }, { productId: b, quantity: 1 }]);
  assert.equal(trend.lines, 2);
  assert.equal(trend.points.length, 91);
  assert.equal(trend.points[0].total, null);
  const known = trend.points.filter((point) => point.total !== null);
  assert.ok(known.length >= 5 && known.length <= 7, `${known.length} ngày có đủ giá`);
  assert.equal(trend.current, 2 * 1000000 + 300000);
  assert.equal(trend.insight.label, 'new', 'mới có dưới 14 ngày dữ liệu cả bộ');
});

test('theo dõi giá cả cấu hình: 12 lần bấm cùng lúc chỉ lưu 10, cùng cấu hình thì đặt lại mốc', async () => {
  const user = await newUser('limit');
  const a = await newProduct('limit-a', 200000);
  const b = await newProduct('limit-b', 100000);
  const sets = [
    ...Array.from({ length: 8 }, (_, i) => [{ productId: a, quantity: i + 1 }]),
    ...Array.from({ length: 4 }, (_, i) => [{ productId: b, quantity: i + 1 }]),
  ];
  const results = await Promise.allSettled(sets.map((items) => buildWatchService.watchBuild(user, { items })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 10);
  for (const result of results.filter((item) => item.status === 'rejected')) assert.equal(result.reason.status, 409, result.reason.message);
  assert.equal((await buildWatchService.listBuildWatches(user)).length, 10);

  // Cấu hình đã theo dõi (khác thứ tự, thêm linh kiện đã có) vẫn là lượt cũ: không vượt giới hạn.
  const saved = (await buildWatchService.listBuildWatches(user)).find((watch) => watch.items.length === 1 && watch.items[0].quantity === 1);
  const again = await buildWatchService.watchBuild(user, { items: [...saved.items, { productId: b, quantity: 1, owned: true }], title: 'Đổi tên' });
  assert.equal(again.id, saved.id);
  await assert.rejects(buildWatchService.watchBuild(user, { items: [] }), (err) => err.status === 400);
  await buildWatchService.unwatchBuild(user, saved.id);
  await assert.rejects(buildWatchService.unwatchBuild(user, saved.id), (err) => err.status === 404);
});

test('cả bộ rẻ hơn: báo một lần mỗi mức giảm, giá nhích lên không báo, về lại mức cũ rồi giảm thì báo', async () => {
  const user = await newUser('drop');
  const a = await newProduct('drop-a', 1000000);
  const b = await newProduct('drop-b', 500000);
  const watch = await buildWatchService.watchBuild(user, { items: [{ productId: a, quantity: 2 }, { productId: b, quantity: 1 }], title: `PC ${tag}` });
  assert.equal(watch.totalAtWatch, 2500000);
  await buildWatchService.sweepBuildWatches();
  assert.equal((await buildDrops(user)).length, 0);

  // updateProduct tự quét (sweepSoon); quét thêm hai lần cùng lúc vẫn chỉ một thông báo.
  await productService.updateProduct(a, { price: 950000 });
  await Promise.all([buildWatchService.sweepBuildWatches(), buildWatchService.sweepBuildWatches()]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  let drops = await buildDrops(user);
  assert.equal(drops.length, 1);
  assert.match(drops[0].Title, new RegExp(`PC ${tag}`));
  assert.match(drops[0].Body, /2\.400\.000đ, giảm 100\.000đ/);
  assert.equal(drops[0].Link, '/build-pc/theo-doi');

  await productService.updateProduct(b, { price: 450000 });
  await buildWatchService.sweepBuildWatches();
  assert.equal((await buildDrops(user)).length, 2, 'giảm tiếp thì báo tiếp');

  await productService.updateProduct(b, { price: 480000 });
  await buildWatchService.sweepBuildWatches();
  assert.equal((await buildDrops(user)).length, 2, 'nhích lên mà vẫn rẻ hơn lúc đầu: không báo');

  await productService.updateProduct(a, { price: 1100000 });
  await buildWatchService.sweepBuildWatches();
  await productService.updateProduct(a, { price: 990000 });
  await buildWatchService.sweepBuildWatches();
  await new Promise((resolve) => setTimeout(resolve, 200));
  drops = await buildDrops(user);
  assert.equal(drops.length, 3);

  const [listed] = await buildWatchService.listBuildWatches(user);
  assert.equal(listed.currentTotal, 2 * 990000 + 480000);
});

test('xoá tài khoản xoá cấu hình đang theo dõi; tải dữ liệu cá nhân có cấu hình theo dõi', async () => {
  const password = 'Test-password-123';
  const { user: registered } = await authService.register({ fullName: 'Khách xoá', email: `${tag}-export@btstore.test`, password, phone: '0901234567' });
  const user = registered.UserID ?? registered.id;
  ctx.userIds.push(user);
  const a = await newProduct('export-a', 700000);
  await buildWatchService.watchBuild(user, { items: [{ productId: a, quantity: 1 }], title: 'Máy học' });
  const data = await accountService.exportMyData(user);
  assert.equal(data.buildWatches.length, 1);
  assert.deepEqual(data.buildWatches[0].items, [{ productId: a, quantity: 1 }]);
  assert.equal(data.buildWatches[0].ItemsJson, undefined);

  await accountService.deleteAccount(user, password);
  const [left] = await query('SELECT COUNT(*) AS N FROM BuildWatches WHERE UserID = @id', { id: [sql.Int, user] });
  assert.equal(left.N, 0);
});

test('máy chạy được gì: DxDiag khớp model laptop, gợi ý RAM/SSD còn hàng đúng loại và giới hạn', async () => {
  const dxdiag = [
    '      System Manufacturer: LENOVO',
    '             System Model: 82XV',
    '             Machine name: KHONG-GUI-DI',
    '                Processor: 13th Gen Intel(R) Core(TM) i5-13420H (12 CPUs), ~2.1GHz',
    '                   Memory: 8192MB RAM',
    '           Card name: NVIDIA GeForce RTX 4050 Laptop GPU',
    '    Dedicated Memory: 5921 MB',
  ].join('\n');
  const result = await machineService.analyzeMachine({ source: 'dxdiag', text: dxdiag, slotsUsed: 1 });
  assert.equal(result.laptopModel.slug, 'lenovo-loq-15irh8');
  assert.equal(result.detected.ramGB, 8);
  assert.equal(result.capabilities.profile.vramGB, 6);
  assert.equal(result.upgrade.ram.upgradable, true);
  assert.ok(result.upgrade.ram.options.length > 0);
  for (const option of result.upgrade.ram.options) {
    assert.equal(option.type, 'laptop_ram');
    assert.equal(option.memoryType, 'DDR5');
    assert.ok(option.resultGB <= 16, 'LOQ 15IRH8 tối đa 16 GB');
    assert.ok(option.stock > 0);
  }
  assert.ok(result.upgrade.ram.options.some((option) => option.action === 'add'), 'còn 1 khe trống thì gợi ý lắp thêm');
  assert.ok(result.upgrade.storage.options.every((option) => (option.m2Size || '2280') === '2280'));

  await assert.rejects(machineService.analyzeMachine({ source: 'dxdiag', text: 'xin chào' }), (err) => err.status === 400);
  await assert.rejects(machineService.analyzeMachine({ source: 'laptop', laptopModelId: 0 }), (err) => err.status === 404);
  const unknown = await machineService.analyzeMachine({ source: 'dxdiag', text: dxdiag.replace('82XV', 'Mau la XYZ') });
  assert.equal(unknown.laptopModel, null);
  assert.equal(unknown.upgrade, null);
  assert.match(unknown.hint, /Chưa có model/);
});

test('máy chạy được gì trên trang sản phẩm: laptop theo model, PC theo thông số, sản phẩm khác không có', async () => {
  const [legion] = await query("SELECT ProductID FROM Products WHERE Slug = N'lenovo-legion-5-15iax11'");
  const laptop = await machineService.capabilitiesForProduct(legion.ProductID);
  assert.equal(laptop.source, 'laptop_model');
  assert.match(laptop.laptopModel.upgradeSummary, /2 khe RAM DDR5, tối đa 32 GB/);

  const [pc] = await query(`
    SELECT TOP 1 p.ProductID FROM Products p JOIN Categories c ON c.CategoryID = p.CategoryID
    WHERE c.Slug = N'pc-gaming' AND p.IsGenerated = 0 AND p.Specs LIKE N'%GB RAM%' ORDER BY p.ProductID
  `);
  const desktop = await machineService.capabilitiesForProduct(pc.ProductID);
  assert.equal(desktop.source, 'specs');
  assert.ok(desktop.capabilities.profile.ramGB >= 8);

  const [monitor] = await query("SELECT ProductID FROM Products WHERE Slug = N'dell-ultrasharp-u2724de'");
  assert.equal((await machineService.capabilitiesForProduct(monitor.ProductID)).capabilities, null);
});

test('sản phẩm sinh tự động: không hiện ở danh sách và tìm kiếm, vẫn lấy được theo mã hoặc khi yêu cầu', async () => {
  const [generated] = await query('SELECT TOP 1 ProductID FROM Products WHERE IsGenerated = 1 AND IsDeleted = 0 ORDER BY ProductID');
  assert.ok(generated, 'seed 002 phải có sản phẩm sinh tự động');
  const search = await productService.getProducts({ q: 'Demo Product', limit: 5 });
  assert.equal(search.pagination.totalItems, 0);
  const all = await productService.getProducts({ limit: 50 });
  assert.ok(all.items.every((item) => !item.isGenerated));
  const included = await productService.getProducts({ q: 'Demo Product', limit: 5, includeGenerated: 'true' });
  assert.ok(included.pagination.totalItems > 1000);
  assert.ok(included.items.every((item) => item.isGenerated));
  const byId = await productService.getProducts({ ids: String(generated.ProductID) });
  assert.equal(byId.items.length, 1);
  assert.equal((await productService.getProductSuggestions('Demo Product')).length, 0);
});
