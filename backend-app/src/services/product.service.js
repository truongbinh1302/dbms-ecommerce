const { getPool, sql } = require('../config/db.sql');
const ProductLog = require('../models/productLog.model');

const slugify = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const parseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const formatProduct = (row) => ({
  id: row.id ?? row.ProductID,
  name: row.Name,
  slug: row.Slug,
  brand: row.Brand,
  description: row.Description,
  price: Number(row.Price || 0),
  oldPrice: row.OldPrice === null || row.OldPrice === undefined ? null : Number(row.OldPrice),
  stock: Number(row.Stock || 0),
  specs: parseJson(row.Specs, []),
  images: parseJson(row.Images, []),
  isFeatured: Boolean(row.IsFeatured),
  rating: Number(row.Rating || 0),
  reviewsCount: Number(row.ReviewsCount || 0),
  category: {
    id: row.categoryId ?? row.CategoryID,
    name: row.categoryName,
    slug: row.categorySlug,
  },
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
});

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

const getProducts = async (filters = {}) => {
  const {
    q = null,
    category = null,
    brand = null,
    minPrice = null,
    maxPrice = null,
    inStock = null,
    featured = null,
    sort = 'newest',
  } = filters;

  const { page, limit } = normalizePagination(filters.page, filters.limit);
  const offset = (page - 1) * limit;

  let orderBy = 'p.ProductID DESC';
  if (sort === 'price_asc') orderBy = 'p.Price ASC';
  if (sort === 'price_desc') orderBy = 'p.Price DESC';
  if (sort === 'newest') orderBy = 'p.CreatedAt DESC';
  if (sort === 'rating') orderBy = 'p.Rating DESC, p.ReviewsCount DESC';

  const pool = getPool();
  const request = new sql.Request(pool);

  request.input('q', sql.NVarChar, q ? String(q) : null);
  request.input('category', sql.NVarChar, category ? String(category) : null);
  request.input('brand', sql.NVarChar, brand ? String(brand) : null);
  request.input('minPrice', sql.Decimal(18, 2), minPrice === null || minPrice === '' ? null : Number(minPrice));
  request.input('maxPrice', sql.Decimal(18, 2), maxPrice === null || maxPrice === '' ? null : Number(maxPrice));
  request.input('inStock', sql.Bit, inStock === 'true' || inStock === true ? 1 : null);
  request.input('featured', sql.Bit, featured === 'true' || featured === true ? 1 : null);
  request.input('offset', sql.Int, offset);
  request.input('limit', sql.Int, limit);

  const result = await request.query(`
    SELECT p.ProductID AS id, p.Name, p.Slug, p.Brand, p.Description, p.Price, p.OldPrice,
           p.Stock, p.Specs, p.Images, p.IsFeatured, p.Rating, p.ReviewsCount,
           p.CreatedAt, p.UpdatedAt,
           c.CategoryID AS categoryId, c.Name AS categoryName, c.Slug AS categorySlug
    FROM Products p
    LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
    WHERE p.IsDeleted = 0
      AND (@q IS NULL OR p.Name LIKE '%' + @q + '%' OR p.Brand LIKE '%' + @q + '%')
      AND (@category IS NULL OR c.Slug = @category)
      AND (@brand IS NULL OR p.Brand = @brand)
      AND (@minPrice IS NULL OR p.Price >= @minPrice)
      AND (@maxPrice IS NULL OR p.Price <= @maxPrice)
      AND (@inStock IS NULL OR p.Stock > 0)
      AND (@featured IS NULL OR p.IsFeatured = @featured)
    ORDER BY ${orderBy}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const countRequest = new sql.Request(pool);
  countRequest.input('q', sql.NVarChar, q ? String(q) : null);
  countRequest.input('category', sql.NVarChar, category ? String(category) : null);
  countRequest.input('brand', sql.NVarChar, brand ? String(brand) : null);
  countRequest.input('minPrice', sql.Decimal(18, 2), minPrice === null || minPrice === '' ? null : Number(minPrice));
  countRequest.input('maxPrice', sql.Decimal(18, 2), maxPrice === null || maxPrice === '' ? null : Number(maxPrice));
  countRequest.input('inStock', sql.Bit, inStock === 'true' || inStock === true ? 1 : null);
  countRequest.input('featured', sql.Bit, featured === 'true' || featured === true ? 1 : null);

  const countResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM Products p
    LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
    WHERE p.IsDeleted = 0
      AND (@q IS NULL OR p.Name LIKE '%' + @q + '%' OR p.Brand LIKE '%' + @q + '%')
      AND (@category IS NULL OR c.Slug = @category)
      AND (@brand IS NULL OR p.Brand = @brand)
      AND (@minPrice IS NULL OR p.Price >= @minPrice)
      AND (@maxPrice IS NULL OR p.Price <= @maxPrice)
      AND (@inStock IS NULL OR p.Stock > 0)
      AND (@featured IS NULL OR p.IsFeatured = @featured)
  `);

  const totalItems = Number(countResult.recordset[0]?.total || 0);
  return {
    items: result.recordset.map(formatProduct),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

const getProductSuggestions = async (keyword) => {
  if (!keyword || String(keyword).trim().length < 2) return [];

  const pool = getPool();
  const result = await new sql.Request(pool)
    .input('keyword', sql.NVarChar, `%${String(keyword).trim()}%`)
    .query(`
      SELECT TOP 10 ProductID AS id, Name AS name, Price AS price,
             JSON_VALUE(Images, '$[0]') AS thumbnail
      FROM Products
      WHERE IsDeleted = 0 AND Name LIKE @keyword
      ORDER BY Name
    `);

  return result.recordset;
};

const getProductById = async (id) => {
  const result = await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .query(`
      SELECT p.ProductID AS id, p.Name, p.Slug, p.Brand, p.Description,
             p.Price, p.OldPrice, p.Stock, p.Specs, p.Images,
             p.IsFeatured, p.Rating, p.ReviewsCount, p.CreatedAt, p.UpdatedAt,
             c.CategoryID AS categoryId, c.Name AS categoryName, c.Slug AS categorySlug
      FROM Products p
      LEFT JOIN Categories c ON p.CategoryID = c.CategoryID
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
    .query(`
      INSERT INTO Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured)
      OUTPUT INSERTED.ProductID
      VALUES (@name, @slug, @brand, @description, @price, @oldPrice, @stock, @categoryId, @specs, @images, @isFeatured)
    `);

  const productId = result.recordset[0].ProductID;
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
    .query(`
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
      WHERE ProductID = @id AND IsDeleted = 0
    `);

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
  const oldStockResult = await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .query('SELECT Stock FROM Products WHERE ProductID = @id AND IsDeleted = 0');

  const oldStock = oldStockResult.recordset[0]?.Stock;
  if (oldStock === undefined) throw new Error('Product not found');

  await new sql.Request(getPool())
    .input('id', sql.Int, Number(id))
    .input('stock', sql.Int, Number(stock))
    .query('UPDATE Products SET Stock = @stock, Version = Version + 1, UpdatedAt = GETDATE() WHERE ProductID = @id');

  await writeProductLog({
    productId: Number(id),
    action: 'stock_adjusted',
    previousValues: { stock: oldStock },
    newValues: { stock: Number(stock) },
    changedBy: adminId || 0,
    notes: reason || 'Stock adjusted through admin API',
  });

  return { productId: Number(id), oldStock, newStock: Number(stock) };
};

module.exports = {
  getProducts,
  getProductSuggestions,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  updateStock,
};
