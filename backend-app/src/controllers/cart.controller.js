const { getPool, sql } = require('../config/db.sql');
const orderService = require('../services/order.service');
const cartService = require('../services/cart.service');
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

/**
 * Báo giá giỏ hàng: giá lấy từ DB, phí ship và giảm giá tính bằng cùng quy tắc với lúc tạo đơn.
 * Không cần đăng nhập, không ghi gì vào DB.
 */
const quoteCart = async (req, res) => {
  try {
    const { items, voucherCode, quoteCode } = req.body || {};
    const quote = await orderService.quoteCart(items, voucherCode, quoteCode);
    return success(res, quote, 'Cart quote calculated');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

const getMyCart = async (req, res) => {
  try {
    const cart = await cartService.getCart(req.user.id);
    return success(res, cart, 'Cart retrieved');
  } catch (err) {
    return error(res, err.message);
  }
};

// Thay toàn bộ giỏ server bằng danh sách client gửi lên (frontend đã gộp giỏ local trước khi gửi).
const replaceMyCart = async (req, res) => {
  try {
    const cart = await cartService.replaceCart(req.user.id, (req.body || {}).items);
    return success(res, cart, 'Cart saved');
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    return error(res, err.message);
  }
};

module.exports = { validateCart, quoteCart, getMyCart, replaceMyCart };
