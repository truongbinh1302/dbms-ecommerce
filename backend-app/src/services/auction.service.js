const { EventEmitter } = require('events');
const { getPool, sql } = require('../config/db.sql');
const inventoryService = require('./inventory.service');
const pricing = require('./pricing.service');
const { parseJson } = require('../utils/productFormat');
const {
  MAX_PRICE,
  toAmount,
  minimumBid,
  resolveLeader,
  extendedEnd,
  maskName,
  validateAuctionInput,
} = require('../utils/auction');

/*
  Đấu giá. Mọi thao tác ghi khoá theo cùng thứ tự Users → Auctions → Products để không tạo vòng chờ:
  - trả giá / mua ngay: khoá dòng Users (UPDLOCK) rồi dòng Auctions (XLOCK, xem lockAuction). Hai người trả giá cùng lúc
    cho một phiên phải chờ nhau ở dòng Auctions, nên người sau luôn thấy giá của người trước.
  - kết thúc phiên, huỷ phiên, hết hạn đặt hàng: khoá Auctions rồi mới trả hàng về kho (Products).
  - đặt hàng cho phiên đã thắng (order.service): Users → Auctions → Products.
  Giờ luôn lấy từ máy chủ DB (SYSDATETIME) để mọi máy chủ ứng dụng thấy cùng một đồng hồ.
  Sau mỗi thay đổi phát sự kiện 'change' để luồng SSE đẩy giá mới cho người đang xem.
*/

const events = new EventEmitter();
events.setMaxListeners(0);
const publish = (auctionId) => events.emit('change', Number(auctionId));

const PAYMENT_HOURS = Number(process.env.AUCTION_PAYMENT_HOURS) > 0 ? Number(process.env.AUCTION_PAYMENT_HOURS) : 24;
const HISTORY_LIMIT = 30;
const RAM_TYPES = ['ram', 'laptop_ram'];

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const money = (value) => `${String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
const num = (value) => (value === null || value === undefined ? null : Number(value));

const safeRollback = async (transaction) => {
  try {
    await transaction.rollback();
  } catch {
    // Transaction đã bị SQL Server huỷ (deadlock, timeout): không còn gì để rollback.
  }
};

const runInTransaction = async (work) => {
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

const notifyUsers = (runner, userIds, { title, body, link }) => {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))];
  if (ids.length === 0) return Promise.resolve();
  const request = new sql.Request(runner)
    .input('title', sql.NVarChar(200), String(title).slice(0, 200))
    .input('body', sql.NVarChar(500), body ? String(body).slice(0, 500) : null)
    .input('link', sql.NVarChar(200), link);
  ids.forEach((id, index) => request.input(`u${index}`, sql.Int, id));
  return request.query(`
    INSERT INTO Notifications (UserID, Type, Title, Body, Link)
    SELECT UserID, N'auction', @title, @body, @link FROM Users
    WHERE UserID IN (${ids.map((_, index) => `@u${index}`).join(', ')}) AND IsActive = 1;
  `);
};

/* ------------------------------ Đọc ------------------------------ */

const SELECT_AUCTION = `
  SELECT a.AuctionID, a.ProductID, a.Title, a.Description, a.StartingPrice, a.BidIncrement, a.BuyNowPrice,
         a.StartsAt, a.EndsAt, a.ScheduledEndsAt, a.ExtendSeconds, a.Status, a.CurrentPrice, a.LeaderUserID,
         a.BidCount, a.WinnerUserID, a.WinningPrice, a.EndedAt, a.PaymentDueAt, a.OrderID, a.Version, a.CreatedAt,
         p.Name AS ProductName, p.Slug, p.Brand, p.Images, p.Price AS ListPrice, p.Specs,
         c.Name AS CategoryName, cs.ComponentType, cs.MemoryType, cs.CapacityGB, cs.Modules,
         leader.FullName AS LeaderName, winner.FullName AS WinnerName, o.OrderCode,
         (SELECT COUNT(*) FROM AuctionMaxBids m WHERE m.AuctionID = a.AuctionID) AS Bidders,
         SYSDATETIME() AS ServerNow
  FROM Auctions a
  JOIN Products p ON p.ProductID = a.ProductID
  LEFT JOIN Categories c ON c.CategoryID = p.CategoryID
  LEFT JOIN ComponentSpecs cs ON cs.ProductID = p.ProductID
  LEFT JOIN Users leader ON leader.UserID = a.LeaderUserID
  LEFT JOIN Users winner ON winner.UserID = a.WinnerUserID
  LEFT JOIN Orders o ON o.OrderID = a.OrderID
