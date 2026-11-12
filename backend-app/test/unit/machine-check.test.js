/*
  Unit test giai đoạn 5: "Máy này chạy được gì?", đọc DxDiag, nâng cấp laptop, nhãn "Nên mua lúc nào?".
  Toàn hàm thuần, không cần DB.
*/
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  llmMemoryGB,
  normalizeProfile,
  estimateCapabilities,
  compareCapabilities,
  gpuKindFromName,
} = require('../../src/utils/workloads');
const { keepRelevantLines, parseDxDiag, matchLaptopModel, isDiscrete, cleanCpuName } = require('../../src/utils/dxdiag');
const { ramUpgrade, storageUpgrade } = require('../../src/utils/laptopUpgrade');
const { classifyPrice, badgeFor, MIN_COVERED_DAYS } = require('../../src/utils/priceInsight');
const { checkBuild } = require('../../src/utils/compatibility');
const { fitsDesktopM2 } = require('../../src/utils/buildAdvisor');
const { profileFromSpecs, profileFromParts, describeUpgradeability } = require('../../src/services/machine.service');
const { canonicalItems } = require('../../src/services/buildWatch.service');

const verdictOf = (result, id) => result.groups.flatMap((group) => group.items).find((item) => item.id === id).verdict;

// ---------- Máy chạy được gì ----------

test('Bộ nhớ cho mô hình nén 4-bit tăng theo số tham số', () => {
  assert.equal(llmMemoryGB(8), 6);
  assert.equal(llmMemoryGB(14), 9.7);
  assert.ok(llmMemoryGB(70) > 40);
});

test('normalizeProfile: thiếu RAM thì null; card không có VRAM coi như không có card rời', () => {
  assert.equal(normalizeProfile({}), null);
  assert.equal(normalizeProfile({ ramGB: 1 }), null);
  const profile = normalizeProfile({ ramGB: 16, gpuKind: 'nvidia', vramGB: 0 });
  assert.equal(profile.gpuKind, null);
  assert.equal(normalizeProfile({ ramGB: 16, gpuKind: 'apple' }).unifiedMemory, true);
});

test('Card 8 GB: mô hình 8B chạy nhanh trên card, 14B tràn sang RAM nên chậm, 70B không chạy được', () => {
  const result = estimateCapabilities({ ramGB: 16, gpuKind: 'nvidia', vramGB: 8, cpuThreads: 16 });
  assert.equal(verdictOf(result, 'llm-8b'), 'good');
  assert.equal(verdictOf(result, 'llm-14b'), 'slow');
  assert.equal(verdictOf(result, 'llm-70b'), 'no');
  assert.equal(verdictOf(result, 'sdxl'), 'ok');
  assert.match(result.summary, /8B/);
});

test('Không có card rời: AI chạy bằng CPU nếu đủ RAM, tạo ảnh không được', () => {
  const result = estimateCapabilities({ ramGB: 32 });
  assert.equal(verdictOf(result, 'llm-8b'), 'slow');
  assert.equal(verdictOf(result, 'llm-32b'), 'slow', '32B cần khoảng 21 GB, còn 24 GB sau khi trừ phần cho hệ điều hành');
  assert.equal(verdictOf(result, 'llm-70b'), 'no');
  assert.equal(verdictOf(result, 'sd15'), 'no');
  assert.equal(verdictOf(result, 'docker'), 'good');
  assert.match(result.summary, /Chưa chạy nhanh/);
});

test('Máy Apple dùng chung RAM: card dùng khoảng 3/4 RAM', () => {
  const result = estimateCapabilities({ ramGB: 16, gpuKind: 'apple' });
  assert.equal(verdictOf(result, 'llm-14b'), 'good');
  assert.equal(verdictOf(result, 'llm-32b'), 'no');
  assert.match(result.summary, /bộ nhớ chung/);
});

test('8 GB RAM: Docker và máy ảo chật, Android Studio ở mức tối thiểu', () => {
  const result = estimateCapabilities({ ramGB: 8 });
  assert.equal(verdictOf(result, 'docker'), 'slow');
  assert.equal(verdictOf(result, 'vm'), 'no');
  assert.equal(verdictOf(result, 'android'), 'slow');
});

