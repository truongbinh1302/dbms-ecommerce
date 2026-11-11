const { getPool, sql } = require('../config/db.sql');
const config = require('../config/env');
const inventoryService = require('./inventory.service');
const notificationService = require('./notification.service');

/*
  Đổi trả theo Chính sách đổi trả (#/chinh-sach/doi-tra):
  - Khách gửi yêu cầu từ trang đơn hàng trong RETURN_DAYS ngày kể từ khi đơn được giao
    (Orders.DeliveredAt), cho các lý do: lỗi do nhà sản xuất, giao sai, khác mô tả.
  - Tổng số lượng yêu cầu của một sản phẩm (trừ yêu cầu bị từ chối hoặc khách tự huỷ) không vượt số đã mua.
    Tạo yêu cầu khoá dòng đơn hàng (UPDLOCK) nên hai yêu cầu gửi cùng lúc được xếp hàng.
  - Admin: duyệt → nhận hàng (tuỳ chọn nhập lại kho, ghi sổ kho lý do 'return')
    → hoàn tất (trả tiền: ghi số tiền đã hoàn, không vượt số khách đã trả cho đơn;
    đổi hàng: xuất hàng mới, ghi sổ kho lý do 'exchange'). Mỗi bước báo cho khách.
*/

const RETURN_KINDS = ['exchange', 'refund'];
const RETURN_REASONS = ['defective', 'wrong_item', 'not_as_described'];
const RETURN_STATUSES = ['pending', 'approved', 'received', 'completed', 'rejected', 'cancelled'];
const OPEN_RETURN_STATUSES = ['pending', 'approved', 'received'];
const COUNTED_RETURN_STATUSES = ['pending', 'approved', 'received', 'completed'];
const TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['received', 'rejected'],
  received: ['completed'],
};
const STATUS_LABELS = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt, chờ nhận hàng',
  received: 'Cửa hàng đã nhận hàng',
  completed: 'Hoàn tất',
  rejected: 'Bị từ chối',
  cancelled: 'Đã huỷ',
};
const MAX_ITEM_QUANTITY = 999;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const cleanText = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const sqlList = (values) => values.map((value) => `N'${value}'`).join(', ');

const safeRollback = async (transaction) => {
  try {
    await transaction.rollback();
  } catch {
    // transaction đã tự huỷ (XACT_ABORT) hoặc chưa bắt đầu
  }
};

/** Kiểm tra và chuẩn hoá yêu cầu của khách. Gộp dòng trùng sản phẩm. */
const validateReturnPayload = (payload = {}) => {
  const kind = String(payload.kind || '');
  if (!RETURN_KINDS.includes(kind)) throw createHttpError(400, 'Hãy chọn đổi sản phẩm mới hoặc trả hàng hoàn tiền');
  const reason = String(payload.reason || '');
  if (!RETURN_REASONS.includes(reason)) throw createHttpError(400, 'Lý do đổi trả không hợp lệ');
  const description = cleanText(payload.description, 1000);
  if (description.length < 10) throw createHttpError(400, 'Hãy mô tả tình trạng sản phẩm (ít nhất 10 ký tự)');

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const merged = new Map();
  for (const item of rawItems) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) throw createHttpError(400, 'Sản phẩm không hợp lệ');
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
      throw createHttpError(400, 'Số lượng đổi trả không hợp lệ');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  if (merged.size === 0) throw createHttpError(400, 'Hãy chọn ít nhất một sản phẩm cần đổi trả');
  const items = [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
  return { kind, reason, description, items };
};

/** Kiểm tra admin cập nhật: bước chuyển hợp lệ, ghi chú khi từ chối, số tiền hoàn. */
const validateAdminUpdate = (current, payload = {}) => {
  const status = String(payload.status || '');
  if (!RETURN_STATUSES.includes(status)) throw createHttpError(400, 'Trạng thái không hợp lệ');
  if (!(TRANSITIONS[current] || []).includes(status)) {
    throw createHttpError(422, `Không chuyển được từ "${STATUS_LABELS[current] || current}" sang "${STATUS_LABELS[status]}"`, { code: 'invalid_transition' });
  }
  const adminNote = cleanText(payload.adminNote, 500) || null;
  if (status === 'rejected' && !adminNote) throw createHttpError(400, 'Hãy ghi lý do từ chối để báo cho khách');
  let refundAmount = null;
  if (payload.refundAmount !== undefined && payload.refundAmount !== null && payload.refundAmount !== '') {
    refundAmount = Math.round(Number(payload.refundAmount));
    if (!Number.isFinite(refundAmount) || refundAmount < 0) throw createHttpError(400, 'Số tiền hoàn không hợp lệ');
  }
  return { status, adminNote, refundAmount, restock: payload.restock === true };
};