`;

const phaseOf = (row) => {
  if (row.Status !== 'active') return row.Status;
  const now = new Date(row.ServerNow).getTime();
  if (now < new Date(row.StartsAt).getTime()) return 'upcoming';
  if (now < new Date(row.EndsAt).getTime()) return 'running';
  return 'closing';
};

/** Dòng SQL → dữ liệu công khai. userId: người đang xem (để đánh dấu "Bạn"), admin: hiện tên thật. */
const toAuction = (row, { userId = null, admin = false } = {}) => {
  const phase = phaseOf(row);
  const viewer = userId ? Number(userId) : null;
  const currentPrice = num(row.CurrentPrice);
  const buyNowPrice = num(row.BuyNowPrice);
  const isRam = RAM_TYPES.includes(row.ComponentType);
  const won = ['won', 'ordered', 'expired'].includes(row.Status) && row.WinnerUserID;
  return {
    id: Number(row.AuctionID),
    title: row.Title,
    description: row.Description,
    status: row.Status,
    phase,
    product: {
      id: Number(row.ProductID),
      name: row.ProductName,
      slug: row.Slug,
      brand: row.Brand,
      image: parseJson(row.Images, [])[0] || null,
      listPrice: num(row.ListPrice),
      category: row.CategoryName || null,
      specs: parseJson(row.Specs, []).slice(0, 6),
      ram: isRam ? { memoryType: row.MemoryType, capacityGB: num(row.CapacityGB), modules: num(row.Modules), laptop: row.ComponentType === 'laptop_ram' } : null,
    },
    startingPrice: num(row.StartingPrice),
    bidIncrement: num(row.BidIncrement),
    buyNowPrice: phase === 'running' && buyNowPrice && (currentPrice === null || currentPrice < buyNowPrice) ? buyNowPrice : null,
    currentPrice,
    bidCount: Number(row.BidCount),
    bidders: Number(row.Bidders || 0),
    minimumBid: phase === 'running' ? minimumBid({ bidCount: Number(row.BidCount), currentPrice, startingPrice: row.StartingPrice, bidIncrement: row.BidIncrement }) : null,
    leader: row.LeaderUserID ? {
      name: admin ? row.LeaderName : maskName(row.LeaderName),
      isYou: viewer === Number(row.LeaderUserID),
    } : null,
    startsAt: row.StartsAt,
    endsAt: row.EndsAt,
    scheduledEndsAt: row.ScheduledEndsAt,
    extendSeconds: Number(row.ExtendSeconds),
    extended: new Date(row.EndsAt).getTime() > new Date(row.ScheduledEndsAt).getTime(),
    endedAt: row.EndedAt,
    winner: won ? {
      name: admin ? row.WinnerName : maskName(row.WinnerName),
      isYou: viewer === Number(row.WinnerUserID),
      price: num(row.WinningPrice),
      paymentDueAt: row.PaymentDueAt,
      ...((admin || viewer === Number(row.WinnerUserID)) && row.OrderID ? { orderId: Number(row.OrderID), orderCode: row.OrderCode } : {}),
    } : null,
    version: Number(row.Version),
    serverNow: row.ServerNow,
  };
};

const loadRow = async (runner, auctionId) => {
  const result = await new sql.Request(runner)
    .input('id', sql.Int, Number(auctionId))
    .query(`${SELECT_AUCTION} WHERE a.AuctionID = @id`);
  return result.recordset[0] || null;
};

const loadHistory = async (auctionId, userId = null, limit = HISTORY_LIMIT) => {
  const result = await new sql.Request(getPool())
    .input('id', sql.Int, Number(auctionId))
    .input('limit', sql.Int, limit)
    .query(`
      SELECT TOP (@limit) b.BidID, b.UserID, b.Amount, b.Kind, b.CreatedAt, u.FullName
      FROM AuctionBids b JOIN Users u ON u.UserID = b.UserID
      WHERE b.AuctionID = @id
      ORDER BY b.BidID DESC
    `);
  return result.recordset.map((row) => ({
    id: Number(row.BidID),
    name: userId && Number(row.UserID) === Number(userId) ? 'Bạn' : maskName(row.FullName),
    isYou: Boolean(userId && Number(row.UserID) === Number(userId)),
    amount: Number(row.Amount),
    kind: row.Kind,
    at: row.CreatedAt,
  }));
};

/** Ảnh chụp công khai để đẩy qua SSE (không gắn với người xem). */
const getSnapshot = async (auctionId) => {
  const row = await loadRow(getPool(), auctionId);
  if (!row) return null;
  return { ...toAuction(row), history: await loadHistory(auctionId, null, 10) };
};

const getAuction = async (auctionId, userId = null) => {
  const id = Number(auctionId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(404, 'Không tìm thấy phiên đấu giá');
  let row = await loadRow(getPool(), id);
  if (!row) throw createHttpError(404, 'Không tìm thấy phiên đấu giá');
  // Phiên vừa hết giờ mà lượt quét định kỳ chưa tới: chốt luôn để khách thấy kết quả ngay.
  // Chỉ khoá dòng khi thật sự cần chốt, để người xem không tranh khoá với người đang trả giá.
  if (phaseOf(row) === 'closing' && await finalizeAuction(id)) row = await loadRow(getPool(), id);
  const auction = toAuction(row, { userId });
  let myMax = null;
  if (userId) {
    const mine = await new sql.Request(getPool())
      .input('id', sql.Int, id)
      .input('userId', sql.Int, Number(userId))
      .query('SELECT MaxAmount FROM AuctionMaxBids WHERE AuctionID = @id AND UserID = @userId');
    myMax = mine.recordset[0] ? Number(mine.recordset[0].MaxAmount) : null;
  }
  return { ...auction, myMax, history: await loadHistory(id, userId) };
};

const LIST_FILTERS = {
  running: "a.Status = N'active' AND a.StartsAt <= SYSDATETIME() AND a.EndsAt > SYSDATETIME()",
  upcoming: "a.Status = N'active' AND a.StartsAt > SYSDATETIME()",
  ended: "a.Status <> N'active'",
  all: '1 = 1',
};
const LIST_ORDER = {
  running: 'a.EndsAt ASC',
  upcoming: 'a.StartsAt ASC',
  ended: 'a.EndedAt DESC, a.AuctionID DESC',
  all: 'a.AuctionID DESC',
};

const listAuctions = async ({ phase = 'running', category = null, mine = false, page = 1, limit = 12 } = {}, userId = null) => {
  await sweepDue();
  const key = Object.hasOwn(LIST_FILTERS, phase) ? phase : 'running';
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 12, 1), 50);
  const where = [LIST_FILTERS[key]];
  if (category === 'ram') where.push("cs.ComponentType IN (N'ram', N'laptop_ram')");
  const request = new sql.Request(getPool())
    .input('offset', sql.Int, (pageNum - 1) * pageSize)
    .input('limit', sql.Int, pageSize);
  if (mine) {
    if (!userId) return { items: [], total: 0, page: pageNum, limit: pageSize };
    request.input('userId', sql.Int, Number(userId));
    where.push('(EXISTS (SELECT 1 FROM AuctionMaxBids mm WHERE mm.AuctionID = a.AuctionID AND mm.UserID = @userId) OR a.WinnerUserID = @userId)');
  }
  const whereSql = where.join(' AND ');
  const result = await request.query(`
    ${SELECT_AUCTION}
    WHERE ${whereSql}
    ORDER BY ${LIST_ORDER[key]}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    SELECT COUNT(*) AS Total
    FROM Auctions a JOIN Products p ON p.ProductID = a.ProductID LEFT JOIN ComponentSpecs cs ON cs.ProductID = p.ProductID
    WHERE ${whereSql};
  `);
  return {
    items: result.recordsets[0].map((row) => toAuction(row, { userId })),
    total: Number(result.recordsets[1][0].Total),
    page: pageNum,
    limit: pageSize,
  };
};

/* ------------------------------ Trả giá ------------------------------ */

const lockUser = async (transaction, userId) => {
  const result = await new sql.Request(transaction)
    .input('userId', sql.Int, Number(userId))
    .query('SELECT UserID FROM Users WITH (UPDLOCK, ROWLOCK) WHERE UserID = @userId AND IsActive = 1');
  if (!result.recordset[0]) throw createHttpError(401, 'Tài khoản không hợp lệ');
};

/*
  Khoá dòng phiên bằng XLOCK (độc quyền) ngay từ đầu, không dùng UPDLOCK.
  Bài test 50 người trả giá cùng lúc từng gặp deadlock với UPDLOCK: một người XEM phiên giữ khoá S trên dòng
  Auctions trong lúc đọc AuctionMaxBids, còn người TRẢ GIÁ đã ghi AuctionMaxBids (khoá X) và chờ đổi U → X trên
  dòng Auctions. Giữ X từ đầu thì người xem chờ ngay ở dòng Auctions, không giữ gì người trả giá cần, nên hết vòng chờ.
*/
const lockAuction = async (transaction, auctionId) => {
  const result = await new sql.Request(transaction)
    .input('id', sql.Int, Number(auctionId))
    .query(`
      SELECT AuctionID, ProductID, Title, Status, StartsAt, EndsAt, ExtendSeconds, StartingPrice, BidIncrement,
             BuyNowPrice, CurrentPrice, LeaderUserID, BidCount, WinnerUserID, WinningPrice, PaymentDueAt, OrderID,
             SYSDATETIME() AS Now
      FROM Auctions WITH (XLOCK, ROWLOCK)
      WHERE AuctionID = @id
    `);
  return result.recordset[0] || null;
};

const assertRunning = (auction) => {
  if (!auction) throw createHttpError(404, 'Không tìm thấy phiên đấu giá');
  const now = new Date(auction.Now).getTime();
  if (auction.Status !== 'active' || now >= new Date(auction.EndsAt).getTime()) {
    throw createHttpError(409, 'Phiên đấu giá đã kết thúc', { code: 'auction_closed' });
  }
  if (now < new Date(auction.StartsAt).getTime()) {
    throw createHttpError(409, 'Phiên đấu giá chưa bắt đầu', { code: 'auction_not_started', startsAt: auction.StartsAt });
  }
};

/**
 * Trả giá: amount là GIÁ TỐI ĐA khách chịu trả. Hệ thống chỉ dùng tới mức cần để dẫn đầu.
 * Trả về outcome: 'leading' (đang dẫn đầu), 'outbid' (giá tối đa của người khác cao hơn), 'raised' (người đang dẫn nâng giá tối đa).
 */
const placeBid = async (userId, auctionId, rawAmount) => {
  const amount = toAmount(rawAmount);
  if (!amount || amount <= 0 || amount > MAX_PRICE) throw createHttpError(400, 'Giá không hợp lệ');

  const outcome = await runInTransaction(async (transaction) => {
    await lockUser(transaction, userId);
    const auction = await lockAuction(transaction, auctionId);
    assertRunning(auction);
    const id = Number(auction.AuctionID);
    const uid = Number(userId);
    const now = auction.Now;

    const mineResult = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('userId', sql.Int, uid)
      .query('SELECT MaxAmount FROM AuctionMaxBids WHERE AuctionID = @id AND UserID = @userId');
    const myMax = mineResult.recordset[0] ? Number(mineResult.recordset[0].MaxAmount) : null;

    // Người đang dẫn đầu nâng giá tối đa: giá hiện tại giữ nguyên (không tự đẩy giá của chính mình lên).
    if (auction.LeaderUserID && Number(auction.LeaderUserID) === uid) {
      if (myMax !== null && amount <= myMax) {
        throw createHttpError(400, `Bạn đang dẫn đầu với giá tối đa ${money(myMax)}. Muốn nâng thì nhập mức cao hơn.`, { code: 'max_not_higher', myMax });
      }
      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('userId', sql.Int, uid)
        .input('amount', sql.Decimal(18, 2), amount)
        .query('UPDATE AuctionMaxBids SET MaxAmount = @amount WHERE AuctionID = @id AND UserID = @userId');
      return { id, outcome: 'raised', price: Number(auction.CurrentPrice), changed: false };
    }

    const minimum = minimumBid({
      bidCount: Number(auction.BidCount),
      currentPrice: num(auction.CurrentPrice),
      startingPrice: auction.StartingPrice,
      bidIncrement: auction.BidIncrement,
    });
    if (amount < minimum) {
      throw createHttpError(400, `Giá tối thiểu lúc này là ${money(minimum)}`, { code: 'bid_too_low', minimum });
    }

    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('userId', sql.Int, uid)
      .input('amount', sql.Decimal(18, 2), amount)
      .input('now', sql.DateTime2(3), now)
      .query(`
        UPDATE AuctionMaxBids SET MaxAmount = @amount, Since = @now WHERE AuctionID = @id AND UserID = @userId;
        IF @@ROWCOUNT = 0
          INSERT INTO AuctionMaxBids (AuctionID, UserID, MaxAmount, Since) VALUES (@id, @userId, @amount, @now);
      `);

    const top = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`
        SELECT TOP 2 UserID, MaxAmount, Since FROM AuctionMaxBids
        WHERE AuctionID = @id ORDER BY MaxAmount DESC, Since ASC, UserID ASC
      `);
    const leader = resolveLeader({
      startingPrice: auction.StartingPrice,
      bidIncrement: auction.BidIncrement,
      maxBids: top.recordset.map((row) => ({ userId: Number(row.UserID), maxAmount: Number(row.MaxAmount), since: row.Since })),
    });

    // Lịch sử công khai: lượt của khách, và nếu giá tối đa của người dẫn đầu cao hơn thì thêm lượt hệ thống trả thay.
    const rows = leader.leaderUserId === uid
      ? [{ userId: uid, amount: leader.price, kind: 'bid' }]
      : [{ userId: uid, amount, kind: 'bid' }, { userId: leader.leaderUserId, amount: leader.price, kind: 'auto' }];
    for (const row of rows) {
      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .input('userId', sql.Int, row.userId)
        .input('amount', sql.Decimal(18, 2), row.amount)
        .input('kind', sql.NVarChar(10), row.kind)
        .query('INSERT INTO AuctionBids (AuctionID, UserID, Amount, Kind) VALUES (@id, @userId, @amount, @kind)');
    }

    const endsAt = extendedEnd(auction.EndsAt, now, Number(auction.ExtendSeconds));
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('price', sql.Decimal(18, 2), leader.price)
      .input('leader', sql.Int, leader.leaderUserId)
      .input('count', sql.Int, rows.length)
      .input('endsAt', sql.DateTime2(3), endsAt)
      .query(`
        UPDATE Auctions
        SET CurrentPrice = @price, LeaderUserID = @leader, BidCount = BidCount + @count,
            EndsAt = @endsAt, Version = Version + 1, UpdatedAt = SYSDATETIME()
        WHERE AuctionID = @id
      `);

    const previousLeader = auction.LeaderUserID ? Number(auction.LeaderUserID) : null;
    if (previousLeader && previousLeader !== leader.leaderUserId) {
      await notifyUsers(transaction, [previousLeader], {
        title: 'Bạn vừa bị trả giá cao hơn',
        body: `${auction.Title}: giá hiện tại ${money(leader.price)}. Trả giá lại trước khi phiên kết thúc.`,
        link: `/dau-gia/${id}`,
      });
    }
    return {
      id,
      outcome: leader.leaderUserId === uid ? 'leading' : 'outbid',
      price: leader.price,
      extended: endsAt.getTime() > new Date(auction.EndsAt).getTime(),
      changed: true,
    };
  });

  if (outcome.changed) publish(outcome.id);
  return { outcome: outcome.outcome, price: outcome.price, extended: Boolean(outcome.extended), auction: await getAuction(outcome.id, userId) };
};

/** Mua ngay theo giá BuyNowPrice: phiên kết thúc ngay, người mua thắng. */
const buyNow = async (userId, auctionId) => {
  const id = await runInTransaction(async (transaction) => {
    await lockUser(transaction, userId);
    const auction = await lockAuction(transaction, auctionId);
    assertRunning(auction);
    const price = num(auction.BuyNowPrice);
    if (!price) throw createHttpError(400, 'Phiên này không có giá mua ngay');
    if (auction.CurrentPrice !== null && Number(auction.CurrentPrice) >= price) {
      throw createHttpError(409, 'Giá đấu đã vượt giá mua ngay, hãy trả giá', { code: 'buy_now_closed' });
    }
    const auctionKey = Number(auction.AuctionID);
    await new sql.Request(transaction)
      .input('id', sql.Int, auctionKey)
      .input('userId', sql.Int, Number(userId))
      .input('price', sql.Decimal(18, 2), price)
      .input('hours', sql.Int, PAYMENT_HOURS)
      .query(`
        INSERT INTO AuctionBids (AuctionID, UserID, Amount, Kind) VALUES (@id, @userId, @price, N'buy_now');
        UPDATE Auctions
        SET Status = N'won', CurrentPrice = @price, LeaderUserID = @userId, BidCount = BidCount + 1,
            WinnerUserID = @userId, WinningPrice = @price, EndedAt = SYSDATETIME(),
            PaymentDueAt = DATEADD(HOUR, @hours, SYSDATETIME()), Version = Version + 1, UpdatedAt = SYSDATETIME()
        WHERE AuctionID = @id;
      `);
    const others = await new sql.Request(transaction)
      .input('id', sql.Int, auctionKey)
      .input('userId', sql.Int, Number(userId))
      .query('SELECT UserID FROM AuctionMaxBids WHERE AuctionID = @id AND UserID <> @userId');
    await notifyUsers(transaction, others.recordset.map((row) => row.UserID), {
      title: 'Phiên đấu giá đã kết thúc',
      body: `${auction.Title}: một khách đã mua ngay với giá ${money(price)}.`,
      link: `/dau-gia/${auctionKey}`,
    });
    await notifyUsers(transaction, [userId], {
      title: 'Bạn đã mua ngay thành công',
      body: `${auction.Title}: ${money(price)}. Hãy đặt hàng trong ${PAYMENT_HOURS} giờ để giữ quyền mua.`,
      link: `/dau-gia/${auctionKey}`,
    });
    return auctionKey;
  });
  publish(id);
  return getAuction(id, userId);
};

/* --------------------------- Kết thúc phiên --------------------------- */

/** Chốt một phiên đã hết giờ. Trả true nếu vừa chốt. Gọi lặp lại an toàn (chỉ chốt phiên còn 'active'). */
async function finalizeAuction(auctionId) {
  const done = await runInTransaction(async (transaction) => {
    const auction = await lockAuction(transaction, auctionId);
    if (!auction || auction.Status !== 'active' || new Date(auction.Now).getTime() < new Date(auction.EndsAt).getTime()) return false;
    const id = Number(auction.AuctionID);
    if (!auction.LeaderUserID) {
      await new sql.Request(transaction)
        .input('id', sql.Int, id)
        .query(`UPDATE Auctions SET Status = N'unsold', EndedAt = EndsAt, Version = Version + 1, UpdatedAt = SYSDATETIME() WHERE AuctionID = @id`);
      await inventoryService.changeStock(transaction, { productId: auction.ProductID, change: 1, reason: 'auction', note: `Phiên đấu giá #${id} không có người trả giá` });
      return true;
    }
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('hours', sql.Int, PAYMENT_HOURS)
      .query(`
        UPDATE Auctions
        SET Status = N'won', WinnerUserID = LeaderUserID, WinningPrice = CurrentPrice, EndedAt = EndsAt,
            PaymentDueAt = DATEADD(HOUR, @hours, SYSDATETIME()), Version = Version + 1, UpdatedAt = SYSDATETIME()
        WHERE AuctionID = @id
      `);
    await notifyUsers(transaction, [auction.LeaderUserID], {
      title: 'Bạn đã thắng phiên đấu giá',
      body: `${auction.Title}: ${money(auction.CurrentPrice)}. Hãy đặt hàng trong ${PAYMENT_HOURS} giờ để giữ quyền mua.`,
      link: `/dau-gia/${id}`,
    });
    const others = await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .input('userId', sql.Int, Number(auction.LeaderUserID))
      .query('SELECT UserID FROM AuctionMaxBids WHERE AuctionID = @id AND UserID <> @userId');
    await notifyUsers(transaction, others.recordset.map((row) => row.UserID), {
      title: 'Phiên đấu giá đã kết thúc',
      body: `${auction.Title}: giá thắng ${money(auction.CurrentPrice)}.`,
      link: `/dau-gia/${id}`,
    });
    return true;
  });
  if (done) publish(auctionId);
  return done;
}

