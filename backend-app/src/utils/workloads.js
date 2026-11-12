/*
  "Máy này chạy được gì?": ước tính theo dung lượng RAM, VRAM và số luồng CPU của một cấu hình.
  Mọi ngưỡng là khuyến nghị của cửa hàng (dựa trên dung lượng bộ nhớ cần để nạp mô hình hoặc chạy phần mềm),
  không phải yêu cầu chính thức của nhà phát triển, và không đo tốc độ thật. Hàm thuần, không gọi DB.

  Hồ sơ máy (profile):
    ramGB        RAM hệ thống
    vramGB       VRAM card rời (0 nếu không có card rời)
    gpuKind      'nvidia' | 'amd' | 'intel' | 'apple' | null (null = chỉ có đồ hoạ tích hợp)
    gpuName      tên card (chỉ để hiển thị)
    cpuThreads   số luồng CPU (null nếu không rõ)
    unifiedMemory  true với máy Apple Silicon: card dùng chung RAM
*/

const VERDICTS = {
  good: 'Tốt',
  ok: 'Được',
  slow: 'Chậm',
  no: 'Không chạy được',
};
const RANK = { no: 0, slow: 1, ok: 2, good: 3 };

// RAM để dành cho hệ điều hành, trình duyệt và IDE khi tính phần còn lại cho công việc nặng.
const BASE_RAM_GB = 8;
// Mô hình nén 4-bit (Q4_K_M): khoảng 0,6 GB mỗi tỉ tham số; thêm bộ nhớ ngữ cảnh khoảng 8.000 token.
const Q4_GB_PER_BILLION = 0.6;

const LLM_SIZES = [
  { id: 'llm-4b', billions: 4, label: 'Mô hình ngôn ngữ cỡ 3-4B', examples: 'Llama 3.2 3B, Gemma 3 4B, Phi-4 mini' },
  { id: 'llm-8b', billions: 8, label: 'Mô hình ngôn ngữ cỡ 7-8B', examples: 'Llama 3.1 8B, Qwen3 8B' },
  { id: 'llm-14b', billions: 14, label: 'Mô hình ngôn ngữ cỡ 12-14B', examples: 'Qwen3 14B, Phi-4, Gemma 3 12B' },
  { id: 'llm-32b', billions: 32, label: 'Mô hình ngôn ngữ cỡ 27-32B', examples: 'Qwen3 32B, Gemma 3 27B' },
  { id: 'llm-70b', billions: 70, label: 'Mô hình ngôn ngữ cỡ 70B', examples: 'Llama 3.3 70B' },
];

const IMAGE_MODELS = [
  { id: 'sd15', label: 'Tạo ảnh Stable Diffusion 1.5 (512 px)', goodVram: 6, okVram: 4 },
  { id: 'sdxl', label: 'Tạo ảnh SDXL (1024 px)', goodVram: 12, okVram: 8 },
  { id: 'flux', label: 'Tạo ảnh FLUX.1 bản nén fp8', goodVram: 16, okVram: 12 },
];

const roundGB = (value) => Math.round(value * 10) / 10;
const formatGB = (value) => `${String(roundGB(value)).replace('.', ',')} GB`;

/** Bộ nhớ cần để chạy mô hình ngôn ngữ nén 4-bit (GB). */
const llmMemoryGB = (billions) => roundGB(billions * Q4_GB_PER_BILLION + 1 + billions * 0.02);

const hasGpu = (profile) => Boolean(profile.gpuKind) && (profile.vramGB > 0 || profile.unifiedMemory);

/** VRAM card dùng được. Máy Apple dùng chung RAM: macOS cho card dùng khoảng 3/4 RAM. */
const usableVram = (profile) => (profile.unifiedMemory ? Math.floor(profile.ramGB * 0.75) : Number(profile.vramGB) || 0);

const freeRam = (profile) => Math.max(Number(profile.ramGB) - BASE_RAM_GB, 0);

const notNvidiaNote = (profile) => (profile.gpuKind === 'amd' || profile.gpuKind === 'intel'
  ? 'Card AMD/Intel được ít công cụ AI hỗ trợ sẵn hơn card NVIDIA (CUDA), có thể phải cấu hình thêm.'
  : null);

