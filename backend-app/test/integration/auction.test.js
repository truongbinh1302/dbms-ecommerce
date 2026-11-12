/*
  Test tích hợp đấu giá trên SQL Server thật: đặt giá tự động, nhiều người trả giá cùng lúc,
  gia hạn phút chót, mua ngay tranh nhau, chốt phiên, đặt hàng theo giá thắng, hết hạn, huỷ phiên, luồng SSE.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const auctions = require('../../src/services/auction.service');
const orderService = require('../../src/services/order.service');
const accountService = require('../../src/services/account.service');

const tag = `au${Date.now()}`;
const ctx = { productId: null, adminId: null, users: [], auctionIds: [], orderIds: [] };
const ADDRESS = { recipientName: 'Đấu Giá Test', phone: '0901234567', province: 'TP. Hồ Chí Minh', ward: 'Phường Diên Hồng', street: '268 Lý Thường Kiệt' };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};
const stock = async () => Number((await query('SELECT Stock FROM Products WHERE ProductID = @id', { id: [sql.Int, ctx.productId] }))[0].Stock);
const row = async (id) => (await query('SELECT * FROM Auctions WHERE AuctionID = @id', { id: [sql.Int, id] }))[0];
const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

const open = async (overrides = {}) => {
  const created = await auctions.createAuction(ctx.adminId, {
    productId: ctx.productId, title: `Phiên ${tag}`, startingPrice: 2000000, bidIncrement: 50000, endsAt: inMinutes(60), ...overrides,
  });
  ctx.auctionIds.push(created.id);
  return created.id;
};
const user = (index) => ctx.users[index];
// Đưa giờ kết thúc (và hạn đặt hàng) về quá khứ để thử chốt phiên mà không phải chờ.
const endNow = (id) => query(`
  UPDATE Auctions SET StartsAt = DATEADD(MINUTE, -30, SYSDATETIME()), EndsAt = DATEADD(SECOND, -1, SYSDATETIME()),
         ScheduledEndsAt = DATEADD(SECOND, -1, SYSDATETIME()) WHERE AuctionID = @id`, { id: [sql.Int, id] });

test.before(async () => {
  await connectSQL();
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  ctx.adminId = admin.UserID;
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (@name, @slug, 3000000, 20, @categoryId)
  `, { name: [sql.NVarChar, `RAM đấu giá ${tag}`], slug: [sql.NVarChar, `${tag}-ram`], categoryId: [sql.Int, category.CategoryID] });
  ctx.productId = product.ProductID;
  for (let i = 0; i < 60; i += 1) {
    const [created] = await query(`
      INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
      VALUES (@name, @email, N'not-a-real-hash', N'customer')
    `, { name: [sql.NVarChar, `Khách ${i} ${tag}`], email: [sql.NVarChar, `${tag}-${i}@btstore.test`] });
    ctx.users.push(created.UserID);
  }
});

test.after(async () => {
  const users = ctx.users.join(',') || '0';
  const auctionList = ctx.auctionIds.join(',') || '0';
  const orders = ctx.orderIds.join(',') || '0';
  try {
    await query(`
    UPDATE Auctions SET OrderID = NULL WHERE AuctionID IN (${auctionList});
    DELETE FROM OrderStatusHistory WHERE OrderID IN (${orders});
    DELETE FROM StockMovements WHERE OrderID IN (${orders}) OR ProductID = @productId;
    DELETE FROM OrderItems WHERE OrderID IN (${orders});
    DELETE FROM Orders WHERE OrderID IN (${orders});
    DELETE FROM AuctionBids WHERE AuctionID IN (${auctionList});
    DELETE FROM AuctionMaxBids WHERE AuctionID IN (${auctionList});
    DELETE FROM Auctions WHERE AuctionID IN (${auctionList});
    DELETE FROM Notifications WHERE UserID IN (${users});
    DELETE FROM CartItems WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM PriceHistory WHERE ProductID = @productId;
    DELETE FROM Products WHERE ProductID = @productId;
  `, { productId: [sql.Int, ctx.productId] });
  } finally {
    await getPool().close();
  }
});

test('mở phiên: giữ 1 sản phẩm khỏi kho, ghi sổ kho; dữ liệu sai bị từ chối', async () => {
  const before = await stock();
  const id = await open();
  assert.equal(await stock(), before - 1);
  const [movement] = await query("SELECT TOP 1 Change, Reason, Note FROM StockMovements WHERE ProductID = @id ORDER BY MovementID DESC", { id: [sql.Int, ctx.productId] });
  assert.deepEqual([movement.Change, movement.Reason], [-1, 'auction']);
  assert.match(movement.Note, new RegExp(`#${id}`));

  await assert.rejects(auctions.createAuction(ctx.adminId, { productId: ctx.productId, startingPrice: 2000000, bidIncrement: 50000, endsAt: inMinutes(2) }), (err) => err.status === 400 && /5 phút/.test(err.message));
  await assert.rejects(auctions.createAuction(ctx.adminId, { productId: ctx.productId, startingPrice: 2000000, bidIncrement: 50000, buyNowPrice: 1000, endsAt: inMinutes(60) }), (err) => err.status === 400);
});

test('đặt giá tự động: bị vượt tự động, nâng giá tối đa, bằng nhau thì người trước thắng, báo người bị vượt', async () => {
  const id = await open();
  const first = await auctions.placeBid(user(0), id, 2100000);
  assert.deepEqual([first.outcome, first.auction.currentPrice, first.auction.myMax, first.auction.leader.isYou], ['leading', 2000000, 2100000, true]);

  const second = await auctions.placeBid(user(1), id, 2050000);
  assert.equal(second.outcome, 'outbid');
  assert.equal(second.auction.currentPrice, 2100000, 'hệ thống trả thay người 0 tới min(2,1tr; 2,05tr + 50k)');
  assert.deepEqual(second.auction.history.slice(0, 2).map((bid) => [bid.kind, bid.amount, bid.isYou]), [['auto', 2100000, false], ['bid', 2050000, true]]);

  await assert.rejects(auctions.placeBid(user(1), id, 2100000), (err) => err.status === 400 && err.data.code === 'bid_too_low' && err.data.minimum === 2150000);
  await assert.rejects(auctions.placeBid(user(0), id, 2100000), (err) => err.status === 400 && err.data.code === 'max_not_higher');
  const raised = await auctions.placeBid(user(0), id, 2500000);
  assert.deepEqual([raised.outcome, raised.auction.currentPrice, raised.auction.myMax], ['raised', 2100000, 2500000]);

  const tie = await auctions.placeBid(user(2), id, 2500000);
  assert.deepEqual([tie.outcome, tie.auction.currentPrice], ['outbid', 2500000]);
  const over = await auctions.placeBid(user(2), id, 3000000);
  assert.deepEqual([over.outcome, over.auction.currentPrice, over.auction.leader.isYou], ['leading', 2550000, true]);

  const [note] = await query("SELECT Title, Link FROM Notifications WHERE UserID = @u AND Type = N'auction'", { u: [sql.Int, user(0)] });
  assert.equal(note.Title, 'Bạn vừa bị trả giá cao hơn');
  assert.equal(note.Link, `/dau-gia/${id}`);
  const saved = await row(id);
  assert.equal(Number(saved.BidCount), Number((await query('SELECT COUNT(*) AS N FROM AuctionBids WHERE AuctionID = @id', { id: [sql.Int, id] }))[0].N));
});

test('50 người trả giá và 50 lượt xem cùng lúc: không deadlock, không mất lượt, giá và người dẫn đầu đúng công thức, không ai lỗi ngoài "giá thấp"', async () => {
  const id = await open({ startingPrice: 1000000, bidIncrement: 10000 });
  // Mỗi người một giá tối đa khác nhau, gửi cùng lúc theo thứ tự xáo trộn.
  const bids = Array.from({ length: 50 }, (_, index) => ({ userId: user(index + 3), amount: 1000000 + (index + 1) * 37000 }))
    .sort(() => Math.random() - 0.5);
  // Cùng lúc có 50 lượt xem phiên (đọc giá, lịch sử) để bắt deadlock giữa người xem và người trả giá.
  const [results, views] = await Promise.all([
    Promise.allSettled(bids.map((bid) => auctions.placeBid(bid.userId, id, bid.amount))),
    Promise.allSettled(Array.from({ length: 50 }, () => auctions.getAuction(id))),
  ]);
  assert.deepEqual(views.filter((view) => view.status === 'rejected').map((view) => view.reason.message), []);
  const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  assert.ok(failures.every((err) => err.status === 400 && err.data?.code === 'bid_too_low'), failures.map((err) => err.message).join(' | '));

  const maxes = await query('SELECT UserID, MaxAmount FROM AuctionMaxBids WHERE AuctionID = @id ORDER BY MaxAmount DESC', { id: [sql.Int, id] });
  assert.equal(maxes.length, results.length - failures.length, 'mỗi lượt được nhận có đúng một giá tối đa');
  const saved = await row(id);
  const expected = Math.min(Number(maxes[0].MaxAmount), Number(maxes[1].MaxAmount) + 10000);
  assert.equal(Number(saved.CurrentPrice), expected);
  assert.equal(saved.LeaderUserID, maxes[0].UserID);
  assert.equal(Number(maxes[0].MaxAmount), 1000000 + 50 * 37000, 'giá tối đa cao nhất luôn được nhận');
  const history = await query('SELECT Amount, Kind FROM AuctionBids WHERE AuctionID = @id ORDER BY BidID', { id: [sql.Int, id] });
  assert.equal(Number(saved.BidCount), history.length);
  // Giá công khai của người dẫn đầu không bao giờ giảm theo thời gian.
  const leaderPrices = history.filter((bid, index) => bid.Kind === 'auto' || index === history.length - 1 || history[index + 1]?.Kind !== 'auto').map((bid) => Number(bid.Amount));
  assert.ok(leaderPrices.every((price, index) => index === 0 || price >= leaderPrices[index - 1] - 0), 'giá dẫn đầu không giảm');
});

test('một người bấm trả giá từ 5 tab cùng lúc: chỉ một lượt được nhận, còn lại bị từ chối rõ ràng', async () => {
  const id = await open();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => auctions.placeBid(user(55), id, 2200000)));
  const ok = results.filter((result) => result.status === 'fulfilled');
  assert.equal(ok.length, 1);
  assert.ok(results.filter((result) => result.status === 'rejected').every((result) => result.reason.data?.code === 'max_not_higher'));
  assert.equal(Number((await row(id)).BidCount), 1);
});

test('gia hạn phút chót: trả giá khi còn 30 giây thì phiên kéo dài tới 2 phút sau lượt trả', async () => {
  const id = await open();
  await query('UPDATE Auctions SET EndsAt = DATEADD(SECOND, 30, SYSDATETIME()), ScheduledEndsAt = DATEADD(SECOND, 30, SYSDATETIME()) WHERE AuctionID = @id', { id: [sql.Int, id] });
  const result = await auctions.placeBid(user(4), id, 2000000);
  assert.equal(result.extended, true);
  const saved = await row(id);
  const [clock] = await query('SELECT DATEDIFF(SECOND, SYSDATETIME(), EndsAt) AS SecondsLeft FROM Auctions WHERE AuctionID = @id', { id: [sql.Int, id] });
  assert.ok(clock.SecondsLeft >= 115 && clock.SecondsLeft <= 120, `còn ${clock.SecondsLeft} giây`);
  assert.ok(new Date(saved.EndsAt) > new Date(saved.ScheduledEndsAt));
});

test('10 người bấm "Mua ngay" cùng lúc: đúng một người thắng', async () => {
  const id = await open({ buyNowPrice: 3200000 });
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => auctions.buyNow(user(10 + index), id)));
  const winners = results.filter((result) => result.status === 'fulfilled');
  assert.equal(winners.length, 1);
  assert.ok(results.filter((result) => result.status === 'rejected').every((result) => result.reason.status === 409 && result.reason.data.code === 'auction_closed'));
  const saved = await row(id);
  assert.deepEqual([saved.Status, Number(saved.WinningPrice), Number((await query("SELECT COUNT(*) AS N FROM AuctionBids WHERE AuctionID = @id AND Kind = N'buy_now'", { id: [sql.Int, id] }))[0].N)], ['won', 3200000, 1]);
  await assert.rejects(auctions.placeBid(user(20), id, 4000000), (err) => err.status === 409);
});

test('hết giờ: phiên có người trả giá thì người dẫn đầu thắng; không ai trả thì trả hàng về kho', async () => {
  const sold = await open();
  await auctions.placeBid(user(30), sold, 2300000);
  await auctions.placeBid(user(31), sold, 2200000);
  await endNow(sold);
  const viewed = await auctions.getAuction(sold, user(30));
  assert.deepEqual([viewed.status, viewed.winner.isYou, viewed.winner.price], ['won', true, 2250000]);
  assert.ok(new Date(viewed.winner.paymentDueAt) > new Date(viewed.serverNow));
  const notes = await query("SELECT UserID, Title FROM Notifications WHERE UserID IN (@a, @b) AND Title LIKE N'%kết thúc%' OR (UserID = @a AND Title LIKE N'%thắng%')", { a: [sql.Int, user(30)], b: [sql.Int, user(31)] });
  assert.ok(notes.some((note) => note.UserID === user(30) && /thắng/.test(note.Title)));
  assert.ok(notes.some((note) => note.UserID === user(31)));

  const before = await stock();
  const unsold = await open();
  await endNow(unsold);
  const swept = await auctions.sweepDue();
  assert.ok(swept.finalized >= 1);
  assert.equal((await row(unsold)).Status, 'unsold');
  assert.equal(await stock(), before, 'mở phiên trừ 1, không bán được trả lại 1');
  ctx.soldAuctionId = sold;
});

test('đặt hàng theo giá thắng: đúng người, đúng giá, không trừ kho lần hai, không đặt hai lần; huỷ đơn trả hàng về kho', async () => {
  const id = ctx.soldAuctionId;
  await assert.rejects(auctions.getCheckoutQuote(user(31), id), (err) => err.status === 404);
  const quote = await auctions.getCheckoutQuote(user(30), id);
  assert.deepEqual([quote.items[0].unitPrice, quote.subtotal, quote.items[0].listPrice], [2250000, 2250000, 3000000]);

  const base = { items: [{ productId: ctx.productId, quantity: 1 }], paymentMethod: 'cod', shippingAddress: ADDRESS, auctionId: id };
  await assert.rejects(orderService.createOrder(user(31), base), (err) => err.status === 404);
  await assert.rejects(orderService.createOrder(user(30), { ...base, voucherCode: 'GIAM10' }), (err) => err.status === 400 && err.data.code === 'auction_no_voucher');
  await assert.rejects(orderService.createOrder(user(30), { ...base, items: [{ productId: ctx.productId, quantity: 2 }] }), (err) => err.data?.code === 'auction_item_mismatch');

  const before = await stock();
  const order = await orderService.createOrder(user(30), { ...base, expectedTotal: quote.total });
  ctx.orderIds.push(order.orderId);
  assert.equal(order.subtotal, 2250000);
  assert.equal(order.auctionId, id);
  assert.equal(await stock(), before, 'hàng đã giữ từ lúc mở phiên');
  const [item] = await query('SELECT UnitPrice, Quantity FROM OrderItems WHERE OrderID = @id', { id: [sql.Int, order.orderId] });
  assert.deepEqual([Number(item.UnitPrice), item.Quantity], [2250000, 1]);
  assert.deepEqual([(await row(id)).Status, (await row(id)).OrderID], ['ordered', order.orderId]);
  const detail = await orderService.getOrderById(order.orderId, user(30));
  assert.equal(detail.auctionId, id);
  await assert.rejects(orderService.createOrder(user(30), base), (err) => err.status === 409 && err.data.code === 'auction_already_ordered');

  await orderService.cancelOrder(order.orderId, user(30), 'Đổi ý');
  assert.equal(await stock(), before + 1, 'huỷ đơn đấu giá thì sản phẩm về kho bán thường');
});

test('người thắng không đặt hàng đúng hạn: phiên hết hạn, hàng về kho, không đặt được nữa', async () => {
  const id = await open();
  await auctions.placeBid(user(40), id, 2000000);
  await endNow(id);
  await auctions.sweepDue();
  await query('UPDATE Auctions SET PaymentDueAt = DATEADD(SECOND, -1, SYSDATETIME()) WHERE AuctionID = @id', { id: [sql.Int, id] });
  await assert.rejects(
    orderService.createOrder(user(40), { items: [{ productId: ctx.productId, quantity: 1 }], paymentMethod: 'cod', shippingAddress: ADDRESS, auctionId: id }),
    (err) => err.status === 410,
  );
  const before = await stock();
  const swept = await auctions.sweepDue();
  assert.ok(swept.expired >= 1);
  assert.equal((await row(id)).Status, 'expired');
  assert.equal(await stock(), before + 1);
});

test('quản trị huỷ phiên: trả hàng về kho, báo người đã trả giá, không trả giá được nữa', async () => {
  const id = await open();
  await auctions.placeBid(user(41), id, 2000000);
  const before = await stock();
  const cancelled = await auctions.cancelAuction(ctx.adminId, id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(await stock(), before + 1);
  const [note] = await query("SELECT Title FROM Notifications WHERE UserID = @u AND Title LIKE N'%huỷ%'", { u: [sql.Int, user(41)] });
  assert.ok(note);
  await assert.rejects(auctions.placeBid(user(42), id, 2500000), (err) => err.status === 409);
  await assert.rejects(auctions.cancelAuction(ctx.adminId, id), (err) => err.status === 409);
});

test('đang dẫn đầu thì chưa xoá được tài khoản; dữ liệu tải về có lượt trả giá', async () => {
  const id = await open();
  await auctions.placeBid(user(56), id, 2000000);
  const exported = await accountService.exportMyData(user(56));
  assert.equal(exported.auctionBids.length, 1);
  assert.equal(exported.auctionBids[0].AuctionID, id);
  const { hashPassword } = require('../../src/utils/hash');
  await query('UPDATE Users SET Password = @hash WHERE UserID = @u', { hash: [sql.NVarChar, await hashPassword('Dau-gia-123')], u: [sql.Int, user(56)] });
  await assert.rejects(accountService.deleteAccount(user(56), 'Dau-gia-123'), (err) => err.status === 409 && err.data.code === 'open_auctions');
});

test('luồng SSE: người đang xem nhận giá mới ngay sau lượt trả giá', async () => {
  const app = require('../../src/app');
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const id = await open();
  const controller = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auctions/${id}/events`, { signal: controller.signal });
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const nextUpdate = async () => {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed');
        buffer += decoder.decode(value, { stream: true });
      }
    };
    const initial = await nextUpdate();
    assert.equal(initial.currentPrice, null);
    const started = Date.now();
    await auctions.placeBid(user(44), id, 2400000);
    await auctions.placeBid(user(45), id, 2300000);
    let update = await nextUpdate();
    if (update.bidCount < 3) update = await nextUpdate();
    assert.equal(update.currentPrice, 2350000);
    assert.equal(update.bidCount, 3);
    assert.equal(update.history[0].kind, 'auto');
    assert.ok(update.history.every((bid) => bid.name !== `Khách 44 ${tag}`), 'tên người trả giá được ẩn');
    assert.ok(Date.now() - started < 2000);
  } finally {
    controller.abort();
    await new Promise((resolve) => server.close(resolve));
  }
});
