const auctionService = require('../services/auction.service');
const { success, error } = require('../utils/response');

const handle = (fn, message, statusCode = 200) => async (req, res) => {
  try {
    return success(res, await fn(req), message, statusCode);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

const viewer = (req) => (req.user ? req.user.id : null);

/*
  Luồng giá trực tiếp (Server-Sent Events): GET /auctions/:id/events.
  Mỗi phiên có một nhóm người xem. Có thay đổi thì đọc ảnh chụp công khai MỘT lần rồi gửi cho cả nhóm;
  nhiều lượt trả giá dồn dập trong 150 ms được gộp thành một lần gửi. Thông tin riêng (giá tối đa của bạn)
  không đi qua luồng này; trình duyệt tự tải lại khi nhận sự kiện.
*/
const MAX_STREAMS = 1000;
const HEARTBEAT_MS = 25000;
const COALESCE_MS = 150;
const viewers = new Map(); // auctionId → Set<res>
const pending = new Map(); // auctionId → timer
let streamCount = 0;

const broadcast = async (auctionId) => {
  pending.delete(auctionId);
  const group = viewers.get(auctionId);
  if (!group || group.size === 0) return;
  try {
    const snapshot = await auctionService.getSnapshot(auctionId);
    if (!snapshot) return;
    const frame = `event: update\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of group) res.write(frame);
  } catch (err) {
    console.warn('[auction-stream] snapshot failed:', err.message);
  }
};

auctionService.events.on('change', (auctionId) => {
  if (!viewers.has(auctionId) || pending.has(auctionId)) return;
  pending.set(auctionId, setTimeout(() => broadcast(auctionId), COALESCE_MS));
});

const stream = async (req, res) => {
  const auctionId = Number(req.params.id);
  if (!Number.isInteger(auctionId) || auctionId <= 0) return error(res, 'Không tìm thấy phiên đấu giá', 404);
  if (streamCount >= MAX_STREAMS) return error(res, 'Đang có quá nhiều người xem, trang sẽ tự cập nhật chậm hơn', 503);
  let snapshot;
  try {
    snapshot = await auctionService.getSnapshot(auctionId);
  } catch (err) {
    return error(res, err.message);
  }
  if (!snapshot) return error(res, 'Không tìm thấy phiên đấu giá', 404);

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`retry: 3000\nevent: update\ndata: ${JSON.stringify(snapshot)}\n\n`);

  streamCount += 1;
  if (!viewers.has(auctionId)) viewers.set(auctionId, new Set());
  viewers.get(auctionId).add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  heartbeat.unref();
  res.on('close', () => {
    clearInterval(heartbeat);
    streamCount -= 1;
    const group = viewers.get(auctionId);
    if (group) {
      group.delete(res);
      if (group.size === 0) viewers.delete(auctionId);
    }
  });
  return undefined;
};

module.exports = {
  list: handle((req) => auctionService.listAuctions({
    phase: req.query.phase,
    category: req.query.category,
    mine: req.query.mine === '1' || req.query.mine === 'true',
    page: req.query.page,
    limit: req.query.limit,
  }, viewer(req)), 'Auctions retrieved'),
  get: handle((req) => auctionService.getAuction(req.params.id, viewer(req)), 'Auction retrieved'),
  stream,
  bid: handle((req) => auctionService.placeBid(req.user.id, req.params.id, (req.body || {}).amount), 'Bid placed', 201),
  buyNow: handle((req) => auctionService.buyNow(req.user.id, req.params.id), 'Bought now', 201),
  checkout: handle((req) => auctionService.getCheckoutQuote(req.user.id, req.params.id), 'Checkout quote'),
  adminList: handle((req) => auctionService.listForAdmin({ status: req.query.status, page: req.query.page, limit: req.query.limit }), 'Auctions retrieved'),
  create: handle((req) => auctionService.createAuction(req.user.id, req.body || {}), 'Auction created', 201),
  cancel: handle((req) => auctionService.cancelAuction(req.user.id, req.params.id), 'Auction cancelled'),
  // Cho test: số người đang xem qua SSE.
  streamStats: () => ({ streams: streamCount, auctions: viewers.size }),
};
