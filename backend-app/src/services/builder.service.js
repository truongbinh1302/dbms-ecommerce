const { getPool, sql } = require('../config/db.sql');
const { parseJson } = require('../utils/productFormat');
const { SLOT_ORDER, SLOT_LABELS, checkBuild } = require('../utils/compatibility');
const { PRESETS, autoBuild, upgradeOptions } = require('../utils/buildAdvisor');

/*
  Build PC: đọc linh kiện kèm thông số (ComponentSpecs) rồi gọi các hàm thuần
  trong utils/compatibility và utils/buildAdvisor. Giá luôn lấy từ DB.
*/

const MAX_PARTS = 20;

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const COMPONENT_SELECT = `
  SELECT p.ProductID, p.Name, p.Slug, p.Brand, p.Price, p.OldPrice, p.Stock, p.Images,
         cs.ComponentType, cs.Socket, cs.MemoryType, cs.FormFactor, cs.SupportedFormFactors,
         cs.SupportedSockets, cs.PowerW, cs.PsuWatts, cs.LengthMm, cs.MaxGpuLengthMm,
         cs.HeightMm, cs.MaxCoolerHeightMm, cs.MemorySlots, cs.Modules, cs.CapacityGB,
         cs.M2Slots, cs.StorageInterface, cs.HasIntegratedGraphics, cs.IncludesCooler,
         cs.Tier, cs.VramGB
  FROM ComponentSpecs cs
  JOIN Products p ON p.ProductID = cs.ProductID
  WHERE p.IsDeleted = 0
`;

const intOrNull = (value) => (value === null || value === undefined ? null : Number(value));
const boolOrNull = (value) => (value === null || value === undefined ? null : Boolean(value));

/** Dòng SQL → linh kiện (camelCase) mà compatibility/buildAdvisor hiểu. */
const toPart = (row) => ({
  productId: row.ProductID,
  name: row.Name,
  slug: row.Slug,
  brand: row.Brand,
  price: Number(row.Price || 0),
  oldPrice: row.OldPrice === null || row.OldPrice === undefined ? null : Number(row.OldPrice),
  stock: Number(row.Stock || 0),
  image: parseJson(row.Images, [])[0] || null,
  type: row.ComponentType,
  socket: row.Socket,
  memoryType: row.MemoryType,
  formFactor: row.FormFactor,
  supportedFormFactors: row.SupportedFormFactors,
  supportedSockets: row.SupportedSockets,
  powerW: intOrNull(row.PowerW),
  psuWatts: intOrNull(row.PsuWatts),
  lengthMm: intOrNull(row.LengthMm),
  maxGpuLengthMm: intOrNull(row.MaxGpuLengthMm),
  heightMm: intOrNull(row.HeightMm),
  maxCoolerHeightMm: intOrNull(row.MaxCoolerHeightMm),
  memorySlots: intOrNull(row.MemorySlots),
  modules: intOrNull(row.Modules),
  capacityGB: intOrNull(row.CapacityGB),
  m2Slots: intOrNull(row.M2Slots),
  storageInterface: row.StorageInterface,
  hasIntegratedGraphics: boolOrNull(row.HasIntegratedGraphics),
  includesCooler: boolOrNull(row.IncludesCooler),
  tier: intOrNull(row.Tier),
  vramGB: intOrNull(row.VramGB),
});

const loadComponents = async (executor = getPool(), productIds = null) => {
  const request = new sql.Request(executor);
  let filter = '';
  if (productIds) {
    if (productIds.length === 0) return [];
    productIds.forEach((id, index) => request.input(`id${index}`, sql.Int, id));
    filter = ` AND p.ProductID IN (${productIds.map((_, index) => `@id${index}`).join(', ')})`;
  }
  const result = await request.query(`${COMPONENT_SELECT}${filter} ORDER BY cs.ComponentType, p.Price, p.ProductID`);
  return result.recordset.map(toPart);
};

/**
 * Chuẩn hoá danh sách linh kiện client gửi lên.
 * `owned: true` là linh kiện khách đã có: vẫn kiểm tra tương thích nhưng không tính tiền.
 */
const normalizeBuildItems = (rawItems) => {
  if (!Array.isArray(rawItems)) {
    throw createHttpError(400, 'items phải là một mảng');
  }
  const merged = new Map();
  for (const raw of rawItems) {
    const productId = Number(raw && raw.productId);
    const quantity = raw && raw.quantity !== undefined ? Number(raw.quantity) : 1;
    const owned = Boolean(raw && raw.owned);
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 8) {
      throw createHttpError(400, 'Mỗi linh kiện cần productId hợp lệ và số lượng từ 1 đến 8');
    }
    const key = `${productId}:${owned ? 'owned' : 'buy'}`;
    const current = merged.get(key);
    merged.set(key, { productId, owned, quantity: (current ? current.quantity : 0) + quantity });
  }
  const items = [...merged.values()];
  if (items.length > MAX_PARTS) {
    throw createHttpError(400, `Một cấu hình tối đa ${MAX_PARTS} dòng linh kiện`);
  }
  return items;
};