/** Người thắng không đặt hàng trước hạn: phiên hết hạn, hàng về kho. */
const expireUnpaid = async (auctionId) => {
  const done = await runInTransaction(async (transaction) => {
    const auction = await lockAuction(transaction, auctionId);
    if (!auction || auction.Status !== 'won' || new Date(auction.Now).getTime() < new Date(auction.PaymentDueAt).getTime()) return false;
    const id = Number(auction.AuctionID);
    await new sql.Request(transaction)
      .input('id', sql.Int, id)
      .query(`UPDATE Auctions SET Status = N'expired', Version = Version + 1, UpdatedAt = SYSDATETIME() WHERE AuctionID = @id`);
    await inventoryService.changeStock(transaction, { productId: auction.ProductID, change: 1, reason: 'auction', note: `Phiên đấu giá #${id}: người thắng không đặt hàng đúng hạn` });
    await notifyUsers(transaction, [auction.WinnerUserID], {
      title: 'Đã hết hạn đặt hàng phiên đấu giá',
      body: `${auction.Title}: quá ${PAYMENT_HOURS} giờ chưa đặt hàng nên quyền mua đã bị huỷ.`,
      link: `/dau-gia/${id}`,
    });
    return true;
  });
  if (done) publish(auctionId);
  return done;
};