const checkLlm = (profile, model) => {
  const need = llmMemoryGB(model.billions);
  const vram = usableVram(profile);
  const base = { id: model.id, group: 'ai', label: model.label, examples: model.examples, needGB: need };
  if (profile.unifiedMemory && vram >= need) {
    return { ...base, verdict: 'good', detail: `Cần khoảng ${formatGB(need)}; máy dùng chung ${profile.ramGB} GB RAM cho card nên nạp được cả mô hình.` };
  }
  if (hasGpu(profile) && !profile.unifiedMemory && vram >= need) {
    return { ...base, verdict: 'good', detail: `Cần khoảng ${formatGB(need)}, vừa trong ${vram} GB VRAM: chạy hoàn toàn trên card, trả lời nhanh.`, note: notNvidiaNote(profile) };
  }
  const spare = freeRam(profile);
  if (hasGpu(profile) && !profile.unifiedMemory && vram + spare >= need) {
    return { ...base, verdict: 'slow', detail: `Cần khoảng ${formatGB(need)}, hơn ${vram} GB VRAM: phần còn lại nằm ở RAM nên chạy chậm hơn nhiều.` };
  }
  if (!hasGpu(profile) && spare >= need) {
    return { ...base, verdict: 'slow', detail: `Cần khoảng ${formatGB(need)}: không có card rời nên chạy bằng CPU, trả lời chậm.` };
  }
  return { ...base, verdict: 'no', detail: `Cần khoảng ${formatGB(need)} bộ nhớ trống, máy không đủ.` };
};

const checkImage = (profile, model) => {
  const vram = usableVram(profile);
  const base = { id: model.id, group: 'ai', label: model.label };
  if (!hasGpu(profile)) {
    return { ...base, verdict: 'no', detail: 'Cần card đồ hoạ rời; chạy bằng CPU mất nhiều phút cho mỗi ảnh.' };
  }
  const note = notNvidiaNote(profile);
  if (vram >= model.goodVram) return { ...base, verdict: 'good', detail: `${vram} GB VRAM đủ thoải mái.`, note };
  if (vram >= model.okVram) return { ...base, verdict: 'ok', detail: `${vram} GB VRAM chạy được, nên giảm độ phân giải hoặc bật chế độ tiết kiệm VRAM (thoải mái từ ${model.goodVram} GB).`, note };
  return { ...base, verdict: 'no', detail: `Cần từ ${model.okVram} GB VRAM, máy có ${vram} GB.` };
};

const checkDocker = (profile) => {
  const spare = freeRam(profile);
  const base = {
    id: 'docker',
    group: 'dev',
    label: 'Lập trình web với Docker',
    examples: 'VS Code, Node.js, vài container cơ sở dữ liệu',
  };
  const tail = 'Ví dụ: bộ Docker của chính cửa hàng này (SQL Server, MongoDB, API, web) cần khoảng 4 GB.';
  if (spare >= 16) return { ...base, verdict: 'good', detail: `Còn khoảng ${spare} GB cho Docker sau khi mở IDE và trình duyệt: chạy nhiều dịch vụ cùng lúc thoải mái. ${tail}` };
  if (spare >= 6) return { ...base, verdict: 'ok', detail: `Còn khoảng ${spare} GB cho Docker: đủ cho vài container (API, cơ sở dữ liệu). ${tail}` };
  if (spare >= 3) return { ...base, verdict: 'slow', detail: `Chỉ còn khoảng ${spare} GB cho Docker: 1-2 container nhẹ, máy dễ chậm khi mở thêm trình duyệt.` };
  if (profile.ramGB >= 8) return { ...base, verdict: 'slow', detail: `RAM ${profile.ramGB} GB gần như hết sau khi mở IDE và trình duyệt: chạy được 1 container nhẹ nhưng rất chậm, nên từ 16 GB.` };
  return { ...base, verdict: 'no', detail: `RAM ${profile.ramGB} GB không đủ cho Docker cùng IDE và trình duyệt, nên từ 16 GB.` };
};

