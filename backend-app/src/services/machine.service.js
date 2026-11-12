const { getPool, sql } = require('../config/db.sql');
const { parseJson } = require('../utils/productFormat');
const { loadComponents, normalizeBuildItems, evaluateBuild } = require('./builder.service');
const {
  estimateCapabilities,
  compareCapabilities,
  threadsForTier,
  gpuKindFromName,
} = require('../utils/workloads');
const { keepRelevantLines, parseDxDiag, matchLaptopModel, MAX_TEXT } = require('../utils/dxdiag');
const { ramUpgrade, storageUpgrade } = require('../utils/laptopUpgrade');

/*
  "Máy này chạy được gì?" và nâng cấp laptop:
  - hồ sơ máy lấy từ cấu hình Build PC, model laptop (LaptopModels), thông số sản phẩm PC bán sẵn,
    file DxDiag của khách hoặc khách tự nhập;
  - ước tính khả năng chạy (utils/workloads) và gợi ý nâng cấp RAM/SSD cho laptop (utils/laptopUpgrade),
    kèm "nâng xong chạy thêm được gì".
  File DxDiag không được lưu; chỉ các dòng cần thiết được đọc.
*/

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const toModel = (row) => ({
  id: row.LaptopModelID,
  slug: row.Slug,
  brand: row.Brand,
  name: row.Name,
  matchKeys: row.MatchKeys,
  productId: row.ProductID,
  cpuName: row.CpuName,
  cpuThreads: Number(row.CpuThreads),
  gpuName: row.GpuName,
  vramGB: row.VramGB === null ? 0 : Number(row.VramGB),
  ramGB: Number(row.RamGB),
  ramType: row.RamType,
  ramSolderedGB: Number(row.RamSolderedGB),
  ramSlots: Number(row.RamSlots),
  maxRamGB: Number(row.MaxRamGB),
  m2Slots: Number(row.M2Slots),
  m2Size: row.M2Size,
  pcieGen: row.PcieGen === null ? null : Number(row.PcieGen),
  storageGB: Number(row.StorageGB),
  unifiedMemory: Boolean(row.UnifiedMemory),
  note: row.Note,
});

/** Thông tin model trả cho giao diện (không có khoá so khớp DxDiag). */
const publicModel = (model) => {
  if (!model) return null;
  const { matchKeys, ...rest } = model;
  return {
    ...rest,
    upgradeSummary: describeUpgradeability(model),
  };
};

/** Một câu tóm tắt khả năng nâng cấp, hiện ở trang sản phẩm laptop. */
const describeUpgradeability = (model) => {
  const ram = model.ramSlots === 0
    ? `RAM ${model.ramGB} GB hàn chết, không nâng được`
    : model.ramSolderedGB > 0
      ? `RAM ${model.ramSolderedGB} GB hàn + ${model.ramSlots} khe ${model.ramType} rời, tối đa ${model.maxRamGB} GB`
      : `${model.ramSlots} khe RAM ${model.ramType}, tối đa ${model.maxRamGB} GB`;
  const ssd = model.m2Slots === 0
    ? 'SSD hàn chết'
    : `${model.m2Slots} khe SSD M.2 ${model.m2Size || '2280'}${model.pcieGen ? ` PCIe ${model.pcieGen}.0` : ''}`;
  return `${ram}; ${ssd}.`;
};

const loadLaptopModels = async () => {
  const result = await new sql.Request(getPool()).query('SELECT * FROM LaptopModels ORDER BY Brand, Name');
  return result.recordset.map(toModel);
};

const listLaptopModels = async () => (await loadLaptopModels()).map((model) => ({
  id: model.id,
  brand: model.brand,
  name: model.name,
  cpuName: model.cpuName,
  gpuName: model.gpuName,
  ramGB: model.ramGB,
  ramSolderedGB: model.ramSolderedGB,
  ramSlots: model.ramSlots,
  maxRamGB: model.maxRamGB,
  productId: model.productId,
}));

const profileFromModel = (model) => ({
  ramGB: model.ramGB,
  vramGB: model.vramGB,
  gpuKind: model.unifiedMemory ? 'apple' : (model.vramGB > 0 ? gpuKindFromName(model.gpuName) : null),
  gpuName: model.gpuName,
  cpuName: model.cpuName,
  cpuThreads: model.cpuThreads,
  unifiedMemory: model.unifiedMemory,
});

/** Hồ sơ máy từ các linh kiện của cấu hình Build PC (kể cả linh kiện khách đã có). */
const profileFromParts = (parts) => {
  const ramGB = parts.filter((part) => part.type === 'ram').reduce((sum, part) => sum + (part.capacityGB || 0) * (part.quantity || 1), 0);
  const cpu = parts.find((part) => part.type === 'cpu');
  const gpu = parts.filter((part) => part.type === 'gpu').sort((a, b) => (b.vramGB || 0) - (a.vramGB || 0))[0];
  return {
    ramGB,
    vramGB: gpu ? gpu.vramGB || 0 : 0,
    gpuKind: gpu ? gpuKindFromName(gpu.name) || 'nvidia' : null,
    gpuName: gpu ? gpu.name : null,
    cpuName: cpu ? cpu.name : null,
    cpuThreads: cpu ? threadsForTier(cpu.tier) : null,
  };
};

