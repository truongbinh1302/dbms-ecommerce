/*
  Kiểm tra tương thích cấu hình PC (hàm thuần, không đụng DB).
  Đầu vào: danh sách linh kiện, mỗi linh kiện có `type`, `quantity`, `name` và thông số
  lấy từ bảng ComponentSpecs (socket, memoryType, formFactor, powerW, lengthMm...).
  Đầu ra: lỗi (chắc chắn không lắp/chạy được) và cảnh báo (nên xem lại), kèm công suất ước tính.
*/

const SLOT_ORDER = ['cpu', 'mainboard', 'ram', 'gpu', 'storage', 'cooler', 'psu', 'case'];
const SINGLE_SLOTS = ['cpu', 'mainboard', 'gpu', 'cooler', 'psu', 'case'];
const REQUIRED_SLOTS = ['cpu', 'mainboard', 'ram', 'storage', 'psu', 'case'];

const SLOT_LABELS = {
  cpu: 'CPU',
  mainboard: 'Mainboard',
  ram: 'RAM',
  gpu: 'Card đồ hoạ',
  storage: 'Ổ cứng',
  cooler: 'Tản nhiệt',
  psu: 'Nguồn',
  case: 'Vỏ case',
};

// Mainboard, RAM, ổ cứng, quạt... ước khoảng 75 W. Nguồn nên dư ít nhất 30% so với tổng ước tính.
const BASE_POWER_W = 75;
const PSU_HEADROOM = 1.3;

const splitList = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);

const groupByType = (parts) => {
  const groups = Object.fromEntries(SLOT_ORDER.map((type) => [type, []]));
  for (const part of parts) {
    if (groups[part.type]) groups[part.type].push(part);
  }
  return groups;
};

const estimatePowerW = (groups) => {
  const cpu = groups.cpu[0];
  const gpus = groups.gpu;
  return BASE_POWER_W
    + (cpu ? Number(cpu.powerW || 0) : 0)
    + gpus.reduce((sum, gpu) => sum + Number(gpu.powerW || 0) * (gpu.quantity || 1), 0);
};

const recommendedPsuW = (estimatedW) => Math.ceil((estimatedW * PSU_HEADROOM) / 50) * 50;

/**
 * @param {Array} parts linh kiện đã chọn (kể cả linh kiện khách đã có sẵn)
 * @returns {{ ok, complete, errors, warnings, estimatedPowerW, recommendedPsuW }}
 */
