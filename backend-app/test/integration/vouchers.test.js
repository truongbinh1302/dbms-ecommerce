/*
  Test tích hợp: admin tạo, xem, tắt mã giảm giá trên SQL Server thật.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const voucherService = require('../../src/services/voucher.service');
const pricing = require('../../src/services/pricing.service');

const tag = `VT${Date.now().toString(36).toUpperCase()}`;
const hours = (n) => new Date(Date.now() + n * 3600000).toISOString();

test.before(async () => {
  await connectSQL();
});

test.after(async () => {
  await new sql.Request(getPool())
    .input('like', sql.NVarChar, `${tag}%`)
    .query('DELETE FROM Vouchers WHERE Code LIKE @like');
  await getPool().close();
});

test('tạo mã có thời hạn: giờ admin nhập được đổi đúng sang giờ máy chủ, áp dụng được ngay', async () => {
  const created = await voucherService.createVoucher(getPool(), {
    code: `${tag}-NOW`, discountType: 'percent', discountValue: 10, maxDiscount: 300000, minOrderAmount: 1000000, usageLimit: 5,
    startDate: hours(-1), endDate: hours(2),
  });
  assert.equal(created.state, 'active');
  assert.equal(created.code, `${tag}-NOW`);
  assert.ok(Math.abs(new Date(created.startsAt) - new Date(hours(-1))) < 60000, 'mốc bắt đầu giữ đúng thời điểm');

  const voucher = await voucherService.findVoucherByCode(getPool(), `${tag.toLowerCase()}-now`);
  assert.equal(pricing.checkVoucher(voucher, 2000000), null);
  assert.equal(pricing.calcVoucherDiscount(voucher, 5000000), 300000, 'giảm 10% nhưng tối đa 300.000đ');

  await assert.rejects(
    voucherService.createVoucher(getPool(), { code: `${tag}-now`, discountType: 'amount', discountValue: 10000 }),
    (err) => err.status === 409 && err.data.code === 'voucher_exists',
  );
});

test('trạng thái mã: sắp chạy, hết hạn, hết lượt, đã tắt', async () => {
  const scheduled = await voucherService.createVoucher(getPool(), { code: `${tag}-SOON`, discountType: 'amount', discountValue: 20000, startDate: hours(3) });
  assert.equal(scheduled.state, 'scheduled');
  const soonVoucher = await voucherService.findVoucherByCode(getPool(), `${tag}-SOON`);
  assert.equal(pricing.checkVoucher(soonVoucher, 1000000).code, 'voucher_out_of_date');

  const expired = await voucherService.createVoucher(getPool(), { code: `${tag}-OLD`, discountType: 'amount', discountValue: 20000, startDate: hours(-48), endDate: hours(-24) });
  assert.equal(expired.state, 'expired');

  const usedUp = await voucherService.createVoucher(getPool(), { code: `${tag}-ONE`, discountType: 'amount', discountValue: 20000, usageLimit: 1 });
  await new sql.Request(getPool()).input('id', sql.Int, usedUp.id).query('UPDATE Vouchers SET UsedCount = 1 WHERE VoucherID = @id');

  const disabled = await voucherService.setVoucherActive(getPool(), scheduled.id, false);
  assert.deepEqual([disabled.isActive, disabled.state], [false, 'disabled']);
  assert.equal(pricing.checkVoucher(await voucherService.findVoucherByCode(getPool(), `${tag}-SOON`), 1000000).code, 'voucher_inactive');
  assert.equal((await voucherService.setVoucherActive(getPool(), scheduled.id, true)).state, 'scheduled');

  const all = (await voucherService.listAdminVouchers(getPool())).filter((item) => item.code.startsWith(tag));
  assert.deepEqual(
    Object.fromEntries(all.map((item) => [item.code.slice(tag.length + 1), item.state])),
    { NOW: 'active', SOON: 'scheduled', OLD: 'expired', ONE: 'used_up' },
  );
  const onlyExpired = await voucherService.listAdminVouchers(getPool(), { state: 'expired' });
  assert.ok(onlyExpired.every((item) => item.state === 'expired') && onlyExpired.some((item) => item.code === `${tag}-OLD`));
  await assert.rejects(voucherService.listAdminVouchers(getPool(), { state: 'lost' }), (err) => err.status === 400);
  await assert.rejects(voucherService.setVoucherActive(getPool(), 0, false), (err) => err.status === 404);
  await assert.rejects(voucherService.setVoucherActive(getPool(), scheduled.id, 'no'), (err) => err.status === 400);
});