/** Quét định kỳ: chốt phiên hết giờ và huỷ quyền mua quá hạn. */
async function sweepDue() {
  const due = await new sql.Request(getPool()).query(`
    SELECT AuctionID, Status FROM Auctions
    WHERE (Status = N'active' AND EndsAt <= SYSDATETIME()) OR (Status = N'won' AND PaymentDueAt <= SYSDATETIME())
  `);
  let finalized = 0;
  let expired = 0;
  for (const row of due.recordset) {
    if (row.Status === 'active' && await finalizeAuction(row.AuctionID)) finalized += 1;
    if (row.Status === 'won' && await expireUnpaid(row.AuctionID)) expired += 1;
  }
  return { finalized, expired };
}

/* ------------------------------ Quản trị ------------------------------ */

const createAuction = async (adminId, raw = {}) => {
  const clock = await new sql.Request(getPool()).query('SELECT SYSDATETIME() AS Now');
  const { errors, value } = validateAuctionInput(raw, clock.recordset[0].Now);
  if (errors.length) throw createHttpError(400, errors[0], { errors });

  const id = await runInTransaction(async (transaction) => {
    const product = await new sql.Request(transaction)
      .input('productId', sql.Int, value.productId)
      .query('SELECT ProductID, Name, Stock FROM Products WITH (UPDLOCK, ROWLOCK) WHERE ProductID = @productId AND IsDeleted = 0');
    const row = product.recordset[0];
    if (!row) throw createHttpError(404, 'Không tìm thấy sản phẩm');
    if (Number(row.Stock) < 1) throw createHttpError(409, 'Sản phẩm đã hết hàng, không mở phiên được', { code: 'out_of_stock' });
    const inserted = await new sql.Request(transaction)
      .input('productId', sql.Int, value.productId)
      .input('title', sql.NVarChar(150), value.title || row.Name)
      .input('description', sql.NVarChar(1000), value.description)
      .input('startingPrice', sql.Decimal(18, 2), value.startingPrice)
      .input('bidIncrement', sql.Decimal(18, 2), value.bidIncrement)
      .input('buyNowPrice', sql.Decimal(18, 2), value.buyNowPrice)
      .input('startsAt', sql.DateTime2(3), value.startsAt)
      .input('endsAt', sql.DateTime2(3), value.endsAt)
      .input('extendSeconds', sql.Int, value.extendSeconds)
      .input('adminId', sql.Int, adminId ? Number(adminId) : null)
      .query(`
        INSERT INTO Auctions (ProductID, Title, Description, StartingPrice, BidIncrement, BuyNowPrice, StartsAt, EndsAt, ScheduledEndsAt, ExtendSeconds, CreatedBy)
        OUTPUT INSERTED.AuctionID
        VALUES (@productId, @title, @description, @startingPrice, @bidIncrement, @buyNowPrice, @startsAt, @endsAt, @endsAt, @extendSeconds, @adminId)
      `);
    const auctionId = Number(inserted.recordset[0].AuctionID);
    await inventoryService.changeStock(transaction, { productId: value.productId, change: -1, reason: 'auction', note: `Giữ cho phiên đấu giá #${auctionId}`, userId: adminId });
    return auctionId;
  });
  publish(id);
  return toAuction(await loadRow(getPool(), id), { admin: true });
};

