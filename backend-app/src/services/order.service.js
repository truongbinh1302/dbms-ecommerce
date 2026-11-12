const crypto = require('crypto');
const { getPool, sql } = require('../config/db.sql');
const config = require('../config/env');
const pricing = require('./pricing.service');
const voucherService = require('./voucher.service');
const cartService = require('./cart.service');
const priceQuoteService = require('./priceQuote.service');
const inventoryService = require('./inventory.service');
const promotionService = require('./promotion.service');
const notificationService = require('./notification.service');
const returnService = require('./return.service');
const auctionService = require('./auction.service');
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
const lockProductsForOrder = async (transaction, items, { heldProductId = null } = {}) => {
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

    // Sản phẩm của phiên đấu giá đã được giữ khỏi kho từ lúc mở phiên, không trừ hay kiểm tra lại.
    const held = heldProductId !== null && item.productId === heldProductId;
    if (!held && Number(product.Stock) < item.quantity) {
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
  const auctionId = orderData.auctionId === undefined || orderData.auctionId === null || orderData.auctionId === ''
    ? null
    : Number(orderData.auctionId);
  if (auctionId !== null && (!Number.isInteger(auctionId) || auctionId <= 0)) throw createHttpError(400, 'Phiên đấu giá không hợp lệ');
  if (auctionId !== null && voucherCode) throw createHttpError(400, 'Đơn đấu giá không dùng được voucher', { code: 'auction_no_voucher' });
  const quoteCode = orderData.quoteCode && auctionId === null ? String(orderData.quoteCode).trim().toUpperCase() : null;
  const termsVersion = orderData.termsVersion ? String(orderData.termsVersion).slice(0, 20) : null;
  const rawExpected = orderData.expectedTotal;
  const expectedTotal = rawExpected === undefined || rawExpected === null || rawExpected === ''
    || !Number.isFinite(Number(rawExpected))
    ? null
    : Math.round(Number(rawExpected));

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // UPDLOCK trên dòng Users: đặt hàng và xoá tài khoản cùng lúc sẽ chạy lần lượt,
    // nên không có đơn mới lọt vào tài khoản vừa bị xoá.
    const userCheck = await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .query(`SELECT UserID FROM Users WITH (UPDLOCK, ROWLOCK) WHERE UserID = @userId AND IsActive = 1`);

    if (!userCheck.recordset[0]) {
      throw createHttpError(401, 'Invalid user or user not found');
    }

    // Đơn của phiên đấu giá: khoá phiên trước khi khoá sản phẩm (cùng thứ tự Users → Auctions → Products
    // với lúc chốt phiên và trả hàng về kho), kiểm tra đúng người thắng và còn hạn đặt hàng.
    const auction = auctionId !== null ? await auctionService.lockForOrder(transaction, userId, auctionId) : null;
    if (auction && !items.some((item) => item.productId === auction.productId && item.quantity === 1)) {
      throw createHttpError(400, 'Đơn đấu giá phải có đúng 1 sản phẩm của phiên', { code: 'auction_item_mismatch' });
    }

    const { products } = await lockProductsForOrder(transaction, items, { heldProductId: auction ? auction.productId : null });

    // Đặt theo báo giá Build PC: báo giá hết hạn thì báo lỗi để khách xem lại giá mới,
    // không âm thầm tính giá khác với giá khách đã thấy.
    let lockedQuote = quoteCode ? await priceQuoteService.loadLockedPrices(transaction, quoteCode) : null;
    if (lockedQuote && !products.some((product) => lockedQuote.prices.has(product.ProductID))) {
      lockedQuote = null;
    }
    // Hot Deal: khoá dòng PromotionItems (sau khi đã khoá Products) để hai đơn không cùng lấy suất cuối.
    const promotions = await promotionService.loadForProducts(transaction, products.map((product) => product.ProductID), { lock: true });
    const lines = pricing.applyLockedPrices(
      pricing.applyPromotions(
        products.map((product) => ({ productId: product.ProductID, quantity: product.quantity, unitPrice: Number(product.Price) })),
        promotions,
      ),
      lockedQuote ? lockedQuote.prices : null,
    ).map((line) => (auction && line.productId === auction.productId
      // Giá thắng đấu giá thay cho giá niêm yết, không cộng Hot Deal.
      ? { ...line, unitPrice: auction.price, lineTotal: auction.price, promotionId: null, promotion: null, priceLocked: false }
      : line));
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

    let voucher = null;
    if (voucherCode) {
      voucher = await voucherService.findVoucherByCode(transaction, voucherCode, { lock: true });
      const problem = pricing.checkVoucher(voucher, subtotal);
      if (problem) {
        throw createHttpError(400, problem.message, { code: problem.code, voucherCode });
      }
    }

    const quote = pricing.buildQuote(subtotal, voucher);
    // Khách gửi kèm tổng tiền đã thấy ở trang thanh toán: nếu giá vừa đổi (Hot Deal hết suất, hết giờ,
    // admin đổi giá) thì dừng lại cho khách xem giá mới, không âm thầm tính số tiền khác.
    if (expectedTotal !== null && expectedTotal !== quote.total) {
      throw createHttpError(409, 'Giá đơn hàng vừa thay đổi. Vui lòng kiểm tra lại tổng tiền rồi đặt lại.', {
        code: 'price_changed',
        expectedTotal,
        total: quote.total,
        items: lines.map((line) => ({ productId: line.productId, unitPrice: line.unitPrice, promotionNote: line.promotionNote || null })),
      });
    }
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
      .input('quoteCode', sql.NVarChar(20), lockedQuote ? lockedQuote.code : null)
      .input('termsVersion', sql.NVarChar(20), termsVersion)
      .query(`
        INSERT INTO Orders (UserID, PaymentMethod, Status, Subtotal, Discount, ShippingFee, Total, ShippingAddress, Note, QuoteCode, TermsVersion)
        OUTPUT INSERTED.OrderID, INSERTED.CreatedAt
        VALUES (@userId, @paymentMethod, @status, @subtotal, @discount, @shippingFee, @total, @shippingAddress, @note, @quoteCode, @termsVersion)
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
    await recordStatusChange(transaction, { orderId, to: status, by: 'customer' });

    for (const [index, item] of products.entries()) {
      await new sql.Request(transaction)
        .input('orderId', sql.Int, orderId)
        .input('productId', sql.Int, item.ProductID)
        .input('quantity', sql.Int, item.quantity)
        .input('unitPrice', sql.Decimal(18, 2), lines[index].unitPrice)
        .input('promotionId', sql.Int, lines[index].promotionId || null)
        .query(`
          INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice, PromotionID)
          VALUES (@orderId, @productId, @quantity, @unitPrice, @promotionId)
        `);

      if (lines[index].promotionId) {
        await promotionService.consume(transaction, {
          promotionId: lines[index].promotionId,
          productId: item.ProductID,
          quantity: item.quantity,
        });
      }

      if (!auction || item.ProductID !== auction.productId) {
        await inventoryService.changeStock(transaction, {
          productId: item.ProductID,
          change: -item.quantity,
          reason: 'sale',
          orderId,
        });
      }
    }

    if (auction) await auctionService.markOrdered(transaction, auction.auctionId, orderId);

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
      quoteCode: lockedQuote ? lockedQuote.code : null,
      auctionId: auction ? auction.auctionId : null,
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
const quoteCart = async (rawItems, rawVoucherCode = null, rawQuoteCode = null) => {
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
  const baseLines = [];
  const issues = [];

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
    baseLines.push({
      productId: item.productId,
      name: product.Name,
      unitPrice: Number(product.Price),
      quantity: item.quantity,
    });
  }

  // Báo giá Build PC sai hoặc hết hạn không làm hỏng báo giá giỏ hàng, chỉ trả về priceLockError.
  let lockedQuote = null;
  let quoteError = null;
  if (rawQuoteCode) {
    try {
      lockedQuote = await priceQuoteService.loadLockedPrices(pool, rawQuoteCode);
    } catch (err) {
      if (!err.status) throw err;
      quoteError = { ...(err.data || {}), message: err.message };
    }
  }
  // Giỏ không còn sản phẩm nào của báo giá thì coi như không dùng báo giá.
  if (lockedQuote && !baseLines.some((line) => lockedQuote.prices.has(line.productId))) {
    lockedQuote = null;
  }
  const promotions = await promotionService.loadForProducts(pool, baseLines.map((line) => line.productId));
  const lines = pricing.applyLockedPrices(pricing.applyPromotions(baseLines, promotions), lockedQuote ? lockedQuote.prices : null);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

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
    priceLock: lockedQuote ? { code: lockedQuote.code, expiresAt: lockedQuote.expiresAt } : null,
    priceLockError: quoteError,
  };
};

const getUserOrders = async (userId, status = null, page = 1, limit = 10) => {
  const pool = getPool();
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 100);
  const offset = (pageNum - 1) * pageSize;
  // Một hoặc nhiều trạng thái, cách nhau bằng dấu phẩy (tab "Đang xử lý" gồm nhiều trạng thái).
  const statuses = String(status || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (statuses.some((item) => !allowedStatuses.includes(item))) {
    throw createHttpError(400, `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`);
  }
  const statusesJson = statuses.length ? JSON.stringify(statuses) : null;
  const statusCondition = 'AND (@statuses IS NULL OR Status IN (SELECT value FROM OPENJSON(@statuses)))';

  const result = await new sql.Request(pool)
    .input('userId', sql.Int, Number(userId))
    .input('statuses', sql.NVarChar(sql.MAX), statusesJson)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, pageSize)
    .query(`
      SELECT OrderID AS id, OrderCode AS orderCode, Status, PaymentMethod, PaymentStatus, Total,
             (SELECT COUNT(*) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS itemCount,
             CreatedAt
      FROM Orders o
      WHERE UserID = @userId ${statusCondition}
      ORDER BY CreatedAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS total FROM Orders WHERE UserID = @userId ${statusCondition};

      -- Số đơn theo từng trạng thái (cho các tab), không phụ thuộc bộ lọc đang chọn.
      SELECT Status, COUNT(*) AS Total FROM Orders WHERE UserID = @userId GROUP BY Status;
    `);

  const totalItems = Number(result.recordsets[1][0]?.total || 0);
  return {
    items: result.recordsets[0],
    counts: Object.fromEntries(result.recordsets[2].map((row) => [row.Status, Number(row.Total)])),
    pagination: {
      page: pageNum,
      limit: pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
};

/**
 * Ghi một dòng lịch sử trạng thái đơn (migration 020). Gọi trong cùng transaction với lệnh đổi trạng thái.
 * by: customer | admin | payment | system.
 */
const recordStatusChange = (runner, { orderId, from = null, to, by = 'system', note = null }) => new sql.Request(runner)
  .input('orderId', sql.Int, Number(orderId))
  .input('from', sql.NVarChar(50), from)
  .input('to', sql.NVarChar(50), to)
  .input('by', sql.NVarChar(20), by)
  .input('note', sql.NVarChar(500), note ? String(note).slice(0, 500) : null)
  .query('INSERT INTO OrderStatusHistory (OrderID, FromStatus, ToStatus, ChangedBy, Note) VALUES (@orderId, @from, @to, @by, @note)');

const getOrderById = async (orderId, userId = null) => {
  const request = new sql.Request(getPool());
  request.input('orderId', sql.Int, Number(orderId));
  if (userId) request.input('userId', sql.Int, Number(userId));

  const userCondition = userId ? 'AND o.UserID = @userId' : '';

  const result = await request.query(`
    SELECT o.OrderID AS id, o.OrderCode AS orderCode, o.Status, o.PaymentMethod, o.PaymentStatus,
           o.VNPayTxnRef AS txnRef, o.CancelReason,
           o.Subtotal, o.Discount, o.ShippingFee, o.Total, o.Note, o.QuoteCode AS quoteCode, o.TermsVersion AS termsVersion,
           (SELECT TOP 1 AuctionID FROM Auctions au WHERE au.OrderID = o.OrderID) AS auctionId,
           o.ShippingAddress, o.CreatedAt, o.UpdatedAt,
           o.ShippingCarrier AS shippingCarrier, o.TrackingCode AS trackingCode,
           o.ShippedAt AS shippedAt, o.DeliveredAt AS deliveredAt,
           o.RefundAmount AS refundAmount, o.RefundReference AS refundReference, o.RefundedAt AS refundedAt,
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
             oi.Quantity, oi.UnitPrice, oi.PromotionID AS promotionId, pr.Name AS promotionName
      FROM OrderItems oi
      JOIN Products p ON oi.ProductID = p.ProductID
      LEFT JOIN Promotions pr ON pr.PromotionID = oi.PromotionID
      WHERE oi.OrderID = @orderId
    `);

  order.items = itemsResult.recordset;

  const warrantiesResult = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .query(`
      SELECT SerialNumber AS serialNumber, ProductID AS productId,
             CONVERT(CHAR(10), StartDate, 23) AS startDate, CONVERT(CHAR(10), EndDate, 23) AS endDate
      FROM Warranties
      WHERE OrderID = @orderId
      ORDER BY ProductID, SerialNumber
    `);
  order.warranties = warrantiesResult.recordset;
  order.returns = await returnService.listForOrder(orderId);
  order.returnWindow = await returnService.getReturnWindow(orderId);

  // Lịch sử trạng thái: khách chỉ thấy ghi chú của lần huỷ (lý do huỷ vốn đã hiện cho khách);
  // ghi chú nội bộ của admin ở các bước khác chỉ admin thấy.
  const historyResult = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .query(`
      SELECT FromStatus, ToStatus, ChangedBy, Note, ChangedAt
      FROM OrderStatusHistory
      WHERE OrderID = @orderId
      ORDER BY HistoryID
    `);
  order.history = historyResult.recordset.map((row) => ({
    from: row.FromStatus,
    status: row.ToStatus,
    by: row.ChangedBy,
    note: !userId || row.ToStatus === 'cancelled' ? row.Note : null,
    at: row.ChangedAt,
  }));

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
const cancelLockedOrder = async (transaction, order, { reason = null, paymentStatus = null, by = 'system' } = {}) => {
  const orderId = Number(order.OrderID);

  const itemsResult = await new sql.Request(transaction)
    .input('orderId', sql.Int, orderId)
    .query('SELECT ProductID, Quantity, PromotionID FROM OrderItems WHERE OrderID = @orderId ORDER BY ProductID');

  for (const item of itemsResult.recordset) {
    await inventoryService.changeStock(transaction, {
      productId: item.ProductID,
      change: Number(item.Quantity),
      reason: 'cancel',
      orderId,
      note: reason ? String(reason).slice(0, 300) : null,
    });
    if (item.PromotionID) {
      await promotionService.release(transaction, { promotionId: item.PromotionID, productId: item.ProductID, quantity: Number(item.Quantity) });
    }
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
  await recordStatusChange(transaction, { orderId, from: order.Status, to: 'cancelled', by, note: reason });

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

    const result = await cancelLockedOrder(transaction, order, { reason: reason || null, by: 'customer' });
    await transaction.commit();
    notificationService.sweepSoon(); // hàng trả về kho: báo khách đang chờ có hàng
    return { orderId: result.orderId, status: result.status, paymentStatus: result.paymentStatus };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

const SHIPPING_CARRIER_MAX = 50;
const TRACKING_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,59}$/;

/** Đơn vị vận chuyển và mã vận đơn admin nhập khi giao đơn cho bên vận chuyển. */
const normalizeShipment = ({ carrier, trackingCode } = {}) => {
  const cleanCarrier = String(carrier ?? '').trim().replace(/\s+/g, ' ');
  const cleanCode = String(trackingCode ?? '').trim();
  if (cleanCarrier.length > SHIPPING_CARRIER_MAX) throw createHttpError(400, `Tên đơn vị vận chuyển tối đa ${SHIPPING_CARRIER_MAX} ký tự`);
  if (cleanCode && !TRACKING_CODE_PATTERN.test(cleanCode)) {
    throw createHttpError(400, 'Mã vận đơn chỉ gồm chữ, số, dấu chấm, gạch ngang (3–60 ký tự)');
  }
  if (cleanCode && !cleanCarrier) throw createHttpError(400, 'Hãy nhập đơn vị vận chuyển cho mã vận đơn');
  return { carrier: cleanCarrier || null, trackingCode: cleanCode || null };
};

const shippedMessage = ({ carrier, trackingCode }) => {
  if (carrier && trackingCode) return `Đơn đang được ${carrier} giao tới bạn, mã vận đơn ${trackingCode}.`;
  if (carrier) return `Đơn đang được ${carrier} giao tới bạn.`;
  return 'Đơn đang trên đường giao tới bạn.';
};

const updateOrderStatus = async (orderId, status, note, shipment = {}) => {
  if (!allowedStatuses.includes(status)) {
    throw createHttpError(400, `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`);
  }
  const { carrier, trackingCode } = status === 'shipped' ? normalizeShipment(shipment) : { carrier: null, trackingCode: null };

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
      const result = await cancelLockedOrder(transaction, order, { reason: note || 'Admin huỷ đơn', by: 'admin' });
      await notificationService.notify(transaction, {
        userId: order.UserID,
        type: 'order_status',
        title: `Đơn #${order.OrderID} đã bị huỷ`,
        body: note || 'Cửa hàng đã huỷ đơn. Nếu bạn đã thanh toán, tiền sẽ được hoàn lại.',
        link: `/don-hang/${order.OrderID}`,
      });
      await transaction.commit();
      notificationService.sweepSoon();
      return { id: result.orderId, status: result.status, updatedAt: result.updatedAt };
    } catch (err) {
      await safeRollback(transaction);
      throw err;
    }
  }

  // Đơn đã có yêu cầu đổi trả thì giữ trạng thái "đã giao" (mốc tính hạn đổi trả).
  if (status !== 'delivered') {
    const returns = await new sql.Request(getPool())
      .input('orderId', sql.Int, Number(orderId))
      .query(`
        SELECT COUNT(*) AS Total FROM ReturnRequests
        WHERE OrderID = @orderId AND Status NOT IN (N'rejected', N'cancelled')
      `);
    if (Number(returns.recordset[0].Total) > 0) {
      throw createHttpError(422, 'Đơn đã có yêu cầu đổi trả, không đổi trạng thái được nữa', { code: 'has_returns' });
    }
  }

  // Đơn đã huỷ thì kho đã được hoàn, không cho chuyển sang trạng thái khác nữa.
  // Cột Note là ghi chú của KHÁCH lúc đặt hàng: không ghi đè bằng ghi chú của admin.
  // ShippedAt/DeliveredAt ghi lần đầu đơn sang trạng thái đó; DeliveredAt là mốc tính hạn đổi trả,
  // nên bị xoá nếu admin chuyển đơn ra khỏi "đã giao" (vd. bấm nhầm).
  // Đổi trạng thái và ghi lịch sử trong một transaction (một batch): lịch sử luôn khớp với đơn.
  const result = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .input('status', sql.NVarChar, status)
    .input('carrier', sql.NVarChar(50), carrier)
    .input('trackingCode', sql.NVarChar(60), trackingCode)
    .input('note', sql.NVarChar(500), note ? String(note).slice(0, 500) : null)
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @changed TABLE (
        id INT, status NVARCHAR(50), updatedAt DATETIME2, userId INT, orderCode NVARCHAR(30),
        carrier NVARCHAR(50), trackingCode NVARCHAR(60),
        previousStatus NVARCHAR(50), previousCarrier NVARCHAR(50), previousTrackingCode NVARCHAR(60)
      );
      UPDATE Orders
      SET Status = @status,
          ShippingCarrier = CASE WHEN @status = N'shipped' AND @carrier IS NOT NULL THEN @carrier ELSE ShippingCarrier END,
          TrackingCode = CASE WHEN @status = N'shipped' AND @carrier IS NOT NULL THEN @trackingCode ELSE TrackingCode END,
          ShippedAt = CASE WHEN @status IN (N'shipped', N'delivered') THEN COALESCE(ShippedAt, SYSDATETIME()) ELSE ShippedAt END,
          DeliveredAt = CASE WHEN @status = N'delivered' THEN COALESCE(DeliveredAt, SYSDATETIME()) ELSE NULL END,
          UpdatedAt = GETDATE()
      OUTPUT
        INSERTED.OrderID, INSERTED.Status, INSERTED.UpdatedAt, INSERTED.UserID, INSERTED.OrderCode,
        INSERTED.ShippingCarrier, INSERTED.TrackingCode,
        DELETED.Status, DELETED.ShippingCarrier, DELETED.TrackingCode
      INTO @changed
      WHERE OrderID = @orderId AND Status <> 'cancelled';
      INSERT INTO OrderStatusHistory (OrderID, FromStatus, ToStatus, ChangedBy, Note)
      SELECT id, previousStatus, status, N'admin', @note FROM @changed WHERE previousStatus <> status;
      COMMIT TRANSACTION;
      SELECT * FROM @changed;
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

  const shipmentChanged = status === 'shipped'
    && (updatedOrder.carrier !== updatedOrder.previousCarrier || updatedOrder.trackingCode !== updatedOrder.previousTrackingCode);
  if (updatedOrder.previousStatus !== updatedOrder.status || shipmentChanged) {
    try {
      await notificationService.notify(null, {
        userId: updatedOrder.userId,
        type: 'order_status',
        title: `Đơn ${updatedOrder.orderCode || `#${updatedOrder.id}`}: ${notificationService.ORDER_STATUS_LABELS[status] || status}`,
        body: status === 'shipped'
          ? shippedMessage(updatedOrder)
          : status === 'delivered' ? 'Đơn đã giao. Cảm ơn bạn đã mua hàng!' : null,
        link: `/don-hang/${updatedOrder.id}`,
      });
    } catch (err) {
      console.warn('[notifications] order status notification failed:', err.message);
    }
  }

  return {
    id: updatedOrder.id,
    status: updatedOrder.status,
    updatedAt: updatedOrder.updatedAt,
    shippingCarrier: updatedOrder.carrier,
    trackingCode: updatedOrder.trackingCode,
  };
};

