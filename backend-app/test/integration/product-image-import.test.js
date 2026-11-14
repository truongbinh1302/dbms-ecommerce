/*
  Test tích hợp thêm ảnh sản phẩm hàng loạt trên SQL Server thật.
  Chạy:  cd backend-app && npm run test:db
  Tạo sản phẩm và thư mục tạm riêng, xoá sạch khi xong.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const { importFolder, listProducts } = require('../../src/services/productImageImport.service');

const tag = `img${Date.now()}`;
const ctx = { productIds: [], dirs: [] };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);

const tempDir = (name) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-${name}-`));
  ctx.dirs.push(dir);
  return dir;
};

const createProduct = async (suffix, images) => {
  const category = await getPool().request().query("SELECT TOP 1 CategoryID FROM Categories WHERE Slug = N'components'");
  const result = await getPool().request()
    .input('name', sql.NVarChar, `Ảnh ${tag} ${suffix}`)
    .input('slug', sql.NVarChar, `${tag}-${suffix}`)
    .input('images', sql.NVarChar, JSON.stringify(images))
    .input('categoryId', sql.Int, category.recordset[0].CategoryID)
    .query(`INSERT INTO Products (Name, Slug, Brand, Price, Stock, CategoryID, Specs, Images)
            OUTPUT INSERTED.ProductID VALUES (@name, @slug, N'Test', 1000000, 5, @categoryId, N'[]', @images)`);
  ctx.productIds.push(result.recordset[0].ProductID);
  return { id: result.recordset[0].ProductID, slug: `${tag}-${suffix}` };
};

const imagesOf = async (id) => {
  const result = await getPool().request().input('id', sql.Int, id).query('SELECT Images FROM Products WHERE ProductID = @id');
  return JSON.parse(result.recordset[0].Images);
};

test.before(async () => {
  await connectSQL();
});

test.after(async () => {
  try {
    if (ctx.productIds.length) await getPool().request().query(`DELETE FROM Products WHERE ProductID IN (${ctx.productIds.join(',')})`);
  } finally {
    for (const dir of ctx.dirs) fs.rmSync(dir, { recursive: true, force: true });
    await getPool().close();
  }
});

test('gắn ảnh theo tên file: thay ảnh minh hoạ, giữ ảnh đã tải lên, báo file sai tên hoặc không phải ảnh', async () => {
  const illustrated = await createProduct('cpu', ['/images/products/x.svg']);
  const empty = await createProduct('ram', []);
  const uploaded = await createProduct('gpu', ['/uploads/product-123.jpg']);
  const images = tempDir('in');
  const uploads = tempDir('uploads');
  fs.writeFileSync(path.join(images, `${illustrated.slug}.png`), PNG);
  fs.writeFileSync(path.join(images, `${illustrated.slug}-2.JPG`), JPG);
  fs.writeFileSync(path.join(images, `${empty.slug}.jpg`), JPG);
  fs.writeFileSync(path.join(images, `${uploaded.slug}.jpg`), JPG);
  fs.writeFileSync(path.join(images, `${tag}-cpux.jpg`), JPG);
  fs.writeFileSync(path.join(images, `${empty.slug}-3.png`), Buffer.from('<svg onload="alert(1)"></svg> not an image'));
  fs.writeFileSync(path.join(images, 'danh-sach-ma-san-pham.csv'), 'ma_san_pham\n');

  const dry = await importFolder({ dir: images, uploadsDir: uploads, dryRun: true });
  assert.equal(dry.updated.length, 2);
  assert.deepEqual(await imagesOf(illustrated.id), ['/images/products/x.svg'], 'chạy thử không sửa dữ liệu');
  assert.equal(fs.existsSync(path.join(uploads, 'products')), false);

  const report = await importFolder({ dir: images, uploadsDir: uploads });
  const first = await imagesOf(illustrated.id);
  assert.equal(first.length, 2);
  assert.match(first[0], new RegExp(`^/uploads/products/${illustrated.slug}-1-[0-9a-f]{10}\\.png$`));
  assert.match(first[1], /-2-[0-9a-f]{10}\.jpg$/);
  for (const url of first) assert.ok(fs.existsSync(path.join(uploads, url.replace('/uploads/', ''))));
  assert.equal((await imagesOf(empty.id)).length, 1);
  assert.deepEqual(await imagesOf(uploaded.id), ['/uploads/product-123.jpg']);
  assert.deepEqual(report.keptUploaded.map((item) => item.slug), [uploaded.slug]);
  assert.deepEqual(report.unknown.map((item) => item.suggestion), [illustrated.slug]);
  assert.deepEqual(report.invalid.map((item) => item.file), [`${empty.slug}-3.png`]);
  assert.equal(report.ignored, 1);

  const forced = await importFolder({ dir: images, uploadsDir: uploads, force: true });
  assert.ok(forced.updated.some((item) => item.slug === uploaded.slug));
  assert.match((await imagesOf(uploaded.id))[0], /^\/uploads\/products\//);

  const listed = (await listProducts()).filter((product) => product.slug.startsWith(tag));
  assert.ok(listed.every((product) => product.imageKind === 'photo'));
});