const cancelAuction = async (adminId, auctionId) => {
  const id = await runInTransaction(async (transaction) => {
    const auction = await lockAuction(transaction, auctionId);
    if (!auction) throw createHttpError(404, 'Không tìm thấy phiên đấu giá');
    if (auction.Status !== 'active') throw createHttpError(409, 'Chỉ huỷ được phiên chưa kết thúc', { code: 'not_active' });
    const key = Number(auction.AuctionID);
    await new sql.Request(transaction)
      .input('id', sql.Int, key)
      .query(`UPDATE Auctions SET Status = N'cancelled', EndedAt = SYSDATETIME(), Version = Version + 1, UpdatedAt = SYSDATETIME() WHERE AuctionID = @id`);
    await inventoryService.changeStock(transaction, { productId: auction.ProductID, change: 1, reason: 'auction', note: `Huỷ phiên đấu giá #${key}`, userId: adminId });
    const bidders = await new sql.Request(transaction).input('id', sql.Int, key).query('SELECT UserID FROM AuctionMaxBids WHERE AuctionID = @id');
    await notifyUsers(transaction, bidders.recordset.map((row) => row.UserID), {
      title: 'Phiên đấu giá đã bị huỷ',
      body: `${auction.Title}: cửa hàng đã huỷ phiên, bạn không phải trả tiền.`,
      link: `/dau-gia/${key}`,
    });
    return key;
  });
  publish(id);
  return toAuction(await loadRow(getPool(), id), { admin: true });
};

