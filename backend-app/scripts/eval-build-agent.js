/*
  Đo trợ lý AI ráp máy trên 30 yêu cầu mẫu (scripts/build-agent-cases.js) để làm số liệu cho báo cáo.
  Gọi OpenAI thật bằng khoá đã lưu ở trang quản trị: mỗi yêu cầu vài lượt gọi, tốn tiền theo bảng giá của OpenAI.

  Chạy trong container backend (đã có kết nối DB và khoá):
    docker compose exec -T backend node scripts/eval-build-agent.js > bao-cao-tro-ly-ai.md
  Tuỳ chọn:
    --limit N          chỉ chạy N yêu cầu đầu
    --only id1,id2     chỉ chạy các yêu cầu có id này
    --concurrency N    số yêu cầu chạy song song (mặc định 3)
    --json FILE        ghi thêm kết quả chi tiết dạng JSON
    --price-in X --price-out Y   giá USD cho 1 triệu token vào/ra để ước tính chi phí (không ghi thì chỉ báo số token)
  Tiến độ in ra stderr, báo cáo Markdown in ra stdout.
*/
const fs = require('fs');

// stdout chỉ dành cho báo cáo Markdown; mọi dòng log khác sang stderr.
console.log = (...args) => process.stderr.write(`${args.join(' ')}\n`);

const { connectSQL, getPool } = require('../src/config/db.sql');
const buildAgentService = require('../src/services/buildAgent.service');
const builderService = require('../src/services/builder.service');
const { checkBuild } = require('../src/utils/compatibility');
const { gpuKindFromName } = require('../src/utils/workloads');
const { money } = require('../src/utils/buildAgent');
const CASES = require('./build-agent-cases');

const argValue = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