const formatReturn = (row, items = []) => ({
  id: row.ReturnID,
  code: row.ReturnCode,
  orderId: row.OrderID,
  orderCode: row.OrderCode || null,
  kind: row.Kind,
  reason: row.Reason,
  description: row.Description,
  status: row.Status,
  statusLabel: STATUS_LABELS[row.Status] || row.Status,
  restocked: Boolean(row.Restocked),
  refundAmount: row.RefundAmount === null || row.RefundAmount === undefined ? null : Number(row.RefundAmount),
  adminNote: row.AdminNote,
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
  resolvedAt: row.ResolvedAt,
  customerName: row.CustomerName,
  items: items.map((item) => ({
    productId: item.ProductID,
    productName: item.ProductName,
    quantity: Number(item.Quantity),
    unitPrice: Number(item.UnitPrice),
  })),
});

const RETURN_SELECT = `
  SELECT r.ReturnID, r.ReturnCode, r.OrderID, o.OrderCode, r.Kind, r.Reason, r.Description, r.Status, r.Restocked,
         r.RefundAmount, r.AdminNote, r.CreatedAt, r.UpdatedAt, r.ResolvedAt, u.FullName AS CustomerName
  FROM ReturnRequests r
  JOIN Orders o ON o.OrderID = r.OrderID
  JOIN Users u ON u.UserID = r.UserID`;

const loadItems = async (runner, returnIds) => {
  if (returnIds.length === 0) return [];
  const result = await new sql.Request(runner)
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(returnIds))
    .query(`
      SELECT ri.ReturnID, ri.ProductID, p.Name AS ProductName, ri.Quantity, ri.UnitPrice
      FROM ReturnRequestItems ri
      JOIN Products p ON p.ProductID = ri.ProductID
      WHERE ri.ReturnID IN (SELECT CAST([value] AS INT) FROM OPENJSON(@ids))
      ORDER BY ri.ReturnID, ri.ProductID
    `);
  return result.recordset;
};

const withItems = async (runner, rows) => {
  const items = await loadItems(runner, rows.map((row) => row.ReturnID));
  return rows.map((row) => formatReturn(row, items.filter((item) => item.ReturnID === row.ReturnID)));
};

const getReturn = async (runner, returnId) => {
  const result = await new sql.Request(runner)
    .input('returnId', sql.Int, Number(returnId))
    .query(`${RETURN_SELECT} WHERE r.ReturnID = @returnId`);
  if (!result.recordset[0]) return null;
  return (await withItems(runner, result.recordset))[0];
};

/** Các yêu cầu đổi trả của một đơn (hiển thị ở trang đơn hàng của khách và admin). */
const listForOrder = async (orderId) => {
  const result = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .query(`${RETURN_SELECT} WHERE r.OrderID = @orderId ORDER BY r.ReturnID DESC`);
  return withItems(getPool(), result.recordset);
};

// Dòng hàng của đơn, gộp theo sản phẩm (đơn cũ có thể có hai dòng cùng sản phẩm); đơn giá bình quân.
const ORDER_LINES_SQL = `
  SELECT ProductID, SUM(Quantity) AS Quantity,
         CAST(SUM(Quantity * UnitPrice) / SUM(Quantity) AS DECIMAL(18,2)) AS UnitPrice
  FROM OrderItems WHERE OrderID = @orderId GROUP BY ProductID`;

/**
 * Số lượng còn được yêu cầu đổi trả cho từng sản phẩm của đơn.
 * runner là pool hoặc transaction đang giữ khoá dòng đơn.
 */
const remainingQuantities = async (runner, orderId) => {
  const result = await new sql.Request(runner)
    .input('orderId', sql.Int, Number(orderId))
    .query(`
      SELECT oi.ProductID, p.Name AS ProductName, oi.Quantity,
             oi.Quantity - ISNULL(req.Requested, 0) AS Remaining
      FROM (${ORDER_LINES_SQL}) oi
      JOIN Products p ON p.ProductID = oi.ProductID
      OUTER APPLY (
        SELECT SUM(ri.Quantity) AS Requested
        FROM ReturnRequestItems ri
        JOIN ReturnRequests r ON r.ReturnID = ri.ReturnID
        WHERE r.OrderID = @orderId AND ri.ProductID = oi.ProductID
          AND r.Status IN (${sqlList(COUNTED_RETURN_STATUSES)})
      ) req
    `);
  return result.recordset;
};