test('compareCapabilities chỉ liệt kê việc được nâng hạng', () => {
  const before = estimateCapabilities({ ramGB: 8, gpuKind: 'nvidia', vramGB: 6 });
  const after = estimateCapabilities({ ramGB: 16, gpuKind: 'nvidia', vramGB: 6 });
  const improved = compareCapabilities(before, after);
  const ids = improved.map((item) => item.id);
  assert.ok(ids.includes('llm-14b'), 'RAM thêm giúp 14B chạy (chậm) được');
  assert.ok(ids.includes('android'));
  assert.ok(!ids.includes('sd15'), 'tạo ảnh phụ thuộc VRAM, không đổi');
  assert.deepEqual(compareCapabilities(after, after), []);
});

test('gpuKindFromName nhận hãng theo tên card', () => {
  assert.equal(gpuKindFromName('NVIDIA GeForce RTX 4050 Laptop GPU'), 'nvidia');
  assert.equal(gpuKindFromName('Sapphire Pulse Radeon RX 7600'), 'amd');
  assert.equal(gpuKindFromName('Intel Arc B580'), 'intel');
  assert.equal(gpuKindFromName('Apple M3 GPU 10 nhân'), 'apple');
  assert.equal(gpuKindFromName(''), null);
});

// ---------- DxDiag ----------

const DXDIAG = [
  '------------------',
  'System Information',
  '------------------',
  '             Machine name: LAPTOP-BINH',
  '                User name: binh',
  '      System Manufacturer: LENOVO',
  '             System Model: 82XV',
  '                Processor: 13th Gen Intel(R) Core(TM) i5-13420H (12 CPUs), ~2.1GHz',
  '                   Memory: 16384MB RAM',
  '      Available OS Memory: 16120MB RAM',
  '---------------',
  'Display Devices',
  '---------------',
  '           Card name: Intel(R) UHD Graphics',
  '    Dedicated Memory: 128 MB',
  '           Card name: NVIDIA GeForce RTX 4050 Laptop GPU',
  '    Dedicated Memory: 5921 MB',
  '           Card name: NVIDIA GeForce RTX 4050 Laptop GPU',
  '    Dedicated Memory: 5921 MB',
].join('\r\n');

test('keepRelevantLines bỏ tên máy, tên người dùng và các dòng khác', () => {
  const kept = keepRelevantLines(DXDIAG);
  assert.doesNotMatch(kept, /LAPTOP-BINH|User name|Available OS Memory/);
  assert.match(kept, /System Model: 82XV/);
  assert.match(kept, /Dedicated Memory/);
});

test('parseDxDiag đọc model, CPU, RAM và chọn card rời; gộp card trùng tên', () => {
  const parsed = parseDxDiag(keepRelevantLines(DXDIAG));
  assert.equal(parsed.manufacturer, 'LENOVO');
  assert.equal(parsed.model, '82XV');
  assert.equal(parsed.cpuName, '13th Gen Intel Core i5-13420H');
  assert.equal(parsed.cpuThreads, 12);
  assert.equal(parsed.ramGB, 16);
  assert.equal(parsed.gpus.length, 2);
  assert.equal(parsed.gpu.name, 'NVIDIA GeForce RTX 4050 Laptop GPU');
  assert.equal(parsed.gpu.vramGB, 6);
  assert.equal(parsed.gpu.kind, 'nvidia');
});

test('parseDxDiag: số MB có dấu phân cách, file không phải DxDiag thì null', () => {
  assert.equal(parseDxDiag('Memory: 32,768MB RAM').ramGB, 32);
  assert.equal(parseDxDiag('hello\nworld'), null);
  assert.equal(parseDxDiag(''), null);
});

