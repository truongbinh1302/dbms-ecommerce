const { getPool, sql } = require('../config/db.sql');
const config = require('../config/env');
const { assertShippingAddress, findProvince } = require('./address.service');

/*
  Dịch vụ sau bán: kỹ thuật / lắp đặt tại nhà, thu cũ đổi mới, yêu cầu bảo hành.
  - Lịch tại nhà: chỉ nhận trong tỉnh của cửa hàng, từ ngày mai tới BOOKING_DAYS ngày;
    mỗi khung giờ có tối đa slotCapacity lịch (số kỹ thuật viên). Đếm lịch bằng
    UPDLOCK + HOLDLOCK nên hai khách đặt cùng lúc không vượt số chỗ.
  - Thu cũ: giá ước tính chỉ để tham khảo, giá chốt sau khi kỹ thuật viên kiểm tra máy.
  - Bảo hành: chỉ cho serial thuộc đơn của chính khách và còn hạn; mỗi serial một yêu cầu đang mở.
*/

const HOME_SERVICE_KINDS = [
  { id: 'pc_assembly', label: 'Lắp ráp, lắp đặt PC mới mua' },
  { id: 'device_setup', label: 'Lắp đặt màn hình, máy in, thiết bị mạng' },
  { id: 'cleaning', label: 'Vệ sinh máy, thay keo tản nhiệt' },
  { id: 'software', label: 'Cài Windows, phần mềm, driver' },
  { id: 'diagnosis', label: 'Kiểm tra lỗi phần cứng tại nhà' },
];
const TIME_SLOTS = ['08:00-10:00', '10:00-12:00', '13:30-15:30', '15:30-17:30', '18:00-20:00'];

// Thu cũ: giá trị còn lại mỗi năm theo loại máy, hệ số tình trạng, tỷ lệ thu mua.
const TRADE_IN_CATEGORIES = {
  laptop: { label: 'Laptop', yearlyKeep: 0.72 },
  desktop: { label: 'PC để bàn (cả bộ)', yearlyKeep: 0.7 },
  gpu: { label: 'Card màn hình', yearlyKeep: 0.7 },
  cpu: { label: 'CPU', yearlyKeep: 0.75 },
  monitor: { label: 'Màn hình', yearlyKeep: 0.75 },
  other: { label: 'Linh kiện, phụ kiện khác', yearlyKeep: 0.6 },
};
const TRADE_IN_CONDITIONS = {
  like_new: { label: 'Như mới, còn hộp và phụ kiện', factor: 0.95 },
  good: { label: 'Tốt, trầy xước nhẹ', factor: 0.85 },
  fair: { label: 'Trầy xước nhiều hoặc pin chai', factor: 0.65 },
  broken: { label: 'Hỏng, không lên nguồn', factor: 0.25 },
};
const TRADE_IN_BUY_RATE = 0.8;

