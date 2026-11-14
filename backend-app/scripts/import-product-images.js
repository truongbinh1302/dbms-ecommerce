/*
  Thêm ảnh sản phẩm hàng loạt (Windows: bấm đúp THEM-ANH-SAN-PHAM.bat ở thư mục gốc).

  Chạy trong container backend:
    node scripts/import-product-images.js --list > danh-sach-ma-san-pham.csv   danh sách mã để đặt tên file
    node scripts/import-product-images.js <thư mục ảnh> [--ghi-de] [--thu]
  Tên file = mã sản phẩm, ví dụ amd-ryzen-7-9700x.jpg; ảnh phụ: amd-ryzen-7-9700x-2.jpg ... -6.jpg.
  JPG, PNG, WebP hoặc GIF, tối đa 5 MB mỗi ảnh.
    --ghi-de   thay cả ảnh đã tải lên ở trang quản trị (mặc định chỉ thay ảnh minh hoạ hoặc ô chưa có ảnh)
    --thu      chỉ báo sẽ làm gì, không chép file, không sửa dữ liệu
*/
console.log = (...args) => process.stderr.write(`${args.join(' ')}\n`); // stdout dành cho kết quả

const { connectSQL, getPool } = require('../src/config/db.sql');
const { listProducts, importFolder } = require('../src/services/productImageImport.service');
const { csvRow } = require('../src/utils/productImageImport');

const KIND_LABEL = { none: 'chưa có ảnh', illustration: 'ảnh minh hoạ', photo: 'ảnh thật' };
const write = (line = '') => process.stdout.write(`${line}\n`);

const printList = async () => {
  const products = await listProducts();
  // BOM để Excel mở đúng tiếng Việt.
  process.stdout.write('﻿');
  write(csvRow(['ma_san_pham', 'ten_file_anh', 'ten_san_pham', 'hang', 'danh_muc', 'anh_hien_tai']));
  for (const product of products) {
    write(csvRow([product.slug, `${product.slug}.jpg`, product.name, product.brand, product.category, KIND_LABEL[product.imageKind]]));
  }
  process.stderr.write(`Đã liệt kê ${products.length} sản phẩm.\n`);
};

const printReport = (report, { dryRun }) => {
  const verb = dryRun ? 'Sẽ gắn' : 'Đã gắn';
  write(`${verb} ảnh cho ${report.updated.length} sản phẩm.`);
  for (const item of report.updated) write(`  + ${item.name}: ${item.files.join(', ')}`);
  if (report.keptUploaded.length) {
    write('');
    write(`Giữ nguyên ${report.keptUploaded.length} sản phẩm đã có ảnh tải lên ở trang quản trị (chạy với --ghi-de để thay):`);
    for (const item of report.keptUploaded) write(`  = ${item.name}: ${item.files.join(', ')}`);
  }
  if (report.unknown.length) {
    write('');
    write(`${report.unknown.length} file không khớp mã sản phẩm nào (xem danh-sach-ma-san-pham.csv):`);
    for (const item of report.unknown) write(`  ? ${item.file}${item.suggestion ? `  (có phải ${item.suggestion}?)` : ''}`);
  }
  if (report.invalid.length) {
    write('');
    write(`${report.invalid.length} file bị bỏ qua:`);
    for (const item of report.invalid) write(`  ! ${item.file}: ${item.reason}`);
  }
  write('');
  write(`Còn ${report.withoutPhoto.length} sản phẩm chưa có ảnh thật (đang hiện ảnh minh hoạ).`);
};

const main = async () => {
  const args = process.argv.slice(2);
  await connectSQL();
  if (args.includes('--list')) {
    await printList();
  } else {
    const dir = args.find((arg) => !arg.startsWith('--'));
    if (!dir) throw new Error('Cần đường dẫn thư mục ảnh, hoặc --list để xem danh sách mã sản phẩm');
    const dryRun = args.includes('--thu');
    const report = await importFolder({ dir, force: args.includes('--ghi-de'), dryRun });
    printReport(report, { dryRun });
  }
  await getPool().close();
};

main().catch((err) => {
  process.stderr.write(`Lỗi: ${err.message}\n`);
  process.exit(1);
});