test('isDiscrete: iGPU AMD có bộ nhớ đặt sẵn vẫn là đồ hoạ tích hợp', () => {
  assert.equal(isDiscrete('AMD Radeon(TM) Graphics', 2048), false);
  assert.equal(isDiscrete('AMD Radeon 780M Graphics', 4096), false);
  assert.equal(isDiscrete('AMD Radeon RX 7600S', 8176), true);
  assert.equal(isDiscrete('Intel(R) Arc(TM) Graphics', 128), false);
  assert.equal(isDiscrete('Intel(R) Arc(TM) A370M Graphics', 4096), true);
  assert.equal(isDiscrete('Unknown Adapter', 4096), true);
  assert.equal(cleanCpuName('AMD Ryzen 7 7840HS w/ Radeon 780M Graphics (16 CPUs), ~3.8GHz'), 'AMD Ryzen 7 7840HS w/ Radeon 780M Graphics');
});

test('matchLaptopModel chọn khoá dài nhất khớp, không phân biệt hoa thường và dấu cách', () => {
  const models = [
    { id: 1, matchKeys: 'FA507' },
    { id: 2, matchKeys: '82XV|LOQ 15IRH8' },
    { id: 3, matchKeys: 'FA507NV|TUF Gaming A15 FA507NV' },
  ];
  assert.equal(matchLaptopModel({ manufacturer: 'ASUSTeK', model: 'ASUS TUF Gaming A15 FA507NV_FA507NV' }, models).id, 3);
  assert.equal(matchLaptopModel({ manufacturer: 'LENOVO', model: '82xv' }, models).id, 2);
  assert.equal(matchLaptopModel({ manufacturer: 'Dell', model: 'Inspiron 3520' }, models), null);
  assert.equal(matchLaptopModel({ model: null }, models), null);
});

// ---------- Nâng cấp laptop ----------

const ddr5 = (productId, capacityGB, modules, price, stock = 5) => ({ productId, name: `ddr5-${capacityGB}x${modules}`, type: 'laptop_ram', memoryType: 'DDR5', capacityGB, modules, price, stock });
const kits = [
  ddr5(1, 8, 1, 790000),
  ddr5(2, 16, 1, 1390000),
  ddr5(3, 32, 1, 2690000),
  ddr5(4, 32, 2, 2790000),
  ddr5(5, 64, 2, 5490000),
  ddr5(6, 16, 1, 990000, 0),
  { ...ddr5(7, 16, 1, 990000), memoryType: 'DDR4' },
];
const legion = { ramType: 'DDR5', ramSolderedGB: 0, ramSlots: 2, maxRamGB: 32, ramGB: 16, unifiedMemory: false };

test('RAM hàn hoặc bộ nhớ hợp nhất: không nâng cấp được', () => {
  const soldered = ramUpgrade({ ...legion, ramSlots: 0, ramSolderedGB: 32, ramGB: 32 }, { ramGB: 32 }, kits);
  assert.equal(soldered.upgradable, false);
  assert.match(soldered.reason, /hàn/);
  const mac = ramUpgrade({ ...legion, ramSlots: 0, ramSolderedGB: 16, ramGB: 16, unifiedMemory: true }, { ramGB: 16 }, kits);
  assert.match(mac.reason, /hợp nhất/);
});

test('Đã bằng mức tối đa thì không gợi ý', () => {
  const result = ramUpgrade(legion, { ramGB: 32 }, kits);
  assert.equal(result.upgradable, false);
  assert.match(result.reason, /tối đa/);
});

test('Gợi ý thay RAM: đúng loại, còn hàng, không vượt tối đa, đủ khe; giữ cả 1 thanh 32 GB và bộ 2x16', () => {
  const result = ramUpgrade(legion, { ramGB: 16, slotsUsed: 2 }, kits);
  assert.equal(result.upgradable, true);
  const ids = result.options.map((option) => option.productId);
  assert.ok(ids.includes(3) && ids.includes(4));
  assert.ok(!ids.includes(5), '64 GB vượt mức tối đa 32 GB');
  assert.ok(!ids.includes(6), 'hết hàng');
  assert.ok(!ids.includes(7), 'sai loại DDR4');
  assert.ok(result.options.every((option) => option.action === 'replace' && option.resultGB > 16));
  assert.match(result.options.find((option) => option.productId === 3).note, /kênh đơn/);
});