const checkAndroid = (profile) => {
  const ram = Number(profile.ramGB) || 0;
  const base = { id: 'android', group: 'dev', label: 'Android Studio và máy ảo Android' };
  const cpuNote = profile.cpuThreads && profile.cpuThreads < 12 ? 'CPU ít luồng nên build Gradle sẽ lâu.' : null;
  if (ram >= 32) return { ...base, verdict: 'good', detail: `${ram} GB RAM: chạy IDE, Gradle và máy ảo cùng lúc thoải mái.`, note: cpuNote };
  if (ram >= 16) return { ...base, verdict: 'ok', detail: `${ram} GB RAM chạy được IDE và một máy ảo; nên đóng bớt ứng dụng khác.`, note: cpuNote };
  if (ram >= 8) return { ...base, verdict: 'slow', detail: `${ram} GB RAM là mức tối thiểu: máy ảo rất chậm, nên chạy thử trên điện thoại thật.`, note: cpuNote };
  return { ...base, verdict: 'no', detail: `Android Studio cần tối thiểu 8 GB RAM, máy có ${ram} GB.` };
};

const checkVirtualMachines = (profile) => {
  const count = Math.floor(freeRam(profile) / 4);
  const base = { id: 'vm', group: 'dev', label: 'Máy ảo (WSL2, VirtualBox, VMware) 4 GB mỗi máy' };
  if (count >= 3) return { ...base, verdict: 'good', detail: `Chạy cùng lúc khoảng ${count} máy ảo 4 GB.` };
  if (count >= 1) return { ...base, verdict: 'ok', detail: `Chạy cùng lúc khoảng ${count} máy ảo 4 GB.` };
  return { ...base, verdict: 'no', detail: 'Không đủ RAM trống cho một máy ảo 4 GB khi đang mở IDE và trình duyệt.' };
};

const checkBlender = (profile) => {
  const vram = usableVram(profile);
  const base = { id: 'blender', group: 'creative', label: 'Blender render Cycles' };
  if (!hasGpu(profile)) return { ...base, verdict: 'slow', detail: 'Không có card rời: render bằng CPU, chậm hơn nhiều lần.' };
  if (profile.gpuKind === 'nvidia' && vram >= 8) return { ...base, verdict: 'good', detail: `Card NVIDIA ${vram} GB render bằng OptiX, cảnh vừa và lớn vẫn vừa VRAM.` };
  if (vram >= 8 || profile.unifiedMemory) return { ...base, verdict: 'ok', detail: `Render bằng card (${profile.gpuKind === 'apple' ? 'Metal' : 'HIP/oneAPI'}), chậm hơn card NVIDIA cùng tầm.` };
  return { ...base, verdict: 'ok', detail: `${vram} GB VRAM render được cảnh nhỏ; cảnh lớn có thể thiếu VRAM.` };
};

const checkVideo = (profile) => {
  const ram = Number(profile.ramGB) || 0;
  const vram = usableVram(profile);
  const base = { id: 'video', group: 'creative', label: 'Dựng video (DaVinci Resolve, Premiere Pro)' };
  if (ram >= 32 && (vram >= 8 || profile.unifiedMemory)) return { ...base, verdict: 'good', detail: 'Đủ RAM và VRAM để dựng 4K nhiều lớp.' };
  if (ram >= 16 && hasGpu(profile)) return { ...base, verdict: 'ok', detail: 'Dựng 1080p mượt; 4K nên dùng file proxy.' };
  if (ram >= 16) return { ...base, verdict: 'slow', detail: 'Không có card rời: dựng 1080p được, 4K giật.' };
  return { ...base, verdict: 'slow', detail: `RAM ${ram} GB: chỉ nên dựng video ngắn 1080p.` };
};

const checkOffice = (profile) => {
  const ram = Number(profile.ramGB) || 0;
  const base = { id: 'office', group: 'dev', label: 'Văn phòng, học online, trình duyệt nhiều tab' };
  if (ram >= 16) return { ...base, verdict: 'good', detail: `${ram} GB RAM thoải mái.` };
  if (ram >= 8) return { ...base, verdict: 'ok', detail: `${ram} GB RAM đủ dùng, mở quá nhiều tab sẽ chậm.` };
  return { ...base, verdict: 'slow', detail: `${ram} GB RAM dễ chậm khi mở nhiều tab.` };
};

const GROUPS = [
  { id: 'ai', label: 'AI chạy trên máy' },
  { id: 'dev', label: 'Lập trình và học tập' },
  { id: 'creative', label: 'Đồ hoạ, dựng video' },
];