/** Hạn đổi trả của đơn: còn mở không, hạn chót, số lượng còn yêu cầu được. */
const getReturnWindow = async (orderId) => {
  const result = await new sql.Request(getPool())
    .input('orderId', sql.Int, Number(orderId))
    .input('days', sql.Int, config.store.returnDays)
    .query(`
      SELECT Status, DeliveredAt, DATEADD(day, @days, DeliveredAt) AS Deadline,
             CASE WHEN Status = N'delivered' AND DeliveredAt IS NOT NULL
                       AND SYSDATETIME() < DATEADD(day, @days, DeliveredAt) THEN 1 ELSE 0 END AS IsOpen
      FROM Orders WHERE OrderID = @orderId
    `);
  const row = result.recordset[0];
  if (!row) return null;
  const remaining = row.IsOpen ? await remainingQuantities(getPool(), orderId) : [];
  return {
    days: config.store.returnDays,
    open: Boolean(row.IsOpen) && remaining.some((item) => Number(item.Remaining) > 0),
    deadline: row.Deadline,
    items: remaining.map((item) => ({ productId: item.ProductID, remaining: Math.max(Number(item.Remaining), 0) })),
  };
};

const createReturn = async (userId, orderId, payload) => {
  const data = validateReturnPayload(payload);
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const orderResult = await new sql.Request(transaction)
      .input('orderId', sql.Int, Number(orderId))
      .input('userId', sql.Int, Number(userId))
      .input('days', sql.Int, config.store.returnDays)
      .query(`
        SELECT OrderID, OrderCode, Status, DeliveredAt,
               CASE WHEN DeliveredAt IS NOT NULL AND SYSDATETIME() < DATEADD(day, @days, DeliveredAt) THEN 1 ELSE 0 END AS InWindow
        FROM Orders WITH (UPDLOCK, ROWLOCK)
        WHERE OrderID = @orderId AND UserID = @userId
      `);
    const order = orderResult.recordset[0];
    if (!order) throw createHttpError(404, 'Không tìm thấy đơn hàng');
    if (order.Status !== 'delivered') {
      throw createHttpError(422, 'Chỉ gửi yêu cầu đổi trả cho đơn đã giao', { code: 'not_delivered' });
    }
    if (!order.InWindow) {
      throw createHttpError(422, `Đã quá ${config.store.returnDays} ngày kể từ khi nhận hàng. Bạn vẫn có thể yêu cầu bảo hành theo serial.`, { code: 'return_window_closed' });
    }

    const remaining = await remainingQuantities(transaction, orderId);
    for (const item of data.items) {
      const line = remaining.find((row) => row.ProductID === item.productId);
      if (!line) throw createHttpError(400, 'Sản phẩm không có trong đơn hàng', { productId: item.productId });
      const available = Math.max(Number(line.Remaining), 0);
      if (item.quantity > available) {
        throw createHttpError(
          409,
          available > 0
            ? `${line.ProductName}: chỉ còn ${available} sản phẩm có thể yêu cầu đổi trả`
            : `${line.ProductName} đã có yêu cầu đổi trả cho toàn bộ số lượng`,
          { code: 'return_quantity_exceeded', productId: item.productId, available },
        );
      }
    }

    const inserted = await new sql.Request(transaction)
      .input('orderId', sql.Int, Number(orderId))
      .input('userId', sql.Int, Number(userId))
      .input('kind', sql.NVarChar(20), data.kind)
      .input('reason', sql.NVarChar(30), data.reason)
      .input('description', sql.NVarChar(1000), data.description)
      .input('items', sql.NVarChar(sql.MAX), JSON.stringify(data.items))
      .query(`
        DECLARE @created TABLE (ReturnID INT);
        INSERT INTO ReturnRequests (OrderID, UserID, Kind, Reason, Description)
        OUTPUT INSERTED.ReturnID INTO @created
        VALUES (@orderId, @userId, @kind, @reason, @description);

        INSERT INTO ReturnRequestItems (ReturnID, ProductID, Quantity, UnitPrice)
        SELECT c.ReturnID, j.productId, j.quantity, oi.UnitPrice
        FROM @created c
        CROSS JOIN OPENJSON(@items) WITH (productId INT, quantity INT) j
        JOIN (${ORDER_LINES_SQL}) oi ON oi.ProductID = j.productId;

        SELECT ReturnID FROM @created;
      `);
    const returnId = inserted.recordset[0].ReturnID;
    const created = await getReturn(transaction, returnId);
    await transaction.commit();
    return created;
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

const cancelMyReturn = async (userId, returnId) => {
  const result = await new sql.Request(getPool())
    .input('returnId', sql.Int, Number(returnId) || 0)
    .input('userId', sql.Int, Number(userId))
    .query(`
      UPDATE ReturnRequests
      SET Status = N'cancelled', UpdatedAt = SYSDATETIME(), ResolvedAt = SYSDATETIME()
      OUTPUT INSERTED.ReturnID
      WHERE ReturnID = @returnId AND UserID = @userId AND Status = N'pending';
      SELECT Status FROM ReturnRequests WHERE ReturnID = @returnId AND UserID = @userId;
    `);
  if (!result.recordsets[0][0]) {
    if (!result.recordsets[1][0]) throw createHttpError(404, 'Không tìm thấy yêu cầu đổi trả');
    throw createHttpError(422, 'Yêu cầu đã được cửa hàng xử lý, không huỷ được nữa', { code: 'not_cancellable' });
  }
  return getReturn(getPool(), returnId);
};

const listReturns = async ({ status = '', page = 1, limit = 20 } = {}) => {
  const statuses = String(status || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (statuses.some((value) => !RETURN_STATUSES.includes(value))) throw createHttpError(400, 'Trạng thái không hợp lệ');
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const where = statuses.length ? `WHERE r.Status IN (${sqlList(statuses)})` : '';
  const result = await new sql.Request(getPool())
    .input('offset', sql.Int, (safePage - 1) * safeLimit)
    .input('limit', sql.Int, safeLimit)
    .query(`
      ${RETURN_SELECT}
      ${where}
      ORDER BY CASE WHEN r.Status IN (${sqlList(OPEN_RETURN_STATUSES)}) THEN 0 ELSE 1 END, r.ReturnID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
      SELECT COUNT(*) AS Total FROM ReturnRequests r ${where};
    `);
  const total = Number(result.recordsets[1][0].Total);
  return {
    items: await withItems(getPool(), result.recordsets[0]),
    pagination: { page: safePage, limit: safeLimit, totalItems: total, totalPages: Math.max(Math.ceil(total / safeLimit), 1) },
  };
};

const updateReturn = async (adminId, returnId, payload = {}) => {
  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const locked = await new sql.Request(transaction)
      .input('returnId', sql.Int, Number(returnId) || 0)
      .query(`
        SELECT r.ReturnID, r.ReturnCode, r.OrderID, r.UserID, r.Kind, r.Status, o.OrderCode, o.Total
        FROM ReturnRequests r WITH (UPDLOCK, ROWLOCK)
        JOIN Orders o ON o.OrderID = r.OrderID
        WHERE r.ReturnID = @returnId
      `);
    const current = locked.recordset[0];
    if (!current) throw createHttpError(404, 'Không tìm thấy yêu cầu đổi trả');
    const data = validateAdminUpdate(current.Status, payload);
    const items = (await loadItems(transaction, [current.ReturnID]))
      .map((item) => ({ productId: item.ProductID, name: item.ProductName, quantity: Number(item.Quantity), unitPrice: Number(item.UnitPrice) }));
    const itemsValue = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    let refundAmount = null;
    let restocked = false;

    if (data.status === 'received' && data.restock) {
      for (const item of items) {
        await inventoryService.changeStock(transaction, {
          productId: item.productId,
          change: item.quantity,
          reason: 'return',
          orderId: current.OrderID,
          note: `Hàng trả về ${current.ReturnCode}`,
          userId: adminId,
        });
      }
      restocked = true;
    }

    if (data.status === 'completed' && current.Kind === 'refund') {
      // Không hoàn quá số khách đã trả cho đơn, tính cả các lần hoàn trước.
      const refunded = await new sql.Request(transaction)
        .input('orderId', sql.Int, current.OrderID)
        .input('returnId', sql.Int, current.ReturnID)
        .query(`
          SELECT ISNULL(SUM(RefundAmount), 0) AS Refunded
          FROM ReturnRequests WITH (UPDLOCK)
          WHERE OrderID = @orderId AND ReturnID <> @returnId AND Status = N'completed'
        `);
      const cap = Math.max(Number(current.Total) - Number(refunded.recordset[0].Refunded), 0);
      refundAmount = data.refundAmount === null ? Math.min(itemsValue, cap) : data.refundAmount;
      if (refundAmount > cap) {
        throw createHttpError(400, `Số tiền hoàn tối đa là ${cap.toLocaleString('vi-VN')}đ (số khách đã trả cho đơn trừ các lần hoàn trước)`, { code: 'refund_too_large', max: cap });
      }
    }

    if (data.status === 'completed' && current.Kind === 'exchange') {
      // Xuất hàng mới đổi cho khách: khoá sản phẩm theo thứ tự ProductID rồi kiểm tra tồn.
      const stock = await new sql.Request(transaction)
        .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(items.map((item) => item.productId)))
        .query(`
          SELECT ProductID, Stock FROM Products WITH (UPDLOCK, ROWLOCK)
          WHERE ProductID IN (SELECT CAST([value] AS INT) FROM OPENJSON(@ids))
          ORDER BY ProductID
        `);
      for (const item of items) {
        const row = stock.recordset.find((entry) => entry.ProductID === item.productId);
        if (!row || Number(row.Stock) < item.quantity) {
          throw createHttpError(409, `${item.name} không đủ hàng để đổi (còn ${row ? row.Stock : 0})`, { code: 'out_of_stock', productId: item.productId });
        }
      }
      for (const item of items) {
        await inventoryService.changeStock(transaction, {
          productId: item.productId,
          change: -item.quantity,
          reason: 'exchange',
          orderId: current.OrderID,
          note: `Xuất đổi hàng ${current.ReturnCode}`,
          userId: adminId,
        });
      }
    }

    await new sql.Request(transaction)
      .input('returnId', sql.Int, current.ReturnID)
      .input('status', sql.NVarChar(20), data.status)
      .input('note', sql.NVarChar(500), data.adminNote)
      .input('refund', sql.Decimal(18, 2), refundAmount)
      .input('restocked', sql.Bit, restocked ? 1 : 0)
      .query(`
        UPDATE ReturnRequests
        SET Status = @status,
            AdminNote = COALESCE(@note, AdminNote),
            RefundAmount = COALESCE(@refund, RefundAmount),
            Restocked = CASE WHEN @restocked = 1 THEN 1 ELSE Restocked END,
            UpdatedAt = SYSDATETIME(),
            ResolvedAt = CASE WHEN @status IN (N'completed', N'rejected') THEN SYSDATETIME() ELSE ResolvedAt END
        WHERE ReturnID = @returnId
      `);

    const defaultBodies = {
      approved: 'Cửa hàng đã duyệt yêu cầu. Vui lòng đóng gói sản phẩm kèm đủ hộp và phụ kiện, cửa hàng sẽ liên hệ lấy hàng.',
      received: 'Cửa hàng đã nhận sản phẩm và đang xử lý.',
      completed: current.Kind === 'refund'
        ? `Đã hoàn ${Number(refundAmount || 0).toLocaleString('vi-VN')}đ theo phương thức thanh toán của đơn.`
        : 'Sản phẩm đổi mới đã được gửi cho bạn.',
    };
    await notificationService.notify(transaction, {
      userId: current.UserID,
      type: 'order_status',
      title: `Đổi trả ${current.ReturnCode}: ${STATUS_LABELS[data.status]}`,
      body: data.adminNote || defaultBodies[data.status] || null,
      link: `/don-hang/${current.OrderID}`,
    });

    const updated = await getReturn(transaction, current.ReturnID);
    await transaction.commit();
    if (restocked) notificationService.sweepSoon(); // hàng trả về đã nhập kho: báo khách đang chờ có hàng
    return updated;
  } catch (err) {
    await safeRollback(transaction);
    throw err;
  }
};

module.exports = {
  RETURN_KINDS,
  RETURN_REASONS,
  RETURN_STATUSES,
  OPEN_RETURN_STATUSES,
  STATUS_LABELS,
  validateReturnPayload,
  validateAdminUpdate,
  listForOrder,
  getReturnWindow,
  createReturn,
  cancelMyReturn,
  listReturns,
  updateReturn,
};
