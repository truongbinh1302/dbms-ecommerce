/*
  Test tích hợp: dịch vụ sau bán (lịch tại nhà, thu cũ, bảo hành) trên SQL Server thật.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const afterSales = require('../../src/services/afterSales.service');
const warrantyService = require('../../src/services/warranty.service');
const accountService = require('../../src/services/account.service');
const config = require('../../src/config/env');
const { hashPassword } = require('../../src/utils/hash');

const tag = `as${Date.now()}`;
const ctx = { userIds: [], productId: null, serials: [] };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const newUser = async (suffix, password = 'not-a-real-hash') => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (N'Dịch vụ Test', @email, @password, N'customer')
  `, { email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`], password: [sql.NVarChar, password] });
  ctx.userIds.push(user.UserID);
  return user.UserID;
};

const address = (province = config.store.province) => ({
  recipientName: 'Dịch vụ Test',
  phone: '0901234567',
  province,
  ward: 'Phường Bến Thành',
  street: '12 Lê Lợi',
});

const homeBooking = (overrides = {}) => ({
  type: 'home_service',
  serviceKind: 'cleaning',
  scheduledDate: afterSales.vietnamDate(3),
  timeSlot: '10:00-12:00',
  address: address(),
  description: 'Máy nóng, quạt kêu to',
  ...overrides,
});

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (N'After sales test', @slug, 1000000, 10, @categoryId)
  `, { slug: [sql.NVarChar, `${tag}-product`], categoryId: [sql.Int, category.CategoryID] });
  ctx.productId = product.ProductID;
});

test.after(async () => {
  const users = ctx.userIds.join(',') || '0';
  await query(`
    DELETE e FROM ServiceRequestEvents e JOIN ServiceRequests r ON r.RequestID = e.RequestID WHERE r.UserID IN (${users});
    DELETE FROM ServiceRequests WHERE UserID IN (${users});
    DELETE w FROM Warranties w JOIN Orders o ON o.OrderID = w.OrderID WHERE o.UserID IN (${users});
    DELETE oi FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID WHERE o.UserID IN (${users});
    DELETE FROM Orders WHERE UserID IN (${users});
    DELETE FROM Notifications WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM PriceHistory WHERE ProductID = @productId;
    DELETE FROM StockMovements WHERE ProductID = @productId;
    DELETE FROM Products WHERE ProductID = @productId;
  `, { productId: [sql.Int, ctx.productId] });
  await mongoose.disconnect();
  await getPool().close();
});

test('lịch tại nhà: kiểm tra tỉnh, ngày, khung giờ; trùng lịch; khách tự huỷ', async () => {
  const userId = await newUser('home');
  await assert.rejects(afterSales.createRequest(userId, homeBooking({ address: address('Hà Nội') })), (err) => err.status === 400 && /chỉ nhận trong/.test(err.message));
  await assert.rejects(afterSales.createRequest(userId, homeBooking({ scheduledDate: afterSales.vietnamDate(0) })), (err) => err.status === 400);
  await assert.rejects(afterSales.createRequest(userId, homeBooking({ timeSlot: '23:00-01:00' })), (err) => err.status === 400);
  await assert.rejects(afterSales.createRequest(userId, homeBooking({ serviceKind: 'mining' })), (err) => err.status === 400);

  const created = await afterSales.createRequest(userId, homeBooking());
  assert.match(created.code, /^DV\d{6}$/);
  assert.equal(created.status, 'new');
  assert.equal(created.serviceLabel, 'Vệ sinh máy, thay keo tản nhiệt');
  assert.equal(created.address.ward, 'Phường Bến Thành');
  assert.deepEqual(created.events.map((event) => event.status), ['new']);

  await assert.rejects(afterSales.createRequest(userId, homeBooking()), (err) => err.status === 409 && err.data.code === 'duplicate_slot');

  const options = await afterSales.getOptions();
  const day = options.days.find((item) => item.date === afterSales.vietnamDate(3));
  assert.equal(day.slots.find((slot) => slot.slot === '10:00-12:00').remaining, config.services.slotCapacity - 1);
  assert.equal(options.days.length, config.services.bookingDays);

  const cancelled = await afterSales.cancelMyRequest(userId, created.id, 'Bận việc');
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.events.at(-1).note, /Bận việc/);
  await assert.rejects(afterSales.cancelMyRequest(userId, created.id), (err) => err.status === 409);
});

test('nhiều khách đặt cùng khung giờ: không vượt số kỹ thuật viên', async () => {
  const capacity = config.services.slotCapacity;
  const users = await Promise.all(Array.from({ length: capacity + 3 }, (_, index) => newUser(`slot${index}`)));
  const booking = homeBooking({ scheduledDate: afterSales.vietnamDate(5), timeSlot: '18:00-20:00' });
  const results = await Promise.allSettled(users.map((userId) => afterSales.createRequest(userId, booking)));
  const ok = results.filter((result) => result.status === 'fulfilled');
  const full = results.filter((result) => result.status === 'rejected');
  assert.equal(ok.length, capacity);
  assert.ok(full.every((result) => result.reason.status === 409 && result.reason.data.code === 'slot_full'), full.map((r) => r.reason.message).join(' | '));
  const [{ Booked }] = await query(`
    SELECT COUNT(*) AS Booked FROM ServiceRequests
    WHERE Type = N'home_service' AND ScheduledDate = CAST(@date AS DATE) AND TimeSlot = N'18:00-20:00' AND Status <> N'cancelled'
  `, { date: [sql.NVarChar, booking.scheduledDate] });
  assert.ok(Booked <= capacity);
});

test('thu cũ: lưu giá ước tính; admin chốt giá và chuyển trạng thái đúng thứ tự', async () => {
  const userId = await newUser('tradein');
  const estimate = afterSales.estimateTradeIn({ category: 'laptop', purchasePrice: 25000000, ageMonths: 24, condition: 'good' });
  assert.ok(estimate.low > 0 && estimate.high >= estimate.low);

  await assert.rejects(afterSales.createRequest(userId, { type: 'trade_in', category: 'laptop', purchasePrice: 25000000, ageMonths: 24, condition: 'good', brandModel: 'Dell XPS 13', contactPhone: '123' }), (err) => err.status === 400);
  const created = await afterSales.createRequest(userId, {
    type: 'trade_in', category: 'laptop', purchasePrice: 25000000, ageMonths: 24, condition: 'good', brandModel: 'Dell XPS 13 9310', contactPhone: '0901 234 567',
  });
  assert.deepEqual([created.estimateLow, created.estimateHigh], [estimate.low, estimate.high]);
  assert.equal(created.device.brandModel, 'Dell XPS 13 9310');
  assert.equal(created.contactPhone, '0901234567');

  await assert.rejects(afterSales.updateRequest(created.id, { status: 'completed' }, null), (err) => err.status === 409);
  await afterSales.updateRequest(created.id, { status: 'confirmed', note: 'Hẹn khách mang máy tới chiều mai' }, null);
  await afterSales.updateRequest(created.id, { note: 'Máy có vết nứt bản lề', internal: true }, null);
  await afterSales.updateRequest(created.id, { status: 'in_progress' }, null);
  const done = await afterSales.updateRequest(created.id, { status: 'completed', finalPrice: 7800000, note: 'Đã thu máy' }, null);
  assert.equal(done.finalPrice, 7800000);
  assert.equal(done.events.filter((event) => event.internal).length, 1);

  const [{ Total: notified }] = await query("SELECT COUNT(*) AS Total FROM Notifications WHERE UserID = @userId AND Type = N'service_update'", { userId: [sql.Int, userId] });
  assert.equal(notified, 3, 'xác nhận, đang xử lý, hoàn tất: 3 thông báo; ghi chú nội bộ không báo');

  const mine = await afterSales.getRequest(created.id, { userId });
  assert.deepEqual(mine.events.map((event) => event.status), ['new', 'confirmed', 'in_progress', 'completed']);
  assert.ok(!mine.events.some((event) => /bản lề/.test(event.note || '')), 'ghi chú nội bộ không lộ cho khách');
  await assert.rejects(afterSales.getRequest(created.id, { userId: ctx.userIds[0] }), (err) => err.status === 404);

  const adminList = await afterSales.listRequests({ type: 'trade_in' });
  assert.ok(adminList.some((item) => item.id === created.id && item.customerEmail.endsWith('@btstore.test')));
});

test('bảo hành: chỉ serial của chính khách và còn hạn; mỗi serial một yêu cầu mở', async () => {
  const owner = await newUser('warranty');
  const stranger = await newUser('stranger');
  const [order] = await query(`
    INSERT INTO Orders (UserID, PaymentMethod, Status, Subtotal, Discount, ShippingFee, Total)
    OUTPUT INSERTED.OrderID VALUES (@userId, N'cod', N'delivered', 2000000, 0, 0, 2000000)
  `, { userId: [sql.Int, owner] });
  await query('INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice) VALUES (@orderId, @productId, 2, 1000000)', {
    orderId: [sql.Int, order.OrderID], productId: [sql.Int, ctx.productId],
  });
  const serial = `${tag}A`.toUpperCase();
  const expiredSerial = `${tag}B`.toUpperCase();
  await warrantyService.registerWarranty({ serialNumber: serial, orderId: order.OrderID, productId: ctx.productId, months: 24 });
  await warrantyService.registerWarranty({ serialNumber: expiredSerial, orderId: order.OrderID, productId: ctx.productId, months: 1, startDate: '2024-01-01' });

  const payload = { type: 'warranty', serialNumber: serial.toLowerCase(), description: 'Không lên hình sau khi cắm nguồn', contactPhone: '0901234567', handoff: 'store' };
  await assert.rejects(afterSales.createRequest(stranger, payload), (err) => err.status === 404);
  await assert.rejects(afterSales.createRequest(owner, { ...payload, description: 'hỏng' }), (err) => err.status === 400);
  await assert.rejects(afterSales.createRequest(owner, { ...payload, serialNumber: expiredSerial }), (err) => err.status === 400 && err.data.code === 'warranty_expired');

  const created = await afterSales.createRequest(owner, payload);
  assert.equal(created.serialNumber, serial);
  assert.equal(created.productName, 'After sales test');
  assert.equal(created.orderId, order.OrderID);
  await assert.rejects(afterSales.createRequest(owner, payload), (err) => err.status === 409 && err.data.code === 'open_request');

  const list = await afterSales.listMyRequests(owner);
  assert.equal(list[0].id, created.id);
});

test('xoá tài khoản: huỷ yêu cầu đang mở, xoá địa chỉ và số điện thoại; dữ liệu tải về có yêu cầu dịch vụ', async () => {
  const password = 'Delete-me-123';
  const userId = await newUser('delete', await hashPassword(password));
  const created = await afterSales.createRequest(userId, homeBooking({ scheduledDate: afterSales.vietnamDate(7), timeSlot: '08:00-10:00' }));

  const exported = await accountService.exportMyData(userId);
  assert.equal(exported.serviceRequests[0].Code, created.code);
  assert.equal(exported.serviceRequests[0].Address.street, '12 Lê Lợi');

  await accountService.deleteAccount(userId, password);
  const [row] = await query('SELECT Status, Address, ContactPhone, Description FROM ServiceRequests WHERE RequestID = @id', { id: [sql.Int, created.id] });
  assert.deepEqual(row, { Status: 'cancelled', Address: null, ContactPhone: null, Description: null });
});
