const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getPool, sql } = require('../config/db.sql');
const {
  MAX_IMAGE_BYTES,
  ILLUSTRATION_PREFIX,
  parseImageFileName,
  detectImageType,
  parseImages,
  shouldReplaceImages,
  suggestSlug,
} = require('../utils/productImageImport');

/*
  Thêm ảnh sản phẩm hàng loạt từ một thư mục: mỗi file đặt tên theo mã sản phẩm (Slug), ví dụ
  amd-ryzen-7-9700x.jpg, thêm ảnh phụ amd-ryzen-7-9700x-2.jpg. Ảnh được chép vào uploads/products/
  (cùng chỗ với ảnh tải lên ở trang quản trị) rồi ghi vào cột Images.
*/

const DEFAULT_UPLOADS_DIR = path.join(__dirname, '../../uploads');

/** Sản phẩm thật đang bán (không tính 50.000 sản phẩm sinh tự động), kèm loại ảnh hiện có. */
const listProducts = async () => {
  const result = await getPool().request().query(`
    SELECT p.ProductID, p.Slug, p.Name, p.Brand, p.Images, c.Name AS CategoryName
    FROM Products p
    LEFT JOIN Categories c ON c.CategoryID = p.CategoryID
    WHERE p.IsDeleted = 0 AND p.IsGenerated = 0
    ORDER BY c.Name, p.Name;
  `);
  return result.recordset.map((row) => {
    const images = parseImages(row.Images);
    return {
      id: row.ProductID,
      slug: row.Slug,
      name: row.Name,
      brand: row.Brand,
      category: row.CategoryName,
      images,
      imageKind: images.length === 0 ? 'none' : images.every((url) => url.startsWith(ILLUSTRATION_PREFIX)) ? 'illustration' : 'photo',
    };
  });
};

/**
 * @param dir         thư mục chứa ảnh
 * @param force       true: thay cả ảnh quản trị đã tải lên
 * @param uploadsDir  thư mục uploads của backend (test truyền thư mục tạm)
 * @param dryRun      true: chỉ báo cáo, không chép file, không sửa DB
 */
const importFolder = async ({ dir, force = false, uploadsDir = DEFAULT_UPLOADS_DIR, dryRun = false }) => {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Không thấy thư mục ảnh: ${dir}`);
  }
  const products = await listProducts();
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const slugs = products.map((product) => product.slug);

  const report = { updated: [], keptUploaded: [], unknown: [], invalid: [], ignored: 0 };
  const groups = new Map();

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const parsed = parseImageFileName(entry.name);
    if (!parsed) {
      report.ignored += 1; // danh sách mã (.csv), ghi chú... không phải ảnh
      continue;
    }
    // Mã sản phẩm có thể tự kết thúc bằng -2..-6: khớp cả tên trước rồi mới hiểu là ảnh thứ 2..6.
    const target = bySlug.has(parsed.fullSlug) ? { slug: parsed.fullSlug, order: 1 } : { slug: parsed.slug, order: parsed.order };
    const product = bySlug.get(target.slug);
    if (!product) {
      report.unknown.push({ file: entry.name, suggestion: suggestSlug(parsed.fullSlug, slugs) });
      continue;
    }
    const filePath = path.join(dir, entry.name);
    const size = fs.statSync(filePath).size;
    if (size > MAX_IMAGE_BYTES) {
      report.invalid.push({ file: entry.name, reason: `nặng ${(size / 1024 / 1024).toFixed(1)} MB, tối đa 5 MB` });
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const type = detectImageType(buffer);
    if (!type) {
      report.invalid.push({ file: entry.name, reason: 'không phải ảnh JPG, PNG, WebP hoặc GIF' });
      continue;
    }
    if (!groups.has(product.slug)) groups.set(product.slug, []);
    groups.get(product.slug).push({ file: entry.name, order: target.order, buffer, type });
  }

  const targetDir = path.join(uploadsDir, 'products');
  if (!dryRun) fs.mkdirSync(targetDir, { recursive: true });

  for (const [slug, files] of groups) {
    const product = bySlug.get(slug);
    if (!shouldReplaceImages(product.images, { force })) {
      report.keptUploaded.push({ slug, name: product.name, files: files.map((item) => item.file) });
      continue;
    }
    files.sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
    const urls = [];
    for (const item of files) {
      const hash = crypto.createHash('sha256').update(item.buffer).digest('hex').slice(0, 10);
      const fileName = `${slug}-${item.order}-${hash}.${item.type}`;
      if (!dryRun) fs.writeFileSync(path.join(targetDir, fileName), item.buffer);
      urls.push(`/uploads/products/${fileName}`);
    }
    if (!dryRun) {
      await getPool().request()
        .input('id', sql.Int, product.id)
        .input('images', sql.NVarChar(sql.MAX), JSON.stringify(urls))
        .query('UPDATE Products SET Images = @images, Version = Version + 1, UpdatedAt = GETDATE() WHERE ProductID = @id');
    }
    report.updated.push({ slug, name: product.name, files: files.map((item) => item.file), images: urls });
  }

  const updatedSlugs = new Set(report.updated.map((item) => item.slug));
  report.withoutPhoto = products
    .filter((product) => product.imageKind !== 'photo' && !updatedSlugs.has(product.slug))
    .map((product) => ({ slug: product.slug, name: product.name }));
  return report;
};

module.exports = { listProducts, importFolder };