const checkBuild = (parts) => {
  const groups = groupByType(parts);
  const errors = [];
  const warnings = [];
  const add = (list, code, message, types) => list.push({ code, message, types });

  for (const type of SINGLE_SLOTS) {
    const count = groups[type].reduce((sum, part) => sum + (part.quantity || 1), 0);
    if (count > 1 && type !== 'gpu') {
      add(errors, 'too_many', `Chỉ chọn một ${SLOT_LABELS[type]}`, [type]);
    }
  }

  const missing = REQUIRED_SLOTS.filter((type) => groups[type].length === 0);
  const cpu = groups.cpu[0];
  const board = groups.mainboard[0];
  const pcCase = groups.case[0];
  const psu = groups.psu[0];
  const cooler = groups.cooler[0];

  if (cpu && board && cpu.socket && board.socket && cpu.socket.toUpperCase() !== board.socket.toUpperCase()) {
    add(errors, 'socket_mismatch', `CPU dùng socket ${cpu.socket} nhưng mainboard là socket ${board.socket}`, ['cpu', 'mainboard']);
  }

  if (board) {
    const modules = groups.ram.reduce((sum, ram) => sum + Number(ram.modules || 1) * (ram.quantity || 1), 0);
    for (const ram of groups.ram) {
      if (ram.memoryType && board.memoryType && ram.memoryType.toUpperCase() !== board.memoryType.toUpperCase()) {
        add(errors, 'memory_type_mismatch', `RAM ${ram.memoryType} không cắm được vào mainboard hỗ trợ ${board.memoryType}`, ['ram', 'mainboard']);
      }
    }
    if (board.memorySlots && modules > board.memorySlots) {
      add(errors, 'memory_slots', `Cần ${modules} khe RAM nhưng mainboard chỉ có ${board.memorySlots} khe`, ['ram', 'mainboard']);
    }

    const m2Drives = groups.storage
      .filter((drive) => String(drive.storageInterface || '').toUpperCase() === 'M.2')
      .reduce((sum, drive) => sum + (drive.quantity || 1), 0);
    if (board.m2Slots !== null && board.m2Slots !== undefined && m2Drives > board.m2Slots) {
      add(errors, 'm2_slots', `Có ${m2Drives} ổ M.2 nhưng mainboard chỉ có ${board.m2Slots} khe M.2`, ['storage', 'mainboard']);
    }
  }

  if (board && pcCase && board.formFactor) {
    const supported = splitList(pcCase.supportedFormFactors);
    if (supported.length > 0 && !supported.includes(board.formFactor.toUpperCase())) {
      add(errors, 'form_factor', `Case chỉ hỗ trợ mainboard ${supported.join(', ')}, không vừa mainboard ${board.formFactor}`, ['case', 'mainboard']);
    }
  }

  if (pcCase && pcCase.maxGpuLengthMm) {
    for (const gpu of groups.gpu) {
      if (gpu.lengthMm && gpu.lengthMm > pcCase.maxGpuLengthMm) {
        add(errors, 'gpu_length', `Card dài ${gpu.lengthMm} mm, case chỉ chứa tối đa ${pcCase.maxGpuLengthMm} mm`, ['gpu', 'case']);
      }
    }
  }

  if (cooler) {
    if (cpu && cpu.socket) {
      const sockets = splitList(cooler.supportedSockets);
      if (sockets.length > 0 && !sockets.includes(cpu.socket.toUpperCase())) {
        add(errors, 'cooler_socket', `Tản nhiệt không hỗ trợ socket ${cpu.socket}`, ['cooler', 'cpu']);
      }
    }
    if (pcCase && pcCase.maxCoolerHeightMm && cooler.heightMm && cooler.heightMm > pcCase.maxCoolerHeightMm) {
      add(errors, 'cooler_height', `Tản cao ${cooler.heightMm} mm, case chỉ chứa tản cao tối đa ${pcCase.maxCoolerHeightMm} mm`, ['cooler', 'case']);
    }
  } else if (cpu && cpu.includesCooler === false) {
    add(warnings, 'no_cooler', 'CPU này không kèm tản nhiệt, nên chọn thêm tản', ['cooler', 'cpu']);
  }

  if (parts.some((part) => part.type === 'laptop_ram')) {
    add(errors, 'laptop_ram', 'RAM laptop (SO-DIMM) không cắm được vào mainboard máy bàn, hãy chọn RAM DIMM', ['ram']);
  }
  const shortM2 = groups.storage.filter((drive) => String(drive.storageInterface || '').toUpperCase() === 'M.2' && drive.m2Size && drive.m2Size !== '2280');
  if (shortM2.length > 0) {
    add(warnings, 'm2_size', `Ổ M.2 cỡ ${[...new Set(shortM2.map((drive) => drive.m2Size))].join(', ')}: mainboard máy bàn thường có khe 2280, cần miếng chuyển để cố định ổ`, ['storage']);
  }

  if (cpu && groups.gpu.length === 0 && cpu.hasIntegratedGraphics === false) {
    add(errors, 'no_display_output', 'CPU không có nhân đồ hoạ tích hợp, cần chọn card đồ hoạ để có hình', ['gpu', 'cpu']);
  }

  const estimatedPowerW = estimatePowerW(groups);
  const recommended = recommendedPsuW(estimatedPowerW);
  if (psu && psu.psuWatts) {
    if (psu.psuWatts < estimatedPowerW) {
      add(errors, 'psu_too_weak', `Nguồn ${psu.psuWatts} W thấp hơn mức tiêu thụ ước tính ${estimatedPowerW} W`, ['psu']);
    } else if (psu.psuWatts < recommended) {
      add(warnings, 'psu_low_headroom', `Nguồn ${psu.psuWatts} W hơi sát; nên dùng từ ${recommended} W`, ['psu']);
    }
  }

  if (missing.length > 0) {
    add(warnings, 'incomplete', `Còn thiếu: ${missing.map((type) => SLOT_LABELS[type]).join(', ')}`, missing);
  }

  return {
    ok: errors.length === 0,
    complete: missing.length === 0,
    errors,
    warnings,
    estimatedPowerW,
    recommendedPsuW: recommended,
  };
};

module.exports = {
  SLOT_ORDER,
  SLOT_LABELS,
  REQUIRED_SLOTS,
  checkBuild,
  estimatePowerW: (parts) => estimatePowerW(groupByType(parts)),
  recommendedPsuW,
};