/** Kiểm tra cấu hình theo điều kiện của yêu cầu mẫu. parts: linh kiện có type, quantity và thông số kho. */
const checkExpectations = (expect, parts, { total, summary = '' }) => {
  const failures = [];
  const of = (type) => parts.filter((part) => part.type === type);
  const gpu = of('gpu')[0];
  const cpu = of('cpu')[0];
  const board = of('mainboard')[0];
  const ramGB = of('ram').reduce((sum, part) => sum + (part.capacityGB || 0) * (part.quantity || 1), 0);
  const storageGB = of('storage').reduce((sum, part) => sum + (part.capacityGB || 0) * (part.quantity || 1), 0);
  if (expect.budget && total > expect.budget) failures.push(`vượt ngân sách (${money(total)} > ${money(expect.budget)})`);
  if (expect.needsGpu === true && !gpu) failures.push('thiếu card rời');
  if (expect.needsGpu === false && gpu) failures.push('mua card rời không cần thiết');
  if (expect.gpuBrand && (!gpu || gpuKindFromName(gpu.name) !== expect.gpuBrand)) failures.push(`card không phải ${expect.gpuBrand}`);
  if (expect.minVramGB && (!gpu || (gpu.vramGB || 0) < expect.minVramGB)) failures.push(`VRAM dưới ${expect.minVramGB} GB`);
  if (expect.minRamGB && ramGB < expect.minRamGB) failures.push(`RAM ${ramGB} GB < ${expect.minRamGB} GB`);
  if (expect.minStorageGB && storageGB < expect.minStorageGB) failures.push(`ổ ${storageGB} GB < ${expect.minStorageGB} GB`);
  if (expect.minCpuTier && (!cpu || (cpu.tier || 0) < expect.minCpuTier)) failures.push(`CPU hạng dưới ${expect.minCpuTier}`);
  if (expect.socket && (!cpu || !expect.socket.includes(cpu.socket))) failures.push(`CPU không thuộc ${expect.socket.join('/')}`);
  if (expect.boardFormFactor && (!board || String(board.formFactor).toUpperCase() !== expect.boardFormFactor)) failures.push(`mainboard không phải ${expect.boardFormFactor}`);
  if (expect.ssd && !of('storage').some((part) => part.storageInterface === 'M.2' || !/HDD|BarraCuda/i.test(part.name))) failures.push('không có SSD');
  if (expect.honestAbout && !new RegExp(expect.honestAbout, 'i').test(summary)) failures.push('không nói rõ phần cửa hàng chưa có dữ liệu');
  return failures;
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const cell = (value) => String(value ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');

const runCase = async (item, catalog) => {
  const started = Date.now();
  try {
    const prepared = await buildAgentService.prepare({ request: item.request });
    const result = await buildAgentService.run(prepared, { catalog });
    const main = result.builds.find((build) => build.variant === 'main');
    let failures = [];
    let reachedCustomerInvalid = false;
    let pass;
    if (main) {
      // Kiểm tra độc lập: cấu hình khách thấy phải lắp được, đủ linh kiện và còn hàng.
      const parts = main.items.map((line) => ({ ...catalog.byId.get(line.productId), quantity: line.quantity }));
      const check = checkBuild(parts);
      reachedCustomerInvalid = !check.ok || !check.complete || parts.some((part) => !part || part.stock < part.quantity);
      failures = checkExpectations(item.expect, parts, { total: main.total, summary: main.summary });
    }
    if (item.kind === 'build') pass = Boolean(main) && failures.length === 0;
    else if (item.kind === 'impossible') pass = !main || Boolean(main.overBudgetReason) || main.withinBudget === true;
    else pass = !main && result.status === 'declined';
    if (item.kind !== 'build' && main && item.kind === 'impossible' && !pass) failures.push('vượt ngân sách mà không giải thích');
    if (item.kind === 'decline' && main) failures.push('ráp máy cho yêu cầu không phải PC');
    if (item.kind === 'build' && !main) failures.push(`không có cấu hình (${result.status}): ${result.note}`);
    return {
      id: item.id,
      kind: item.kind,
      request: item.request,
      status: result.status,
      pass,
      failures,
      reachedCustomerInvalid,
      total: main?.total ?? null,
      budget: result.budget,
      alternative: result.builds.length > 1,
      parts: main ? main.items.map((line) => line.name) : [],
      stats: result.stats,
      note: result.note,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { id: item.id, kind: item.kind, request: item.request, status: 'error', pass: false, failures: [err.message], stats: null, ms: Date.now() - started };
  }
};

/** Bộ luật cũ (tab "Theo phần mềm cần dùng"): nhận ra nhu cầu từ từ khoá rồi ráp theo mẫu có sẵn. */
const runBaseline = async (item, catalog) => {
  try {
    const advice = await builderService.adviseFromText(item.request);
    if (!advice.parts) return { id: item.id, understood: false, pass: item.kind === 'decline' };
    const parts = advice.parts.map((part) => ({ ...catalog.byId.get(part.productId), ...part }));
    const failures = checkExpectations(item.expect, parts, { total: advice.subtotal });
    let pass = failures.length === 0;
    if (item.kind === 'impossible') pass = advice.advice?.withinBudget !== false;
    if (item.kind === 'decline') pass = false;
    return { id: item.id, understood: true, pass, failures };
  } catch {
    return { id: item.id, understood: false, pass: false };
  }
};

const main = async () => {
  await connectSQL();
  const limit = Number(argValue('--limit', 0));
  const only = argValue('--only');
  const concurrency = Math.max(1, Number(argValue('--concurrency', 3)));
  const priceIn = Number(argValue('--price-in', NaN));
  const priceOut = Number(argValue('--price-out', NaN));
  let cases = CASES;
  if (only) cases = cases.filter((item) => only.split(',').includes(item.id));
  if (limit > 0) cases = cases.slice(0, limit);

  const catalog = await buildAgentService.loadCatalog();
  const results = new Array(cases.length);
  let next = 0;
  const worker = async () => {
    while (next < cases.length) {
      const index = next;
      next += 1;
      results[index] = await runCase(cases[index], catalog);
      const r = results[index];
      process.stderr.write(`${r.pass ? 'ĐẠT ' : 'TRƯỢT'} ${r.id} (${Math.round(r.ms / 1000)} s)${r.failures.length ? ` — ${r.failures.join('; ')}` : ''}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  const baseline = [];
  for (const item of cases) baseline.push(await runBaseline(item, catalog));

  const ok = results.filter((r) => r.stats);
  const buildCases = results.filter((r) => r.kind === 'build');
  const withBudget = buildCases.filter((r) => r.budget && r.total !== null);
  const special = results.filter((r) => r.kind !== 'build');
  const seconds = ok.map((r) => r.stats.ms / 1000);
  const tokensIn = ok.reduce((sum, r) => sum + r.stats.inputTokens, 0);
  const tokensOut = ok.reduce((sum, r) => sum + r.stats.outputTokens, 0);
  const selfCorrected = ok.filter((r) => r.stats.rejectedSubmissions > 0 && r.total !== null);
  const settings = await require('../src/services/assistant.service').loadSettings();
  const cost = Number.isFinite(priceIn) && Number.isFinite(priceOut)
    ? `${((tokensIn * priceIn + tokensOut * priceOut) / 1e6).toFixed(3)} USD (${((tokensIn * priceIn + tokensOut * priceOut) / 1e6 / Math.max(ok.length, 1)).toFixed(4)} USD mỗi yêu cầu)`
    : 'không ước tính (chạy lại với --price-in và --price-out theo bảng giá OpenAI)';

  const lines = [];
  lines.push('# Đánh giá trợ lý AI ráp máy');
  lines.push('');
  lines.push(`Chạy lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}, mô hình ${settings.model}, ${cases.length} yêu cầu mẫu, kho ${catalog.parts.length} linh kiện máy bàn còn hàng.`);
  lines.push('');
  lines.push('## Tổng hợp');
  lines.push('');
  lines.push('| Chỉ số | Kết quả |');
  lines.push('|---|---|');
  lines.push(`| Yêu cầu đạt mọi điều kiện kiểm tra | ${results.filter((r) => r.pass).length}/${results.length} (${pct(results.filter((r) => r.pass).length, results.length)}) |`);
  lines.push(`| Yêu cầu ráp máy có cấu hình hợp lệ | ${buildCases.filter((r) => r.total !== null).length}/${buildCases.length} |`);
  lines.push(`| Cấu hình đúng mọi ràng buộc của khách | ${buildCases.filter((r) => r.pass).length}/${buildCases.length} |`);
  lines.push(`| Nằm trong ngân sách | ${withBudget.filter((r) => r.total <= r.budget).length}/${withBudget.length} |`);
  lines.push(`| Xử lý đúng yêu cầu không thể đáp ứng hoặc không phải ráp PC | ${special.filter((r) => r.pass).length}/${special.length} |`);
  lines.push(`| Cấu hình sai (không lắp được, thiếu, hết hàng) lọt tới khách | ${results.filter((r) => r.reachedCustomerInvalid).length} |`);
  lines.push(`| Yêu cầu có lần bị hệ thống trả lại rồi tự sửa thành công | ${selfCorrected.length} (tổng ${ok.reduce((sum, r) => sum + r.stats.rejectedSubmissions, 0)} lần trả lại) |`);
  lines.push(`| Thời gian mỗi yêu cầu | trung vị ${median(seconds).toFixed(1)} s, chậm nhất ${Math.max(0, ...seconds).toFixed(1)} s |`);
  lines.push(`| Lượt gọi mô hình / công cụ trung bình | ${(ok.reduce((sum, r) => sum + r.stats.rounds, 0) / Math.max(ok.length, 1)).toFixed(1)} / ${(ok.reduce((sum, r) => sum + r.stats.toolCalls, 0) / Math.max(ok.length, 1)).toFixed(1)} |`);
  lines.push(`| Token | vào ${tokensIn.toLocaleString('vi-VN')}, ra ${tokensOut.toLocaleString('vi-VN')} (trung bình ${Math.round((tokensIn + tokensOut) / Math.max(ok.length, 1)).toLocaleString('vi-VN')} mỗi yêu cầu) |`);
  lines.push(`| Chi phí | ${cost} |`);
  lines.push(`| Lỗi khi gọi (mạng, OpenAI) | ${results.filter((r) => r.status === 'error').length} |`);
  lines.push('');
  lines.push('## So với bộ luật từ khoá cũ (tab "Theo phần mềm cần dùng")');
  lines.push('');
  lines.push('| | Bộ luật từ khoá | Trợ lý AI |');
  lines.push('|---|---|---|');
  lines.push(`| Hiểu được yêu cầu và đưa cấu hình | ${baseline.filter((b) => b.understood).length}/${cases.length} | ${results.filter((r) => r.total !== null).length}/${cases.length} |`);
  lines.push(`| Đạt mọi điều kiện kiểm tra | ${baseline.filter((b) => b.pass).length}/${cases.length} | ${results.filter((r) => r.pass).length}/${cases.length} |`);
  lines.push('');
  lines.push('## Từng yêu cầu');
  lines.push('');
  lines.push('| # | Yêu cầu | Kết quả | Tổng tiền | Ngân sách | Lượt / công cụ / trả lại | Thời gian | Ghi chú |');
  lines.push('|---|---|---|---|---|---|---|---|');
  results.forEach((r, index) => {
    const stats = r.stats ? `${r.stats.rounds} / ${r.stats.toolCalls} / ${r.stats.rejectedSubmissions}` : '—';
    const verdict = r.pass ? 'Đạt' : 'Chưa đạt';
    const remark = r.failures.length ? r.failures.join('; ') : r.kind === 'build' ? (r.alternative ? 'có thêm phương án thứ hai' : '') : r.note;
    lines.push(`| ${index + 1} | ${cell(r.request)} | ${verdict} (${r.status}) | ${r.total ? money(r.total) : '—'} | ${r.budget ? money(r.budget) : '—'} | ${stats} | ${r.stats ? `${(r.stats.ms / 1000).toFixed(1)} s` : '—'} | ${cell(remark)} |`);
  });
  lines.push('');
  lines.push('Cách chấm: mỗi yêu cầu có điều kiện kiểm tra tự động (ngân sách, có/không card rời, hãng card, VRAM, RAM, dung lượng ổ, hãng CPU, cỡ mainboard...) đọc từ thông số trong kho, xem scripts/build-agent-cases.js. Yêu cầu không thể đáp ứng đạt khi trợ lý không đưa cấu hình hoặc nói rõ vì sao vượt ngân sách; yêu cầu không phải ráp PC đạt khi trợ lý từ chối.');
  process.stdout.write(`${lines.join('\n')}\n`);

  const jsonPath = argValue('--json');
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify({ model: settings.model, results, baseline }, null, 2));
  await getPool().close();
};

main().catch((err) => {
  process.stderr.write(`Lỗi: ${err.message}\n`);
  process.exit(1);
});
