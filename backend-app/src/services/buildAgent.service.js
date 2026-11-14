const { getPool } = require('../config/db.sql');
const { loadComponents } = require('./builder.service');
const { getInsights } = require('./priceInsight.service');
const { EFFECTIVE_PRICE_SQL } = require('./promotionSql');
const assistant = require('./assistant.service');
const { parseBudget } = require('../utils/needParser');
const { MAX_REQUEST_CHARS, LAPTOP_NOTE, createCatalog, isLaptopRequest, runBuildAgent } = require('../utils/buildAgent');

/*
  Trợ lý AI tự ráp cấu hình: nạp linh kiện thật (giá đã tính Hot Deal, nhãn giá 90 ngày) rồi chạy
  vòng lặp ở utils/buildAgent với OpenAI. Dùng chung khoá, mô hình, bật/tắt và hạn mức ngày với
  trợ lý mua hàng (trang quản trị → Trợ lý AI). Không lưu yêu cầu của khách, không ghi nội dung vào log.
*/

// Mỗi lượt gọi OpenAI tối đa ASSISTANT_TIMEOUT_MS; cả lần ráp dừng sau chừng này dù còn lượt.
const TOTAL_DEADLINE_MS = 110 * 1000;
const MIN_BUDGET = 3000000;
const MAX_BUDGET = 500000000;

const createHttpError = (status, message, code = null) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.data = { code };
  return err;
};

/** Linh kiện máy bàn còn hàng với giá khách trả hôm nay và nhãn giá 90 ngày. */
const loadCatalog = async () => {
  const components = await loadComponents();
  const prices = await getPool().request().query(`
    SELECT ep.ProductID, ep.EffectivePrice
    FROM (${EFFECTIVE_PRICE_SQL}) ep
    WHERE ep.ProductID IN (SELECT ProductID FROM ComponentSpecs);
  `);
  const effective = new Map(prices.recordset.map((row) => [row.ProductID, Number(row.EffectivePrice)]));
  let insights = new Map();
  try {
    insights = await getInsights(components.map((part) => part.productId));
  } catch (err) {
    // Nhãn giá chỉ là thông tin phụ cho trợ lý; lỗi khi tính thì vẫn ráp được.
    console.warn('[build-agent] price insight skipped:', err.message);
  }
  return createCatalog(components.map((part) => {
    const price = effective.get(part.productId) ?? part.price;
    return { ...part, listPrice: part.price, price, hotDeal: price < part.price, priceInsight: insights.get(part.productId) || null };
  }));
};

const readBudget = (raw, request) => {
  if (raw !== undefined && raw !== null && raw !== '') {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < MIN_BUDGET || value > MAX_BUDGET) {
      throw createHttpError(400, 'Ngân sách cần từ 3 triệu đến 500 triệu đồng');
    }
    return Math.round(value);
  }
  return parseBudget(request);
};

/**
 * Kiểm tra yêu cầu trước khi bắt đầu (lỗi ở đây trả JSON bình thường, chưa mở luồng).
 * Tính một lượt vào hạn mức câu hỏi mỗi ngày của trợ lý.
 */
const prepare = async (body = {}, { settings = null, now = new Date() } = {}) => {
  const current = settings || await assistant.loadSettings();
  if (!current.enabled) throw createHttpError(503, 'Trợ lý AI chưa được bật', 'assistant_disabled');
  const request = String(body.request ?? '').replace(/\s+/g, ' ').trim();
  if (request.length < 5) throw createHttpError(400, 'Hãy mô tả bạn cần máy để làm gì');
  if (request.length > MAX_REQUEST_CHARS) throw createHttpError(400, `Yêu cầu tối đa ${MAX_REQUEST_CHARS} ký tự`);
  const budget = readBudget(body.budget, request);
  // Hỏi về laptop: trả lời ngay bằng quy tắc, không gọi mô hình nên cũng không tính vào hạn mức.
  if (isLaptopRequest(request)) return { request, budget, settings: current, declined: true };
  assistant.takeDailyQuota(now, current.dailyLimit);
  return { request, budget, settings: current };
};

/**
 * Chạy trợ lý. options: onEvent (gửi từng bước), signal (khách đóng trang), fetch, catalog (test).
 */
const run = async ({ request, budget, settings, declined = false }, { onEvent = () => {}, signal = null, fetch: fetchImpl = globalThis.fetch, catalog = null } = {}) => {
  if (declined) {
    return {
      status: 'declined',
      builds: [],
      note: LAPTOP_NOTE,
      trace: [],
      stats: { rounds: 0, toolCalls: 0, rejectedSubmissions: 0, ms: 0, inputTokens: 0, outputTokens: 0 },
      request,
      budget,
      model: settings.model,
    };
  }
  const parts = catalog || await loadCatalog();
  if (parts.parts.length === 0) throw createHttpError(503, 'Kho hiện chưa có linh kiện máy bàn để ráp');
  const deadline = Date.now() + TOTAL_DEADLINE_MS;
  const callModel = (messages, tools) => assistant.requestCompletion(fetchImpl, messages, settings, { tools, maxTokens: 4000, signal });
  try {
    const result = await runBuildAgent({
      request,
      budget,
      catalog: parts,
      callModel,
      onEvent,
      isCancelled: () => Boolean(signal?.aborted) || Date.now() > deadline,
    });
    return { ...result, request, budget, model: settings.model };
  } catch (err) {
    if (err.cancelled && !signal?.aborted) throw createHttpError(504, 'Trợ lý ráp lâu quá, bạn thử lại với yêu cầu ngắn gọn hơn nhé.', 'build_agent_timeout');
    throw err;
  }
};

module.exports = { TOTAL_DEADLINE_MS, loadCatalog, prepare, run };
