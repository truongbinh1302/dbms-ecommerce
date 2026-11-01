const test = require('node:test');
const assert = require('node:assert/strict');

const { checkBuild, recommendedPsuW, estimatePowerW } = require('../../src/utils/compatibility');
const { PRESETS, isNvidia, autoBuild, upgradeOptions } = require('../../src/utils/buildAdvisor');
const { applyLockedPrices } = require('../../src/services/pricing.service');
const { normalizeBuildItems, evaluateBuild } = require('../../src/services/builder.service');
const { generateQuoteCode, normalizeQuoteCode, CODE_PATTERN } = require('../../src/services/priceQuote.service');
const { normalizeSerial } = require('../../src/services/warranty.service');

// Danh mục nhỏ, cùng dạng với seed 003, để kiểm tra thuật toán mà không cần DB.
let nextId = 1;
const part = (type, price, specs = {}) => ({ productId: nextId++, name: `${type}-${price}`, type, price, stock: 10, ...specs });
// Kiểm tra nhận diện card NVIDIA theo tên sản phẩm.
test('isNvidia nhận GeForce/RTX/GTX, không nhận Radeon/Arc', () => {
  assert.equal(isNvidia({ name: 'ASUS Prime GeForce RTX 5070 12G' }), true);
  assert.equal(isNvidia({ name: 'Sapphire Pulse Radeon RX 7600 8GB' }), false);
  assert.equal(isNvidia({ name: 'Intel Arc B580 12GB' }), false);
});