const TYPES = ['home_service', 'trade_in', 'warranty'];
const STATUSES = ['new', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const OPEN_STATUSES = ['new', 'confirmed', 'in_progress'];
const TRANSITIONS = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const MAX_OPEN_PER_USER = 5;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const PHONE_PATTERN = /^(0|\+84)\d{9,10}$/;
const normalizePhone = (value) => String(value || '').replace(/[\s.-]/g, '');

const settings = () => ({
  province: config.store.province,
  slotCapacity: Math.max(Number(config.services?.slotCapacity) || 2, 1),
  bookingDays: Math.min(Math.max(Number(config.services?.bookingDays) || 14, 1), 60),
});

/** Ngày theo giờ Việt Nam (YYYY-MM-DD), cộng offsetDays. */
const vietnamDate = (offsetDays = 0, now = new Date()) => new Date(now.getTime() + 7 * 3600000 + offsetDays * 86400000)
  .toISOString().slice(0, 10);

// ---------- Thu cũ ----------

const roundTo = (value, step) => Math.round(value / step) * step;

/** Ước tính giá thu cũ (đồng). Thuần tính toán để test được và dùng chung cho API báo giá. */
const estimateTradeIn = ({ category, purchasePrice, ageMonths, condition } = {}) => {
  const type = TRADE_IN_CATEGORIES[category];
  const state = TRADE_IN_CONDITIONS[condition];
  const price = Number(purchasePrice);
  const months = Number(ageMonths);
  if (!type) throw createHttpError(400, 'Chọn loại máy');
  if (!state) throw createHttpError(400, 'Chọn tình trạng máy');
  if (!Number.isFinite(price) || price < 100000 || price > 500000000) {
    throw createHttpError(400, 'Giá mua mới phải từ 100.000đ đến 500.000.000đ');
  }
  if (!Number.isInteger(months) || months < 0 || months > 120) throw createHttpError(400, 'Thời gian đã dùng từ 0 đến 120 tháng');

  const value = price * type.yearlyKeep ** (months / 12) * state.factor * TRADE_IN_BUY_RATE;
  const low = Math.max(roundTo(value * 0.9, 50000), 0);
  const high = Math.max(roundTo(value * 1.05, 50000), low);
  return {
    low,
    high,
    explanation: `${type.label}: giữ khoảng ${Math.round(type.yearlyKeep * 100)}% giá trị mỗi năm, `
      + `tình trạng "${state.label}" (x${state.factor}), cửa hàng thu ${Math.round(TRADE_IN_BUY_RATE * 100)}% giá trị còn lại.`,
  };
};

// ---------- Lịch tại nhà ----------

const getOptions = async () => {
  const { province, slotCapacity, bookingDays } = settings();
  const from = vietnamDate(1);
  const to = vietnamDate(bookingDays);
  const result = await new sql.Request(getPool())
    .input('from', sql.NVarChar(10), from)
    .input('to', sql.NVarChar(10), to)
    .query(`
      SELECT CONVERT(NVARCHAR(10), ScheduledDate, 23) AS Day, TimeSlot, COUNT(*) AS Booked
      FROM ServiceRequests
      WHERE Type = N'home_service' AND Status <> N'cancelled'
        AND ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)
      GROUP BY ScheduledDate, TimeSlot
    `);
  const booked = new Map(result.recordset.map((row) => [`${row.Day}|${row.TimeSlot}`, Number(row.Booked)]));
  const days = [];
  for (let offset = 1; offset <= bookingDays; offset += 1) {
    const date = vietnamDate(offset);
    days.push({
      date,
      slots: TIME_SLOTS.map((slot) => ({ slot, remaining: Math.max(slotCapacity - (booked.get(`${date}|${slot}`) || 0), 0) })),
    });
  }
  return {
    province,
    kinds: HOME_SERVICE_KINDS,
    days,
    tradeIn: {
      categories: Object.entries(TRADE_IN_CATEGORIES).map(([id, item]) => ({ id, label: item.label })),
      conditions: Object.entries(TRADE_IN_CONDITIONS).map(([id, item]) => ({ id, label: item.label })),
    },
  };
};

// ---------- Tạo yêu cầu ----------

const insertRequest = async (transaction, userId, fields) => {
  const result = await new sql.Request(transaction)
    .input('userId', sql.Int, Number(userId))
    .input('type', sql.NVarChar(20), fields.type)
    .input('serviceKind', sql.NVarChar(40), fields.serviceKind || null)
    .input('orderId', sql.Int, fields.orderId || null)
    .input('serialNumber', sql.NVarChar(60), fields.serialNumber || null)
    .input('scheduledDate', sql.NVarChar(10), fields.scheduledDate || null)
    .input('timeSlot', sql.NVarChar(20), fields.timeSlot || null)
    .input('address', sql.NVarChar(sql.MAX), fields.address ? JSON.stringify(fields.address) : null)
    .input('contactPhone', sql.NVarChar(20), fields.contactPhone || null)
    .input('description', sql.NVarChar(1000), fields.description || null)
    .input('deviceInfo', sql.NVarChar(sql.MAX), fields.deviceInfo ? JSON.stringify(fields.deviceInfo) : null)
    .input('estimateLow', sql.Decimal(18, 2), fields.estimateLow ?? null)
    .input('estimateHigh', sql.Decimal(18, 2), fields.estimateHigh ?? null)
    .query(`
      INSERT INTO ServiceRequests (UserID, Type, ServiceKind, OrderID, SerialNumber, ScheduledDate, TimeSlot, Address,
                                   ContactPhone, Description, DeviceInfo, EstimateLow, EstimateHigh)
      OUTPUT INSERTED.RequestID
      VALUES (@userId, @type, @serviceKind, @orderId, @serialNumber, CAST(@scheduledDate AS DATE), @timeSlot, @address,
              @contactPhone, @description, @deviceInfo, @estimateLow, @estimateHigh)
    `);
  const requestId = result.recordset[0].RequestID;
  await new sql.Request(transaction)
    .input('requestId', sql.Int, requestId)
    .input('userId', sql.Int, Number(userId))
    .query(`INSERT INTO ServiceRequestEvents (RequestID, Status, Note, CreatedBy) VALUES (@requestId, N'new', N'Khách gửi yêu cầu', @userId)`);
  return requestId;
};

const lockUserAndCountOpen = async (transaction, userId) => {
  const result = await new sql.Request(transaction)
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT UserID FROM Users WITH (UPDLOCK, ROWLOCK) WHERE UserID = @userId AND IsActive = 1;
      SELECT COUNT(*) AS OpenCount FROM ServiceRequests
      WHERE UserID = @userId AND Status IN (N'new', N'confirmed', N'in_progress');
    `);
  if (!result.recordsets[0][0]) throw createHttpError(401, 'Tài khoản không hợp lệ');
  if (Number(result.recordsets[1][0].OpenCount) >= MAX_OPEN_PER_USER) {
    throw createHttpError(409, `Bạn đang có ${MAX_OPEN_PER_USER} yêu cầu chưa xong, vui lòng chờ cửa hàng xử lý`, { code: 'too_many_open' });
  }
};

const validateHomeService = (payload) => {
  const { province, bookingDays } = settings();
  const kind = HOME_SERVICE_KINDS.find((item) => item.id === payload.serviceKind);
  if (!kind) throw createHttpError(400, 'Chọn loại dịch vụ');
  const date = String(payload.scheduledDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < vietnamDate(1) || date > vietnamDate(bookingDays)) {
    throw createHttpError(400, `Chọn ngày từ ngày mai đến ${bookingDays} ngày tới`);
  }
  if (!TIME_SLOTS.includes(payload.timeSlot)) throw createHttpError(400, 'Chọn khung giờ');
  const address = assertShippingAddress(payload.address);
  if (findProvince(address.province) !== findProvince(province)) {
    throw createHttpError(400, `Dịch vụ tại nhà hiện chỉ nhận trong ${province}. Bạn có thể mang máy tới cửa hàng.`, {
      fields: { province: `Chỉ nhận lịch trong ${province}` },
    });
  }
  return {
    type: 'home_service',
    serviceKind: kind.id,
    scheduledDate: date,
    timeSlot: payload.timeSlot,
    address,
    contactPhone: address.phone,
    description: cleanText(payload.description, 1000) || null,
    orderId: payload.orderId ? Number(payload.orderId) : null,
  };
};

const validateTradeIn = (payload) => {
  const estimate = estimateTradeIn(payload);
  const brandModel = cleanText(payload.brandModel, 150);
  if (brandModel.length < 3) throw createHttpError(400, 'Nhập hãng và mẫu máy (ví dụ: Dell XPS 13 9310)');
  const phone = normalizePhone(payload.contactPhone);
  if (!PHONE_PATTERN.test(phone)) throw createHttpError(400, 'Số điện thoại không hợp lệ', { fields: { contactPhone: 'Số điện thoại không hợp lệ' } });
  return {
    type: 'trade_in',
    serviceKind: payload.category,
    contactPhone: phone,
    description: cleanText(payload.description, 1000) || null,
    deviceInfo: {
      category: payload.category,
      brandModel,
      purchasePrice: Math.round(Number(payload.purchasePrice)),
      ageMonths: Number(payload.ageMonths),
      condition: payload.condition,
    },
    estimateLow: estimate.low,
    estimateHigh: estimate.high,
  };
};

const validateWarranty = (payload) => {
  const serialNumber = String(payload.serialNumber || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9][A-Z0-9-]{3,59}$/.test(serialNumber)) throw createHttpError(400, 'Số serial không hợp lệ');
  const description = cleanText(payload.description, 1000);
  if (description.length < 10) throw createHttpError(400, 'Mô tả lỗi ít nhất 10 ký tự để kỹ thuật viên chuẩn bị');
  const phone = normalizePhone(payload.contactPhone);
  if (!PHONE_PATTERN.test(phone)) throw createHttpError(400, 'Số điện thoại không hợp lệ', { fields: { contactPhone: 'Số điện thoại không hợp lệ' } });
  const handoff = payload.handoff === 'pickup' ? 'pickup' : 'store';
  return { type: 'warranty', serialNumber, description, contactPhone: phone, serviceKind: handoff };
};

const createRequest = async (userId, payload = {}) => {
  const type = payload.type;
  if (!TYPES.includes(type)) throw createHttpError(400, 'Loại yêu cầu không hợp lệ');
  const fields = type === 'home_service'
    ? validateHomeService(payload)
    : type === 'trade_in' ? validateTradeIn(payload) : validateWarranty(payload);

  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  let requestId;
  try {
    await lockUserAndCountOpen(transaction, userId);

    if (fields.orderId) {
      const order = await new sql.Request(transaction)
        .input('orderId', sql.Int, fields.orderId)
        .input('userId', sql.Int, Number(userId))
        .query('SELECT OrderID FROM Orders WHERE OrderID = @orderId AND UserID = @userId');
      if (!order.recordset[0]) throw createHttpError(400, 'Đơn hàng không thuộc tài khoản của bạn');
    }

    if (type === 'home_service') {
      // Khoá khoảng (ngày, khung giờ) để hai lịch đặt cùng lúc không vượt số kỹ thuật viên.
      const slot = await new sql.Request(transaction)
        .input('date', sql.NVarChar(10), fields.scheduledDate)
        .input('slot', sql.NVarChar(20), fields.timeSlot)
        .input('userId', sql.Int, Number(userId))
        .query(`
          SELECT COUNT(*) AS Booked,
                 SUM(CASE WHEN UserID = @userId THEN 1 ELSE 0 END) AS Mine
          FROM ServiceRequests WITH (UPDLOCK, HOLDLOCK)
          WHERE Type = N'home_service' AND ScheduledDate = CAST(@date AS DATE) AND TimeSlot = @slot
            AND Status <> N'cancelled'
        `);
      const { Booked, Mine } = slot.recordset[0];
      if (Number(Mine) > 0) throw createHttpError(409, 'Bạn đã có lịch trong khung giờ này', { code: 'duplicate_slot' });
      if (Number(Booked) >= settings().slotCapacity) {
        throw createHttpError(409, 'Khung giờ này vừa kín lịch, vui lòng chọn giờ khác', { code: 'slot_full' });
      }
    }

    if (type === 'warranty') {
      const warranty = await new sql.Request(transaction)
        .input('serial', sql.NVarChar(60), fields.serialNumber)
        .input('userId', sql.Int, Number(userId))
        .query(`
          SELECT w.SerialNumber, w.OrderID, DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), w.EndDate) AS DaysLeft,
                 (SELECT COUNT(*) FROM ServiceRequests r WITH (UPDLOCK, HOLDLOCK)
                  WHERE r.SerialNumber = w.SerialNumber AND r.Type = N'warranty'
                    AND r.Status IN (N'new', N'confirmed', N'in_progress')) AS OpenRequests
          FROM Warranties w
          JOIN Orders o ON o.OrderID = w.OrderID
          WHERE w.SerialNumber = @serial AND o.UserID = @userId
        `);
      const row = warranty.recordset[0];
      if (!row) throw createHttpError(404, 'Không tìm thấy serial này trong các đơn của bạn');
      if (Number(row.DaysLeft) < 0) {
        throw createHttpError(400, 'Sản phẩm đã hết hạn bảo hành. Bạn có thể đặt lịch kiểm tra lỗi (có tính phí).', { code: 'warranty_expired' });
      }
      if (Number(row.OpenRequests) > 0) throw createHttpError(409, 'Serial này đang có yêu cầu bảo hành chưa xong', { code: 'open_request' });
      fields.orderId = row.OrderID;
    }

    requestId = await insertRequest(transaction, userId, fields);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
  return getRequest(requestId, { userId });
};

// ---------- Đọc ----------

const parseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const formatRequest = (row, events = [], { admin = false } = {}) => ({
  id: row.RequestID,
  code: row.Code,
  type: row.Type,
  status: row.Status,
  serviceKind: row.ServiceKind,
  serviceLabel: row.Type === 'home_service'
    ? HOME_SERVICE_KINDS.find((item) => item.id === row.ServiceKind)?.label || row.ServiceKind
    : row.Type === 'trade_in'
      ? TRADE_IN_CATEGORIES[row.ServiceKind]?.label || row.ServiceKind
      : row.ServiceKind === 'pickup' ? 'Nhận máy tại nhà' : 'Mang máy tới cửa hàng',
  orderId: row.OrderID,
  serialNumber: row.SerialNumber,
  productName: row.ProductName || null,
  scheduledDate: row.ScheduledDate instanceof Date ? row.ScheduledDate.toISOString().slice(0, 10) : row.ScheduledDate,
  timeSlot: row.TimeSlot,
  address: parseJson(row.Address),
  contactPhone: row.ContactPhone,
  description: row.Description,
  device: parseJson(row.DeviceInfo),
  estimateLow: row.EstimateLow === null ? null : Number(row.EstimateLow),
  estimateHigh: row.EstimateHigh === null ? null : Number(row.EstimateHigh),
  finalPrice: row.FinalPrice === null ? null : Number(row.FinalPrice),
  customerName: admin ? row.CustomerName : undefined,
  customerEmail: admin ? row.CustomerEmail : undefined,
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
  events: events.map((event) => ({
    status: event.Status,
    note: event.Note,
    internal: admin ? !event.IsCustomerVisible : undefined,
    createdAt: event.CreatedAt,
  })),
});

const REQUEST_COLUMNS = `
  r.RequestID, r.Code, r.Type, r.Status, r.ServiceKind, r.OrderID, r.SerialNumber, r.ScheduledDate, r.TimeSlot,
  r.Address, r.ContactPhone, r.Description, r.DeviceInfo, r.EstimateLow, r.EstimateHigh, r.FinalPrice,
  r.CreatedAt, r.UpdatedAt, p.Name AS ProductName, u.FullName AS CustomerName, u.Email AS CustomerEmail`;

const REQUEST_JOINS = `
  JOIN Users u ON u.UserID = r.UserID
  LEFT JOIN Warranties w ON w.SerialNumber = r.SerialNumber
  LEFT JOIN Products p ON p.ProductID = w.ProductID`;

const loadEvents = async (requestIds, { admin = false } = {}) => {
  if (requestIds.length === 0) return new Map();
  const result = await new sql.Request(getPool())
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(requestIds))
    .query(`
      SELECT RequestID, Status, Note, IsCustomerVisible, CreatedAt FROM ServiceRequestEvents
      WHERE RequestID IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids)) ${admin ? '' : 'AND IsCustomerVisible = 1'}
      ORDER BY EventID
    `);
  const map = new Map();
  for (const row of result.recordset) {
    if (!map.has(row.RequestID)) map.set(row.RequestID, []);
    map.get(row.RequestID).push(row);
  }
  return map;
};

const getRequest = async (requestId, { userId = null, admin = false } = {}) => {
  const id = Number(requestId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(404, 'Không tìm thấy yêu cầu');
  const request = new sql.Request(getPool()).input('id', sql.Int, id);
  if (userId) request.input('userId', sql.Int, Number(userId));
  const result = await request.query(`
    SELECT ${REQUEST_COLUMNS} FROM ServiceRequests r ${REQUEST_JOINS}
    WHERE r.RequestID = @id ${userId ? 'AND r.UserID = @userId' : ''}
  `);
  const row = result.recordset[0];
  if (!row) throw createHttpError(404, 'Không tìm thấy yêu cầu');
  const events = await loadEvents([id], { admin });
  return formatRequest(row, events.get(id) || [], { admin });
};

const listMyRequests = async (userId) => {
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .query(`
      SELECT TOP 50 ${REQUEST_COLUMNS} FROM ServiceRequests r ${REQUEST_JOINS}
      WHERE r.UserID = @userId
      ORDER BY r.RequestID DESC
    `);
  const events = await loadEvents(result.recordset.map((row) => row.RequestID));
  return result.recordset.map((row) => formatRequest(row, events.get(row.RequestID) || []));
};

const listRequests = async ({ type = null, status = null, limit = 50 } = {}) => {
  if (type && !TYPES.includes(type)) throw createHttpError(400, 'Loại yêu cầu không hợp lệ');
  if (status && !STATUSES.includes(status) && status !== 'open') throw createHttpError(400, 'Trạng thái không hợp lệ');
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await new sql.Request(getPool())
    .input('type', sql.NVarChar(20), type || null)
    .input('status', sql.NVarChar(20), status && status !== 'open' ? status : null)
    .input('openOnly', sql.Bit, status === 'open' ? 1 : 0)
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@limit) ${REQUEST_COLUMNS} FROM ServiceRequests r ${REQUEST_JOINS}
      WHERE (@type IS NULL OR r.Type = @type)
        AND (@status IS NULL OR r.Status = @status)
        AND (@openOnly = 0 OR r.Status IN (N'new', N'confirmed', N'in_progress'))
      ORDER BY CASE WHEN r.Status IN (N'new', N'confirmed', N'in_progress') THEN 0 ELSE 1 END,
               r.ScheduledDate, r.RequestID DESC
    `);
  const events = await loadEvents(result.recordset.map((row) => row.RequestID), { admin: true });
  return result.recordset.map((row) => formatRequest(row, events.get(row.RequestID) || [], { admin: true }));
};