const listForAdmin = async ({ status = '', page = 1, limit = 20 } = {}) => {
  await sweepDue();
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const request = new sql.Request(getPool()).input('offset', sql.Int, (pageNum - 1) * pageSize).input('limit', sql.Int, pageSize);
  let where = '1 = 1';
  if (['active', 'won', 'ordered', 'unsold', 'expired', 'cancelled'].includes(status)) {
    request.input('status', sql.NVarChar(20), status);
    where = 'a.Status = @status';
  }
  const result = await request.query(`
    ${SELECT_AUCTION} WHERE ${where} ORDER BY a.AuctionID DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    SELECT COUNT(*) AS Total FROM Auctions a WHERE ${where};
  `);
  return {
    items: result.recordsets[0].map((row) => toAuction(row, { admin: true })),
    total: Number(result.recordsets[1][0].Total),
    page: pageNum,
    limit: pageSize,
  };
};

/* --------------------------- Đặt hàng sau khi thắng --------------------------- */

/** Khoá phiên người dùng đã thắng để đặt hàng (gọi trong transaction của createOrder, sau khi khoá Users). */
const lockForOrder = async (transaction, userId, auctionId) => {
  const auction = await lockAuction(transaction, auctionId);
  if (!auction || Number(auction.WinnerUserID) !== Number(userId)) {
    throw createHttpError(404, 'Không tìm thấy phiên bạn đã thắng', { code: 'auction_not_won' });
  }
  if (auction.Status === 'ordered') {
    throw createHttpError(409, 'Phiên này đã được đặt hàng', { code: 'auction_already_ordered', orderId: auction.OrderID });
  }
  if (auction.Status !== 'won' || new Date(auction.Now).getTime() >= new Date(auction.PaymentDueAt).getTime()) {
    throw createHttpError(410, 'Đã hết hạn đặt hàng cho phiên đấu giá này', { code: 'auction_payment_expired' });
  }
  return { auctionId: Number(auction.AuctionID), productId: Number(auction.ProductID), price: Number(auction.WinningPrice) };
};