// VRAM của card máy bàn hay gặp trong thông số PC bán sẵn. Card có hai bản VRAM (4060 Ti 8/16 GB) lấy bản nhỏ.
const DESKTOP_GPUS = [
  [/rtx\s*5090/i, 32], [/rtx\s*5080/i, 16], [/rtx\s*5070\s*ti/i, 16], [/rtx\s*5070/i, 12], [/rtx\s*5060/i, 8],
  [/rtx\s*4090/i, 24], [/rtx\s*4080/i, 16], [/rtx\s*4070\s*ti\s*super/i, 16], [/rtx\s*4070/i, 12], [/rtx\s*4060/i, 8],
  [/rtx\s*3060/i, 12], [/rx\s*7900\s*xtx/i, 24], [/rx\s*7900/i, 20], [/rx\s*7800/i, 16], [/rx\s*7700/i, 12],
  [/rx\s*7600/i, 8], [/arc\s*b580/i, 12],
];

/** Hồ sơ máy từ thông số dạng chữ của PC bán sẵn (["Ryzen 7", "RTX 5070", "32GB RAM", ...]). */
const profileFromSpecs = (specs) => {
  const text = (Array.isArray(specs) ? specs : []).join(' | ');
  const ram = text.match(/(\d{1,3})\s*GB\s*RAM/i);
  if (!ram) return null;
  const gpuRule = DESKTOP_GPUS.find(([pattern]) => pattern.test(text));
  const gpuName = gpuRule ? text.match(gpuRule[0])[0].toUpperCase().replace(/\s+/g, ' ') : null;
  let threads = 12;
  if (/i9|ryzen\s*9|ultra\s*9/i.test(text)) threads = 24;
  else if (/i7|ryzen\s*7|ultra\s*7/i.test(text)) threads = 16;
  return {
    ramGB: Number(ram[1]),
    vramGB: gpuRule ? gpuRule[1] : 0,
    gpuKind: gpuRule ? gpuKindFromName(gpuName) : null,
    gpuName,
    cpuThreads: threads,
  };
};

/** Ước tính cho cấu hình đang ráp ở Build PC. */
const capabilitiesForBuild = async (rawItems) => {
  const items = normalizeBuildItems(rawItems);
  const components = await loadComponents(getPool(), [...new Set(items.map((item) => item.productId))]);
  const { parts } = evaluateBuild(items, components);
  const profile = profileFromParts(parts);
  if (!profile.ramGB) return { capabilities: null, message: 'Chọn RAM để xem máy chạy được gì.' };
  return { capabilities: estimateCapabilities(profile), message: null };
};

/** Ước tính cho sản phẩm PC/laptop của cửa hàng. Trả về null nếu không đủ thông số. */
const capabilitiesForProduct = async (productId) => {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(400, 'Sản phẩm không hợp lệ');
  const result = await new sql.Request(getPool())
    .input('id', sql.Int, id)
    .query(`
      SELECT p.ProductID, p.Specs, c.Slug AS CategorySlug, c.Icon AS CategoryIcon
      FROM Products p LEFT JOIN Categories c ON c.CategoryID = p.CategoryID
      WHERE p.ProductID = @id AND p.IsDeleted = 0;
      SELECT * FROM LaptopModels WHERE ProductID = @id;
    `);
  const product = result.recordsets[0][0];
  if (!product) throw createHttpError(404, 'Không tìm thấy sản phẩm');
  const modelRow = result.recordsets[1][0];
  if (modelRow) {
    const model = toModel(modelRow);
    return { productId: id, source: 'laptop_model', laptopModel: publicModel(model), capabilities: estimateCapabilities(profileFromModel(model)) };
  }
  // Laptop chưa có trong LaptopModels: VRAM card laptop khác card máy bàn cùng tên nên không đoán.
  if (product.CategoryIcon === 'desktop') {
    const profile = profileFromSpecs(parseJson(product.Specs, []));
    if (profile) return { productId: id, source: 'specs', laptopModel: null, capabilities: estimateCapabilities(profile) };
  }
  return { productId: id, source: null, laptopModel: null, capabilities: null };
};

const MANUAL_GPU_KINDS = ['nvidia', 'amd', 'intel', 'none'];

const profileFromManual = (raw = {}) => {
  const ramGB = Number(raw.ramGB);
  if (!Number.isFinite(ramGB) || ramGB < 2 || ramGB > 512) throw createHttpError(400, 'Hãy chọn dung lượng RAM');
  const kind = MANUAL_GPU_KINDS.includes(raw.gpuKind) ? raw.gpuKind : 'none';
  const vramGB = kind === 'none' ? 0 : Number(raw.vramGB);
  if (kind !== 'none' && (!Number.isFinite(vramGB) || vramGB < 1 || vramGB > 96)) throw createHttpError(400, 'Hãy chọn VRAM của card');
  return {
    ramGB,
    vramGB,
    gpuKind: kind === 'none' ? null : kind,
    gpuName: null,
    cpuThreads: Number(raw.cpuThreads) || null,
  };
};

