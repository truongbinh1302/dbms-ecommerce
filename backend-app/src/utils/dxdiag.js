/*
  Đọc file DxDiag.txt (Windows: Win + R → dxdiag → "Save All Information...").
  Chỉ lấy hãng máy, model, CPU, dung lượng RAM và card đồ hoạ. Trình duyệt chỉ gửi các dòng đó lên
  (xem KEEP_KEYS), không gửi tên máy hay thông tin khác. Hàm thuần, không gọi DB.
*/

// Các khoá giữ lại (giao diện lọc theo đúng danh sách này trước khi gửi).
const KEEP_KEYS = ['System Manufacturer', 'System Model', 'Processor', 'Memory', 'Card name', 'Chip type', 'Dedicated Memory'];
const MAX_TEXT = 20000;

const toNumber = (value) => Number(String(value || '').replace(/[.,\s]/g, ''));

const cleanCpuName = (value) => String(value || '')
  .replace(/\(\s*\d+\s*CPUs?\s*\).*$/i, '')
  .replace(/\((R|TM)\)/gi, '')
  .replace(/\s+CPU\s+@.*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const gpuVendor = (name) => {
  if (/nvidia|geforce|quadro|\brtx\b|\bgtx\b/i.test(name)) return 'nvidia';
  if (/radeon|\bamd\b/i.test(name)) return 'amd';
  if (/intel/i.test(name)) return 'intel';
  return null;
};

/**
 * Card rời hay đồ hoạ tích hợp. Theo tên trước (máy AMD có thể đặt sẵn 2-4 GB "Dedicated Memory" cho iGPU),
 * không nhận ra tên thì dựa vào bộ nhớ riêng từ 2 GB.
 */
const isDiscrete = (name, dedicatedMB) => {
  const text = String(name || '');
  if (/nvidia|geforce|quadro|\brtx\b|\bgtx\b/i.test(text)) return true;
  if (/radeon\s*(\(tm\)\s*)?(rx|pro)\b/i.test(text)) return true;
  if (/arc\s*(\(tm\)\s*)?[ab]\d{3}/i.test(text)) return true;
  if (/\b(uhd|iris|hd graphics)\b/i.test(text)) return false;
  if (/radeon\s*(\(tm\)\s*)?(\d{3}m\s*)?graphics/i.test(text)) return false;
  if (/arc\s*(\(tm\)\s*)?graphics/i.test(text)) return false;
  if (/microsoft basic/i.test(text)) return false;
  return Number(dedicatedMB) >= 2048;
};

/** Chỉ giữ các dòng cần thiết (giao diện cũng làm việc này trước khi gửi). */
const keepRelevantLines = (text) => String(text || '')
  .split(/\r?\n/)
  .filter((line) => KEEP_KEYS.some((key) => new RegExp(`^\\s*${key}\\s*:`, 'i').test(line)))
  .join('\n');

/**
 * Phân tích nội dung DxDiag. Trả về null nếu không thấy dòng nào nhận ra được.
 * { manufacturer, model, cpuName, cpuThreads, ramGB, gpus: [{ name, vramGB, kind, discrete }], gpu }
 */
const parseDxDiag = (rawText) => {
  const text = String(rawText || '').slice(0, MAX_TEXT);
  const result = { manufacturer: null, model: null, cpuName: null, cpuThreads: null, ramGB: null, gpus: [], gpu: null };
  let currentGpu = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z ]+?)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];

    if (key === 'system manufacturer' && !result.manufacturer) result.manufacturer = value.slice(0, 80) || null;
    else if (key === 'system model' && !result.model) result.model = value.slice(0, 120) || null;
    else if (key === 'processor' && !result.cpuName) {
      result.cpuName = cleanCpuName(value).slice(0, 100) || null;
      const threads = value.match(/\(\s*(\d+)\s*CPUs?\s*\)/i);
      if (threads) result.cpuThreads = Number(threads[1]);
    } else if (key === 'memory' && result.ramGB === null) {
      const mb = value.match(/([\d.,]+)\s*MB/i);
      if (mb && toNumber(mb[1]) > 0) result.ramGB = Math.round(toNumber(mb[1]) / 1024);
    } else if (key === 'card name') {
      currentGpu = { name: value.slice(0, 100), dedicatedMB: null };
      result.gpus.push(currentGpu);
    } else if (key === 'dedicated memory' && currentGpu && currentGpu.dedicatedMB === null) {
      const mb = value.match(/([\d.,]+)\s*MB/i);
      currentGpu.dedicatedMB = mb ? toNumber(mb[1]) : 0;
    }
  }

  // Một card có thể hiện ở cả mục Display và Render: gộp theo tên.
  const byName = new Map();
  for (const gpu of result.gpus) {
    const existing = byName.get(gpu.name);
    if (!existing || (gpu.dedicatedMB || 0) > (existing.dedicatedMB || 0)) byName.set(gpu.name, gpu);
  }
  result.gpus = [...byName.values()].map((gpu) => {
    const discrete = isDiscrete(gpu.name, gpu.dedicatedMB);
    return {
      name: gpu.name,
      kind: gpuVendor(gpu.name),
      discrete,
      vramGB: discrete && gpu.dedicatedMB ? Math.round(gpu.dedicatedMB / 1024) : 0,
    };
  });
  result.gpu = result.gpus.filter((gpu) => gpu.discrete).sort((a, b) => b.vramGB - a.vramGB)[0] || null;

  if (!result.model && !result.cpuName && result.ramGB === null && result.gpus.length === 0) return null;
  return result;
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Tìm model laptop khớp dòng "System Model" (và hãng). Mỗi model có MatchKeys dạng "82Y9|Legion Slim 5 16APH8".
 * Chọn khoá dài nhất khớp được để "TUF Gaming A15 FA507NV" thắng "FA507".
 */
const matchLaptopModel = (parsed, models) => {
  if (!parsed || !parsed.model) return null;
  const haystack = normalizeKey(`${parsed.manufacturer || ''} ${parsed.model}`);
  let best = null;
  for (const model of models) {
    for (const key of String(model.matchKeys || '').split('|').map(normalizeKey).filter((item) => item.length >= 4)) {
      if (haystack.includes(key) && (!best || key.length > best.length)) best = { model, length: key.length };
    }
  }
  return best ? best.model : null;
};

module.exports = { KEEP_KEYS, MAX_TEXT, keepRelevantLines, parseDxDiag, matchLaptopModel, isDiscrete, cleanCpuName };
