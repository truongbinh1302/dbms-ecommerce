const crypto = require('crypto');
const { getPool, sql } = require('../config/db.sql');
const config = require('../config/env');
const builderService = require('./builder.service');

/*
  Báo giá cấu hình Build PC có hạn (mặc định 48 giờ).
  - Lưu giá từng linh kiện tại thời điểm báo giá; trong thời hạn, khách đặt hàng
    được tính theo giá thấp hơn giữa giá báo và giá hiện tại (pricing.applyLockedPrices).
  - Báo giá không giữ hàng trong kho; tồn kho vẫn kiểm tra lúc đặt.
  - Hết hạn được so bằng giờ của DB server (SYSDATETIME) để tránh lệch múi giờ.
*/

// Bỏ các ký tự dễ nhầm (0/O, 1/I/L) vì khách có thể đọc mã qua điện thoại.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^BQ[A-Z0-9]{8}$/;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const generateQuoteCode = () => {
  const bytes = crypto.randomBytes(8);
  let code = 'BQ';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
};

const normalizeQuoteCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
};

const SELECT_QUOTE = `
  SELECT QuoteID, Code, UserID, Title, ItemsJson, Subtotal, CreatedAt, ExpiresAt,
         CASE WHEN ExpiresAt <= SYSDATETIME() THEN 1 ELSE 0 END AS IsExpired
  FROM BuildQuotes
  WHERE Code = @code
`;

const findQuoteRow = async (executor, code) => {
  const result = await new sql.Request(executor)
    .input('code', sql.NVarChar(20), code)
    .query(SELECT_QUOTE);
  return result.recordset[0] || null;
};

const parseItems = (row) => {
  try {
    const parsed = JSON.parse(row.ItemsJson);
    return { items: parsed.items || [], owned: parsed.owned || [] };
  } catch {
    return { items: [], owned: [] };
  }
};

/** Tạo báo giá từ cấu hình đang chọn. Giá lấy từ DB tại thời điểm tạo. */
const createQuote = async (userId, { items: rawItems, title } = {}) => {
  const items = builderService.normalizeBuildItems(rawItems);
  const components = await builderService.loadComponents(getPool(), [...new Set(items.map((item) => item.productId))]);
  const evaluation = builderService.evaluateBuild(items, components);

  const notComponent = evaluation.issues.find((issue) => issue.issue === 'not_component');
  if (notComponent) {
    throw createHttpError(400, `Sản phẩm ${notComponent.productId} không phải linh kiện Build PC`);
  }
  if (evaluation.lines.length === 0) {
    throw createHttpError(400, 'Báo giá cần ít nhất một linh kiện cần mua');
  }

  const payload = {
    items: evaluation.lines.map(({ productId, name, type, unitPrice, quantity }) => ({ productId, name, type, unitPrice, quantity })),
    owned: evaluation.parts.filter((part) => part.owned).map(({ productId, name, type, quantity }) => ({ productId, name, type, quantity })),
  };
  const cleanTitle = title ? String(title).trim().slice(0, 120) || null : null;

  // Mã ngẫu nhiên 8 ký tự (31^8 khả năng); thử lại vài lần nếu trùng.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateQuoteCode();
    try {
      const result = await new sql.Request(getPool())
        .input('code', sql.NVarChar(20), code)
        .input('userId', sql.Int, userId ? Number(userId) : null)
        .input('title', sql.NVarChar(120), cleanTitle)
        .input('itemsJson', sql.NVarChar(sql.MAX), JSON.stringify(payload))
        .input('subtotal', sql.Decimal(18, 2), evaluation.subtotal)
        .input('hours', sql.Int, config.pricing.quoteValidHours)
        .query(`
          INSERT INTO BuildQuotes (Code, UserID, Title, ItemsJson, Subtotal, ExpiresAt)
          OUTPUT INSERTED.CreatedAt, INSERTED.ExpiresAt
          VALUES (@code, @userId, @title, @itemsJson, @subtotal, DATEADD(HOUR, @hours, SYSDATETIME()))
        `);
      const saved = result.recordset[0];
      return {
        code,
        title: cleanTitle,
        ...payload,
        subtotal: evaluation.subtotal,
        check: evaluation.check,
        issues: evaluation.issues,
        createdAt: saved.CreatedAt,
        expiresAt: saved.ExpiresAt,
      };
    } catch (err) {
      if (!/UQ_BuildQuotes_Code|duplicate key/i.test(err.message)) throw err;
    }
  }
  throw createHttpError(500, 'Không tạo được mã báo giá, vui lòng thử lại');
};

/** Xem báo giá: kèm giá hiện tại từng linh kiện và kết quả kiểm tra tương thích theo thông số hiện tại. */
const getQuote = async (rawCode) => {
  const code = normalizeQuoteCode(rawCode);
  if (!code) throw createHttpError(404, 'Không tìm thấy báo giá');

  const row = await findQuoteRow(getPool(), code);
  if (!row) throw createHttpError(404, 'Không tìm thấy báo giá');

  const { items, owned } = parseItems(row);
  const allItems = [
    ...items.map((item) => ({ productId: item.productId, quantity: item.quantity, owned: false })),
    ...owned.map((item) => ({ productId: item.productId, quantity: item.quantity, owned: true })),
  ];
  const components = await builderService.loadComponents(getPool(), [...new Set(allItems.map((item) => item.productId))]);
  const current = builderService.evaluateBuild(allItems, components);
  const currentById = new Map(components.map((part) => [part.productId, part]));

  return {
    code: row.Code,
    title: row.Title,
    createdAt: row.CreatedAt,
    expiresAt: row.ExpiresAt,
    expired: Boolean(row.IsExpired),
    subtotal: Number(row.Subtotal),
    items: items.map((item) => {
      const part = currentById.get(item.productId);
      return {
        ...item,
        currentPrice: part ? part.price : null,
        stock: part ? part.stock : 0,
        image: part ? part.image : null,
        slug: part ? part.slug : null,
      };
    }),
    owned,
    check: current.check,
    issues: current.issues,
  };
};

/**
 * Giá đã giữ của một báo giá còn hạn, dạng Map productId → { unitPrice, quantity }.
 * Ném lỗi 404/410 nếu mã sai hoặc đã hết hạn, để trang thanh toán báo cho khách.
 */
const loadLockedPrices = async (executor, rawCode) => {
  const code = normalizeQuoteCode(rawCode);
  if (!code) throw createHttpError(404, 'Mã báo giá không hợp lệ', { code: 'quote_not_found' });

  const row = await findQuoteRow(executor, code);
  if (!row) throw createHttpError(404, 'Không tìm thấy báo giá', { code: 'quote_not_found', quoteCode: code });
  if (row.IsExpired) {
    throw createHttpError(410, 'Báo giá đã hết hạn giữ giá', { code: 'quote_expired', quoteCode: code, expiresAt: row.ExpiresAt });
  }

  const { items } = parseItems(row);
  const prices = new Map();
  for (const item of items) {
    prices.set(Number(item.productId), { unitPrice: Number(item.unitPrice), quantity: Number(item.quantity) });
  }
  return { code, expiresAt: row.ExpiresAt, prices };
};

module.exports = {
  CODE_PATTERN,
  generateQuoteCode,
  normalizeQuoteCode,
  createQuote,
  getQuote,
  loadLockedPrices,
};