/**
 * Admin ghi nhận đã hoàn tiền cho đơn đã thanh toán rồi bị huỷ (PaymentStatus = refund_required).
 * Tiền được hoàn ở cổng thanh toán/ngân hàng; ở đây lưu số tiền, mã giao dịch hoàn và báo cho khách.
 */
const recordRefund = async (orderId, { amount, reference, note } = {}) => {
  const cleanReference = String(reference ?? '').trim().slice(0, 100);
  if (!cleanReference) throw createHttpError(400, 'Hãy nhập mã giao dịch hoàn tiền (từ VNPay hoặc ngân hàng)');
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const order = await lockOrderById(transaction, orderId);
    if (!order) throw createHttpError(404, 'Order not found');
    if (order.PaymentStatus !== 'refund_required') {
      throw createHttpError(422, 'Đơn này không ở trạng thái chờ hoàn tiền', { code: 'not_refund_required' });
    }
    const total = Number(order.Total);
    const refund = amount === undefined || amount === null || amount === '' ? total : Math.round(Number(amount));
    if (!Number.isFinite(refund) || refund <= 0 || refund > total) {
      throw createHttpError(400, `Số tiền hoàn phải từ 1đ đến ${total.toLocaleString('vi-VN')}đ`);
    }
    const updated = await new sql.Request(transaction)
      .input('orderId', sql.Int, Number(order.OrderID))
      .input('amount', sql.Decimal(18, 2), refund)
      .input('reference', sql.NVarChar(100), cleanReference)
      .query(`
        UPDATE Orders
        SET PaymentStatus = N'refunded', RefundAmount = @amount, RefundReference = @reference,
            RefundedAt = SYSDATETIME(), UpdatedAt = GETDATE()
        OUTPUT INSERTED.OrderID, INSERTED.OrderCode, INSERTED.UserID, INSERTED.RefundedAt
        WHERE OrderID = @orderId
      `);
    const row = updated.recordset[0];
    await notificationService.notify(transaction, {
      userId: row.UserID,
      type: 'order_status',
      title: `Đơn ${row.OrderCode || `#${row.OrderID}`}: đã hoàn tiền`,
      body: `Cửa hàng đã hoàn ${refund.toLocaleString('vi-VN')}đ (mã giao dịch ${cleanReference}).${note ? ` ${String(note).trim().slice(0, 200)}` : ''} Thời gian tiền về tài khoản tuỳ ngân hàng.`,
      link: `/don-hang/${row.OrderID}`,
    });
    await transaction.commit();
    return { id: row.OrderID, paymentStatus: 'refunded', refundAmount: refund, refundReference: cleanReference, refundedAt: row.RefundedAt };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
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
      if (orderStatus !== order.Status) {
        await recordStatusChange(transaction, { orderId: base.orderId, from: order.Status, to: orderStatus, by: 'payment', note: 'Thanh toán VNPay thành công' });
      }

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
        by: 'payment',
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
        by: 'system',
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

/**
 * Danh sách đơn cho admin: lọc theo một hoặc nhiều trạng thái ("confirmed,shipped"),
 * tìm theo mã đơn, số đơn, tên/email khách, tên/số điện thoại người nhận.
 */
const ADMIN_PAYMENT_FILTERS = ['unpaid', 'pending', 'paid', 'failed', 'expired', 'refund_required', 'refunded'];

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày dạng YYYY-MM-DD (theo lịch Việt Nam); trống thì null, sai định dạng thì 400. */
const parseFilterDay = (value, label) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(`${text}T00:00:00Z`);
  if (!DAY_PATTERN.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw createHttpError(400, `${label} không hợp lệ (YYYY-MM-DD)`);
  }
  return text;
};

