const test = require('node:test');
const assert = require('node:assert/strict');
const address = require('../../src/services/address.service');
const { foldText, buildSearchText, tokenizeQuery } = require('../../src/utils/searchText');
const { loadServicesWithFakeDb } = require('../helpers/fakeDb');

test('có đúng 34 tỉnh/thành, không trùng', () => {
  assert.equal(address.PROVINCES.length, 34);
  assert.equal(new Set(address.PROVINCES).size, 34);
});

test('tìm tỉnh không phân biệt dấu, hoa thường, tiền tố', () => {
  assert.equal(address.findProvince('Thành phố Hồ Chí Minh'), 'TP. Hồ Chí Minh');
  assert.equal(address.findProvince('ho chi minh'), 'TP. Hồ Chí Minh');
  assert.equal(address.findProvince('Tỉnh Khánh Hoà'), 'Khánh Hòa');
  assert.equal(address.findProvince('Bến Tre'), null); // đã nhập vào Vĩnh Long từ 01/7/2025
});

test('chuẩn hoá số điện thoại Việt Nam', () => {
  assert.equal(address.normalizePhone('090 123 4567'), '0901234567');
  assert.equal(address.normalizePhone('+84901234567'), '0901234567');
  assert.equal(address.normalizePhone('84-90-123-4567'), '0901234567');
  assert.equal(address.normalizePhone('090123456'), null);
  assert.equal(address.normalizePhone('abc'), null);
});

test('đọc địa chỉ đã lưu: JSON thì parse, chữ cũ thì null', () => {
  assert.deepEqual(address.parseStoredAddress('{"province":"Huế"}'), { province: 'Huế' });
  assert.equal(address.parseStoredAddress('Ho Chi Minh City'), null);
  assert.equal(address.parseStoredAddress(null), null);
});

test('bỏ dấu tiếng Việt, kể cả chữ đ', () => {
  assert.equal(foldText('Điện thoại ĐẸP – Màn hình 27"'), 'dien thoai dep man hinh 27');
  assert.deepEqual(tokenizeQuery('  Màn HÌNH   màn hình 240Hz '), ['man', 'hinh', '240hz']);
});

test('SearchText có thêm từ khoá tiếng Việt theo danh mục', () => {
  const text = buildSearchText({
    name: 'Odyssey 27 240Hz',
    brand: 'Samsung',
    specs: ['27 inch', 'QHD'],
    categorySlug: 'monitors',
    categoryName: 'Monitors',
  });
  assert.equal(text, 'odyssey 27 240hz samsung 27 inch qhd monitors man hinh');
  for (const token of tokenizeQuery('màn hình samsung 240hz')) {
    assert.ok(text.includes(token), token);
  }
});

const setupCart = () => {
  const { services, db } = loadServicesWithFakeDb(['cart.service']);
  db.store.users.push({ UserID: 2, IsActive: true });
  db.store.products.push(
    { ProductID: 10, Name: 'Chuột', Price: 1000000, Stock: 5, IsDeleted: false },
    { ProductID: 11, Name: 'Hàng đã ẩn', Price: 500000, Stock: 5, IsDeleted: true },
  );
  return { cartService: services['cart.service'], db };
};

test('giỏ server: gộp dòng trùng, bỏ sản phẩm đã ẩn, giới hạn 99', async () => {
  const { cartService, db } = setupCart();
  const cart = await cartService.replaceCart(1, [
    { productId: 10, quantity: 60 },
    { productId: 10, quantity: 60 },
    { productId: 11, quantity: 1 },
    { productId: 999, quantity: 1 },
  ]);
  assert.deepEqual(cart.items.map((i) => [i.productId, i.quantity]), [[10, 99]]);
  assert.equal(cart.items[0].product.name, 'Chuột');
  assert.equal(db.store.cartItems.length, 1);
});

test('giỏ server: thay toàn bộ giỏ, mỗi user một giỏ riêng', async () => {
  const { cartService, db } = setupCart();
  await cartService.replaceCart(1, [{ productId: 10, quantity: 1 }]);
  await cartService.replaceCart(2, [{ productId: 10, quantity: 3 }]);
  await cartService.replaceCart(1, []);

  assert.deepEqual((await cartService.getCart(1)).items, []);
  assert.equal((await cartService.getCart(2)).items[0].quantity, 3);
  assert.equal(db.store.cartItems.length, 1);
});

test('giỏ server: dữ liệu sai định dạng trả 400', async () => {
  const { cartService } = setupCart();
  await assert.rejects(cartService.replaceCart(1, 'abc'), (err) => err.status === 400);
  await assert.rejects(cartService.replaceCart(1, [{ productId: 10, quantity: 0 }]), (err) => err.status === 400);
});
