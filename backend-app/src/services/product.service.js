const { getPool, sql } = require('../config/db.sql');
const ProductLog = require('../models/productLog.model');
const { formatProduct } = require('../utils/productFormat');
const { promoApply, PROMO_COLUMNS } = require('./promotionSql');
const { tokenizeQuery } = require('../utils/searchText');
const { refreshSearchText } = require('./searchIndex.service');
const notificationService = require('./notification.service');

const slugify = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// SearchText chỉ phục vụ tìm kiếm: nếu cập nhật lỗi thì ghi cảnh báo, không làm hỏng thao tác chính.
const syncSearchText = async (productId) => {
  try {
    await refreshSearchText(getPool(), [productId]);
  } catch (err) {
    console.warn(`Search text not updated for product ${productId}:`, err.message);
  }
};

const writeProductLog = async (payload) => {
  try {
    await ProductLog.createLog(payload);
  } catch (err) {
    // Product audit logs are useful for the MongoDB part of the assignment,
    // but a Mongo logging failure must not roll back a successful SQL operation.
    console.warn('Product audit log skipped:', err.message);
  }
};

const normalizePagination = (page, limit) => ({
  page: Math.max(Number.parseInt(page, 10) || 1, 1),
  limit: Math.min(Math.max(Number.parseInt(limit, 10) || 12, 1), 100),
});

const MAX_IDS = 50;

const parseIdList = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(raw.map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0))].slice(0, MAX_IDS);
};

/**
 * Gắn tham số lọc và trả về mệnh đề WHERE dùng chung cho câu lấy dữ liệu và câu đếm.
 * Tìm kiếm: mọi từ khoá (đã bỏ dấu) phải có trong SearchText. Sản phẩm chưa có SearchText
 * (chưa chạy backfill) vẫn tìm được theo cách cũ bằng Name/Brand LIKE.
 */
// Giá khách trả: giá Hot Deal đang chạy (promoApply) nếu có, không thì giá niêm yết.
// Lọc và sắp xếp theo giá dùng giá này, nên câu truy vấn nào dùng buildProductFilter cũng phải có promoApply('p').
const EFFECTIVE_PRICE = 'COALESCE(promo.PromoSalePrice, p.Price)';

const buildProductFilter = (request, filters, tokens, ids) => {
  const {
    q = null,
    category = null,
    brand = null,
    minPrice = null,
    maxPrice = null,
    inStock = null,
    featured = null,
  } = filters;

  request.input('q', sql.NVarChar, q ? String(q).trim() : null);
  request.input('category', sql.NVarChar, category ? String(category) : null);
  request.input('brand', sql.NVarChar, brand ? String(brand) : null);
  request.input('minPrice', sql.Decimal(18, 2), minPrice === null || minPrice === '' ? null : Number(minPrice));
  request.input('maxPrice', sql.Decimal(18, 2), maxPrice === null || maxPrice === '' ? null : Number(maxPrice));
  request.input('inStock', sql.Bit, inStock === 'true' || inStock === true ? 1 : null);
  request.input('featured', sql.Bit, featured === 'true' || featured === true ? 1 : null);
  tokens.forEach((token, index) => request.input(`t${index}`, sql.NVarChar, token));
  ids.forEach((id, index) => request.input(`id${index}`, sql.Int, id));

  const tokenMatch = tokens.length > 0
    ? tokens.map((_, index) => `p.SearchText LIKE N'%' + @t${index} + N'%'`).join(' AND ')
    : '1 = 0';
  const idFilter = ids.length > 0
    ? `AND p.ProductID IN (${ids.map((_, index) => `@id${index}`).join(', ')})`
    : '';

  return `
    WHERE p.IsDeleted = 0
      AND (@q IS NULL
           OR (${tokenMatch})
           OR (p.SearchText IS NULL AND (p.Name LIKE N'%' + @q + N'%' OR p.Brand LIKE N'%' + @q + N'%')))
      AND (@category IS NULL OR c.Slug = @category)
      AND (@brand IS NULL OR p.Brand = @brand)
      AND (@minPrice IS NULL OR ${EFFECTIVE_PRICE} >= @minPrice)
      AND (@maxPrice IS NULL OR ${EFFECTIVE_PRICE} <= @maxPrice)
      AND (@inStock IS NULL OR p.Stock > 0)
      AND (@featured IS NULL OR p.IsFeatured = @featured)
      ${idFilter}
  `;
};