/** Ghép linh kiện đã chọn với thông số trong DB, chạy kiểm tra tương thích và tính tạm tính. */
const evaluateBuild = (items, components) => {
  const byId = new Map(components.map((part) => [part.productId, part]));
  const issues = [];
  const parts = [];
  const lines = [];
  let subtotal = 0;

  for (const item of items) {
    const part = byId.get(item.productId);
    if (!part) {
      issues.push({ productId: item.productId, issue: 'not_component' });
      continue;
    }
    parts.push({ ...part, quantity: item.quantity, owned: item.owned });
    if (item.owned) continue;
    if (part.stock < item.quantity) {
      issues.push({ productId: part.productId, productName: part.name, availableStock: part.stock, issue: 'insufficient_stock' });
    }
    subtotal += part.price * item.quantity;
    lines.push({ productId: part.productId, name: part.name, type: part.type, unitPrice: part.price, quantity: item.quantity, lineTotal: part.price * item.quantity });
  }

  return { parts, lines, issues, subtotal, check: checkBuild(parts) };
};

const checkConfiguration = async (rawItems) => {
  const items = normalizeBuildItems(rawItems);
  const components = await loadComponents(getPool(), [...new Set(items.map((item) => item.productId))]);
  return evaluateBuild(items, components);
};

const listComponents = async () => ({
  slots: SLOT_ORDER.map((type) => ({ type, label: SLOT_LABELS[type] })),
  components: await loadComponents(),
});

const listPresets = () => PRESETS.map(({ id, name, software, reason, needs }) => ({
  id,
  name,
  software,
  reason,
  needs,
}));

const autoBuildPreset = async (presetId) => {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (!preset) throw createHttpError(404, 'Không có nhu cầu sử dụng này');

  const result = autoBuild(preset, await loadComponents());
  if (!result) {
    return { preset: listPresets().find((item) => item.id === presetId), parts: null, message: 'Kho hiện chưa đủ linh kiện cho nhu cầu này' };
  }
  const subtotal = result.parts.reduce((sum, part) => sum + part.price, 0);
  return {
    preset: listPresets().find((item) => item.id === presetId),
    parts: result.parts.map((part) => ({ ...part, quantity: 1 })),
    check: result.check,
    subtotal,
  };
};

const SOCKETS = ['AM4', 'AM5', 'LGA1700'];
const MEMORY_TYPES = ['DDR4', 'DDR5'];
const UPGRADE_LIMIT = 6;

const optionalNumber = (value, min, max) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw createHttpError(400, 'Thông số máy hiện tại không hợp lệ');
  }
  return number;
};

/** Tư vấn nâng cấp: chỉ trả các linh kiện lắp được vào máy khách đang có. */
const suggestUpgrades = async (raw = {}) => {
  const socket = raw.socket ? String(raw.socket).toUpperCase() : null;
  const memoryType = raw.memoryType ? String(raw.memoryType).toUpperCase() : null;
  if (socket && !SOCKETS.includes(socket)) throw createHttpError(400, 'Socket không hợp lệ');
  if (memoryType && !MEMORY_TYPES.includes(memoryType)) throw createHttpError(400, 'Loại RAM không hợp lệ');

  const current = {
    socket,
    memoryType,
    psuWatts: optionalNumber(raw.psuWatts, 200, 2000),
    maxGpuLengthMm: optionalNumber(raw.maxGpuLengthMm, 100, 500),
    cpuPowerW: optionalNumber(raw.cpuPowerW, 10, 400),
    gpuPowerW: optionalNumber(raw.gpuPowerW, 0, 600),
    hasM2Slot: raw.hasM2Slot === undefined || raw.hasM2Slot === null ? null : Boolean(raw.hasM2Slot),
  };

  const options = upgradeOptions(current, await loadComponents());
  return {
    current,
    options: Object.fromEntries(Object.entries(options).map(([type, list]) => [type, list.slice(0, UPGRADE_LIMIT)])),
  };
};

module.exports = {
  MAX_PARTS,
  toPart,
  loadComponents,
  normalizeBuildItems,
  evaluateBuild,
  checkConfiguration,
  listComponents,
  listPresets,
  autoBuildPreset,
  suggestUpgrades,
};