const getAdminOrders = async (status = null, page = 1, limit = 20, q = '', payment = '', from = '', to = '') => {
  const pageNum = Math.max(Number.parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const offset = (pageNum - 1) * pageSize;
  const statuses = String(status || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (statuses.some((item) => !allowedStatuses.includes(item))) {
    throw createHttpError(400, `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`);
  }
  const keyword = String(q || '').trim().slice(0, 100);
  const paymentStatus = String(payment || '').trim();
  if (paymentStatus && !ADMIN_PAYMENT_FILTERS.includes(paymentStatus)) {
    throw createHttpError(400, 'Trạng thái thanh toán không hợp lệ');
  }
  const fromDay = parseFilterDay(from, 'Từ ngày');
  const toDay = parseFilterDay(to, 'Đến ngày');
  if (fromDay && toDay && fromDay > toDay) throw createHttpError(400, 'Từ ngày phải trước hoặc bằng đến ngày');

  // Khoảng ngày theo giờ Việt Nam, đổi sang giờ của máy chủ SQL (giống báo cáo ngày) để so với CreatedAt.
  const dayBounds = `
    DECLARE @tz INT = DATEPART(TZOFFSET, SYSDATETIMEOFFSET());
    DECLARE @start DATETIME2 = CASE WHEN @from IS NULL THEN NULL
      ELSE CAST(SWITCHOFFSET(TODATETIMEOFFSET(CAST(@from AS DATETIME2), 420), @tz) AS DATETIME2) END;
    DECLARE @end DATETIME2 = CASE WHEN @to IS NULL THEN NULL
      ELSE CAST(SWITCHOFFSET(TODATETIMEOFFSET(DATEADD(DAY, 1, CAST(@to AS DATETIME2)), 420), @tz) AS DATETIME2) END;`;

  const where = `
    WHERE (@statuses IS NULL OR o.Status IN (SELECT value FROM OPENJSON(@statuses)))
      AND (@payment IS NULL OR o.PaymentStatus = @payment)
      AND (@start IS NULL OR o.CreatedAt >= @start)
      AND (@end IS NULL OR o.CreatedAt < @end)
      AND (@q IS NULL
        OR o.OrderCode LIKE N'%' + @q + N'%'
        OR CAST(o.OrderID AS NVARCHAR(12)) = @q
        OR u.FullName COLLATE Latin1_General_CI_AI LIKE N'%' + @q + N'%'
        OR u.Email LIKE N'%' + @q + N'%'
        OR JSON_VALUE(o.ShippingAddress, '$.recipientName') COLLATE Latin1_General_CI_AI LIKE N'%' + @q + N'%'
        OR JSON_VALUE(o.ShippingAddress, '$.phone') LIKE N'%' + @q + N'%')`;
  const bind = (request) => request
    .input('statuses', sql.NVarChar(sql.MAX), statuses.length ? JSON.stringify(statuses) : null)
    .input('q', sql.NVarChar(100), keyword || null)
    .input('payment', sql.NVarChar(30), paymentStatus || null)
    .input('from', sql.NVarChar(10), fromDay)
    .input('to', sql.NVarChar(10), toDay);

  const result = await bind(new sql.Request(getPool()))
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, pageSize)
    .query(`
      ${dayBounds}
      SELECT
        o.OrderID AS id,
        o.OrderCode AS orderCode,
        o.Status AS status,
        o.PaymentMethod AS paymentMethod,
        o.PaymentStatus AS paymentStatus,
        o.Total AS total,
        o.CreatedAt AS createdAt,
        u.FullName AS customerName,
        u.Email AS customerEmail,
        JSON_VALUE(o.ShippingAddress, '$.recipientName') AS recipientName,
        JSON_VALUE(o.ShippingAddress, '$.phone') AS recipientPhone,
        JSON_VALUE(o.ShippingAddress, '$.province') AS province,
        items.ItemCount AS itemCount,
        COALESCE(items.ItemsText, N'Không có sản phẩm') AS itemsText
      FROM Orders o
      JOIN Users u ON o.UserID = u.UserID
      OUTER APPLY (
        SELECT COUNT(*) AS ItemCount,
               STRING_AGG(CONVERT(NVARCHAR(MAX), CONCAT(p.Name, N' x', oi.Quantity)), N', ') AS ItemsText
        FROM OrderItems oi JOIN Products p ON oi.ProductID = p.ProductID
        WHERE oi.OrderID = o.OrderID
      ) items
      ${where}
      ORDER BY o.CreatedAt DESC, o.OrderID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const countResult = await bind(new sql.Request(getPool())).query(`
    ${dayBounds}
    SELECT COUNT(*) AS total
    FROM Orders o
    JOIN Users u ON o.UserID = u.UserID
    ${where}
  `);

  const totalItems = Number(countResult.recordset[0]?.total || 0);
  // Số đơn đang chờ hoàn tiền (khách đã trả rồi đơn bị huỷ): hiện cảnh báo trên trang quản trị.
  const refundCount = await new sql.Request(getPool())
    .query("SELECT COUNT(*) AS total FROM Orders WHERE PaymentStatus = N'refund_required'");

  return {
    items: result.recordset,
    refundRequired: Number(refundCount.recordset[0]?.total || 0),
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
  recordRefund,
  getAdminOrders,
  updateOrderPayment,
  getOrderByVNPayTxnRef,
  getOrderPaymentStatus,
  applyVNPayResult,
  getPaymentWindow,
  expireStalePayments,
  // Xuất thêm để viết unit test
  normalizeItems,
  normalizeShipment,
  parseOrderIdFromTxnRef,
};