const getProducts = async (filters = {}, { countTotal = true } = {}) => {
  const q = filters.q ? String(filters.q).trim() : '';
  const tokens = q ? tokenizeQuery(q) : [];
  const ids = parseIdList(filters.ids);
  const sort = filters.sort || (q ? 'relevance' : 'newest');

  const { page, limit } = normalizePagination(filters.page, filters.limit);
  const offset = (page - 1) * limit;

  let orderBy = 'p.ProductID DESC';
  if (sort === 'price_asc') orderBy = `${EFFECTIVE_PRICE} ASC, p.ProductID ASC`;
  if (sort === 'price_desc') orderBy = `${EFFECTIVE_PRICE} DESC, p.ProductID ASC`;
  if (sort === 'newest') orderBy = 'p.CreatedAt DESC';
  if (sort === 'rating') orderBy = 'p.Rating DESC, p.ReviewsCount DESC';
  // Sản phẩm nổi bật trước, rồi theo thứ tự nhập (sản phẩm thật trong seed có ID nhỏ).
  if (sort === 'featured') orderBy = 'p.IsFeatured DESC, p.ProductID ASC';
  // Khớp ở đầu tên/chuỗi tìm kiếm xếp trước, sau đó ưu tiên sản phẩm nổi bật và còn hàng.
  if (sort === 'relevance' && tokens.length > 0) {
    orderBy = `CASE WHEN p.SearchText LIKE @t0 + N'%' THEN 0 ELSE 1 END,
               p.IsFeatured DESC,
               CASE WHEN p.Stock > 0 THEN 0 ELSE 1 END,
               p.ProductID ASC`;
  }

  const pool = getPool();
  const request = new sql.Request(pool);
  const where = buildProductFilter(request, { ...filters, q: q || null }, tokens, ids);
  request.input('offset', sql.Int, offset);
  request.input('limit', sql.Int, limit);

  const result = await request.query(`
    SELECT p.ProductID AS id, p.Name, p.Slug, p.Brand, p.Description, p.Price, p.OldPrice,
           p.Stock, p.Specs, p.Images, p.IsFeatured, p.Rating, p.ReviewsCount,
           p.CreatedAt, p.UpdatedAt,
           c.CategoryID AS categoryId, c.Name AS categoryName, c.Slug AS categorySlug,
           ${PROMO_COLUMNS}
    FROM Products p
    LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
    ${promoApply('p')}
    ${where}
    ORDER BY ${orderBy}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const items = result.recordset.map(formatProduct);
  // Gợi ý khi gõ không cần tổng số kết quả: bỏ câu COUNT để trả lời nhanh gấp đôi.
  if (!countTotal) {
    return { items, pagination: { page, limit, totalItems: null, totalPages: null } };
  }

  const countRequest = new sql.Request(pool);
  const countWhere = buildProductFilter(countRequest, { ...filters, q: q || null }, tokens, ids);
  const countResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM Products p
    LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
    ${promoApply('p')}
    ${countWhere}
  `);

  const totalItems = Number(countResult.recordset[0]?.total || 0);
  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/** Gợi ý khi đang gõ: cùng cách tìm không dấu với getProducts. */
const getProductSuggestions = async (keyword) => {
  if (!keyword || String(keyword).trim().length < 2) return [];

  const result = await getProducts({ q: keyword, limit: 8, sort: 'relevance' }, { countTotal: false });
  return result.items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    thumbnail: Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null,
  }));
};

const getProductById = async (id) => {
  const result = await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .query(`
      SELECT p.ProductID AS id, p.Name, p.Slug, p.Brand, p.Description,
             p.Price, p.OldPrice, p.Stock, p.Specs, p.Images,
             p.IsFeatured, p.Rating, p.ReviewsCount, p.CreatedAt, p.UpdatedAt,
             c.CategoryID AS categoryId, c.Name AS categoryName, c.Slug AS categorySlug,
             ${PROMO_COLUMNS}
      FROM Products p
      LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
      ${promoApply('p')}
      WHERE p.ProductID = @id AND p.IsDeleted = 0
    `);

  return result.recordset[0] ? formatProduct(result.recordset[0]) : null;
};