test('RAM hàn + khe trống (slotsUsed = 0): chỉ gợi ý lắp thêm', () => {
  const vivobook = { ramType: 'DDR5', ramSolderedGB: 8, ramSlots: 1, maxRamGB: 24, ramGB: 8, unifiedMemory: false };
  const result = ramUpgrade(vivobook, { ramGB: 8, slotsUsed: 0 }, kits);
  assert.ok(result.options.length > 0);
  assert.ok(result.options.every((option) => option.action === 'add' && option.modules === 1));
  assert.deepEqual(result.options.map((option) => option.resultGB), [16, 24]);
});

test('Không rõ số khe đang dùng: chỉ gợi ý thay, kèm cách xem khe trống', () => {
  const result = ramUpgrade(legion, { ramGB: 8, slotsUsed: null }, kits);
  assert.ok(result.options.every((option) => option.action === 'replace'));
  assert.match(result.tip, /Slots used/);
});

const drive = (productId, capacityGB, m2Size, pcieGen, price) => ({ productId, name: `ssd-${capacityGB}-${m2Size}`, type: 'storage', storageInterface: 'M.2', capacityGB, m2Size, pcieGen, price, stock: 3 });

test('SSD: chỉ ổ M.2 đúng cỡ khe, rẻ nhất mỗi dung lượng, ghi chú khi khe PCIe đời thấp hơn', () => {
  const drives = [drive(1, 1000, '2280', 4, 1990000), drive(2, 1000, '2280', 4, 1790000), drive(3, 1000, '2230', 4, 2490000), drive(4, 2000, '2280', 4, 4690000), { ...drive(5, 2000, null, null, 1000), storageInterface: 'SATA' }];
  const result = storageUpgrade({ m2Slots: 1, m2Size: '2280', pcieGen: 3, storageGB: 512 }, drives);
  assert.deepEqual(result.options.map((option) => option.productId), [2, 4]);
  assert.match(result.options[0].note, /PCIe 3\.0/);
  assert.match(result.tip, /thay ổ/);
  const short = storageUpgrade({ m2Slots: 1, m2Size: '2230', pcieGen: 4, storageGB: 512 }, drives);
  assert.deepEqual(short.options.map((option) => option.productId), [3]);
  assert.equal(storageUpgrade({ m2Slots: 0 }, drives).upgradable, false);
});

test('describeUpgradeability tóm tắt RAM và SSD của model', () => {
  assert.equal(
    describeUpgradeability({ ramSlots: 1, ramSolderedGB: 8, ramType: 'DDR4', maxRamGB: 16, ramGB: 8, m2Slots: 1, m2Size: '2280', pcieGen: null }),
    'RAM 8 GB hàn + 1 khe DDR4 rời, tối đa 16 GB; 1 khe SSD M.2 2280.',
  );
  assert.match(describeUpgradeability({ ramSlots: 0, ramSolderedGB: 16, ramGB: 16, m2Slots: 0 }), /hàn chết.*SSD hàn chết/);
});

// ---------- Hồ sơ máy từ sản phẩm và Build PC ----------

test('profileFromSpecs đọc RAM, card và dòng CPU của PC bán sẵn', () => {
  const profile = profileFromSpecs(['Ryzen 7', 'RTX 5070', '32GB RAM', '1TB NVMe']);
  assert.equal(profile.ramGB, 32);
  assert.equal(profile.vramGB, 12);
  assert.equal(profile.gpuKind, 'nvidia');
  assert.equal(profile.cpuThreads, 16);
  assert.equal(profileFromSpecs(['RTX 4060 Ti 16GB', '16GB RAM']).vramGB, 8, 'bản 4060 Ti lấy VRAM nhỏ hơn cho chắc');
  assert.equal(profileFromSpecs(['27 inch', '4K']), null);
});

