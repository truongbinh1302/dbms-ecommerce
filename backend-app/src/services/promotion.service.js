const { getPool, sql } = require('../config/db.sql');
const { formatProduct } = require('../utils/productFormat');
const { ACTIVE_CONDITION, promoApply, PROMO_COLUMNS } = require('./promotionSql');

/*
  Khuyến mãi có thời hạn (Hot Deal).
  - Giá niêm yết (Products.Price) giữ nguyên; giá khuyến mãi nằm ở PromotionItems và chỉ có hiệu lực
    trong khung giờ của chương trình. Server tự áp giá khi báo giá và khi tạo đơn.
  - Số suất: SoldCount tăng trong transaction tạo đơn (dòng PromotionItems bị khoá UPDLOCK),
    CHECK SoldCount <= QuantityLimit chặn bán lố; huỷ đơn thì trả lại suất.
  - Thời gian lưu DATETIMEOFFSET, so với SYSDATETIMEOFFSET() nên không lệch múi giờ.
*/

const MAX_ITEMS = 50;
const MAX_DAYS = 31;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

/**
 * Các chương trình đang chạy cho danh sách sản phẩm, gom theo ProductID (giá thấp trước).
 * lock = true: khoá các dòng PromotionItems (UPDLOCK) trong transaction tạo đơn.
 * Gọi SAU khi đã khoá Products, để thứ tự khoá luôn là Products rồi PromotionItems.
 */
const loadForProducts = async (runner, productIds, { lock = false } = {}) => {
  const ids = [...new Set(productIds.map(Number))].filter((id) => Number.isInteger(id) && id > 0);
  const map = new Map();
  if (ids.length === 0) return map;

  const result = await new sql.Request(runner)
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
    .query(`
      SELECT pi.PromotionID, pi.ProductID, pi.SalePrice, pi.QuantityLimit, pi.SoldCount, pi.PerOrderLimit,
             pr.Name, pr.EndsAt
      FROM PromotionItems pi ${lock ? 'WITH (UPDLOCK, ROWLOCK)' : ''}
      JOIN Promotions pr ON pr.PromotionID = pi.PromotionID
      WHERE pi.ProductID IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))
        AND ${ACTIVE_CONDITION}
      ORDER BY pi.ProductID, pi.SalePrice, pr.EndsAt
    `);

  for (const row of result.recordset) {
    const list = map.get(row.ProductID) || [];
    list.push({
      PromotionID: row.PromotionID,
      ProductID: row.ProductID,
      SalePrice: Number(row.SalePrice),
      QuantityLimit: row.QuantityLimit === null || row.QuantityLimit === undefined ? null : Number(row.QuantityLimit),
      SoldCount: Number(row.SoldCount || 0),
      PerOrderLimit: row.PerOrderLimit === null || row.PerOrderLimit === undefined ? null : Number(row.PerOrderLimit),
      Name: row.Name,
      EndsAt: row.EndsAt,
    });
    map.set(row.ProductID, list);
  }
  return map;
};

/** Ghi nhận suất đã bán (trong transaction tạo đơn). CHECK constraint chặn vượt số suất. */
const consume = async (transaction, { promotionId, productId, quantity }) => {
  await new sql.Request(transaction)
    .input('promotionId', sql.Int, Number(promotionId))
    .input('productId', sql.Int, Number(productId))
    .input('quantity', sql.Int, Number(quantity))
    .query(`
      UPDATE PromotionItems SET SoldCount = SoldCount + @quantity
      WHERE PromotionID = @promotionId AND ProductID = @productId
    `);
};

/** Trả lại suất khi huỷ đơn (kể cả khi chương trình đã kết thúc, để số liệu đúng). */
const release = async (transaction, { promotionId, productId, quantity }) => {
  await new sql.Request(transaction)
    .input('promotionId', sql.Int, Number(promotionId))
    .input('productId', sql.Int, Number(productId))
    .input('quantity', sql.Int, Number(quantity))
    .query(`
      UPDATE PromotionItems
      SET SoldCount = CASE WHEN SoldCount >= @quantity THEN SoldCount - @quantity ELSE 0 END
      WHERE PromotionID = @promotionId AND ProductID = @productId
    `);
};

// ---------- Quản trị ----------

const parseInstant = (value, label) => {
  const text = String(value || '').trim();
  // Bắt buộc có múi giờ (Z hoặc +07:00) để không hiểu nhầm giờ.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw createHttpError(400, `${label} không hợp lệ`);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw createHttpError(400, `${label} không hợp lệ`);
  return date;
};

