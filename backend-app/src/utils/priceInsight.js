/*
  "Nên mua lúc nào?": so giá hiện tại với lịch sử giá trong cửa sổ N ngày (mặc định 90).
  Chỉ mô tả số liệu đã có (thấp nhất, trung bình theo thời gian, so với 30 ngày trước), không dự đoán giá.
  Hàm thuần: số liệu lấy bằng SQL ở services/priceInsight.service.js.
*/

const WINDOW_DAYS = 90;
// Chênh dưới 3% so với trung bình coi là "ngang giá trung bình".
const NEAR_AVERAGE = 0.03;
// Lịch sử ngắn hơn 14 ngày thì chưa đủ để so.
const MIN_COVERED_DAYS = 14;

const percent = (value) => Math.round(value * 1000) / 10;
const formatPercent = (value) => `${String(Math.abs(percent(value))).replace('.', ',')}%`;

/**
 * @param stats { current, dealPrice, lowest, highest, average, changes, coveredDays, priceDaysAgo30 }
 *   current: giá niêm yết hiện tại; dealPrice: giá Hot Deal đang chạy (null nếu không có)
 *   lowest/highest/average: trên giá niêm yết trong cửa sổ; average tính theo thời gian giữ giá
 *   changes: số lần đổi giá trong cửa sổ; coveredDays: số ngày có dữ liệu trong cửa sổ
 *   priceDaysAgo30: giá niêm yết 30 ngày trước (null nếu sản phẩm mới hơn)
 * @param options.watchHint câu gợi ý khi giá đang cao (sản phẩm: "Báo khi giảm giá", cấu hình: "Báo khi cả bộ rẻ hơn")
 * @param options.newText câu hiện khi chưa đủ 14 ngày dữ liệu
 * @returns { label, tone, text, effectivePrice, ... }
 */
const classifyPrice = (stats, windowDays = WINDOW_DAYS, {
  watchHint = 'Chưa cần gấp thì có thể bật "Báo khi giảm giá".',
  newText = 'Sản phẩm mới lên kệ, chưa đủ dữ liệu giá để so.',
} = {}) => {
  const current = Number(stats.current);
  const deal = stats.dealPrice !== null && stats.dealPrice !== undefined && Number(stats.dealPrice) < current
    ? Number(stats.dealPrice)
    : null;
  const effective = deal ?? current;
  const lowest = Math.min(Number(stats.lowest ?? current), current);
  const highest = Math.max(Number(stats.highest ?? current), current);
  const average = Number(stats.average) > 0 ? Number(stats.average) : current;
  const changes = Number(stats.changes) || 0;
  const covered = Number(stats.coveredDays) || 0;
  const vsAverage = average > 0 ? (effective - average) / average : 0;
  const ago30 = stats.priceDaysAgo30 === null || stats.priceDaysAgo30 === undefined ? null : Number(stats.priceDaysAgo30);
  const vs30 = ago30 && ago30 > 0 ? (effective - ago30) / ago30 : null;

  const base = {
    windowDays,
    effectivePrice: effective,
    listPrice: current,
    dealPrice: deal,
    lowest,
    highest,
    average: Math.round(average),
    changes,
    vsAverage: percent(vsAverage),
    vs30: vs30 === null ? null : percent(vs30),
  };

  if (covered < MIN_COVERED_DAYS && !deal) {
    return { ...base, label: 'new', tone: 'neutral', text: newText };
  }
  if (changes === 0 && !deal) {
    return { ...base, label: 'stable', tone: 'neutral', text: `Giá không đổi trong ${windowDays} ngày qua.` };
  }
  if (effective <= lowest) {
    return {
      ...base,
      label: 'lowest',
      tone: 'good',
      text: deal
        ? `Giá Hot Deal thấp nhất ${windowDays} ngày qua (thấp hơn giá trung bình ${formatPercent(vsAverage)}).`
        : `Giá thấp nhất ${windowDays} ngày qua${vsAverage < 0 ? ` (thấp hơn giá trung bình ${formatPercent(vsAverage)})` : ''}.`,
    };
  }
  if (vsAverage <= -NEAR_AVERAGE) {
    return { ...base, label: 'below_avg', tone: 'good', text: `Thấp hơn giá trung bình ${windowDays} ngày ${formatPercent(vsAverage)}.` };
  }
  if (vsAverage >= NEAR_AVERAGE) {
    return {
      ...base,
      label: 'above_avg',
      tone: 'warn',
      text: `Cao hơn giá trung bình ${windowDays} ngày ${formatPercent(vsAverage)}${vs30 !== null && vs30 > 0 ? `, tăng ${formatPercent(vs30)} so với 30 ngày trước` : ''}. ${watchHint}`,
    };
  }
  return { ...base, label: 'average', tone: 'neutral', text: `Ngang giá trung bình ${windowDays} ngày.` };
};

/** Nhãn ngắn cho thẻ sản phẩm: chỉ hiện khi có thông tin đáng chú ý. */
const BADGES = {
  lowest: 'Thấp nhất 90 ngày',
  below_avg: 'Dưới giá trung bình',
};
const badgeFor = (insight) => (insight && BADGES[insight.label]) || null;

module.exports = { WINDOW_DAYS, MIN_COVERED_DAYS, NEAR_AVERAGE, classifyPrice, badgeFor };
