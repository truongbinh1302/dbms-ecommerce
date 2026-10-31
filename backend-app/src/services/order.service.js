const crypto = require('crypto');
const { getPool, sql } = require('../config/db.sql');
const config = require('../config/env');
const pricing = require('./pricing.service');
const voucherService = require('./voucher.service');
const cartService = require('./cart.service');
const { assertShippingAddress } = require('./address.service');

const allowedStatuses = ['pending', 'pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const allowedPaymentMethods = ['cod', 'vnpay'];
const customerCancellableStatuses = ['pending', 'pending_payment', 'confirmed'];
const adminCancellableStatuses = ['pending', 'pending_payment', 'confirmed', 'processing'];
// Tiền đã về (paid) hoặc đã về nhưng cần hoàn (refund_required): callback VNPay đến sau không đổi đơn nữa.
const settledPaymentStatuses = ['paid', 'refund_required'];

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  if (data) err.data = data;
  return err;
};

/**
 * Chuẩn hoá danh sách sản phẩm: gộp các dòng trùng sản phẩm và sắp theo ProductID.
 * Sắp xếp giúp mọi transaction khoá các dòng Products theo cùng một thứ tự,
 * tránh deadlock khi hai đơn nhiều sản phẩm chạy cùng lúc.
 */
const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError(400, 'Order must contain at least one item');
  }

  const merged = new Map();
  for (const item of items) {
    const productId = Number(item && item.productId);
    const quantity = Number(item && item.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw createHttpError(400, 'Each item must include a valid productId and quantity');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  return [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
};

const normalizePaymentMethod = (value) => {
  const method = String(value || 'cod').trim().toLowerCase();
  if (!allowedPaymentMethods.includes(method)) {
    throw createHttpError(400, `Invalid payment method. Allowed: ${allowedPaymentMethods.join(', ')}`);
  }
  return method;
};

const pad = (value, length = 2) => String(value).padStart(length, '0');

const formatOrderCodeDate = (value = new Date()) => {
  const date = new Date(value);

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('');
};

const buildOrderCode = (orderId, createdAt) => {
  const datePart = formatOrderCodeDate(createdAt);
  const idPart = String(orderId).padStart(6, '0');
  const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();

  return `BT${datePart}${idPart}${randomPart}`;
};

const safeRollback = async (transaction) => {
  try {
    await transaction.rollback();
  } catch (rollbackErr) {
    console.warn('Rollback skipped:', rollbackErr.message);
  }
};

/**
 * Khoá và đọc giá, tồn kho của từng sản phẩm trong transaction.
 * Giá luôn lấy từ DB, không lấy từ request.
 */
const lockProductsForOrder = async (transaction, items) => {
  const products = [];
  let subtotal = 0;

  for (const item of items) {
    const result = await new sql.Request(transaction)
      .input('productId', sql.Int, item.productId)
      .query(`
        SELECT ProductID, Name, Price, Stock
        FROM Products WITH (UPDLOCK, ROWLOCK)
        WHERE ProductID = @productId AND IsDeleted = 0
      `);

    const product = result.recordset[0];
    if (!product) {
      throw createHttpError(404, `Product ${item.productId} not found`);
    }

    if (Number(product.Stock) < item.quantity) {
      throw createHttpError(
        409,
        `Product "${product.Name}" has only ${product.Stock} items in stock`,
        { productId: item.productId, availableStock: product.Stock },
      );
    }

    products.push({ ...product, quantity: item.quantity });
    subtotal += Number(product.Price) * item.quantity;
  }

  return { products, subtotal };
};

/**
 * Tạo đơn hàng trong một transaction:
 * khoá sản phẩm → khoá voucher → tính tiền ở server → ghi đơn, chi tiết đơn,
 * trừ kho, ghi lượt dùng voucher → commit. Lỗi ở bất kỳ bước nào thì rollback.
 * Các trường discount / shippingFee / total client gửi lên đều bị bỏ qua.
 */
const createOrder = async (userId, orderData = {}) => {
  const items = normalizeItems(orderData.items);
  const paymentMethod = normalizePaymentMethod(orderData.paymentMethod);
  const voucherCode = voucherService.normalizeVoucherCode(orderData.voucherCode);
  const shippingAddress = assertShippingAddress(orderData.shippingAddress);
  const note = orderData.note ? String(orderData.note).trim().slice(0, 500) || null : null;

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const userCheck = await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .query(`SELECT UserID FROM Users WHERE UserID = @userId AND IsActive = 1`);

    if (!userCheck.recordset[0]) {
      throw createHttpError(401, 'Invalid user or user not found');
    }

    const { products, subtotal } = await lockProductsForOrder(transaction, items);

    let voucher = null;
    if (voucherCode) {
      voucher = await voucherService.findVoucherByCode(transaction, voucherCode, { lock: true });
      const problem = pricing.checkVoucher(voucher, subtotal);
      if (problem) {
        throw createHttpError(400, problem.message, { code: problem.code, voucherCode });
      }
    }

    const quote = pricing.buildQuote(subtotal, voucher);
    const status = paymentMethod === 'cod' ? 'pending' : 'pending_payment';

    const orderResult = await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .input('paymentMethod', sql.NVarChar, paymentMethod)
      .input('status', sql.NVarChar, status)
      .input('subtotal', sql.Decimal(18, 2), quote.subtotal)
      .input('discount', sql.Decimal(18, 2), quote.discount)
      .input('shippingFee', sql.Decimal(18, 2), quote.shippingFee)
      .input('total', sql.Decimal(18, 2), quote.total)
      .input('shippingAddress', sql.NVarChar, JSON.stringify(shippingAddress))
      .input('note', sql.NVarChar, note)
      .query(`
        INSERT INTO Orders (UserID, PaymentMethod, Status, Subtotal, Discount, ShippingFee, Total, ShippingAddress, Note)
        OUTPUT INSERTED.OrderID, INSERTED.CreatedAt
        VALUES (@userId, @paymentMethod, @status, @subtotal, @discount, @shippingFee, @total, @shippingAddress, @note)
      `);

    const orderId = orderResult.recordset[0].OrderID;
    const createdAt = orderResult.recordset[0].CreatedAt;
    const orderCode = buildOrderCode(orderId, createdAt);

    await new sql.Request(transaction)
      .input('orderId', sql.Int, orderId)
      .input('orderCode', sql.NVarChar, orderCode)
      .query(`
        UPDATE Orders
        SET OrderCode = @orderCode,
            UpdatedAt = GETDATE()
        WHERE OrderID = @orderId
      `);

    for (const item of products) {
      await new sql.Request(transaction)
        .input('orderId', sql.Int, orderId)
        .input('productId', sql.Int, item.ProductID)
        .input('quantity', sql.Int, item.quantity)
        .input('unitPrice', sql.Decimal(18, 2), Number(item.Price))
        .query(`
          INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice)
          VALUES (@orderId, @productId, @quantity, @unitPrice)
        `);

      await new sql.Request(transaction)
        .input('productId', sql.Int, item.ProductID)
        .input('quantity', sql.Int, item.quantity)
        .query(`
          UPDATE Products
          SET Stock = Stock - @quantity,
              Version = Version + 1,
              UpdatedAt = GETDATE()
          WHERE ProductID = @productId
        `);
    }

    if (voucher) {
      await new sql.Request(transaction)
        .input('voucherId', sql.Int, voucher.VoucherID)
        .query(`
          UPDATE Vouchers
          SET UsedCount = UsedCount + 1
          WHERE VoucherID = @voucherId
        `);

      await new sql.Request(transaction)
        .input('voucherId', sql.Int, voucher.VoucherID)
        .input('userId', sql.Int, Number(userId))
        .input('orderId', sql.Int, orderId)
        .query(`
          INSERT INTO VoucherUsages (VoucherID, UserID, OrderID)
          VALUES (@voucherId, @userId, @orderId)
        `);
    }

    // Sản phẩm đã mua thì bỏ khỏi giỏ server, cùng transaction với đơn hàng.
    await cartService.removePurchasedItems(transaction, userId, products.map((item) => item.ProductID));

    await transaction.commit();

    return {
      orderId,
      orderCode,
      status,
      paymentMethod,
      ...quote,
      voucherCode: voucher ? voucher.Code : null,
      createdAt,
    };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

/**
 * Báo giá giỏ hàng (không khoá, không ghi gì). Dùng chung quy tắc với createOrder.
 * Voucher không hợp lệ không làm hỏng báo giá, chỉ trả về voucherError.
 */
const quoteCart = async (rawItems, rawVoucherCode = null) => {
  const items = normalizeItems(rawItems);
  const pool = getPool();

  const request = new sql.Request(pool);
  items.forEach((item, index) => request.input(`id${index}`, sql.Int, item.productId));
  const inList = items.map((_, index) => `@id${index}`).join(', ');

  const result = await request.query(`
    SELECT ProductID, Name, Price, Stock
    FROM Products
    WHERE ProductID IN (${inList}) AND IsDeleted = 0
  `);

  const productsById = new Map(result.recordset.map((product) => [product.ProductID, product]));
  const lines = [];
  const issues = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productsById.get(item.productId);
    if (!product) {
      issues.push({ productId: item.productId, issue: 'product_not_found' });
      continue;
    }
    if (Number(product.Stock) < item.quantity) {
      issues.push({
        productId: item.productId,
        productName: product.Name,
        requestedQty: item.quantity,
        availableStock: product.Stock,
        issue: 'insufficient_stock',
      });
    }
    const unitPrice = Number(product.Price);
    subtotal += unitPrice * item.quantity;
    lines.push({
      productId: item.productId,
      name: product.Name,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
    });
  }

  let voucher = null;
  let voucherError = null;
  const voucherCode = voucherService.normalizeVoucherCode(rawVoucherCode);
  if (voucherCode) {
    const found = await voucherService.findVoucherByCode(pool, voucherCode);
    const problem = pricing.checkVoucher(found, subtotal);
    if (problem) {
      voucherError = { code: problem.code, message: problem.message, voucherCode };
    } else {
      voucher = found;
    }
  }

  return {
    items: lines,
    issues,
    ...pricing.buildQuote(subtotal, voucher),
    voucher: voucherService.toPublicVoucher(voucher),
    voucherError,
  };
};

const getUserOrders = async (userId, status = null, page = 1, limit = 10) => {
  const pool = getPool();
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 100);
  const offset = (pageNum - 1) * pageSize;
  const statusCondition = status ? 'AND Status = @status' : '';

  const request = new sql.Request(pool);
  request.input('userId', sql.Int, Number(userId));
  if (status) request.input('status', sql.NVarChar, status);
  request.input('offset', sql.Int, offset);
  request.input('limit', sql.Int, pageSize);

  const result = await request.query(`
    SELECT OrderID AS id, OrderCode AS orderCode, Status, PaymentMethod, PaymentStatus, Total,
           (SELECT COUNT(*) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS itemCount,
           CreatedAt
    FROM Orders o
    WHERE UserID = @userId ${statusCondition}
    ORDER BY CreatedAt DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const countRequest = new sql.Request(pool);
  countRequest.input('userId', sql.Int, Number(userId));
  if (status) countRequest.input('status', sql.NVarChar, status);

  const countResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM Orders
    WHERE UserID = @userId ${statusCondition}
  `);

  const totalItems = Number(countResult.recordset[0]?.total || 0);
  return {
    items: result.recordset,
    pagination: {
      page: pageNum,
      limit: pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
};

const getOrderById = async (orderId, userId = null) => {
  const request = new sql.Request(getPool());
  request.input('orderId', sql.Int, Number(orderId));
  if (userId) request.input('userId', sql.Int, Number(userId));

  const userCondition = userId ? 'AND o.UserID = @userId' : '';

  const result = await request.query(`
    SELECT o.OrderID AS id, o.OrderCode AS orderCode, o.Status, o.PaymentMethod, o.PaymentStatus,
           o.VNPayTxnRef AS txnRef, o.CancelReason,
           o.Subtotal, o.Discount, o.ShippingFee, o.Total, o.Note,
           o.ShippingAddress, o.CreatedAt, o.UpdatedAt,
           u.FullName AS customerName, u.Email, u.Phone
    FROM Orders o
    JOIN Users u ON o.UserID = u.UserID
    WHERE o.OrderID = @orderId ${userCondition}
  `);

  const order = result.recordset[0];
  if (!order) return null;

  const itemsResult = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .query(`
      SELECT oi.ProductID, p.Name AS productName,
             JSON_VALUE(p.Images, '$[0]') AS thumbnail,
             oi.Quantity, oi.UnitPrice
      FROM OrderItems oi
      JOIN Products p ON oi.ProductID = p.ProductID
      WHERE oi.OrderID = @orderId
    `);

  order.items = itemsResult.recordset;
  try {
    order.shippingAddress = JSON.parse(order.ShippingAddress || '{}');
  } catch {
    order.shippingAddress = {};
  }

  return order;
};

/**
 * Đọc và khoá một đơn hàng trong transaction (UPDLOCK) để các thao tác
 * huỷ đơn, xác nhận thanh toán, hết hạn không chen ngang nhau.
 */
const lockOrderById = async (transaction, orderId, userId = null) => {
  const request = new sql.Request(transaction).input('orderId', sql.Int, Number(orderId));
  if (userId) request.input('userId', sql.Int, Number(userId));

  const result = await request.query(`
    SELECT OrderID, UserID, Status, PaymentMethod, PaymentStatus, Total, VNPayTxnRef
    FROM Orders WITH (UPDLOCK, ROWLOCK)
    WHERE OrderID = @orderId ${userId ? 'AND UserID = @userId' : ''}
  `);

  return result.recordset[0] || null;
};

/**
 * Huỷ một đơn ĐÃ được khoá: hoàn kho, trả lại lượt voucher, đổi trạng thái.
 * Chạy bên trong transaction của hàm gọi; hàm gọi chịu trách nhiệm commit/rollback.
 * Nếu đơn đã thanh toán thì chuyển PaymentStatus sang refund_required để admin hoàn tiền.
 */
const cancelLockedOrder = async (transaction, order, { reason = null, paymentStatus = null } = {}) => {
  const orderId = Number(order.OrderID);

  const itemsResult = await new sql.Request(transaction)
    .input('orderId', sql.Int, orderId)
    .query('SELECT ProductID, Quantity FROM OrderItems WHERE OrderID = @orderId ORDER BY ProductID');

  for (const item of itemsResult.recordset) {
    await new sql.Request(transaction)
      .input('productId', sql.Int, item.ProductID)
      .input('quantity', sql.Int, item.Quantity)
      .query(`
        UPDATE Products
        SET Stock = Stock + @quantity,
            Version = Version + 1,
            UpdatedAt = GETDATE()
        WHERE ProductID = @productId
      `);
  }

  const usageResult = await new sql.Request(transaction)
    .input('orderId', sql.Int, orderId)
    .query(`
      DELETE FROM VoucherUsages
      OUTPUT DELETED.VoucherID
      WHERE OrderID = @orderId
    `);

  for (const usage of usageResult.recordset) {
    await new sql.Request(transaction)
      .input('voucherId', sql.Int, usage.VoucherID)
      .query(`
        UPDATE Vouchers
        SET UsedCount = CASE WHEN UsedCount > 0 THEN UsedCount - 1 ELSE 0 END
        WHERE VoucherID = @voucherId
      `);
  }

  const nextPaymentStatus = paymentStatus
    || (order.PaymentStatus === 'paid' ? 'refund_required' : order.PaymentStatus);

  const updated = await new sql.Request(transaction)
    .input('orderId', sql.Int, orderId)
    .input('reason', sql.NVarChar, reason)
    .input('paymentStatus', sql.NVarChar, nextPaymentStatus)
    .query(`
      UPDATE Orders
      SET Status = 'cancelled',
          CancelReason = @reason,
          PaymentStatus = @paymentStatus,
          UpdatedAt = GETDATE()
      OUTPUT INSERTED.UpdatedAt
      WHERE OrderID = @orderId
    `);

  return {
    orderId,
    status: 'cancelled',
    paymentStatus: nextPaymentStatus,
    updatedAt: updated.recordset[0] ? updated.recordset[0].UpdatedAt : null,
  };
};

const cancelOrder = async (orderId, userId, reason) => {
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const order = await lockOrderById(transaction, orderId, userId);
    if (!order) {
      throw createHttpError(404, 'Order not found');
    }

    if (!customerCancellableStatuses.includes(order.Status)) {
      throw createHttpError(422, 'Cannot cancel order in current status');
    }

    const result = await cancelLockedOrder(transaction, order, { reason: reason || null });
    await transaction.commit();
    return { orderId: result.orderId, status: result.status, paymentStatus: result.paymentStatus };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

const updateOrderStatus = async (orderId, status, note) => {
  if (!allowedStatuses.includes(status)) {
    throw createHttpError(400, `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`);
  }

  // Admin huỷ đơn cũng phải hoàn kho và trả lượt voucher như khách huỷ.
  if (status === 'cancelled') {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      const order = await lockOrderById(transaction, orderId);
      if (!order) {
        throw createHttpError(404, 'Order not found');
      }
      if (!adminCancellableStatuses.includes(order.Status)) {
        throw createHttpError(422, `Cannot cancel order in status "${order.Status}"`);
      }
      const result = await cancelLockedOrder(transaction, order, { reason: note || 'Admin huỷ đơn' });
      await transaction.commit();
      return { id: result.orderId, status: result.status, updatedAt: result.updatedAt };
    } catch (err) {
      await safeRollback(transaction);
      throw err;
    }
  }

  // Đơn đã huỷ thì kho đã được hoàn, không cho chuyển sang trạng thái khác nữa.
  const result = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .input('status', sql.NVarChar, status)
    .input('note', sql.NVarChar, note || null)
    .query(`
      UPDATE Orders
      SET Status = @status,
          Note = COALESCE(@note, Note),
          UpdatedAt = GETDATE()
      OUTPUT
        INSERTED.OrderID AS id,
        INSERTED.Status AS status,
        INSERTED.UpdatedAt AS updatedAt
      WHERE OrderID = @orderId AND Status <> 'cancelled'
    `);

  const updatedOrder = result.recordset[0];
  if (!updatedOrder) {
    const exists = await new sql.Request(getPool())
      .input('orderId', sql.Int, Number(orderId))
      .query('SELECT OrderID FROM Orders WHERE OrderID = @orderId');
    if (exists.recordset[0]) {
      throw createHttpError(422, 'Order is cancelled and cannot change status');
    }
    throw createHttpError(404, 'Order not found');
  }

  return updatedOrder;
};

/**
 * Lấy OrderID từ vnp_TxnRef. Mã giao dịch do createPaymentUrl tạo có dạng "<orderId>_<timestamp>".
 */
const parseOrderIdFromTxnRef = (txnRef) => {
  const match = /^(\d+)_\d+$/.exec(String(txnRef || ''));
  return match ? Number(match[1]) : null;
};

/**
 * Ghi nhận kết quả thanh toán VNPay (dùng cho IPN và, ở môi trường dev, trang return).
 * Chữ ký phải được kiểm tra TRƯỚC khi gọi hàm này.
 *
 * Trả về `code` theo quy ước IPN của VNPay:
 *   '00' đã ghi nhận · '01' không tìm thấy đơn · '02' đơn đã xử lý trước đó · '04' sai số tiền
 *
 * - So số tiền vnp_Amount với Total trong DB (VNPay gửi số tiền × 100).
 * - Idempotent: callback lặp lại sau khi đã ghi nhận sẽ trả '02', không ghi gì thêm.
 * - Thất bại ở lần thanh toán mới nhất → huỷ đơn, hoàn kho, trả voucher.
 * - Thành công nhưng đơn đã bị huỷ (ví dụ quá hạn) → đánh dấu refund_required.
 */
const applyVNPayResult = async ({ txnRef, responseCode, transactionStatus, amount }) => {
  const orderId = parseOrderIdFromTxnRef(txnRef);
  if (!orderId) {
    return { code: '01' };
  }

  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const order = await lockOrderById(transaction, orderId);
    if (!order || order.PaymentMethod !== 'vnpay') {
      await safeRollback(transaction);
      return { code: '01' };
    }

    const base = { orderId: Number(order.OrderID) };
    const expectedAmount = Math.round(Number(order.Total) * 100);
    if (Number(amount) !== expectedAmount) {
      await safeRollback(transaction);
      return { ...base, code: '04', expectedAmount, receivedAmount: Number(amount) };
    }

    const succeeded = responseCode === '00'
      && (transactionStatus === undefined || transactionStatus === null || transactionStatus === '00');

    // Đã ghi nhận tiền về rồi, hoặc đã ghi nhận thất bại rồi: callback lặp lại thì bỏ qua.
    const alreadyHandled = settledPaymentStatuses.includes(order.PaymentStatus)
      || (!succeeded && order.PaymentStatus === 'failed');
    if (alreadyHandled) {
      await safeRollback(transaction);
      return { ...base, code: '02', paymentStatus: order.PaymentStatus, orderStatus: order.Status };
    }

    if (succeeded) {
      const paymentStatus = order.Status === 'cancelled' ? 'refund_required' : 'paid';
      const orderStatus = order.Status === 'pending_payment' ? 'confirmed' : order.Status;

      await new sql.Request(transaction)
        .input('orderId', sql.Int, base.orderId)
        .input('paymentStatus', sql.NVarChar, paymentStatus)
        .input('status', sql.NVarChar, orderStatus)
        .input('txnRef', sql.NVarChar, String(txnRef))
        .query(`
          UPDATE Orders
          SET PaymentStatus = @paymentStatus,
              Status = @status,
              VNPayTxnRef = @txnRef,
              UpdatedAt = GETDATE()
          WHERE OrderID = @orderId
        `);

      await transaction.commit();
      if (paymentStatus === 'refund_required') {
        console.warn(`[VNPay] Order ${base.orderId} was paid after being cancelled; refund required.`);
      }
      return { ...base, code: '00', paymentStatus, orderStatus };
    }

    // Thất bại từ một link cũ (khách đã tạo link mới) thì bỏ qua, không huỷ đơn.
    const isLatestAttempt = order.VNPayTxnRef === String(txnRef);
    if (order.Status === 'pending_payment' && isLatestAttempt) {
      const result = await cancelLockedOrder(transaction, order, {
        reason: `Thanh toán VNPay không thành công (mã ${responseCode})`,
        paymentStatus: 'failed',
      });
      await transaction.commit();
      return { ...base, code: '00', paymentStatus: result.paymentStatus, orderStatus: result.status };
    }

    await safeRollback(transaction);
    return { ...base, code: '00', paymentStatus: order.PaymentStatus, orderStatus: order.Status, ignored: true };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

/**
 * Thông tin để tạo link VNPay: còn bao nhiêu giây trước khi đơn hết hạn thanh toán.
 * Tính bằng giờ của DB server để không lệch múi giờ giữa Node và SQL Server.
 */
const getPaymentWindow = async (orderId, userId, expireMinutes = config.payment.expireMinutes) => {
  const result = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .input('userId', sql.Int, Number(userId))
    .input('minutes', sql.Int, Number(expireMinutes))
    .query(`
      SELECT OrderID, Status, PaymentMethod, PaymentStatus, Total,
             DATEDIFF(SECOND, SYSDATETIME(), DATEADD(MINUTE, @minutes, CreatedAt)) AS SecondsLeft
      FROM Orders
      WHERE OrderID = @orderId AND UserID = @userId
    `);

  return result.recordset[0] || null;
};

/**
 * Huỷ các đơn VNPay quá hạn mà chưa thanh toán, hoàn kho và trả voucher.
 * Mỗi đơn xử lý trong transaction riêng và kiểm tra lại trạng thái sau khi khoá,
 * nên nếu IPN thành công đến cùng lúc thì chỉ một bên thắng.
 */
const expireStalePayments = async (expireMinutes = config.payment.expireMinutes) => {
  const candidates = await new sql.Request(getPool())
    .input('minutes', sql.Int, Number(expireMinutes))
    .query(`
      SELECT OrderID
      FROM Orders
      WHERE Status = 'pending_payment'
        AND PaymentStatus NOT IN ('paid', 'refund_required')
        AND CreatedAt < DATEADD(MINUTE, -@minutes, SYSDATETIME())
    `);

  let expired = 0;
  for (const row of candidates.recordset) {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      const order = await lockOrderById(transaction, row.OrderID);
      if (!order || order.Status !== 'pending_payment' || settledPaymentStatuses.includes(order.PaymentStatus)) {
        await safeRollback(transaction);
        continue;
      }
      await cancelLockedOrder(transaction, order, {
        reason: `Quá hạn thanh toán ${expireMinutes} phút`,
        paymentStatus: 'expired',
      });
      await transaction.commit();
      expired += 1;
    } catch (err) {
      await safeRollback(transaction);
      console.error(`[payments] Could not expire order ${row.OrderID}:`, err.message);
    }
  }

  return expired;
};

const getAdminOrders = async (status = null, page = 1, limit = 20) => {
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const offset = (pageNum - 1) * pageSize;
  const statusCondition = status ? 'WHERE o.Status = @status' : '';
  const request = new sql.Request(getPool());
  if (status) {
    request.input('status', sql.NVarChar, status);
  }
  request.input('offset', sql.Int, offset);
  request.input('limit', sql.Int, pageSize);

  const result = await request.query(`
    SELECT
      o.OrderID AS id,
      o.Status AS status,
      o.PaymentMethod AS paymentMethod,
      o.PaymentStatus AS paymentStatus,
      o.Total AS total,
      o.CreatedAt AS createdAt,
      u.FullName AS customerName,
      u.Email AS customerEmail,
      COUNT(oi.OrderItemID) AS itemCount,
      COALESCE(
        STRING_AGG(
          CONVERT(NVARCHAR(MAX), CONCAT(p.Name, N' x', oi.Quantity)), N', '
        ),
        N'Không có sản phẩm'
      ) AS itemsText
    FROM Orders o
    JOIN Users u ON o.UserID = u.UserID
    LEFT JOIN OrderItems oi ON o.OrderID = oi.OrderID
    LEFT JOIN Products p ON oi.ProductID = p.ProductID
    ${statusCondition}
    GROUP BY
      o.OrderID,
      o.Status,
      o.PaymentMethod,
      o.PaymentStatus,
      o.Total,
      o.CreatedAt,
      u.FullName,
      u.Email
    ORDER BY o.CreatedAt DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  const countRequest = new sql.Request(getPool());
  if (status) {
    countRequest.input('status', sql.NVarChar, status);
  }
  const countResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM Orders
    ${status ? 'WHERE Status = @status' : ''}
  `);

  const totalItems = Number(countResult.recordset[0]?.total || 0);

  return {
    items: result.recordset,
    pagination: {
      page: pageNum,
      limit: pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
};

const updateOrderPayment = async (orderId, paymentStatus, txnRef = null, status = null) => {
  const request = new sql.Request(getPool());

  request.input('orderId', sql.Int, Number(orderId));
  request.input('paymentStatus', sql.NVarChar, paymentStatus);
  request.input('txnRef', sql.NVarChar, txnRef);
  request.input('status', sql.NVarChar, status);

  await request.query(`
    UPDATE Orders
    SET PaymentStatus = @paymentStatus,
        VNPayTxnRef = COALESCE(@txnRef, VNPayTxnRef),
        Status = COALESCE(@status, Status),
        UpdatedAt = GETDATE()
    WHERE OrderID = @orderId
  `);

  return {
    orderId: Number(orderId),
    paymentStatus,
    txnRef,
    status,
  };
};

const getOrderByVNPayTxnRef = async (txnRef) => {
  const result = await new sql.Request(getPool())
    .input('txnRef', sql.NVarChar, txnRef)
    .query(`
      SELECT 
        OrderID AS id,
        Status AS status,
        PaymentMethod AS paymentMethod,
        PaymentStatus AS paymentStatus,
        VNPayTxnRef AS txnRef,
        Total AS total
      FROM Orders
      WHERE VNPayTxnRef = @txnRef
    `);

  return result.recordset[0] || null;
};

const getOrderPaymentStatus = async (orderId, userId = null) => {
  const request = new sql.Request(getPool());

  request.input('orderId', sql.Int, Number(orderId));

  if (userId) {
    request.input('userId', sql.Int, Number(userId));
  }

  const userCondition = userId ? 'AND o.UserID = @userId' : '';

  const result = await request.query(`
    SELECT 
      o.OrderID AS id,
      o.Status AS orderStatus,
      o.PaymentMethod AS paymentMethod,
      o.PaymentStatus AS paymentStatus,
      o.VNPayTxnRef AS txnRef,
      o.Total AS total,
      o.CreatedAt,
      o.UpdatedAt
    FROM Orders o
    WHERE o.OrderID = @orderId ${userCondition}
  `);

  return result.recordset[0] || null;
};

module.exports = {
  createOrder,
  quoteCart,
  getUserOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  getAdminOrders,
  updateOrderPayment,
  getOrderByVNPayTxnRef,
  getOrderPaymentStatus,
  applyVNPayResult,
  getPaymentWindow,
  expireStalePayments,
  // Xuất thêm để viết unit test
  normalizeItems,
  parseOrderIdFromTxnRef,
};
