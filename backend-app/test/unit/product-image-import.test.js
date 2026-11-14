const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseImageFileName,
  detectImageType,
  shouldReplaceImages,
  suggestSlug,
  csvRow,
} = require('../../src/utils/productImageImport');

test('tên file ảnh: mã sản phẩm, thứ tự ảnh phụ, đuôi không phân biệt hoa thường', () => {
  assert.deepEqual(parseImageFileName('amd-ryzen-7-9700x.jpg'), { slug: 'amd-ryzen-7-9700x', order: 1, fullSlug: 'amd-ryzen-7-9700x', extension: 'jpg' });
  assert.equal(parseImageFileName('AMD-Ryzen-7-9700X.JPEG').slug, 'amd-ryzen-7-9700x');
  assert.deepEqual(
    [parseImageFileName('amd-ryzen-7-9700x-2.png').slug, parseImageFileName('amd-ryzen-7-9700x-2.png').order],
    ['amd-ryzen-7-9700x', 2],
  );
  assert.equal(parseImageFileName('amd-ryzen-7-9700x (3).webp').order, 3);
  // Số cuối mã (5600, 32...) không bị hiểu nhầm là thứ tự ảnh.
  assert.deepEqual(
    [parseImageFileName('kingston-fury-beast-32gb-ddr5-5600.jpg').slug, parseImageFileName('kingston-fury-beast-32gb-ddr5-5600.jpg').order],
    ['kingston-fury-beast-32gb-ddr5-5600', 1],
  );
  assert.equal(parseImageFileName('danh-sach-ma-san-pham.csv'), null);
  assert.equal(parseImageFileName('anh.svg'), null, 'SVG có thể chứa script nên không nhận');
});

test('nhận dạng ảnh theo nội dung file, không tin đuôi tên', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  assert.equal(detectImageType(png), 'png');
  assert.equal(detectImageType(jpg), 'jpg');
  assert.equal(detectImageType(webp), 'webp');
  assert.equal(detectImageType(Buffer.from('GIF89a......')), 'gif');
  assert.equal(detectImageType(Buffer.from('<html><script>alert(1)</script>')), null);
});

test('chỉ thay ảnh minh hoạ hoặc ô trống; ảnh đã tải lên chỉ thay khi --ghi-de', () => {
  assert.equal(shouldReplaceImages('[]'), true);
  assert.equal(shouldReplaceImages(null), true);
  assert.equal(shouldReplaceImages('["/images/products/amd-ryzen-7-9700x.svg"]'), true);
  assert.equal(shouldReplaceImages('["/uploads/product-1.jpg"]'), false);
  assert.equal(shouldReplaceImages('["/uploads/product-1.jpg"]', { force: true }), true);
});

test('gợi ý mã gần đúng khi gõ sai tên file', () => {
  const slugs = ['amd-ryzen-7-9700x', 'amd-ryzen-5-9600x', 'logitech-brio-4k'];
  assert.equal(suggestSlug('amd-ryzen-7-9700', slugs), 'amd-ryzen-7-9700x');
  assert.equal(suggestSlug('logitech-brio4k', slugs), 'logitech-brio-4k');
  assert.equal(suggestSlug('ban-phim-co', slugs), null);
});

test('CSV: bọc ngoặc kép khi có dấu phẩy hoặc ngoặc kép', () => {
  assert.equal(csvRow(['a', 'b, c', 'd "e"', null]), 'a,"b, c","d ""e""",');
});
