const { getPool, sql } = require('../config/db.sql');
const { formatProduct } = require('../utils/productFormat');
const { promoApply, PROMO_COLUMNS } = require('./promotionSql');

/*
  Giỏ hàng lưu ở server (bảng CartItems) cho khách đã đăng nhập.
  Mô hình đồng bộ đơn giản: client gửi lên toàn bộ giỏ (PUT /cart), server thay thế.
  Khách chưa đăng nhập vẫn dùng giỏ trong localStorage như trước; khi đăng nhập,
  frontend gộp giỏ local với giỏ server rồi gửi lên một lần.
*/

const MAX_QUANTITY = 99;
const MAX_LINES = 50;

const createHttpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

/** Gộp dòng trùng sản phẩm, giới hạn số lượng 1..99 và tối đa 50 dòng. Giỏ rỗng là hợp lệ. */
const normalizeCartItems = (items) => {
  if (!Array.isArray(items)) {
    throw createHttpError(400, 'items must be an array');
  }

  const merged = new Map();
  for (const item of items) {
    const productId = Number(item && item.productId);
    const quantity = Number(item && item.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw createHttpError(400, 'Each cart item must include a valid productId and quantity');
    }
    merged.set(productId, Math.min(MAX_QUANTITY, (merged.get(productId) || 0) + quantity));
  }

  if (merged.size > MAX_LINES) {
    throw createHttpError(400, `A cart can hold at most ${MAX_LINES} different products`);
  }

  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

const getCart = async (userId, executor = getPool()) => {
  const result = await new sql.Request(executor)
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT ci.ProductID AS id, ci.Quantity AS cartQuantity, ci.UpdatedAt AS cartUpdatedAt,
             p.Name, p.Slug, p.Brand, p.Description, p.Price, p.OldPrice, p.Stock, p.Specs, p.Images,
             p.IsFeatured, p.Rating, p.ReviewsCount, p.CreatedAt, p.UpdatedAt,
             c.CategoryID AS categoryId, c.Name AS categoryName, c.Slug AS categorySlug,
             ${PROMO_COLUMNS}
      FROM CartItems ci
      JOIN Products p ON p.ProductID = ci.ProductID
      LEFT JOIN Categories c ON c.CategoryID = p.CategoryID
      ${promoApply('p')}
      WHERE ci.UserID = @userId AND p.IsDeleted = 0
      ORDER BY ci.UpdatedAt DESC, ci.ProductID
    `);

  return {
    items: result.recordset.map((row) => ({
      productId: row.id,
      quantity: row.cartQuantity,
      product: formatProduct(row),
    })),
  };
};

/**
 * Thay toàn bộ giỏ của user bằng danh sách mới (trong một transaction).
 * Sản phẩm không tồn tại hoặc đã ẩn bị bỏ qua thay vì làm hỏng cả giỏ.
 */
const replaceCart = async (userId, rawItems) => {
  const items = normalizeCartItems(rawItems);
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    let validItems = [];
    if (items.length > 0) {
      const check = new sql.Request(transaction);
      items.forEach((item, index) => check.input(`id${index}`, sql.Int, item.productId));
      const existing = await check.query(`
        SELECT ProductID
        FROM Products
        WHERE ProductID IN (${items.map((_, index) => `@id${index}`).join(', ')}) AND IsDeleted = 0
      `);
      const existingIds = new Set(existing.recordset.map((row) => row.ProductID));
      validItems = items.filter((item) => existingIds.has(item.productId));
    }

    await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .query('DELETE FROM CartItems WHERE UserID = @userId');

    for (const item of validItems) {
      await new sql.Request(transaction)
        .input('userId', sql.Int, Number(userId))
        .input('productId', sql.Int, item.productId)
        .input('quantity', sql.Int, item.quantity)
        .query(`
          INSERT INTO CartItems (UserID, ProductID, Quantity)
          VALUES (@userId, @productId, @quantity)
        `);
    }

    const cart = await getCart(userId, transaction);
    await transaction.commit();
    return cart;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.warn('Rollback skipped:', rollbackErr.message);
    }
    throw err;
  }
};

/** Xoá các sản phẩm vừa mua khỏi giỏ server. Gọi bên trong transaction tạo đơn. */
const removePurchasedItems = async (transaction, userId, productIds) => {
  const ids = [...new Set(productIds.map(Number))].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return;

  const request = new sql.Request(transaction).input('userId', sql.Int, Number(userId));
  ids.forEach((id, index) => request.input(`p${index}`, sql.Int, id));
  await request.query(`
    DELETE FROM CartItems
    WHERE UserID = @userId AND ProductID IN (${ids.map((_, index) => `@p${index}`).join(', ')})
  `);
};

module.exports = {
  normalizeCartItems,
  getCart,
  replaceCart,
  removePurchasedItems,
};