const createProduct = async (productData, adminId) => {
  const { name, brand, description, price, oldPrice, stock, categoryId, specs, images, isFeatured } = productData;
  if (!name || price === undefined || !categoryId) {
    throw new Error('name, price, and categoryId are required');
  }

  const slug = productData.slug || slugify(name);

  const result = await new sql.Request(getPool())
    .input('name', sql.NVarChar, name)
    .input('slug', sql.NVarChar, slug)
    .input('brand', sql.NVarChar, brand || null)
    .input('description', sql.NVarChar, description || null)
    .input('price', sql.Decimal(18, 2), Number(price))
    .input('oldPrice', sql.Decimal(18, 2), oldPrice === undefined || oldPrice === null ? null : Number(oldPrice))
    .input('stock', sql.Int, Number(stock || 0))
    .input('categoryId', sql.Int, Number(categoryId))
    .input('specs', sql.NVarChar, JSON.stringify(specs || []))
    .input('images', sql.NVarChar, JSON.stringify(images || []))
    .input('isFeatured', sql.Bit, isFeatured ? 1 : 0)
    .input('adminId', sql.Int, adminId ? Number(adminId) : null)
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @created TABLE (ProductID INT, Price DECIMAL(18,2), OldPrice DECIMAL(18,2), Stock INT);
      INSERT INTO Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured)
      OUTPUT INSERTED.ProductID, INSERTED.Price, INSERTED.OldPrice, INSERTED.Stock INTO @created
      VALUES (@name, @slug, @brand, @description, @price, @oldPrice, @stock, @categoryId, @specs, @images, @isFeatured);
      -- Mốc giá đầu tiên cho lịch sử giá.
      INSERT INTO PriceHistory (ProductID, Price, OldPrice)
      SELECT ProductID, Price, OldPrice FROM @created;
      -- Tồn đầu kỳ trong sổ kho.
      INSERT INTO StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
      SELECT ProductID, Stock, Stock, N'opening', N'Tồn khi tạo sản phẩm', @adminId FROM @created;
      COMMIT TRANSACTION;
      SELECT ProductID FROM @created;
    `);

  const productId = result.recordset[0].ProductID;
  await syncSearchText(productId);
  await writeProductLog({
    productId,
    action: 'created',
    previousValues: null,
    newValues: productData,
    changedBy: adminId,
    notes: 'Created through admin API',
  });

  return { productId };
};

const updateProduct = async (id, productData, adminId = null) => {
  const oldProduct = await getProductById(id);
  if (!oldProduct) throw new Error('Product not found');

  const { name, brand, description, price, oldPrice, stock, categoryId, specs, images, isFeatured } = productData;
  const slug = name ? slugify(name) : null;

  await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .input('name', sql.NVarChar, name || null)
    .input('slug', sql.NVarChar, slug)
    .input('brand', sql.NVarChar, brand ?? null)
    .input('description', sql.NVarChar, description ?? null)
    .input('price', sql.Decimal(18, 2), price === undefined ? null : Number(price))
    .input('oldPrice', sql.Decimal(18, 2), oldPrice === undefined ? null : Number(oldPrice))
    .input('stock', sql.Int, stock === undefined ? null : Number(stock))
    .input('categoryId', sql.Int, categoryId === undefined ? null : Number(categoryId))
    .input('specs', sql.NVarChar, specs === undefined ? null : JSON.stringify(specs || []))
    .input('images', sql.NVarChar, images === undefined ? null : JSON.stringify(images || []))
    .input('isFeatured', sql.Bit, isFeatured === undefined ? null : (isFeatured ? 1 : 0))
    .input('adminId', sql.Int, adminId ? Number(adminId) : null)
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @changed TABLE (ProductID INT, PriceBefore DECIMAL(18,2), Price DECIMAL(18,2), OldPrice DECIMAL(18,2), StockBefore INT, Stock INT);
      UPDATE Products
      SET Name = COALESCE(@name, Name),
          Slug = COALESCE(@slug, Slug),
          Brand = COALESCE(@brand, Brand),
          Description = COALESCE(@description, Description),
          Price = COALESCE(@price, Price),
          OldPrice = COALESCE(@oldPrice, OldPrice),
          Stock = COALESCE(@stock, Stock),
          CategoryID = COALESCE(@categoryId, CategoryID),
          Specs = COALESCE(@specs, Specs),
          Images = COALESCE(@images, Images),
          IsFeatured = COALESCE(@isFeatured, IsFeatured),
          Version = Version + 1,
          UpdatedAt = GETDATE()
      OUTPUT INSERTED.ProductID, DELETED.Price, INSERTED.Price, INSERTED.OldPrice, DELETED.Stock, INSERTED.Stock INTO @changed
      WHERE ProductID = @id AND IsDeleted = 0;
      -- Chỉ ghi lịch sử khi giá bán thật sự đổi.
      INSERT INTO PriceHistory (ProductID, Price, OldPrice)
      SELECT ProductID, Price, OldPrice FROM @changed WHERE Price <> PriceBefore;
      -- Sửa tồn trong form sản phẩm cũng ghi sổ kho.
      INSERT INTO StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
      SELECT ProductID, Stock - StockBefore, Stock, N'adjust', N'Sửa trong form sản phẩm', @adminId
      FROM @changed WHERE Stock <> StockBefore;
      COMMIT TRANSACTION;
    `);

  await syncSearchText(Number(id));
  // Giá hoặc tồn đổi: báo ngay cho khách đang theo dõi giá / chờ có hàng (không chờ lượt quét định kỳ).
  if (price !== undefined || stock !== undefined) notificationService.sweepSoon();
  await writeProductLog({
    productId: Number(id),
    action: 'updated',
    previousValues: oldProduct,
    newValues: productData,
    changedBy: adminId || 0,
    notes: 'Updated through admin API',
  });

  return { productId: Number(id) };
};