test('profileFromParts cộng RAM theo số lượng và lấy card nhiều VRAM nhất', () => {
  const profile = profileFromParts([
    { type: 'cpu', name: 'Ryzen 9', tier: 3 },
    { type: 'ram', capacityGB: 32, quantity: 2 },
    { type: 'gpu', name: 'GeForce RTX 4060', vramGB: 8 },
    { type: 'gpu', name: 'GeForce RTX 3060', vramGB: 12 },
  ]);
  assert.equal(profile.ramGB, 64);
  assert.equal(profile.vramGB, 12);
  assert.equal(profile.cpuThreads, 24);
});

// ---------- Ổ M.2 ngắn và RAM laptop trong Build PC ----------

test('Build PC: RAM laptop là lỗi, ổ M.2 2230 chỉ cảnh báo; tự ráp không chọn ổ ngắn', () => {
  const result = checkBuild([
    { productId: 1, type: 'laptop_ram', memoryType: 'DDR5', capacityGB: 16, quantity: 1 },
    { productId: 2, type: 'storage', storageInterface: 'M.2', m2Size: '2230', capacityGB: 1000, quantity: 1 },
  ]);
  assert.ok(result.errors.some((error) => error.code === 'laptop_ram'));
  assert.ok(result.warnings.some((warning) => warning.code === 'm2_size'));
  assert.equal(fitsDesktopM2({ storageInterface: 'M.2', m2Size: '2230' }), false);
  assert.equal(fitsDesktopM2({ storageInterface: 'M.2', m2Size: '2280' }), true);
  assert.equal(fitsDesktopM2({ storageInterface: 'SATA' }), true);
});

test('canonicalItems gộp trùng, bỏ linh kiện đã có, sắp theo mã', () => {
  assert.deepEqual(canonicalItems([
    { productId: 9, quantity: 1 },
    { productId: 3, quantity: 2 },
    { productId: 9, quantity: 1 },
    { productId: 5, quantity: 1, owned: true },
  ]), [{ productId: 3, quantity: 2 }, { productId: 9, quantity: 2 }]);
  assert.deepEqual(canonicalItems([]), []);
});

// ---------- Nên mua lúc nào ----------

const stats = (overrides) => ({ current: 1000, dealPrice: null, lowest: 900, highest: 1200, average: 1000, changes: 3, coveredDays: 90, priceDaysAgo30: 1000, ...overrides });

test('classifyPrice: thấp nhất, dưới/ngang/trên trung bình, ổn định, mới lên kệ', () => {
  assert.equal(classifyPrice(stats({ current: 900 })).label, 'lowest');
  assert.equal(classifyPrice(stats({ current: 950 })).label, 'below_avg');
  assert.equal(classifyPrice(stats({ current: 1010 })).label, 'average');
  const high = classifyPrice(stats({ current: 1100, priceDaysAgo30: 1000 }));
  assert.equal(high.label, 'above_avg');
  assert.equal(high.tone, 'warn');
  assert.match(high.text, /Cao hơn giá trung bình 90 ngày 10%, tăng 10% so với 30 ngày trước/);
  assert.equal(classifyPrice(stats({ changes: 0 })).label, 'stable');
  assert.equal(classifyPrice(stats({ coveredDays: MIN_COVERED_DAYS - 1 })).label, 'new');
});

test('classifyPrice: giá Hot Deal thấp hơn niêm yết được tính, kể cả sản phẩm mới', () => {
  const deal = classifyPrice(stats({ current: 1000, dealPrice: 850, coveredDays: 3 }));
  assert.equal(deal.label, 'lowest');
  assert.equal(deal.effectivePrice, 850);
  assert.match(deal.text, /Hot Deal/);
  assert.equal(classifyPrice(stats({ dealPrice: 1100 })).dealPrice, null, 'deal cao hơn niêm yết thì bỏ qua');
});

test('badgeFor chỉ gắn nhãn khi giá đang tốt', () => {
  assert.equal(badgeFor({ label: 'lowest' }), 'Thấp nhất 90 ngày');
  assert.equal(badgeFor({ label: 'below_avg' }), 'Dưới giá trung bình');
  assert.equal(badgeFor({ label: 'above_avg' }), null);
  assert.equal(badgeFor(null), null);
});
