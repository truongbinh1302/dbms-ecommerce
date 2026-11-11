const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReturnPayload, validateAdminUpdate } = require('../../src/services/return.service');
const { normalizeShipment } = require('../../src/services/order.service');

const base = {
  kind: 'refund',
  reason: 'defective',
  description: '  Card   không lên hình   sau 2 ngày dùng ',
  items: [{ productId: 7, quantity: 1 }],
};

test('đổi trả: chuẩn hoá yêu cầu, gộp dòng trùng sản phẩm', () => {
  const result = validateReturnPayload({
    ...base,
    items: [{ productId: 9, quantity: 1 }, { productId: 7, quantity: 1 }, { productId: 9, quantity: 2 }],
  });
  assert.equal(result.description, 'Card không lên hình sau 2 ngày dùng');
  assert.deepEqual(result.items, [{ productId: 7, quantity: 1 }, { productId: 9, quantity: 3 }]);
});

test('đổi trả: từ chối yêu cầu thiếu hoặc sai', () => {
  assert.throws(() => validateReturnPayload({ ...base, kind: 'repair' }), /đổi sản phẩm mới hoặc trả hàng/);
  assert.throws(() => validateReturnPayload({ ...base, reason: 'changed_mind' }), /Lý do/);
  assert.throws(() => validateReturnPayload({ ...base, description: 'hỏng' }), /ít nhất 10 ký tự/);
  assert.throws(() => validateReturnPayload({ ...base, items: [] }), /ít nhất một sản phẩm/);
  assert.throws(() => validateReturnPayload({ ...base, items: [{ productId: 7, quantity: 0 }] }), /Số lượng/);
  assert.throws(() => validateReturnPayload({ ...base, items: [{ productId: 7, quantity: 1.5 }] }), /Số lượng/);
  assert.throws(() => validateReturnPayload({ ...base, items: [{ productId: 'abc', quantity: 1 }] }), /Sản phẩm/);
});

test('đổi trả: admin chỉ đi đúng các bước', () => {
  assert.equal(validateAdminUpdate('pending', { status: 'approved' }).status, 'approved');
  assert.equal(validateAdminUpdate('approved', { status: 'received', restock: true }).restock, true);
  assert.equal(validateAdminUpdate('received', { status: 'completed', refundAmount: '1500000' }).refundAmount, 1500000);
  for (const [from, to] of [['pending', 'completed'], ['pending', 'received'], ['received', 'rejected'], ['completed', 'approved'], ['cancelled', 'approved']]) {
    assert.throws(() => validateAdminUpdate(from, { status: to }), (err) => err.status === 422 && err.data.code === 'invalid_transition', `${from} → ${to}`);
  }
  assert.throws(() => validateAdminUpdate('pending', { status: 'rejected' }), /lý do từ chối/);
  assert.equal(validateAdminUpdate('pending', { status: 'rejected', adminNote: 'Tem bảo hành bị rách' }).adminNote, 'Tem bảo hành bị rách');
  assert.throws(() => validateAdminUpdate('received', { status: 'completed', refundAmount: -1 }), /Số tiền hoàn/);
  assert.throws(() => validateAdminUpdate('pending', { status: 'done' }), /Trạng thái không hợp lệ/);
});

test('giao vận: kiểm tra đơn vị vận chuyển và mã vận đơn', () => {
  assert.deepEqual(normalizeShipment({ carrier: '  Giao Hàng   Nhanh ', trackingCode: ' GHN-8812.33 ' }), { carrier: 'Giao Hàng Nhanh', trackingCode: 'GHN-8812.33' });
  assert.deepEqual(normalizeShipment({}), { carrier: null, trackingCode: null });
  assert.deepEqual(normalizeShipment({ carrier: 'Cửa hàng tự giao' }), { carrier: 'Cửa hàng tự giao', trackingCode: null });
  assert.throws(() => normalizeShipment({ trackingCode: 'ABC123' }), /đơn vị vận chuyển/);
  assert.throws(() => normalizeShipment({ carrier: 'GHTK', trackingCode: 'mã có dấu cách' }), /Mã vận đơn/);
  assert.throws(() => normalizeShipment({ carrier: 'GHTK', trackingCode: '<script>' }), /Mã vận đơn/);
  assert.throws(() => normalizeShipment({ carrier: 'x'.repeat(51) }), /tối đa 50/);
});