/** Chuẩn hoá và kiểm tra hồ sơ máy. Trả về null nếu thiếu RAM. */
const normalizeProfile = (raw = {}) => {
  const ramGB = Number(raw.ramGB);
  if (!Number.isFinite(ramGB) || ramGB < 2 || ramGB > 1024) return null;
  const kinds = ['nvidia', 'amd', 'intel', 'apple'];
  const gpuKind = kinds.includes(raw.gpuKind) ? raw.gpuKind : null;
  const vramGB = gpuKind && gpuKind !== 'apple' ? Math.max(Math.min(Math.round(Number(raw.vramGB) || 0), 96), 0) : 0;
  const threads = Number(raw.cpuThreads);
  return {
    ramGB: Math.round(ramGB),
    vramGB,
    gpuKind: gpuKind && (vramGB > 0 || gpuKind === 'apple') ? gpuKind : null,
    gpuName: raw.gpuName ? String(raw.gpuName).slice(0, 80) : null,
    cpuName: raw.cpuName ? String(raw.cpuName).slice(0, 100) : null,
    cpuThreads: Number.isInteger(threads) && threads > 0 && threads <= 256 ? threads : null,
    unifiedMemory: gpuKind === 'apple' || Boolean(raw.unifiedMemory),
  };
};

/** Ước tính khả năng chạy cho một hồ sơ máy. */
const estimateCapabilities = (rawProfile) => {
  const profile = normalizeProfile(rawProfile);
  if (!profile) return null;
  const checks = [
    ...LLM_SIZES.map((model) => checkLlm(profile, model)),
    ...IMAGE_MODELS.map((model) => checkImage(profile, model)),
    checkOffice(profile),
    checkDocker(profile),
    checkAndroid(profile),
    checkVirtualMachines(profile),
    checkBlender(profile),
    checkVideo(profile),
  ].map((item) => ({ ...item, verdictLabel: VERDICTS[item.verdict], note: item.note || null }));

  const largestLlm = [...LLM_SIZES].reverse().find((model) => checks.find((item) => item.id === model.id).verdict === 'good');
  return {
    profile,
    summary: largestLlm
      ? `Chạy nhanh mô hình AI đến cỡ ${largestLlm.billions}B trên ${profile.unifiedMemory ? 'bộ nhớ chung' : 'card đồ hoạ'}.`
      : 'Chưa chạy nhanh được mô hình AI trên card; các việc khác xem bên dưới.',
    groups: GROUPS.map((group) => ({ ...group, items: checks.filter((item) => item.group === group.id) })),
  };
};

/**
 * So sánh trước/sau (ví dụ sau khi nâng RAM): các việc được xếp hạng tốt hơn.
 * Trả về [{ id, label, from, to }].
 */
const compareCapabilities = (before, after) => {
  if (!before || !after) return [];
  const flat = (result) => new Map(result.groups.flatMap((group) => group.items).map((item) => [item.id, item]));
  const was = flat(before);
  return [...flat(after).values()]
    .filter((item) => was.has(item.id) && RANK[item.verdict] > RANK[was.get(item.id).verdict])
    .map((item) => ({ id: item.id, label: item.label, from: was.get(item.id).verdictLabel, to: item.verdictLabel }));
};

/** Hạng CPU (1 phổ thông, 2 nhiều nhân, 3 cao cấp) theo số luồng, cùng cách xếp với ComponentSpecs.Tier. */
const cpuTierFromThreads = (threads) => {
  const value = Number(threads) || 0;
  if (value >= 24) return 3;
  if (value >= 16) return 2;
  return 1;
};

/** Ngược lại: số luồng đại diện cho một hạng CPU (khi chỉ biết hạng trong Build PC). */
const threadsForTier = (tier) => ({ 1: 12, 2: 16, 3: 24 }[Number(tier)] || null);

const gpuKindFromName = (name) => {
  const text = String(name || '');
  if (/nvidia|geforce|\brtx\b|\bgtx\b|quadro/i.test(text)) return 'nvidia';
  if (/radeon|\bamd\b/i.test(text)) return 'amd';
  if (/\barc\b|intel/i.test(text)) return 'intel';
  if (/apple|\bm[1-4]\b/i.test(text)) return 'apple';
  return null;
};

module.exports = {
  VERDICTS,
  LLM_SIZES,
  IMAGE_MODELS,
  BASE_RAM_GB,
  llmMemoryGB,
  normalizeProfile,
  estimateCapabilities,
  compareCapabilities,
  cpuTierFromThreads,
  threadsForTier,
  gpuKindFromName,
};
