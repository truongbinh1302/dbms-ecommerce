/*
  Quy tắc đấu giá (hàm thuần, không đụng DB) để test được từng trường hợp.

  Đặt giá tự động: khách nhập GIÁ TỐI ĐA mình chịu trả; hệ thống chỉ trả vừa đủ để dẫn đầu.
    - 1 người: giá hiện tại = giá khởi điểm.
    - ≥ 2 người: giá hiện tại = min(giá tối đa cao nhất, giá tối đa cao nhì + bước giá).
    - Hai giá tối đa bằng nhau: ai đặt trước (Since sớm hơn) dẫn đầu, giá = mức đó.
*/

const MIN_PRICE = 10000;
const MAX_PRICE = 2000000000;

const toAmount = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
};

/** Mức tối thiểu khách phải nhập để vượt người đang dẫn đầu. */
const minimumBid = ({ bidCount, currentPrice, startingPrice, bidIncrement }) => (
  bidCount > 0 && currentPrice !== null && currentPrice !== undefined
    ? Number(currentPrice) + Number(bidIncrement)
    : Number(startingPrice)
);

/** Xếp hạng giá tối đa: cao hơn trước, bằng nhau thì đặt sớm hơn trước, rồi theo mã người dùng cho ổn định. */
const rankMaxBids = (maxBids) => [...maxBids].sort((a, b) => (
  Number(b.maxAmount) - Number(a.maxAmount)
  || new Date(a.since).getTime() - new Date(b.since).getTime()
  || a.userId - b.userId
));

/**
 * Người dẫn đầu và giá hiện tại từ các giá tối đa.
 * @returns {{ leaderUserId, price } | null}
 */
const resolveLeader = ({ startingPrice, bidIncrement, maxBids }) => {
  const ranked = rankMaxBids(maxBids);
  if (ranked.length === 0) return null;
  const [top, second] = ranked;
  if (!second) return { leaderUserId: top.userId, price: Number(startingPrice) };
  const price = Math.min(Number(top.maxAmount), Number(second.maxAmount) + Number(bidIncrement));
  return { leaderUserId: top.userId, price: Math.max(price, Number(startingPrice)) };
};

/** Có trả giá trong `extendSeconds` giây cuối thì phiên kết thúc lúc now + extendSeconds. */
const extendedEnd = (endsAt, now, extendSeconds) => {
  const end = new Date(endsAt).getTime();
  const current = new Date(now).getTime();
  if (!extendSeconds || end - current >= extendSeconds * 1000) return new Date(end);
  return new Date(current + extendSeconds * 1000);
};

/** "Trương Bình" → "T***h": người xem thấy có người khác đang trả giá mà không lộ tên. */
const maskName = (fullName) => {
  const name = String(fullName || '').trim();
  if (!name) return 'Ẩn danh';
  const chars = [...name.replace(/\s+/g, '')];
  if (chars.length <= 2) return `${chars[0]}***`;
  return `${chars[0]}***${chars[chars.length - 1]}`;
};

/** Kiểm tra dữ liệu tạo phiên của quản trị. now: giờ máy chủ DB. */
const validateAuctionInput = (raw = {}, now = new Date()) => {
  const errors = [];
  const productId = Number(raw.productId);
  if (!Number.isInteger(productId) || productId <= 0) errors.push('Chọn sản phẩm');
  const title = String(raw.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 150);
  const description = raw.description ? String(raw.description).trim().slice(0, 1000) || null : null;
  const startingPrice = toAmount(raw.startingPrice);
  const bidIncrement = toAmount(raw.bidIncrement);
  const buyNowPrice = raw.buyNowPrice === undefined || raw.buyNowPrice === null || raw.buyNowPrice === '' ? null : toAmount(raw.buyNowPrice);
  if (startingPrice === null || startingPrice < MIN_PRICE || startingPrice > MAX_PRICE) errors.push('Giá khởi điểm từ 10.000đ');
  if (bidIncrement === null || bidIncrement < 1000 || (startingPrice && bidIncrement > startingPrice)) errors.push('Bước giá từ 1.000đ và không lớn hơn giá khởi điểm');
  if (buyNowPrice !== null && (buyNowPrice === null || !startingPrice || buyNowPrice <= startingPrice || buyNowPrice > MAX_PRICE)) errors.push('Giá mua ngay phải cao hơn giá khởi điểm');

  const startsAt = raw.startsAt ? new Date(raw.startsAt) : new Date(now);
  const endsAt = new Date(raw.endsAt);
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < nowMs - 60 * 1000) errors.push('Giờ bắt đầu không được ở quá khứ');
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() - startsAt.getTime() < 5 * 60 * 1000) errors.push('Phiên kéo dài ít nhất 5 phút');
  if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() - startsAt.getTime() > 30 * 24 * 3600 * 1000) errors.push('Phiên dài tối đa 30 ngày');
  const extendSeconds = raw.extendSeconds === undefined || raw.extendSeconds === null || raw.extendSeconds === '' ? 120 : Number(raw.extendSeconds);
  if (!Number.isInteger(extendSeconds) || extendSeconds < 0 || extendSeconds > 600) errors.push('Thời gian gia hạn từ 0 đến 600 giây');

  return {
    errors,
    value: { productId, title, description, startingPrice, bidIncrement, buyNowPrice, startsAt, endsAt, extendSeconds },
  };
};

module.exports = {
  MIN_PRICE,
  MAX_PRICE,
  toAmount,
  minimumBid,
  rankMaxBids,
  resolveLeader,
  extendedEnd,
  maskName,
  validateAuctionInput,
};