const optionalPositiveInt = (value, label, line) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100000) {
    throw createHttpError(400, `Dòng ${line}: ${label} phải là số nguyên từ 1 đến 100000`);
  }
  return number;
};

const validatePromotion = (payload, now = new Date()) => {
  const name = String(payload.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!name) throw createHttpError(400, 'Vui lòng đặt tên chương trình');
  const startsAt = parseInstant(payload.startsAt, 'Giờ bắt đầu');
  const endsAt = parseInstant(payload.endsAt, 'Giờ kết thúc');
  if (endsAt <= startsAt) throw createHttpError(400, 'Giờ kết thúc phải sau giờ bắt đầu');
  if (endsAt <= now) throw createHttpError(400, 'Giờ kết thúc đã qua');
  if (endsAt - startsAt > MAX_DAYS * 86400000) throw createHttpError(400, `Mỗi chương trình kéo dài tối đa ${MAX_DAYS} ngày`);

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) throw createHttpError(400, 'Chương trình cần ít nhất một sản phẩm');
  if (rawItems.length > MAX_ITEMS) throw createHttpError(400, `Mỗi chương trình tối đa ${MAX_ITEMS} sản phẩm`);

  const seen = new Set();
  const items = rawItems.map((item, index) => {
    const line = index + 1;
    const productId = Number(item?.productId);
    if (!Number.isInteger(productId) || productId <= 0) throw createHttpError(400, `Dòng ${line}: chưa chọn sản phẩm`);
    if (seen.has(productId)) throw createHttpError(400, `Dòng ${line}: sản phẩm bị lặp`);
    seen.add(productId);
    const salePrice = Math.round(Number(item?.salePrice));
    if (!Number.isFinite(salePrice) || salePrice <= 0) throw createHttpError(400, `Dòng ${line}: giá khuyến mãi không hợp lệ`);
    return {
      productId,
      salePrice,
      quantityLimit: optionalPositiveInt(item?.quantityLimit, 'số suất', line),
      perOrderLimit: optionalPositiveInt(item?.perOrderLimit, 'giới hạn mỗi đơn', line),
    };
  });
  items.sort((a, b) => a.productId - b.productId);
  return { name, startsAt, endsAt, items };
};

const statusOf = (row, now = new Date()) => {
  if (!row.IsActive) return 'stopped';
  if (new Date(row.EndsAt) <= now) return 'ended';
  if (new Date(row.StartsAt) > now) return 'upcoming';
  return 'running';
};

const formatPromotionRow = (row) => ({
  id: row.PromotionID,
  name: row.Name,
  startsAt: row.StartsAt,
  endsAt: row.EndsAt,
  isActive: Boolean(row.IsActive),
  status: statusOf(row),
  itemCount: row.ItemCount === undefined ? undefined : Number(row.ItemCount),
  soldCount: row.TotalSold === undefined ? undefined : Number(row.TotalSold || 0),
  createdAt: row.CreatedAt,
});