// ---------- Cập nhật trạng thái ----------

const changeStatus = async ({ requestId, userId = null, nextStatus, note, finalPrice, actorId, internal = false }) => {
  const id = Number(requestId);
  const transaction = new sql.Transaction(getPool());
  await transaction.begin();
  try {
    const request = new sql.Request(transaction).input('id', sql.Int, Number.isInteger(id) ? id : 0);
    if (userId) request.input('userId', sql.Int, Number(userId));
    const current = await request.query(`
      SELECT RequestID, Status, Type, ScheduledDate FROM ServiceRequests WITH (UPDLOCK, ROWLOCK)
      WHERE RequestID = @id ${userId ? 'AND UserID = @userId' : ''}
    `);
    const row = current.recordset[0];
    if (!row) throw createHttpError(404, 'Không tìm thấy yêu cầu');

    const changesStatus = nextStatus && nextStatus !== row.Status;
    if (changesStatus && !(TRANSITIONS[row.Status] || []).includes(nextStatus)) {
      throw createHttpError(409, `Không thể chuyển từ "${row.Status}" sang "${nextStatus}"`, { code: 'invalid_transition' });
    }
    if (!changesStatus && !note && finalPrice === undefined) throw createHttpError(400, 'Không có gì để cập nhật');

    await new sql.Request(transaction)
      .input('id', sql.Int, row.RequestID)
      .input('status', sql.NVarChar(20), changesStatus ? nextStatus : row.Status)
      .input('finalPrice', sql.Decimal(18, 2), finalPrice === undefined ? null : finalPrice)
      .input('setPrice', sql.Bit, finalPrice === undefined ? 0 : 1)
      .input('note', sql.NVarChar(500), note || null)
      .input('visible', sql.Bit, internal ? 0 : 1)
      .input('actorId', sql.Int, actorId ? Number(actorId) : null)
      .query(`
        UPDATE ServiceRequests
        SET Status = @status,
            FinalPrice = CASE WHEN @setPrice = 1 THEN @finalPrice ELSE FinalPrice END,
            UpdatedAt = SYSDATETIME()
        WHERE RequestID = @id;
        INSERT INTO ServiceRequestEvents (RequestID, Status, Note, IsCustomerVisible, CreatedBy)
        VALUES (@id, @status, @note, @visible, @actorId);
      `);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
  return getRequest(id, { userId, admin: !userId });
};

/** Khách tự huỷ khi cửa hàng chưa bắt đầu xử lý. */
const cancelMyRequest = async (userId, requestId, reason) => {
  const current = await getRequest(requestId, { userId });
  if (!['new', 'confirmed'].includes(current.status)) {
    throw createHttpError(409, 'Yêu cầu đã được xử lý, vui lòng liên hệ cửa hàng để huỷ', { code: 'cannot_cancel' });
  }
  return changeStatus({
    requestId,
    userId,
    nextStatus: 'cancelled',
    note: `Khách huỷ${reason ? `: ${cleanText(reason, 300)}` : ''}`,
    actorId: userId,
  });
};

const updateRequest = async (requestId, payload = {}, adminId) => {
  const nextStatus = payload.status || null;
  if (nextStatus && !STATUSES.includes(nextStatus)) throw createHttpError(400, 'Trạng thái không hợp lệ');
  let finalPrice;
  if (payload.finalPrice !== undefined && payload.finalPrice !== null && payload.finalPrice !== '') {
    finalPrice = Math.round(Number(payload.finalPrice));
    if (!Number.isFinite(finalPrice) || finalPrice < 0 || finalPrice > 1e10) throw createHttpError(400, 'Giá chốt không hợp lệ');
  }
  return changeStatus({
    requestId,
    nextStatus,
    note: cleanText(payload.note, 500) || null,
    finalPrice,
    actorId: adminId,
    internal: Boolean(payload.internal),
  });
};

module.exports = {
  HOME_SERVICE_KINDS,
  TIME_SLOTS,
  OPEN_STATUSES,
  estimateTradeIn,
  getOptions,
  createRequest,
  getRequest,
  listMyRequests,
  listRequests,
  cancelMyRequest,
  updateRequest,
  vietnamDate,
};
