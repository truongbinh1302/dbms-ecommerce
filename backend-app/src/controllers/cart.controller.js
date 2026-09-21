const { getPool, sql } = require('../config/db.sql');
const { success, error } = require('../utils/response');

const validateCart = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return error(res, 'Cart is empty', 400);
    }

    const normalizedItems = items.map((item) => ({
      productId: Number(item.productId),
      quantity: Number(item.quantity),
    }));

    const invalid = normalizedItems.find((item) => !Number.isInteger(item.productId) || item.productId <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0);
    if (invalid) {
      return error(res, 'Each cart item must include a valid productId and quantity', 400);
    }

    const uniqueProductIds = [...new Set(normalizedItems.map((item) => item.productId))];
    const request = new sql.Request(getPool());
    uniqueProductIds.forEach((id, index) => request.input(`id${index}`, sql.Int, id));
    const inList = uniqueProductIds.map((_, index) => `@id${index}`).join(', ');

    const result = await request.query(`
      SELECT ProductID, Name, Price, Stock
      FROM Products
      WHERE ProductID IN (${inList}) AND IsDeleted = 0
    `);

    const productsMap = new Map(result.recordset.map((product) => [product.ProductID, product]));
    const issues = [];

    for (const item of normalizedItems) {
      const product = productsMap.get(item.productId);
      if (!product) {
        issues.push({ productId: item.productId, issue: 'product_not_found' });
      } else if (product.Stock < item.quantity) {
        issues.push({
          productId: item.productId,
          productName: product.Name,
          requestedQty: item.quantity,
          availableStock: product.Stock,
          issue: 'insufficient_stock',
        });
      }
    }

    return success(res, {
      valid: issues.length === 0,
      issues,
      products: result.recordset,
    }, 'Cart validation completed');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { validateCart };
