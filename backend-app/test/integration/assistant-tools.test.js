/*
  Test tích hợp: các công cụ của trợ lý mua hàng đọc đúng dữ liệu thật (không gọi OpenAI).
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const { refreshSearchText } = require('../../src/services/searchIndex.service');
const assistant = require('../../src/services/assistant.service');

const tag = `as${Date.now()}`;
const ctx = { productId: null };
const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

test.before(async () => {
  await connectSQL();
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [row] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID, Specs) OUTPUT INSERTED.ProductID
    VALUES (@name, @slug, 18500000, 3, @categoryId, N'["RTX 4060","16GB RAM"]')
  `, { name: [sql.NVarChar, `Laptop trợ lý ${tag}`], slug: [sql.NVarChar, `${tag}-laptop`], categoryId: [sql.Int, category.CategoryID] });
  ctx.productId = row.ProductID;
  await refreshSearchText(getPool(), [ctx.productId]);
});

test.after(async () => {
  await query('DELETE FROM PriceHistory WHERE ProductID = @id; DELETE FROM StockMovements WHERE ProductID = @id; DELETE FROM Products WHERE ProductID = @id;', { id: [sql.Int, ctx.productId] });
  await getPool().close();
});

test('search_products và get_product trả giá, tồn kho thật; lọc giá có hiệu lực', async () => {
  const tools = assistant.createToolRunner();
  const found = await tools.search_products({ query: `laptop tro ly ${tag}` });
  assert.deepEqual(found.products.map((item) => [item.id, item.price, item.stock]), [[ctx.productId, 18500000, 3]]);
  const tooCheap = await tools.search_products({ query: `laptop tro ly ${tag}`, maxPrice: 15000000 });
  assert.equal(tooCheap.products.length, 0);

  const detail = await tools.get_product({ productId: ctx.productId });
  assert.equal(detail.product.name, `Laptop trợ lý ${tag}`);
  assert.deepEqual(detail.product.specs, ['RTX 4060', '16GB RAM']);
  assert.deepEqual(await tools.get_product({ productId: 0 }), { error: 'Không có sản phẩm này' });
});

test('get_store_policies và advise_build trả dữ liệu của cửa hàng', async () => {
  const tools = assistant.createToolRunner();
  const policies = await tools.get_store_policies();
  assert.ok(policies.returnDays > 0 && policies.shippingFee >= 0 && policies.paymentMethods.length === 2);
  const advice = await tools.advise_build({ needs: 'code web và Docker, tầm 20 triệu' });
  assert.equal(advice.budget, 20000000);
  assert.ok(advice.need, 'nhận ra nhu cầu lập trình web');
  assert.ok(Array.isArray(advice.parts));
  if (advice.parts.length) assert.ok(advice.parts.every((part) => Number.isInteger(part.id) && part.price > 0));
});