const markOrdered = async (transaction, auctionId, orderId) => {
  await new sql.Request(transaction)
    .input('id', sql.Int, Number(auctionId))
    .input('orderId', sql.Int, Number(orderId))
    .query(`UPDATE Auctions SET Status = N'ordered', OrderID = @orderId, Version = Version + 1, UpdatedAt = SYSDATETIME() WHERE AuctionID = @id`);
};

/** Báo giá trang thanh toán cho phiên đã thắng (cùng dạng với báo giá giỏ hàng). */
const getCheckoutQuote = async (userId, auctionId) => {
  const auction = await getAuction(auctionId, userId);
  if (!auction.winner?.isYou) throw createHttpError(404, 'Không tìm thấy phiên bạn đã thắng', { code: 'auction_not_won' });
  if (auction.status === 'ordered') throw createHttpError(409, 'Phiên này đã được đặt hàng', { code: 'auction_already_ordered', orderId: auction.winner.orderId });
  if (auction.status !== 'won' || new Date(auction.winner.paymentDueAt).getTime() <= new Date(auction.serverNow).getTime()) {
    throw createHttpError(410, 'Đã hết hạn đặt hàng cho phiên đấu giá này', { code: 'auction_payment_expired' });
  }
  const price = auction.winner.price;
  return {
    auction,
    items: [{
      productId: auction.product.id,
      name: auction.product.name,
      quantity: 1,
      listPrice: auction.product.listPrice,
      unitPrice: price,
      lineTotal: price,
      auction: { id: auction.id },
    }],
    issues: [],
    ...pricing.buildQuote(price, null),
    voucher: null,
    voucherError: null,
    priceLock: null,
    priceLockError: null,
  };
};

module.exports = {
  events,
  PAYMENT_HOURS,
  toAuction,
  getAuction,
  getSnapshot,
  listAuctions,
  placeBid,
  buyNow,
  finalizeAuction,
  expireUnpaid,
  sweepDue,
  createAuction,
  cancelAuction,
  listForAdmin,
  lockForOrder,
  markOrdered,
  getCheckoutQuote,
};