const parseSlotsUsed = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4) throw createHttpError(400, 'Số khe RAM đang dùng không hợp lệ');
  return number;
};

/** Gợi ý nâng cấp laptop kèm "nâng xong chạy thêm được gì" cho từng lựa chọn RAM. */
const buildUpgrade = (model, profile, slotsUsed, components, before) => {
  const kits = components.filter((part) => part.type === 'laptop_ram');
  const drives = components.filter((part) => part.type === 'storage');
  const ram = ramUpgrade(model, { ramGB: profile.ramGB, slotsUsed }, kits);
  ram.options = ram.options.map((option) => ({
    ...option,
    improves: compareCapabilities(before, estimateCapabilities({ ...profile, ramGB: option.resultGB })),
  }));
  return {
    ram,
    storage: storageUpgrade(model, drives),
    fixed: model.unifiedMemory
      ? 'CPU, card đồ hoạ, RAM và SSD đều nằm trên mainboard, không thay được.'
      : 'CPU và card đồ hoạ trên laptop hàn chết, không nâng cấp được.',
  };
};

/**
 * Phân tích máy của khách.
 * body: { source: 'dxdiag' | 'laptop' | 'manual', text, laptopModelId, ramGB, vramGB, gpuKind, cpuThreads, slotsUsed }
 */
const analyzeMachine = async (body = {}) => {
  const source = String(body.source || '');
  const slotsUsed = parseSlotsUsed(body.slotsUsed);
  let profile = null;
  let model = null;
  let detected = null;
  let hint = null;

  if (source === 'dxdiag') {
    const text = String(body.text || '');
    if (text.length === 0 || text.length > MAX_TEXT * 10) throw createHttpError(400, 'Hãy chọn file DxDiag.txt');
    const parsed = parseDxDiag(keepRelevantLines(text));
    if (!parsed || parsed.ramGB === null) {
      throw createHttpError(400, 'Không đọc được file. Hãy lưu bằng nút "Save All Information..." trong DxDiag và chọn đúng file .txt vừa lưu.');
    }
    model = matchLaptopModel(parsed, await loadLaptopModels());
    detected = {
      manufacturer: parsed.manufacturer,
      model: parsed.model,
      cpuName: parsed.cpuName,
      cpuThreads: parsed.cpuThreads,
      ramGB: parsed.ramGB,
      gpuName: parsed.gpu ? parsed.gpu.name : null,
      vramGB: parsed.gpu ? parsed.gpu.vramGB : 0,
      integratedGpus: parsed.gpus.filter((gpu) => !gpu.discrete).map((gpu) => gpu.name),
    };
    profile = {
      ramGB: parsed.ramGB,
      vramGB: parsed.gpu ? parsed.gpu.vramGB : 0,
      gpuKind: parsed.gpu ? parsed.gpu.kind : null,
      gpuName: parsed.gpu ? parsed.gpu.name : null,
      cpuName: parsed.cpuName,
      cpuThreads: parsed.cpuThreads,
    };
    if (!model) {
      hint = `Chưa có model "${parsed.model || 'không rõ'}" trong dữ liệu nâng cấp của cửa hàng. `
        + 'Nếu là laptop, chọn model gần đúng ở mục "Chọn model laptop"; nếu là máy bàn, dùng "Nâng cấp máy đang có" trong Build PC.';
    }
  } else if (source === 'laptop') {
    const id = Number(body.laptopModelId);
    model = (await loadLaptopModels()).find((item) => item.id === id) || null;
    if (!model) throw createHttpError(404, 'Không tìm thấy model laptop');
    profile = profileFromModel(model);
    const currentRam = Number(body.ramGB);
    if (Number.isFinite(currentRam) && currentRam >= model.ramSolderedGB && currentRam > 0 && currentRam <= model.maxRamGB) {
      profile.ramGB = currentRam;
    }
  } else if (source === 'manual') {
    profile = profileFromManual(body);
  } else {
    throw createHttpError(400, 'Hãy chọn cách nhập thông tin máy');
  }

  if (model && source === 'dxdiag') {
    // DxDiag cho biết RAM và card thật đang có; model cho biết khe RAM, SSD và giới hạn.
    profile = { ...profileFromModel(model), ...Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== null && value !== undefined)) };
  }

  const capabilities = estimateCapabilities(profile);
  if (!capabilities) throw createHttpError(400, 'Thiếu dung lượng RAM để ước tính');
  const upgrade = model ? buildUpgrade(model, capabilities.profile, slotsUsed, await loadComponents(), capabilities) : null;

  return {
    source,
    detected,
    laptopModel: publicModel(model),
    hint,
    capabilities,
    upgrade,
  };
};

module.exports = {
  toModel,
  publicModel,
  describeUpgradeability,
  loadLaptopModels,
  listLaptopModels,
  profileFromModel,
  profileFromParts,
  profileFromSpecs,
  capabilitiesForBuild,
  capabilitiesForProduct,
  analyzeMachine,
};
