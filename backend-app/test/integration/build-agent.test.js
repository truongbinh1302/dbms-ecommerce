/*
  Test tích hợp: trợ lý AI ráp máy đọc kho thật (SQL Server) và trả luồng NDJSON qua HTTP.
  OpenAI được thay bằng một máy chủ giả chạy kịch bản, nên không cần khoá thật và không tốn tiền.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const config = require('../../src/config/env');
const app = require('../../src/app');
const assistant = require('../../src/services/assistant.service');
const promotionService = require('../../src/services/promotion.service');
const buildAgentService = require('../../src/services/buildAgent.service');
const { PRESETS, autoBuild } = require('../../src/utils/buildAdvisor');

const tag = `ba${Date.now()}`;
const ctx = { gpuId: null, promotionId: null, server: null, openai: null, turns: [], requests: [], items: [] };
const original = { loadSettings: assistant.loadSettings, baseUrl: config.assistant.baseUrl };
const SETTINGS = { enabled: true, apiKey: 'sk-test-agent', model: 'gpt-5.4-mini', perHour: 20, dailyLimit: 500 };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const iso = (offsetMinutes) => new Date(Date.now() + offsetMinutes * 60000).toISOString();

test.before(async () => {
  await connectSQL();
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [gpu] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (@name, @slug, 9000000, 3, @categoryId)
  `, { name: [sql.NVarChar, `GeForce RTX test ${tag} 12G`], slug: [sql.NVarChar, `${tag}-gpu`], categoryId: [sql.Int, category.CategoryID] });
  ctx.gpuId = gpu.ProductID;
  await query(`
    INSERT INTO ComponentSpecs (ProductID, ComponentType, PowerW, LengthMm, VramGB)
    VALUES (@id, N'gpu', 150, 250, 12)
  `, { id: [sql.Int, ctx.gpuId] });
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  const promo = await promotionService.createPromotion({
    name: `Hot Deal ${tag}`, startsAt: iso(-5), endsAt: iso(60), items: [{ productId: ctx.gpuId, salePrice: 8000000 }],
  }, admin.UserID);
  ctx.promotionId = promo.id;

  // OpenAI giả: trả lần lượt các lượt trong ctx.turns, ghi lại yêu cầu nhận được.
  ctx.openai = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      ctx.requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      const message = ctx.turns.shift() || { content: 'Hết kịch bản.' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 1200, completion_tokens: 80 } }));
    });
  });
  await new Promise((resolve) => ctx.openai.listen(0, '127.0.0.1', resolve));
  config.assistant.baseUrl = `http://127.0.0.1:${ctx.openai.address().port}`;
  assistant.loadSettings = async () => SETTINGS;
  assistant.resetUsage();

  ctx.server = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
});

test.after(async () => {
  assistant.loadSettings = original.loadSettings;
  config.assistant.baseUrl = original.baseUrl;
  await new Promise((resolve) => ctx.server.close(resolve));
  await new Promise((resolve) => ctx.openai.close(resolve));
  await query(`
    DELETE FROM PromotionItems WHERE PromotionID = @promo;
    DELETE FROM Promotions WHERE PromotionID = @promo;
    DELETE FROM ComponentSpecs WHERE ProductID = @id;
    DELETE FROM PriceHistory WHERE ProductID = @id;
    DELETE FROM StockMovements WHERE ProductID = @id;
    DELETE FROM Products WHERE ProductID = @id;
  `, { promo: [sql.Int, ctx.promotionId], id: [sql.Int, ctx.gpuId] });
  await getPool().close();
});

const post = (body) => fetch(`http://127.0.0.1:${ctx.server.address().port}/api/v1/builder/agent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('kho của trợ lý: giá Hot Deal, chỉ linh kiện máy bàn còn hàng, có nhãn giá 90 ngày', async () => {
  const catalog = await buildAgentService.loadCatalog();
  const gpu = catalog.byId.get(ctx.gpuId);
  assert.deepEqual([gpu.price, gpu.listPrice, gpu.hotDeal], [8000000, 9000000, true]);
  assert.ok(catalog.parts.every((part) => part.stock > 0 && part.type !== 'laptop_ram'));
  assert.ok(catalog.parts.every((part) => part.type !== 'storage' || !part.m2Size || part.m2Size === '2280'));
  assert.ok(catalog.parts.some((part) => part.priceInsight), 'linh kiện mẫu có lịch sử giá');

  // Cấu hình chạy AI hợp lệ từ kho thật, đổi card sang card đang Hot Deal.
  const base = autoBuild(PRESETS.find((preset) => preset.id === 'ai-local'), catalog.parts);
  assert.ok(base, 'kho mẫu ráp được cấu hình chạy AI');
  ctx.items = base.parts.map((part) => ({ productId: part.type === 'gpu' ? ctx.gpuId : part.productId, reason: `Hợp nhu cầu (${part.type})` }));
  ctx.expectedTotal = ctx.items.reduce((sum, item) => sum + catalog.byId.get(item.productId).price, 0);
});

test('HTTP: luồng NDJSON từng bước, máy chủ trả lại cấu hình sai rồi nhận cấu hình đúng, giá theo kho', async () => {
  const wrong = ctx.items.map((item) => (item.productId === ctx.gpuId ? { ...item, productId: 999999999 } : item));
  ctx.turns.push(
    { content: null, tool_calls: [call('a', 'find_parts', { type: 'gpu', gpuBrand: 'nvidia', minVramGB: 12, minPrice: 7600000, maxPrice: 8500000 })] },
    { content: null, tool_calls: [call('b', 'submit_build', { variant: 'main', title: 'Máy chạy AI', summary: 'Card 12 GB.', items: wrong })] },
    { content: null, tool_calls: [call('c', 'submit_build', { variant: 'main', title: 'Máy chạy AI', summary: 'Card 12 GB.', items: ctx.items })] },
    { content: 'Mình đã ráp xong.' },
  );
  const response = await post({ request: 'Máy chạy AI trên máy tầm 40 triệu' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/);
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));

  assert.deepEqual(events.filter((event) => event.type === 'thinking').map((event) => event.round), [1, 2, 3, 4]);
  const steps = events.filter((event) => event.type === 'step').map((event) => event.step);
  assert.equal(steps.length, 3);
  assert.match(steps[0].detail, new RegExp(`GeForce RTX test ${tag} 12G 8\\.000\\.000đ`));
  assert.equal(steps[1].rejected, true);
  assert.match(steps[1].detail, /999999999/);
  assert.equal(steps[2].ok, true);

  const done = events.at(-1);
  assert.equal(done.type, 'done');
  const { result } = done;
  assert.equal(result.status, 'built');
  assert.equal(result.budget, 40000000);
  assert.equal(result.request, 'Máy chạy AI trên máy tầm 40 triệu');
  assert.equal(result.stats.rejectedSubmissions, 1);
  assert.equal(result.stats.inputTokens, 4800);
  const [build] = result.builds;
  assert.equal(build.total, ctx.expectedTotal);
  const gpu = build.items.find((item) => item.type === 'gpu');
  assert.deepEqual([gpu.productId, gpu.price, gpu.listPrice, gpu.hotDeal], [ctx.gpuId, 8000000, 9000000, true]);
  assert.equal(build.check.ok, true);
  assert.ok(build.capabilities.groups.length > 0);

  // Khách gửi gì thì cũng chỉ nằm trong tin "user"; mô hình nhận đúng khoá, công cụ và ngân sách.
  assert.equal(ctx.requests[0].auth, 'Bearer sk-test-agent');
  assert.equal(ctx.requests[0].url, '/chat/completions');
  assert.equal(ctx.requests[0].body.messages[0].role, 'system');
  assert.match(ctx.requests[0].body.messages[1].content, /40\.000\.000đ/);
  const found = JSON.parse(ctx.requests[1].body.messages.find((message) => message.role === 'tool').content);
  assert.equal(found.parts[0].id, ctx.gpuId);
  assert.equal(found.parts[0].listPrice, 9000000);
});

test('HTTP: lỗi trước khi bắt đầu trả JSON; OpenAI lỗi giữa chừng trả sự kiện error', async () => {
  const short = await post({ request: 'pc' });
  assert.equal(short.status, 400);
  assert.equal((await short.json()).success, false);

  assistant.loadSettings = async () => ({ ...SETTINGS, enabled: false });
  const disabled = await post({ request: 'Máy chơi game 20 triệu' });
  assert.equal(disabled.status, 503);
  assert.match((await disabled.json()).message, /chưa được bật/);
  assistant.loadSettings = async () => SETTINGS;

  const failing = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(500);
      res.end('{}');
    });
  });
  await new Promise((resolve) => failing.listen(0, '127.0.0.1', resolve));
  const previous = config.assistant.baseUrl;
  config.assistant.baseUrl = `http://127.0.0.1:${failing.address().port}`;
  try {
    const response = await post({ request: 'Máy chơi game 20 triệu' });
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(events.at(-1), { type: 'error', message: 'Trợ lý đang bận, bạn thử lại sau ít phút nhé.' });
  } finally {
    config.assistant.baseUrl = previous;
    await new Promise((resolve) => failing.close(resolve));
  }
});