const getPromotion = async (promotionId) => {
  const id = Number(promotionId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(404, 'Không tìm thấy chương trình');
  const pool = getPool();
  const head = await new sql.Request(pool).input('id', sql.Int, id).query(`
    SELECT PromotionID, Name, StartsAt, EndsAt, IsActive, CreatedAt FROM Promotions WHERE PromotionID = @id
  `);
  if (!head.recordset[0]) throw createHttpError(404, 'Không tìm thấy chương trình');
  const items = await new sql.Request(pool).input('id', sql.Int, id).query(`
    SELECT pi.ProductID, p.Name, p.Price, p.Stock, pi.SalePrice, pi.QuantityLimit, pi.SoldCount, pi.PerOrderLimit
    FROM PromotionItems pi JOIN Products p ON p.ProductID = pi.ProductID
    WHERE pi.PromotionID = @id
    ORDER BY p.Name
  `);
  return {
    ...formatPromotionRow(head.recordset[0]),
    items: items.recordset.map((row) => ({
      productId: row.ProductID,
      productName: row.Name,
      listPrice: Number(row.Price),
      stock: Number(row.Stock),
      salePrice: Number(row.SalePrice),
      quantityLimit: row.QuantityLimit === null ? null : Number(row.QuantityLimit),
      soldCount: Number(row.SoldCount),
      perOrderLimit: row.PerOrderLimit === null ? null : Number(row.PerOrderLimit),
    })),
  };
};

/**
 * Tạo chương trình. Kiểm tra trong transaction: sản phẩm tồn tại, giá KM thấp hơn giá niêm yết,
 * và không trùng khung giờ với chương trình khác (đang chạy / sắp chạy) cho cùng sản phẩm.
 */
const createPromotion = async (payload, adminId) => {
  const { name, startsAt, endsAt, items } = validatePromotion(payload || {});
  const transaction = new sql.Transaction(getPool());
  await transaction.begin();
  let promotionId;
  try {
    const ids = JSON.stringify(items.map((item) => item.productId));
    const products = await new sql.Request(transaction)
      .input('ids', sql.NVarChar(sql.MAX), ids)
      .query(`
        SELECT ProductID, Name, Price, IsDeleted FROM Products WITH (UPDLOCK, ROWLOCK)
        WHERE ProductID IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))
        ORDER BY ProductID
      `);
    const byId = new Map(products.recordset.map((row) => [row.ProductID, row]));
    for (const [index, item] of items.entries()) {
      const product = byId.get(item.productId);
      if (!product || product.IsDeleted) {
        throw createHttpError(400, 'Có sản phẩm không tồn tại hoặc đã ngừng bán', { productIds: [item.productId] });
      }
      if (item.salePrice >= Number(product.Price)) {
        throw createHttpError(400, `"${product.Name}": giá khuyến mãi phải thấp hơn giá niêm yết ${Number(product.Price).toLocaleString('vi-VN')}đ`, { productIds: [item.productId], line: index + 1 });
      }
    }

    const overlap = await new sql.Request(transaction)
      .input('ids', sql.NVarChar(sql.MAX), ids)
      .input('startsAt', sql.DateTimeOffset, startsAt)
      .input('endsAt', sql.DateTimeOffset, endsAt)
      .query(`
        SELECT DISTINCT pi.ProductID, p.Name, pr.Name AS PromotionName
        FROM PromotionItems pi WITH (UPDLOCK)
        JOIN Promotions pr ON pr.PromotionID = pi.PromotionID
        JOIN Products p ON p.ProductID = pi.ProductID
        WHERE pi.ProductID IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))
          AND pr.IsActive = 1
          AND pr.EndsAt > SYSDATETIMEOFFSET()
          AND pr.StartsAt < @endsAt AND pr.EndsAt > @startsAt
      `);
    if (overlap.recordset.length) {
      const first = overlap.recordset[0];
      throw createHttpError(400, `"${first.Name}" đã có trong chương trình "${first.PromotionName}" trùng khung giờ`, {
        productIds: overlap.recordset.map((row) => row.ProductID),
      });
    }

    const head = await new sql.Request(transaction)
      .input('name', sql.NVarChar(120), name)
      .input('startsAt', sql.DateTimeOffset, startsAt)
      .input('endsAt', sql.DateTimeOffset, endsAt)
      .input('adminId', sql.Int, adminId ? Number(adminId) : null)
      .query(`
        INSERT INTO Promotions (Name, StartsAt, EndsAt, CreatedBy)
        OUTPUT INSERTED.PromotionID
        VALUES (@name, @startsAt, @endsAt, @adminId)
      `);
    promotionId = head.recordset[0].PromotionID;

    for (const item of items) {
      await new sql.Request(transaction)
        .input('promotionId', sql.Int, promotionId)
        .input('productId', sql.Int, item.productId)
        .input('salePrice', sql.Decimal(18, 2), item.salePrice)
        .input('quantityLimit', sql.Int, item.quantityLimit)
        .input('perOrderLimit', sql.Int, item.perOrderLimit)
        .query(`
          INSERT INTO PromotionItems (PromotionID, ProductID, SalePrice, QuantityLimit, PerOrderLimit)
          VALUES (@promotionId, @productId, @salePrice, @quantityLimit, @perOrderLimit)
        `);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
  return getPromotion(promotionId);
};

const listPromotions = async ({ limit = 30 } = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const result = await new sql.Request(getPool())
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@limit) pr.PromotionID, pr.Name, pr.StartsAt, pr.EndsAt, pr.IsActive, pr.CreatedAt,
             (SELECT COUNT(*) FROM PromotionItems pi WHERE pi.PromotionID = pr.PromotionID) AS ItemCount,
             (SELECT SUM(pi.SoldCount) FROM PromotionItems pi WHERE pi.PromotionID = pr.PromotionID) AS TotalSold
      FROM Promotions pr
      ORDER BY CASE WHEN pr.IsActive = 1 AND pr.EndsAt > SYSDATETIMEOFFSET() THEN 0 ELSE 1 END,
               pr.StartsAt DESC
    `);
  return result.recordset.map(formatPromotionRow);
};

/** Dừng chương trình ngay. Đơn đã đặt giữ nguyên giá đã tính. */
const stopPromotion = async (promotionId) => {
  const id = Number(promotionId);
  const result = await new sql.Request(getPool())
    .input('id', sql.Int, Number.isInteger(id) ? id : 0)
    .query('UPDATE Promotions SET IsActive = 0 OUTPUT INSERTED.PromotionID WHERE PromotionID = @id');
  if (!result.recordset[0]) throw createHttpError(404, 'Không tìm thấy chương trình');
  return getPromotion(id);
};

// ---------- Công khai ----------

/**
 * Chương trình đang chạy (kèm sản phẩm) và các chương trình sắp bắt đầu trong 7 ngày.
 * serverNow để trình duyệt đếm ngược theo giờ máy chủ, không phụ thuộc đồng hồ máy khách.
 */
const getActivePromotions = async () => {
  const pool = getPool();
  const result = await new sql.Request(pool).query(`
    SELECT pr.PromotionID, pr.Name, pr.StartsAt, pr.EndsAt, pr.IsActive,
           CASE WHEN pr.StartsAt <= SYSDATETIMEOFFSET() THEN 1 ELSE 0 END AS IsRunning,
           pi.SalePrice, pi.QuantityLimit, pi.SoldCount, pi.PerOrderLimit,
           p.ProductID AS id, p.Name AS ProductName, p.Slug, p.Brand, p.Description, p.Price, p.OldPrice,
           p.Stock, p.Specs, p.Images, p.IsFeatured, p.Rating, p.ReviewsCount, p.CreatedAt AS ProductCreatedAt,
           p.UpdatedAt AS ProductUpdatedAt,
           c.CategoryID AS categoryId, c.Name AS categoryName, c.Slug AS categorySlug,
           SYSDATETIMEOFFSET() AS ServerNow
    FROM Promotions pr
    JOIN PromotionItems pi ON pi.PromotionID = pr.PromotionID
    JOIN Products p ON p.ProductID = pi.ProductID AND p.IsDeleted = 0
    LEFT JOIN Categories c ON c.CategoryID = p.CategoryID
    WHERE pr.IsActive = 1
      AND pr.EndsAt > SYSDATETIMEOFFSET()
      AND pr.StartsAt <= DATEADD(DAY, 7, SYSDATETIMEOFFSET())
    ORDER BY pr.StartsAt, pr.EndsAt, pr.PromotionID, pi.SalePrice / NULLIF(p.Price, 0)
  `);

  const promotions = new Map();
  let serverNow = new Date();
  for (const row of result.recordset) {
    serverNow = row.ServerNow || serverNow;
    if (!promotions.has(row.PromotionID)) {
      promotions.set(row.PromotionID, {
        id: row.PromotionID,
        name: row.Name,
        startsAt: row.StartsAt,
        endsAt: row.EndsAt,
        status: row.IsRunning ? 'running' : 'upcoming',
        items: [],
      });
    }
    const limit = row.QuantityLimit === null || row.QuantityLimit === undefined ? null : Number(row.QuantityLimit);
    const sold = Number(row.SoldCount || 0);
    const product = formatProduct({ ...row, Name: row.ProductName, CreatedAt: row.ProductCreatedAt, UpdatedAt: row.ProductUpdatedAt });
    product.promotion = {
      id: row.PromotionID,
      name: row.Name,
      salePrice: Number(row.SalePrice),
      startsAt: row.StartsAt,
      endsAt: row.EndsAt,
      quantityLimit: limit,
      soldCount: sold,
      remaining: limit === null ? null : Math.max(limit - sold, 0),
      perOrderLimit: row.PerOrderLimit === null || row.PerOrderLimit === undefined ? null : Number(row.PerOrderLimit),
      status: row.IsRunning ? 'running' : 'upcoming',
    };
    promotions.get(row.PromotionID).items.push(product);
  }

  const list = [...promotions.values()];
  return {
    serverNow,
    running: list.filter((promo) => promo.status === 'running'),
    upcoming: list.filter((promo) => promo.status === 'upcoming').slice(0, 3),
  };
};

module.exports = {
  ACTIVE_CONDITION,
  promoApply,
  PROMO_COLUMNS,
  loadForProducts,
  consume,
  release,
  validatePromotion,
  createPromotion,
  listPromotions,
  getPromotion,
  stopPromotion,
  getActivePromotions,
};
