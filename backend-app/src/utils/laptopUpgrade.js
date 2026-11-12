/*
  Tư vấn nâng cấp laptop theo thông số model (bảng LaptopModels): RAM rời hay hàn, số khe, mức tối đa,
  khe M.2. Chỉ gợi ý linh kiện còn hàng lắp được. Hàm thuần, không gọi DB.
*/

const OPTION_LIMIT = 6;
const byPrice = (a, b) => a.price - b.price || a.productId - b.productId;

/** Giữ lựa chọn rẻ nhất cho mỗi (cách làm, dung lượng sau nâng cấp, số thanh): 1 thanh 32 GB và bộ 2x16 GB đều hiện. */
const cheapestPerResult = (options) => {
  const best = new Map();
  for (const option of options) {
    const key = `${option.action}:${option.resultGB}:${option.modules || 1}`;
    if (!best.has(key) || byPrice(option, best.get(key)) < 0) best.set(key, option);
  }
  return [...best.values()]
    .sort((a, b) => a.resultGB - b.resultGB || byPrice(a, b))
    .slice(0, OPTION_LIMIT);
};

/**
 * @param model   { ramType, ramSolderedGB, ramSlots, maxRamGB, ramGB, unifiedMemory }
 * @param current { ramGB, slotsUsed } slotsUsed: số khe RAM rời đang cắm (null nếu không rõ)
 * @param kits    linh kiện loại laptop_ram còn hàng { productId, name, price, memoryType, capacityGB, modules }
 */
const ramUpgrade = (model, current, kits) => {
  const currentRam = Number(current.ramGB) || model.ramGB;
  if (model.ramSlots === 0) {
    return {
      upgradable: false,
      reason: model.unifiedMemory
        ? 'Bộ nhớ hợp nhất hàn trên chip, không nâng cấp được. Khi mua máy mới nên chọn dung lượng đủ dùng lâu dài.'
        : 'RAM hàn trên mainboard, không nâng cấp được.',
      options: [],
      tip: null,
    };
  }
  if (currentRam >= model.maxRamGB) {
    return { upgradable: false, reason: `Máy đã có ${currentRam} GB, bằng mức tối đa model hỗ trợ (${model.maxRamGB} GB).`, options: [], tip: null };
  }

  const slotsUsed = current.slotsUsed === null || current.slotsUsed === undefined ? null : Number(current.slotsUsed);
  const freeSlots = slotsUsed === null ? null : Math.max(model.ramSlots - slotsUsed, 0);
  const options = [];

  for (const kit of kits.filter((item) => item.stock > 0 && item.memoryType === model.ramType && (item.modules || 1) <= model.ramSlots)) {
    const modules = kit.modules || 1;
    const perModule = kit.capacityGB / modules;
    const replaceTotal = model.ramSolderedGB + kit.capacityGB;
    // Khe rời đang trống hết (slotsUsed = 0) thì không có gì để thay: chỉ gợi ý lắp thêm.
    if (slotsUsed !== 0 && replaceTotal > currentRam && replaceTotal <= model.maxRamGB) {
      const notes = [];
      if (model.ramSolderedGB === 0 && model.ramSlots >= 2 && modules === 1) notes.push('Một thanh chạy kênh đơn, chậm hơn dùng 2 thanh cùng loại.');
      if (model.ramSolderedGB > 0 && perModule !== model.ramSolderedGB) notes.push(`Khác dung lượng phần RAM hàn (${model.ramSolderedGB} GB): vẫn chạy, chỉ phần bằng nhau chạy kênh đôi.`);
      options.push({
        ...kit,
        action: 'replace',
        resultGB: replaceTotal,
        summary: model.ramSolderedGB > 0
          ? `Thay thanh RAM rời: ${model.ramSolderedGB} GB hàn + ${kit.capacityGB} GB = ${replaceTotal} GB`
          : `Thay toàn bộ RAM bằng bộ này: ${replaceTotal} GB`,
        note: notes.join(' ') || null,
      });
    }
    if (freeSlots !== null && freeSlots > 0 && modules <= freeSlots) {
      const addTotal = currentRam + kit.capacityGB;
      if (addTotal <= model.maxRamGB) {
        options.push({
          ...kit,
          action: 'add',
          resultGB: addTotal,
          summary: `Lắp thêm vào khe trống, giữ RAM đang có: ${addTotal} GB`,
          note: 'Nên chọn thanh cùng dung lượng và tốc độ với thanh đang có để chạy kênh đôi.',
        });
      }
    }
  }

  const tip = slotsUsed === null && model.ramSlots > 1
    ? 'Muốn biết còn khe trống không: mở Task Manager → Performance (Hiệu suất) → Memory (Bộ nhớ), xem dòng "Slots used" (Số khe đã dùng).'
    : null;
  return {
    upgradable: true,
    reason: null,
    options: cheapestPerResult(options),
    tip,
  };
};

/**
 * @param model  { m2Slots, m2Size, pcieGen, storageGB }
 * @param drives linh kiện loại storage còn hàng { capacityGB, storageInterface, m2Size, pcieGen, price }
 */
const storageUpgrade = (model, drives) => {
  if (!model.m2Slots) {
    return { upgradable: false, reason: 'Ổ SSD hàn trên mainboard, không thay được. Có thể dùng ổ cứng gắn ngoài qua USB-C.', options: [], tip: null };
  }
  const slotSize = model.m2Size || '2280';
  const best = new Map();
  for (const drive of drives.filter((item) => item.stock > 0 && item.storageInterface === 'M.2' && (item.m2Size || '2280') === slotSize)) {
    if (drive.capacityGB <= 0) continue;
    const current = best.get(drive.capacityGB);
    if (!current || byPrice(drive, current) < 0) best.set(drive.capacityGB, drive);
  }
  const options = [...best.values()]
    .sort((a, b) => a.capacityGB - b.capacityGB || byPrice(a, b))
    .map((drive) => ({
      ...drive,
      bigger: drive.capacityGB > model.storageGB,
      note: model.pcieGen && drive.pcieGen && drive.pcieGen > model.pcieGen
        ? `Khe của máy là PCIe ${model.pcieGen}.0: ổ vẫn chạy, ở tốc độ PCIe ${model.pcieGen}.0.`
        : null,
    }))
    .slice(0, OPTION_LIMIT);
  return {
    upgradable: true,
    reason: null,
    slotSize,
    options,
    tip: model.m2Slots >= 2
      ? `Máy có ${model.m2Slots} khe M.2 ${slotSize}: nếu còn khe trống thì lắp thêm ổ, giữ nguyên ổ đang dùng.`
      : `Máy có 1 khe M.2 ${slotSize}: nâng cấp bằng cách thay ổ (cần sao chép dữ liệu sang ổ mới).`,
  };
};

module.exports = { OPTION_LIMIT, ramUpgrade, storageUpgrade };
