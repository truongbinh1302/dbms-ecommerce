/*
  Test đơn vị trợ lý AI ráp máy: OpenAI giả lập bằng kịch bản, kho linh kiện là dữ liệu mẫu (không cần DB).
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const agent = require('../../src/utils/buildAgent');
const assistant = require('../../src/services/assistant.service');
const buildAgentService = require('../../src/services/buildAgent.service');

const part = (productId, type, price, specs = {}) => ({ productId, type, name: `${type}-${productId}`, price, stock: 5, ...specs });
const COMPONENTS = [
  part(1, 'cpu', 4990000, { name: 'AMD Ryzen 5 7600', socket: 'AM5', tier: 1, powerW: 88, hasIntegratedGraphics: true, includesCooler: true }),
  part(2, 'cpu', 1990000, { name: 'Intel Core i3-12100F', socket: 'LGA1700', tier: 1, powerW: 89, hasIntegratedGraphics: false, includesCooler: true }),
  part(3, 'mainboard', 4290000, { socket: 'AM5', memoryType: 'DDR5', formFactor: 'mATX', memorySlots: 4, m2Slots: 2 }),
  part(4, 'ram', 2690000, { memoryType: 'DDR5', capacityGB: 32, modules: 2 }),
  part(5, 'ram', 990000, { memoryType: 'DDR4', capacityGB: 16, modules: 2 }),
  part(6, 'gpu', 7490000, { name: 'MSI GeForce RTX 3060 12G', vramGB: 12, powerW: 170, lengthMm: 235 }),
  part(7, 'gpu', 6490000, { name: 'Sapphire Radeon RX 7600 8GB', vramGB: 8, powerW: 165, lengthMm: 240 }),
  part(8, 'storage', 1590000, { capacityGB: 1000, storageInterface: 'M.2', m2Size: '2280' }),
  part(9, 'storage', 2490000, { capacityGB: 1000, storageInterface: 'M.2', m2Size: '2230' }),
  part(10, 'psu', 1190000, { psuWatts: 550 }),
  part(11, 'psu', 2490000, { psuWatts: 750 }),
  part(12, 'case', 990000, { supportedFormFactors: 'mATX,ITX', maxGpuLengthMm: 320, maxCoolerHeightMm: 160 }),
  { ...part(13, 'gpu', 16490000, { name: 'ASUS GeForce RTX 5070 12G', vramGB: 12, powerW: 250, lengthMm: 304 }), stock: 0 },
  part(14, 'laptop_ram', 590000, { memoryType: 'DDR5', capacityGB: 8, modules: 1 }),
  { ...part(15, 'ram', 3190000, { memoryType: 'DDR5', capacityGB: 32, modules: 2 }), listPrice: 3190000, price: 2890000 },
];
const catalog = () => agent.createCatalog(COMPONENTS);
const OFFICE = [1, 3, 4, 8, 10, 12].map((productId) => ({ productId, reason: 'hợp nhu cầu' }));
const AI_BUILD = [1, 3, 4, 6, 8, 11, 12].map((productId) => ({ productId, reason: 'hợp nhu cầu' }));
const total = (ids) => ids.reduce((sum, { productId }) => sum + catalog().byId.get(productId).price, 0);

test('kho của trợ lý: chỉ linh kiện máy bàn còn hàng, bỏ ổ M.2 2230, đánh dấu Hot Deal', () => {
  const { parts, byId } = catalog();
  assert.deepEqual(parts.map((item) => item.productId).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 15]);
  assert.ok(parts.every((item, index) => index === 0 || parts[index - 1].price <= item.price));
  assert.equal(byId.get(15).hotDeal, true);
  assert.equal(byId.get(4).hotDeal, false);
  const described = agent.describeForModel(byId.get(15));
  assert.equal(described.price, 2890000);
  assert.equal(described.listPrice, 3190000);
});

test('find_parts lọc theo socket, loại RAM, VRAM, hãng card, giá và sắp xếp', () => {
  const ids = (args) => agent.findParts(catalog(), args).parts.map((item) => item.id);
  assert.deepEqual(ids({ type: 'cpu', socket: 'am5' }), [1]);
  assert.deepEqual(ids({ type: 'ram', memoryType: 'DDR5', minCapacityGB: 32 }), [4, 15]);
  assert.deepEqual(ids({ type: 'gpu', minVramGB: 12, gpuBrand: 'nvidia' }), [6]);
  assert.deepEqual(ids({ type: 'gpu', maxPrice: 7000000 }), [7]);
  assert.deepEqual(ids({ type: 'gpu', sort: 'price_desc', limit: 1 }), [6]);
  assert.deepEqual(ids({ type: 'case', formFactor: 'ATX' }), []);
  assert.deepEqual(ids({ type: 'psu', minWatts: 600 }), [11]);
  assert.deepEqual(ids({ type: 'storage', storageInterface: 'm.2', minCapacityGB: 1000 }), [8]);
  assert.deepEqual(ids({ type: 'storage', storageInterface: 'SATA' }), []);
  assert.deepEqual(ids({ type: 'cpu', integratedGraphics: true }), [1]);
  assert.match(agent.describeStep('find_parts', { type: 'cpu', integratedGraphics: true }, agent.findParts(catalog(), { type: 'cpu', integratedGraphics: true })).title, /có đồ hoạ tích hợp/);
  assert.match(agent.findParts(catalog(), { type: 'laptop' }).error, /type phải/);
  const gpu = agent.findParts(catalog(), { type: 'gpu' }).parts[0];
  assert.deepEqual(Object.keys(gpu).sort(), ['brand', 'id', 'lengthMm', 'name', 'powerW', 'price', 'stock', 'vramGB']);
});

test('check_build: báo ID lạ, lỗi tương thích, tổng tiền so với ngân sách và máy chạy được gì', () => {
  const unknown = agent.checkDraft(catalog(), null, { items: [{ productId: 999 }] });
  assert.match(unknown.problems[0], /ID 999 không có/);

  const mismatch = agent.checkDraft(catalog(), null, { items: [{ productId: 2 }, { productId: 3 }] });
  assert.equal(mismatch.compatible, false);
  assert.match(mismatch.errors[0], /socket/);

  const office = agent.checkDraft(catalog(), 15000000, { items: OFFICE });
  assert.equal(office.compatible, true);
  assert.equal(office.complete, true);
  assert.equal(office.total, total(OFFICE));
  assert.equal(office.overBudgetBy, office.total - 15000000);
  assert.match(office.canRun.summary, /AI|card/);
  assert.ok(office.canRun.verdicts.some((line) => /Docker/.test(line)));
});

test('submit_build: máy chủ kiểm tra lại, trả lý do để mô hình sửa', () => {
  const state = { builds: {}, rejections: 0 };
  const submit = (args, budget = 20000000) => agent.submitBuild(catalog(), budget, state, { title: 'Máy', summary: 'Hợp nhu cầu', ...args });

  assert.match(submit({ variant: 'alternative', tradeoff: 'rẻ hơn', items: OFFICE }).problems[0], /cấu hình chính/);
  assert.match(submit({ variant: 'main', items: OFFICE.map(({ productId }) => ({ productId })) }).problems[0], /Thiếu reason/);
  assert.ok(submit({ variant: 'main', items: [{ productId: 2, reason: 'x' }, ...OFFICE.slice(1)] }).problems.some((item) => /socket/.test(item)));
  // CPU không có đồ hoạ tích hợp, không card: trả lỗi kèm gợi ý dùng bộ lọc integratedGraphics.
  const noScreen = submit({ variant: 'main', items: [{ productId: 2, reason: 'x' }, ...OFFICE.slice(1)] });
  assert.match(noScreen.hint, /integratedGraphics: true/);
  assert.ok(submit({ variant: 'main', items: OFFICE.slice(0, 3) }).problems.some((item) => /Còn thiếu/.test(item)));
  assert.match(submit({ variant: 'main', items: AI_BUILD }, 15000000).problems.join(' '), /vượt ngân sách/);
  assert.match(submit({ variant: 'main', items: [{ productId: 13, reason: 'mạnh' }] }).problems[0], /không có trong danh sách/);
  assert.equal(state.rejections, 7);
  assert.equal(state.builds.main, undefined);

  const accepted = submit({ variant: 'main', items: OFFICE });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.withinBudget, true);
  assert.match(submit({ variant: 'alternative', tradeoff: 'giống', items: OFFICE }).problems[0], /giống hệt/);
  assert.equal(submit({ variant: 'alternative', tradeoff: 'Thêm card 12 GB để chạy AI', items: AI_BUILD }).accepted, true);

  // Vượt ngân sách chỉ được nhận khi mô hình nói rõ vì sao không ráp được trong ngân sách.
  const tight = { builds: {}, rejections: 0 };
  const over = agent.submitBuild(catalog(), 15000000, tight, { variant: 'main', title: 'AI', summary: 's', items: AI_BUILD, overBudgetReason: 'Card rẻ nhất có 12 GB VRAM đã 7,5 triệu' });
  assert.equal(over.accepted, true);
  assert.equal(tight.builds.main.overBudgetReason, 'Card rẻ nhất có 12 GB VRAM đã 7,5 triệu');
});

// Kịch bản mô hình: mỗi phần tử là một lượt trả lời của OpenAI.
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const scripted = (turns) => {
  const seen = [];
  const fn = async (messages, tools) => {
    seen.push({ messages: messages.map((message) => ({ ...message })), tools });
    const next = turns.shift();
    if (!next) throw new Error('unexpected model call');
    return { message: next, usage: { prompt_tokens: 1000, completion_tokens: 100 } };
  };
  fn.seen = seen;
  return fn;
};

test('vòng lặp: tìm, bị trả lại, tự sửa, chốt hai phương án; giá lấy từ kho chứ không từ mô hình', async () => {
  const model = scripted([
    { content: null, tool_calls: [call('a', 'find_parts', { type: 'cpu', socket: 'AM5' }), call('b', 'find_parts', { type: 'gpu', minVramGB: 12 })] },
    { content: null, tool_calls: [call('c', 'submit_build', { variant: 'main', title: 'AI', summary: 's', items: [{ productId: 2, reason: 'rẻ' }, ...AI_BUILD.slice(1)] })] },
    { content: null, tool_calls: [call('d', 'check_build', { items: AI_BUILD }), call('e', 'submit_build', { variant: 'main', title: 'Máy chạy AI 8B', summary: 'Card 12 GB.', items: AI_BUILD })] },
    { content: null, tool_calls: [call('f', 'submit_build', { variant: 'alternative', title: 'Bản văn phòng', summary: 'Không card.', tradeoff: 'Rẻ hơn, không chạy AI trên card', items: OFFICE })] },
  ]);
  const events = [];
  const result = await agent.runBuildAgent({ request: 'Máy chạy AI tầm 30 triệu', budget: 30000000, catalog: catalog(), callModel: model, onEvent: (event) => events.push(event) });

  assert.equal(result.status, 'built');
  assert.equal(model.seen.length, 4, 'đủ hai phương án thì dừng, không gọi thêm');
  assert.deepEqual(result.builds.map((build) => build.variant), ['main', 'alternative']);
  const [main, alternative] = result.builds;
  assert.equal(main.total, total(AI_BUILD));
  assert.deepEqual(main.items.map((item) => item.type), ['cpu', 'mainboard', 'ram', 'gpu', 'storage', 'psu', 'case']);
  assert.equal(main.items.find((item) => item.type === 'gpu').price, 7490000);
  assert.equal(main.withinBudget, true);
  assert.equal(main.check.ok, true);
  assert.match(main.capabilities.summary, /12B|8B|AI/);
  assert.equal(alternative.tradeoff, 'Rẻ hơn, không chạy AI trên card');

  assert.equal(result.stats.rejectedSubmissions, 1);
  assert.equal(result.stats.toolCalls, 6);
  assert.equal(result.stats.inputTokens, 4000);
  assert.equal(result.stats.outputTokens, 400);
  assert.deepEqual(result.trace.map((step) => step.tool), ['find_parts', 'find_parts', 'submit_build', 'check_build', 'submit_build', 'submit_build']);
  assert.match(result.trace[0].title, /Tìm CPU \(socket AM5\)/);
  assert.match(result.trace[2].detail, /Hệ thống trả lại: .*socket/);
  assert.equal(result.trace[2].rejected, true);
  assert.match(result.trace[4].detail, /chấp nhận: Máy chạy AI 8B/);
  assert.deepEqual(events.filter((event) => event.type === 'thinking').map((event) => event.round), [1, 2, 3, 4]);
  assert.equal(events.filter((event) => event.type === 'step').length, 6);

  // Mỗi tool_call có đúng một tin trả lời công cụ, và tin của khách nằm trong khung riêng.
  const last = model.seen[3].messages;
  assert.equal(last.filter((message) => message.role === 'tool').length, 5);
  assert.match(last[1].content, /"""Máy chạy AI tầm 30 triệu"""/);
  assert.match(last[1].content, /30\.000\.000đ/);
  assert.equal(model.seen[0].tools.map((tool) => tool.function.name).join(','), 'find_parts,check_build,submit_build');
});

test('vòng lặp: chỉ có cấu hình chính thì dừng khi mô hình trả lời chữ', async () => {
  const model = scripted([
    { content: null, tool_calls: [call('a', 'submit_build', { variant: 'main', title: 'Văn phòng', summary: 's', items: OFFICE })] },
    { content: 'Mình đã ráp xong cấu hình văn phòng.' },
  ]);
  const result = await agent.runBuildAgent({ request: 'máy văn phòng', catalog: catalog(), callModel: model });
  assert.equal(result.status, 'built');
  assert.equal(result.builds.length, 1);
  assert.equal(result.builds[0].withinBudget, null);
  assert.equal(result.note, 'Mình đã ráp xong cấu hình văn phòng.');
});

test('vòng lặp: không phải yêu cầu ráp PC thì nhắc một lần rồi trả lời từ chối, không có cấu hình', async () => {
  const model = scripted([{ content: 'Bạn muốn ráp máy gì?' }, { content: 'Mục này chỉ ráp PC máy bàn, bạn dùng trợ lý mua hàng để chọn laptop nhé.' }]);
  const result = await agent.runBuildAgent({ request: 'tư vấn laptop', catalog: catalog(), callModel: model });
  assert.equal(result.status, 'declined');
  assert.deepEqual(result.builds, []);
  assert.match(result.note, /chỉ ráp PC máy bàn/);
  assert.equal(model.seen[1].messages.at(-1).role, 'user');
});

test('vòng lặp: hết lượt chưa chốt thì báo chưa xong; huỷ thì dừng ngay', async () => {
  const loop = () => ({ content: null, tool_calls: [call(`x${Math.random()}`, 'find_parts', { type: 'cpu' })] });
  const result = await agent.runBuildAgent({ request: 'máy', catalog: catalog(), callModel: scripted([loop(), loop(), loop()]), maxRounds: 3 });
  assert.equal(result.status, 'incomplete');
  assert.match(result.note, /chưa ráp xong/);
  assert.equal(result.stats.rounds, 3);

  // Bị trả lại vì vượt ngân sách rồi mô hình kết thúc bằng chữ: báo lý do của máy chủ, không dùng câu của mô hình.
  const gaveUp = await agent.runBuildAgent({
    request: 'máy AI 15 triệu',
    budget: 15000000,
    catalog: catalog(),
    callModel: scripted([
      { content: null, tool_calls: [call('a', 'submit_build', { variant: 'main', title: 'AI', summary: 's', items: AI_BUILD })] },
      { content: 'Mình đã ráp xong!' },
      { content: 'Xong rồi nhé.' },
    ]),
  });
  assert.equal(gaveUp.status, 'incomplete');
  assert.match(gaveUp.note, /bị trả lại vì: Tổng .* vượt ngân sách 15\.000\.000đ/);

  await assert.rejects(
    agent.runBuildAgent({ request: 'máy', catalog: catalog(), callModel: scripted([]), isCancelled: () => true }),
    (err) => err.cancelled === true,
  );
});

const SETTINGS = { enabled: true, apiKey: 'sk-test', model: 'gpt-5.4-mini', perHour: 20, dailyLimit: 500 };

test('chuẩn bị: kiểm tra yêu cầu, đọc ngân sách, tính vào hạn mức ngày', async () => {
  assistant.resetUsage();
  await assert.rejects(buildAgentService.prepare({ request: 'chơi game' }, { settings: { ...SETTINGS, enabled: false } }), (err) => err.status === 503);
  await assert.rejects(buildAgentService.prepare({ request: 'abc' }, { settings: SETTINGS }), (err) => err.status === 400);
  await assert.rejects(buildAgentService.prepare({ request: 'x'.repeat(601) }, { settings: SETTINGS }), (err) => err.status === 400);
  await assert.rejects(buildAgentService.prepare({ request: 'chơi game', budget: 1000 }, { settings: SETTINGS }), (err) => err.status === 400);

  const fromText = await buildAgentService.prepare({ request: '  Máy chơi game   tầm 25tr5 ' }, { settings: SETTINGS });
  assert.equal(fromText.request, 'Máy chơi game tầm 25tr5');
  assert.equal(fromText.budget, 25500000);
  const explicit = await buildAgentService.prepare({ request: 'Máy chơi game tầm 25 triệu', budget: '30000000' }, { settings: SETTINGS });
  assert.equal(explicit.budget, 30000000);
  assert.equal(assistant.usageToday(), 2);

  await assert.rejects(buildAgentService.prepare({ request: 'chơi game' }, { settings: { ...SETTINGS, dailyLimit: 2 } }), (err) => err.status === 429);
});

test('chạy với OpenAI giả: gửi đủ công cụ, đọc token, kết quả kèm mô hình và ngân sách', async () => {
  const bodies = [];
  const turns = [
    { tool_calls: [call('a', 'submit_build', { variant: 'main', title: 'Văn phòng', summary: 's', items: OFFICE })] },
    { content: 'Xong.' },
  ];
  const fakeFetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    assert.equal(options.headers.Authorization, 'Bearer sk-test');
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: turns.shift() }], usage: { prompt_tokens: 500, completion_tokens: 50 } }) };
  };
  const events = [];
  const result = await buildAgentService.run(
    { request: 'máy văn phòng 20 triệu', budget: 20000000, settings: SETTINGS },
    { fetch: fakeFetch, catalog: catalog(), onEvent: (event) => events.push(event) },
  );
  assert.equal(result.status, 'built');
  assert.equal(result.model, 'gpt-5.4-mini');
  assert.equal(result.budget, 20000000);
  assert.equal(result.stats.inputTokens, 1000);
  assert.equal(bodies[0].max_completion_tokens, 4000);
  assert.deepEqual(bodies[0].tools.map((tool) => tool.function.name), ['find_parts', 'check_build', 'submit_build']);
  assert.ok(events.some((event) => event.type === 'step'));

  await assert.rejects(
    buildAgentService.run({ request: 'máy', budget: null, settings: SETTINGS }, { fetch: fakeFetch, catalog: agent.createCatalog([]) }),
    (err) => err.status === 503,
  );
});
