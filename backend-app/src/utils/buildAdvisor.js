const { checkBuild, estimatePowerW, recommendedPsuW } = require('./compatibility');

/*
  Gợi ý cấu hình theo phần mềm cần chạy và tư vấn nâng cấp máy đang có.
  Đây là khuyến nghị của cửa hàng (ngưỡng RAM, VRAM, hạng CPU), không phải yêu cầu
  chính thức của nhà phát triển phần mềm. Thuật toán chọn linh kiện rẻ nhất còn hàng
  thoả mãn từng ngưỡng và tương thích với nhau, nên kết quả giải thích được từng bước.
*/

const PRESETS = [
  {
    id: 'van-phong-hoc-tap',
    name: 'Văn phòng, học tập',
    software: 'Office, trình duyệt nhiều tab, học trực tuyến',
    needs: { cpuTier: 1, ramGB: 16, storageGB: 500, gpu: null },
    reason: 'Không cần card rời; 16 GB RAM đủ cho trình duyệt nhiều tab và ứng dụng văn phòng.',
  },
  {
    id: 'lap-trinh-web',
    name: 'Lập trình web, Docker',
    software: 'VS Code, Node.js, Docker, cơ sở dữ liệu chạy local',
    needs: { cpuTier: 1, ramGB: 32, storageGB: 1000, gpu: null },
    reason: 'Docker và các container ăn RAM nhiều nhất; 32 GB giúp chạy IDE, trình duyệt và vài container cùng lúc.',
  },
  {
    id: 'lap-trinh-android',
    name: 'Lập trình Android',
    software: 'Android Studio, Gradle, máy ảo Android',
    needs: { cpuTier: 2, ramGB: 32, storageGB: 1000, gpu: null },
    reason: 'Build Gradle và máy ảo Android hưởng lợi từ CPU nhiều nhân và RAM lớn.',
  },
  {
    id: 'do-hoa-3d',
    name: 'Đồ hoạ 3D, dựng video',
    software: 'Blender, DaVinci Resolve',
    needs: { cpuTier: 2, ramGB: 32, storageGB: 1000, gpu: { minVramGB: 8 } },
    reason: 'Render và dựng video dùng card đồ hoạ; từ 8 GB VRAM để làm việc với cảnh và timeline vừa phải.',
  },
  {
    id: 'ai-local',
    name: 'Chạy mô hình AI trên máy',
    software: 'Ollama, LM Studio, Stable Diffusion',
    needs: { cpuTier: 2, ramGB: 32, storageGB: 1000, gpu: { minVramGB: 12, nvidiaOnly: true } },
    reason: 'VRAM quyết định cỡ mô hình chạy được trên GPU, nên chọn card từ 12 GB VRAM; dùng card NVIDIA vì phần lớn công cụ AI hỗ trợ CUDA sẵn, ít phải cấu hình.',
  },
];

const byPrice = (a, b) => a.price - b.price || a.productId - b.productId;
const inStock = (part) => part.stock > 0;
const ofType = (parts, type) => parts.filter((part) => part.type === type && inStock(part)).sort(byPrice);
const isNvidia = (part) => /geforce|\brtx\b|\bgtx\b/i.test(part.name || '');
const supports = (list, value) => String(list || '').toUpperCase().split(',').map((s) => s.trim()).includes(String(value || '').toUpperCase());