const deleteProduct = async (id, adminId = null) => {
  const oldProduct = await getProductById(id);
  if (!oldProduct) throw new Error('Product not found');

  await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .query('UPDATE Products SET IsDeleted = 1, UpdatedAt = GETDATE(), Version = Version + 1 WHERE ProductID = @id');

  await writeProductLog({
    productId: Number(id),
    action: 'deleted',
    previousValues: oldProduct,
    newValues: { IsDeleted: true },
    changedBy: adminId || 0,
    notes: 'Soft deleted through admin API',
  });

  return { productId: Number(id) };
};

const updateStock = async (id, stock, reason, adminId) => {
  const nextStock = Number(stock);
  if (!Number.isInteger(nextStock) || nextStock < 0 || nextStock > 1000000) {
    const err = new Error('Tồn kho phải là số nguyên từ 0 trở lên');
    err.status = 400;
    throw err;
  }
  const note = String(reason || '').trim().slice(0, 300) || 'Điều chỉnh tồn kho';

  // Đặt tồn và ghi sổ kho (chênh lệch so với tồn cũ) trong cùng một transaction.
  const result = await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .input('stock', sql.Int, nextStock)
    .input('note', sql.NVarChar(300), note)
    .input('adminId', sql.Int, adminId ? Number(adminId) : null)
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @after TABLE (StockBefore INT, Stock INT);
      UPDATE Products
      SET Stock = @stock, Version = Version + 1, UpdatedAt = GETDATE()
      OUTPUT DELETED.Stock, INSERTED.Stock INTO @after
      WHERE ProductID = @id AND IsDeleted = 0;
      INSERT INTO StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
      SELECT @id, Stock - StockBefore, Stock, N'adjust', @note, @adminId FROM @after WHERE Stock <> StockBefore;
      COMMIT TRANSACTION;
      SELECT StockBefore, Stock FROM @after;
    `);

  const row = result.recordset[0];
  if (!row) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }
  const oldStock = Number(row.StockBefore);

  await writeProductLog({
    productId: Number(id),
    action: 'stock_adjusted',
    previousValues: { stock: oldStock },
    newValues: { stock: nextStock },
    changedBy: adminId || 0,
    notes: note,
  });

  if (oldStock <= 0 && nextStock > 0) notificationService.sweepSoon();
  return { productId: Number(id), oldStock, newStock: nextStock };
};

/**
 * Lịch sử giá trong `days` ngày gần nhất, kèm mức giá ngay trước khoảng đó
 * để vẽ được đường giá liền mạch, và giá thấp/cao nhất trong khoảng.
 */
const getPriceHistory = async (id, days = 180) => {
  const productId = Number(id);
  const windowDays = Math.min(Math.max(Number.parseInt(days, 10) || 180, 7), 730);
  if (!Number.isInteger(productId) || productId <= 0) return null;

  const result = await new sql.Request(getPool())
    .input('id', sql.Int, productId)
    .input('days', sql.Int, windowDays)
    .query(`
      DECLARE @from DATETIME2 = DATEADD(DAY, -@days, SYSDATETIME());
      SELECT Price, IsDeleted FROM Products WHERE ProductID = @id;
      SELECT Price, OldPrice, ChangedAt
      FROM (
        SELECT TOP (1) Price, OldPrice, ChangedAt
        FROM PriceHistory
        WHERE ProductID = @id AND ChangedAt < @from
        ORDER BY ChangedAt DESC, PriceHistoryID DESC
      ) AS before
      UNION ALL
      SELECT Price, OldPrice, ChangedAt
      FROM PriceHistory
      WHERE ProductID = @id AND ChangedAt >= @from
      ORDER BY ChangedAt;
    `);

  const product = result.recordsets[0][0];
  if (!product || product.IsDeleted) return null;

  const points = result.recordsets[1].map((row) => ({
    price: Number(row.Price),
    oldPrice: row.OldPrice === null ? null : Number(row.OldPrice),
    changedAt: row.ChangedAt,
  }));
  const prices = points.map((point) => point.price).concat(Number(product.Price));
  return {
    productId,
    days: windowDays,
    currentPrice: Number(product.Price),
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    points,
  };
};

module.exports = {
  getPriceHistory,
  getProducts,
  getProductSuggestions,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
};
