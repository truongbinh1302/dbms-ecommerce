const crypto = require('crypto');
const { getPool, sql } = require('../config/db.sql');

const allowedStatuses = ['pending', 'pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Order must contain at least one item');
    err.status = 400;
    throw err;
  }

  return items.map((item) => {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      const err = new Error('Each item must include a valid productId and quantity');
      err.status = 400;
      throw err;
    }
    return { productId, quantity };
  });
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

const createOrder = async (userId, orderData) => {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  const items = normalizeItems(orderData.items);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const userCheck = await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .query(`SELECT UserID FROM Users WHERE UserID = @userId AND IsActive = 1`);

    if (!userCheck.recordset[0]) {
      const err = new Error('Invalid user or user not found');
      err.status = 401;
      throw err;
    }

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
        const err = new Error(`Product ${item.productId} not found`);
        err.status = 404;
        throw err;
      }

      if (Number(product.Stock) < item.quantity) {
        const err = new Error(`Product "${product.Name}" has only ${product.Stock} items in stock`);
        err.status = 409;
        err.data = { productId: item.productId, availableStock: product.Stock };
        throw err;
      }

      products.push({ ...product, quantity: item.quantity });
      subtotal += Number(product.Price) * item.quantity;
    }

    const discount = Number(orderData.discount || 0);
    const shippingFee = Number(orderData.shippingFee || 0);
    const total = subtotal - discount + shippingFee;
    const paymentMethod = orderData.paymentMethod || 'cod';
    const status = paymentMethod === 'cod' ? 'pending' : 'pending_payment';

    const orderResult = await new sql.Request(transaction)
      .input('userId', sql.Int, Number(userId))
      .input('paymentMethod', sql.NVarChar, paymentMethod)
      .input('status', sql.NVarChar, status)
      .input('subtotal', sql.Decimal(18, 2), subtotal)
      .input('discount', sql.Decimal(18, 2), discount)
      .input('shippingFee', sql.Decimal(18, 2), shippingFee)
      .input('total', sql.Decimal(18, 2), total)
      .input('shippingAddress', sql.NVarChar, JSON.stringify(orderData.shippingAddress || {}))
      .input('note', sql.NVarChar, orderData.note || null)
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

    await transaction.commit();

    return {
      orderId,
      orderCode,
      status,
      paymentMethod,
      subtotal,
      discount,
      shippingFee,
      total,
      createdAt,
    };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
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
    SELECT OrderID AS id, OrderCode AS orderCode, Status, PaymentMethod, Total,
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
    SELECT o.OrderID AS id, o.Status, o.PaymentMethod, o.PaymentStatus,
           o.VNPayTxnRef AS txnRef,
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

const cancelOrder = async (orderId, userId, reason) => {
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const orderResult = await new sql.Request(transaction)
      .input('orderId', sql.Int, Number(orderId))
      .input('userId', sql.Int, Number(userId))
      .query(`
        SELECT OrderID, Status, UserID
        FROM Orders WITH (UPDLOCK, ROWLOCK)
        WHERE OrderID = @orderId AND UserID = @userId
      `);

    const order = orderResult.recordset[0];
    if (!order) {
      const err = new Error('Order not found');
      err.status = 404;
      throw err;
    }

    const cancellableStatuses = ['pending', 'pending_payment', 'confirmed'];
    if (!cancellableStatuses.includes(order.Status)) {
      const err = new Error('Cannot cancel order in current status');
      err.status = 422;
      throw err;
    }

    const itemsResult = await new sql.Request(transaction)
      .input('orderId', sql.Int, Number(orderId))
      .query('SELECT ProductID, Quantity FROM OrderItems WHERE OrderID = @orderId');

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

    await new sql.Request(transaction)
      .input('orderId', sql.Int, Number(orderId))
      .input('reason', sql.NVarChar, reason || null)
      .query(`
        UPDATE Orders
        SET Status = 'cancelled', CancelReason = @reason, UpdatedAt = GETDATE()
        WHERE OrderID = @orderId
      `);

    await transaction.commit();
    return { orderId: Number(orderId), status: 'cancelled' };
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

const updateOrderStatus = async (orderId, status, note) => {
  if (!allowedStatuses.includes(status)) {
    const err = new Error(`Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}`);
    err.status = 400;
    throw err;
  }

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
      WHERE OrderID = @orderId
    `);

  const updatedOrder = result.recordset[0];
  if (!updatedOrder) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  return updatedOrder;
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
  getUserOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  getAdminOrders,
  updateOrderPayment,
  getOrderByVNPayTxnRef,
  getOrderPaymentStatus,
};