/** Ráp cấu hình rẻ nhất thoả preset. Trả về null nếu kho không đủ linh kiện phù hợp. */
const autoBuild = (preset, components) => {
  const { needs } = preset;
  const cpus = ofType(components, 'cpu').filter((cpu) => (cpu.tier || 0) >= needs.cpuTier);
  // Không cần card rời thì ưu tiên CPU có đồ hoạ tích hợp để khỏi mua card.
  const orderedCpus = needs.gpu
    ? cpus
    : [...cpus.filter((cpu) => cpu.hasIntegratedGraphics), ...cpus.filter((cpu) => !cpu.hasIntegratedGraphics)];

  for (const cpu of orderedCpus) {
    const boards = ofType(components, 'mainboard').filter((board) => board.socket === cpu.socket);
    for (const board of boards) {
      const ram = ofType(components, 'ram').find((kit) => kit.memoryType === board.memoryType
        && (kit.capacityGB || 0) >= needs.ramGB
        && (kit.modules || 1) <= (board.memorySlots || 4));
      if (!ram) continue;

      let gpu = null;
      if (needs.gpu) {
        gpu = ofType(components, 'gpu').find((card) => (card.vramGB || 0) >= needs.gpu.minVramGB
          && (!needs.gpu.nvidiaOnly || isNvidia(card))) || null;
        if (!gpu) continue;
      } else if (!cpu.hasIntegratedGraphics) {
        gpu = ofType(components, 'gpu')[0] || null;
        if (!gpu) continue;
      }

      const drives = ofType(components, 'storage').filter((drive) => (drive.capacityGB || 0) >= needs.storageGB);
      const storage = (board.m2Slots > 0 ? drives.find((drive) => drive.storageInterface === 'M.2') : null)
        || drives.find((drive) => drive.storageInterface !== 'M.2')
        || null;
      if (!storage) continue;

      const cooler = cpu.includesCooler
        ? null
        : ofType(components, 'cooler').find((item) => supports(item.supportedSockets, cpu.socket)) || null;
      if (!cpu.includesCooler && !cooler) continue;

      const pcCase = ofType(components, 'case').find((item) => supports(item.supportedFormFactors, board.formFactor)
        && (!gpu || !gpu.lengthMm || !item.maxGpuLengthMm || gpu.lengthMm <= item.maxGpuLengthMm)
        && (!cooler || !cooler.heightMm || !item.maxCoolerHeightMm || cooler.heightMm <= item.maxCoolerHeightMm));
      if (!pcCase) continue;

      const partsSoFar = [cpu, board, ram, gpu, storage, cooler].filter(Boolean);
      const needW = recommendedPsuW(estimatePowerW(partsSoFar));
      const psu = ofType(components, 'psu').find((item) => (item.psuWatts || 0) >= needW);
      if (!psu) continue;

      const parts = [...partsSoFar, psu, pcCase];
      const check = checkBuild(parts);
      if (check.ok && check.complete) {
        return { parts, check };
      }
    }
  }
  return null;
};

/**
 * Tư vấn nâng cấp: khách nhập thông số máy đang có, trả về linh kiện lắp được.
 * @param {object} current { socket, memoryType, psuWatts, maxGpuLengthMm, cpuPowerW, gpuPowerW, hasM2Slot }
 */
const upgradeOptions = (current, components) => {
  const cpuPowerW = Number(current.cpuPowerW) || 125;
  const psuWatts = Number(current.psuWatts) || 0;
  const result = { cpu: [], ram: [], gpu: [], storage: [] };

  for (const part of components.filter(inStock).sort(byPrice)) {
    if (part.type === 'cpu' && current.socket && part.socket === current.socket) {
      const est = 75 + (part.powerW || 0) + (Number(current.gpuPowerW) || 0);
      if (psuWatts && psuWatts < est) continue;
      const notes = [];
      if (psuWatts && psuWatts < recommendedPsuW(est)) notes.push(`Nguồn ${psuWatts} W hơi sát, nên nâng lên ${recommendedPsuW(est)} W`);
      if (part.includesCooler === false) notes.push('Không kèm tản nhiệt, cần mua thêm tản');
      result.cpu.push({ ...part, note: notes.length ? notes.join('. ') : null });
    }
    if (part.type === 'ram' && current.memoryType && part.memoryType === current.memoryType) {
      result.ram.push({ ...part, note: null });
    }
    if (part.type === 'gpu') {
      if (current.maxGpuLengthMm && part.lengthMm && part.lengthMm > Number(current.maxGpuLengthMm)) continue;
      const est = 75 + cpuPowerW + (part.powerW || 0);
      if (psuWatts && psuWatts < est) continue;
      const tight = psuWatts && psuWatts < recommendedPsuW(est);
      result.gpu.push({ ...part, note: tight ? `Nguồn ${psuWatts} W hơi sát, nên nâng lên ${recommendedPsuW(est)} W` : null });
    }
    if (part.type === 'storage') {
      if (part.storageInterface === 'M.2' && current.hasM2Slot === false) continue;
      result.storage.push({ ...part, note: null });
    }
  }
  return result;
};

module.exports = { PRESETS, isNvidia, autoBuild, upgradeOptions };