const catalog = {
  r5_7600: part('cpu', 4990000, { socket: 'AM5', powerW: 88, hasIntegratedGraphics: true, includesCooler: true, tier: 1 }),
  r7_7700: part('cpu', 7290000, { socket: 'AM5', powerW: 88, hasIntegratedGraphics: true, includesCooler: true, tier: 2 }),
  r9_7900x: part('cpu', 9990000, { socket: 'AM5', powerW: 230, hasIntegratedGraphics: true, includesCooler: false, tier: 3 }),
  i3_12100f: part('cpu', 1990000, { socket: 'LGA1700', powerW: 89, hasIntegratedGraphics: false, includesCooler: true, tier: 1 }),
  b650m: part('mainboard', 4290000, { socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', memorySlots: 4, m2Slots: 2 }),
  b650i: part('mainboard', 5490000, { socket: 'AM5', memoryType: 'DDR5', formFactor: 'ITX', memorySlots: 2, m2Slots: 2 }),
  b760m_d4: part('mainboard', 2690000, { socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'mATX', memorySlots: 4, m2Slots: 2 }),
  ddr4_16: part('ram', 990000, { memoryType: 'DDR4', capacityGB: 16, modules: 2 }),
  ddr4_64x4: part('ram', 3490000, { memoryType: 'DDR4', capacityGB: 64, modules: 4 }),
  ddr5_16: part('ram', 1490000, { memoryType: 'DDR5', capacityGB: 16, modules: 2 }),
  ddr5_32: part('ram', 2690000, { memoryType: 'DDR5', capacityGB: 32, modules: 2 }),
  rtx4060: part('gpu', 7990000, { name: 'MSI GeForce RTX 4060', vramGB: 8, lengthMm: 199, powerW: 115 }),
  arcB580: part('gpu', 7290000, { name: 'Intel Arc B580 12GB', vramGB: 12, lengthMm: 272, powerW: 190 }),
  rtx3060: part('gpu', 7490000, { name: 'MSI GeForce RTX 3060 12G', vramGB: 12, lengthMm: 235, powerW: 170 }),
  rtx5080: part('gpu', 35990000, { name: 'ASUS TUF GeForce RTX 5080', vramGB: 16, lengthMm: 348, powerW: 360 }),
  nv3_500: part('storage', 890000, { capacityGB: 500, storageInterface: 'M.2' }),
  sn580_1tb: part('storage', 1590000, { capacityGB: 1000, storageInterface: 'M.2' }),
  mx500_1tb: part('storage', 1790000, { capacityGB: 1000, storageInterface: 'SATA' }),
  psu550: part('psu', 1190000, { psuWatts: 550 }),
  psu650: part('psu', 1390000, { psuWatts: 650 }),
  psu850: part('psu', 3290000, { psuWatts: 850 }),
  air155: part('cooler', 690000, { supportedSockets: 'AM4,AM5,LGA1700', heightMm: 155 }),
  caseItx: part('case', 1290000, { supportedFormFactors: 'ITX', maxGpuLengthMm: 280, maxCoolerHeightMm: 70 }),
  caseCompact: part('case', 690000, { supportedFormFactors: 'mATX,ITX', maxGpuLengthMm: 250, maxCoolerHeightMm: 150 }),
  caseAtx: part('case', 1590000, { supportedFormFactors: 'ATX,mATX,ITX', maxGpuLengthMm: 380, maxCoolerHeightMm: 170 }),
};
const components = Object.values(catalog);
const codes = (result) => result.errors.map((item) => item.code);

test('checkBuild: cấu hình hợp lệ không có lỗi và đủ linh kiện bắt buộc', () => {
  const result = checkBuild([catalog.r5_7600, catalog.b650m, catalog.ddr5_32, catalog.sn580_1tb, catalog.psu550, catalog.caseCompact]);
  assert.equal(result.ok, true);
  assert.equal(result.complete, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.estimatedPowerW, 75 + 88);
});

test('checkBuild: phát hiện lệch socket và lệch loại RAM', () => {
  const result = checkBuild([catalog.i3_12100f, catalog.b650m, catalog.ddr4_16]);
  assert.deepEqual(codes(result).sort(), ['memory_type_mismatch', 'no_display_output', 'socket_mismatch']);
  assert.equal(result.complete, false);
  assert.ok(result.warnings.some((item) => item.code === 'incomplete'));
});

test('checkBuild: RAM 4 thanh không cắm vừa mainboard 2 khe', () => {
  const itxDdr4 = { ...catalog.b650i, memoryType: 'DDR4' };
  assert.ok(codes(checkBuild([itxDdr4, catalog.ddr4_64x4])).includes('memory_slots'));
});

test('checkBuild: case không vừa mainboard, card quá dài, tản quá cao', () => {
  const result = checkBuild([catalog.r9_7900x, catalog.b650m, catalog.rtx5080, catalog.air155, catalog.caseItx]);
  assert.deepEqual(codes(result).sort(), ['cooler_height', 'form_factor', 'gpu_length']);
});

test('checkBuild: nguồn yếu là lỗi, nguồn sát là cảnh báo', () => {
  const weak = checkBuild([catalog.r9_7900x, catalog.b650m, catalog.rtx5080, catalog.psu550]);
  assert.ok(codes(weak).includes('psu_too_weak'));

  const tight = checkBuild([catalog.r7_7700, catalog.b650m, catalog.rtx3060, catalog.psu550]);
  // 75 + 88 + 170 = 333 W → nên dùng ≥ 450 W, nguồn 550 W đạt.
  assert.equal(tight.ok, true);
  assert.equal(tight.warnings.some((item) => item.code === 'psu_low_headroom'), false);

  const sharp = checkBuild([catalog.r9_7900x, catalog.b650m, catalog.rtx3060, catalog.psu550]);
  // 75 + 230 + 170 = 475 W → nên dùng ≥ 650 W, nguồn 550 W chạy được nhưng sát.
  assert.equal(sharp.ok, true);
  assert.ok(sharp.warnings.some((item) => item.code === 'psu_low_headroom'));
});

test('checkBuild: CPU không kèm tản thì cảnh báo, tản không hỗ trợ socket thì lỗi', () => {
  const noCooler = checkBuild([catalog.r9_7900x, catalog.b650m]);
  assert.ok(noCooler.warnings.some((item) => item.code === 'no_cooler'));

  const am4Only = { ...catalog.air155, supportedSockets: 'AM4' };
  assert.ok(codes(checkBuild([catalog.r9_7900x, am4Only])).includes('cooler_socket'));
});

test('checkBuild: chọn 2 CPU là lỗi, 2 card đồ hoạ thì cộng công suất', () => {
  assert.ok(codes(checkBuild([{ ...catalog.r5_7600, quantity: 2 }])).includes('too_many'));
  assert.equal(estimatePowerW([catalog.r5_7600, { ...catalog.rtx4060, quantity: 2 }]), 75 + 88 + 230);
});

test('recommendedPsuW: dư 30% rồi làm tròn lên bội số 50 W', () => {
  assert.equal(recommendedPsuW(163), 250);
  assert.equal(recommendedPsuW(475), 650);
  assert.equal(recommendedPsuW(500), 650);
});

test('autoBuild: mọi preset đều ra cấu hình hợp lệ, đủ linh kiện, đạt ngưỡng nhu cầu', () => {
  for (const preset of PRESETS) {
    const result = autoBuild(preset, components);
    assert.ok(result, `preset ${preset.id} không ráp được`);
    assert.equal(result.check.ok, true, preset.id);
    assert.equal(result.check.complete, true, preset.id);

    const byType = Object.fromEntries(result.parts.map((item) => [item.type, item]));
    assert.ok(byType.cpu.tier >= preset.needs.cpuTier, preset.id);
    assert.ok(byType.ram.capacityGB >= preset.needs.ramGB, preset.id);
    assert.ok(byType.storage.capacityGB >= preset.needs.storageGB, preset.id);
    if (preset.needs.gpu) {
      assert.ok(byType.gpu && byType.gpu.vramGB >= preset.needs.gpu.minVramGB, preset.id);
      if (preset.needs.gpu.nvidiaOnly) assert.ok(isNvidia(byType.gpu), preset.id);
    }
  }
});

test('autoBuild: văn phòng chọn CPU có iGPU, không mua card rời', () => {
  const result = autoBuild(PRESETS.find((item) => item.id === 'van-phong-hoc-tap'), components);
  const types = result.parts.map((item) => item.type);
  assert.equal(types.includes('gpu'), false);
  assert.equal(result.parts.find((item) => item.type === 'cpu').hasIntegratedGraphics, true);
});

test('autoBuild: AI local chọn card NVIDIA từ 12 GB VRAM (bỏ qua card Intel rẻ hơn), nguồn đủ tải', () => {
  const result = autoBuild(PRESETS.find((item) => item.id === 'ai-local'), components);
  const gpu = result.parts.find((item) => item.type === 'gpu');
  assert.equal(gpu.productId, catalog.rtx3060.productId);
  assert.ok(result.parts.find((item) => item.type === 'psu').psuWatts >= result.check.recommendedPsuW);
});

test('autoBuild: bỏ qua linh kiện hết hàng, trả null khi kho không đủ', () => {
  const noStock = components.map((item) => (item.type === 'gpu' ? { ...item, stock: 0 } : item));
  assert.equal(autoBuild(PRESETS.find((item) => item.id === 'ai-local'), noStock), null);
});

test('upgradeOptions: chỉ gợi ý linh kiện lắp được vào máy hiện tại', () => {
  const result = upgradeOptions({ socket: 'AM5', memoryType: 'DDR5', psuWatts: 550, maxGpuLengthMm: 300, hasM2Slot: false }, components);
  assert.ok(result.cpu.every((item) => item.socket === 'AM5'));
  assert.ok(result.ram.every((item) => item.memoryType === 'DDR5'));
  assert.ok(result.gpu.every((item) => item.lengthMm <= 300));
  assert.equal(result.gpu.some((item) => item.productId === catalog.rtx5080.productId), false);
  assert.ok(result.storage.every((item) => item.storageInterface !== 'M.2'));
});

test('upgradeOptions: nguồn yếu thì loại card quá tải, card sát nguồn có ghi chú', () => {
  const result = upgradeOptions({ psuWatts: 400, cpuPowerW: 88 }, components);
  // 75 + 88 + 170 = 333 W ≤ 400 W nhưng cần 450 W mới đủ dư → có ghi chú.
  const rtx3060 = result.gpu.find((item) => item.productId === catalog.rtx3060.productId);
  assert.ok(rtx3060 && rtx3060.note && rtx3060.note.includes('450'));
  assert.equal(result.gpu.some((item) => item.productId === catalog.rtx5080.productId), false);
});

test('applyLockedPrices: lấy giá thấp hơn, chỉ khi số lượng không vượt số lượng báo giá', () => {
  const locked = new Map([[1, { unitPrice: 900, quantity: 1 }], [2, { unitPrice: 2500, quantity: 1 }]]);
  const lines = applyLockedPrices([
    { productId: 1, quantity: 1, unitPrice: 1000 },
    { productId: 2, quantity: 1, unitPrice: 2000 },
    { productId: 1, quantity: 2, unitPrice: 1000 },
    { productId: 3, quantity: 1, unitPrice: 500 },
  ], locked);

  assert.deepEqual(lines.map((line) => [line.unitPrice, line.priceLocked, line.lineTotal]), [
    [900, true, 900],
    [2000, false, 2000],
    [1000, false, 2000],
    [500, false, 500],
  ]);
  assert.equal(lines[0].listPrice, 1000);
  assert.deepEqual(applyLockedPrices([{ productId: 1, quantity: 1, unitPrice: 1000 }], null)[0].unitPrice, 1000);
});

test('normalizeBuildItems: gộp dòng trùng, tách linh kiện đã có, chặn dữ liệu sai', () => {
  const items = normalizeBuildItems([
    { productId: 5 },
    { productId: 5, quantity: 1 },
    { productId: 5, owned: true },
  ]);
  assert.deepEqual(items, [
    { productId: 5, owned: false, quantity: 2 },
    { productId: 5, owned: true, quantity: 1 },
  ]);
  assert.throws(() => normalizeBuildItems({}), /mảng/);
  assert.throws(() => normalizeBuildItems([{ productId: 'x' }]), (err) => Boolean(err.status === 400));
  assert.throws(() => normalizeBuildItems([{ productId: 1, quantity: 9 }]), (err) => Boolean(err.status === 400));
});

test('evaluateBuild: linh kiện đã có không tính tiền nhưng vẫn kiểm tra tương thích', () => {
  const result = evaluateBuild([
    { productId: catalog.r5_7600.productId, quantity: 1, owned: false },
    { productId: catalog.b760m_d4.productId, quantity: 1, owned: true },
    { productId: 999, quantity: 1, owned: false },
  ], components);

  assert.equal(result.subtotal, catalog.r5_7600.price);
  assert.equal(result.lines.length, 1);
  assert.ok(result.check.errors.some((item) => item.code === 'socket_mismatch'));
  assert.deepEqual(result.issues, [{ productId: 999, issue: 'not_component' }]);
});

test('mã báo giá: đúng định dạng, không chứa ký tự dễ nhầm, chuẩn hoá chữ thường', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateQuoteCode();
    assert.match(code, CODE_PATTERN);
    assert.doesNotMatch(code.slice(2), /[01ILO]/);
  }
  assert.equal(normalizeQuoteCode(' bqabcd2345 '), 'BQABCD2345');
  assert.equal(normalizeQuoteCode('BQ123'), null);
  assert.equal(normalizeQuoteCode("BQ'; DROP--"), null);
});

test('serial bảo hành: chuẩn hoá chữ hoa, bỏ khoảng trắng, chặn ký tự lạ', () => {
  assert.equal(normalizeSerial(' s3z-ab12 cd '), 'S3Z-AB12CD');
  assert.equal(normalizeSerial('ab'), null);
  assert.equal(normalizeSerial('AB12%'), null);
});

test('upgradeOptions: CPU không kèm tản có ghi chú cần mua tản', () => {
  const result = upgradeOptions({ socket: 'AM5' }, components);
  const r9 = result.cpu.find((item) => item.productId === catalog.r9_7900x.productId);
  assert.match(r9.note, /tản/);
  assert.equal(result.cpu.find((item) => item.productId === catalog.r5_7600.productId).note, null);
});
