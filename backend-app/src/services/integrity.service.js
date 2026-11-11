const { getPool, sql } = require('../config/db.sql');

/*
  Kiểm tra toàn vẹn dữ liệu (chỉ đọc) cho admin: các bất biến mà code luôn giữ trong transaction.
  Nếu một dòng sai thì có ai đó đã sửa thẳng trong DB, hoặc có lỗi cần tìm. Mỗi kiểm tra trả số dòng sai
  và tối đa SAMPLE dòng mới nhất để xem.
*/

const SAMPLE = 20;

const CHECKS = [
  {
    key: 'stock_ledger',
    label: 'Tồn kho khớp sổ kho',
    rule: 'Products.Stock = tổng StockMovements.Change của sản phẩm',
    sql: `
      SELECT p.ProductID AS id, p.Name AS name, p.Stock AS stock, ISNULL(m.Total, 0) AS ledger
      FROM Products p
      OUTER APPLY (SELECT SUM(sm.Change) AS Total FROM StockMovements sm WHERE sm.ProductID = p.ProductID) m
      WHERE p.Stock <> ISNULL(m.Total, 0)`,
    order: 'id DESC',
  },
  {
    key: 'order_total',
    label: 'Tổng tiền đơn đúng công thức',
    rule: 'Total = Subtotal − Discount + ShippingFee',
    sql: `
      SELECT o.OrderID AS id, o.OrderCode AS code, o.Subtotal AS subtotal, o.Discount AS discount,
             o.ShippingFee AS shippingFee, o.Total AS total
      FROM Orders o
      WHERE ABS(o.Total - (o.Subtotal - o.Discount + o.ShippingFee)) >= 1`,
    order: 'id DESC',
  },
  {
    key: 'order_lines',
    label: 'Tạm tính khớp các dòng sản phẩm',
    rule: 'Subtotal = tổng Quantity × UnitPrice của đơn',
    sql: `
      SELECT o.OrderID AS id, o.OrderCode AS code, o.Subtotal AS subtotal, ISNULL(l.Total, 0) AS lineTotal
      FROM Orders o
      OUTER APPLY (SELECT SUM(oi.Quantity * oi.UnitPrice) AS Total FROM OrderItems oi WHERE oi.OrderID = o.OrderID) l
      WHERE ABS(o.Subtotal - ISNULL(l.Total, 0)) >= 1`,
    order: 'id DESC',
  },
  {
    key: 'voucher_usage',
    label: 'Lượt dùng mã giảm giá khớp số đơn',
    rule: 'Vouchers.UsedCount = số dòng VoucherUsages của mã',
    sql: `
      SELECT v.VoucherID AS id, v.Code AS code, v.UsedCount AS usedCount, ISNULL(u.Total, 0) AS usages
      FROM Vouchers v
      OUTER APPLY (SELECT COUNT(*) AS Total FROM VoucherUsages vu WHERE vu.VoucherID = v.VoucherID) u
      WHERE v.UsedCount <> ISNULL(u.Total, 0)`,
    order: 'id DESC',
  },
  {
    key: 'status_history',
    label: 'Lịch sử trạng thái khớp đơn',
    rule: 'Trạng thái cuối trong OrderStatusHistory = Orders.Status',
    sql: `
      SELECT o.OrderID AS id, o.OrderCode AS code, o.Status AS status, h.ToStatus AS lastHistory
      FROM Orders o
      OUTER APPLY (SELECT TOP 1 ToStatus FROM OrderStatusHistory WHERE OrderID = o.OrderID ORDER BY HistoryID DESC) h
      WHERE h.ToStatus IS NULL OR h.ToStatus <> o.Status`,
    order: 'id DESC',
  },
];

/** Chạy mọi kiểm tra trong một lần đọc (snapshot nhất quán theo từng câu). */
const runChecks = async () => {
  const startedAt = Date.now();
  const batch = CHECKS.map((check) => `
    SELECT COUNT(*) AS Problems FROM (${check.sql}) x;
    SELECT TOP (${SAMPLE}) * FROM (${check.sql}) x ORDER BY ${check.order};`).join('\n');
  const result = await new sql.Request(getPool()).query(batch);
  const checks = CHECKS.map((check, index) => {
    const problems = Number(result.recordsets[index * 2][0].Problems);
    return {
      key: check.key,
      label: check.label,
      rule: check.rule,
      ok: problems === 0,
      problems,
      sample: result.recordsets[index * 2 + 1],
    };
  });
  return {
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    ok: checks.every((check) => check.ok),
    checks,
  };
};

module.exports = { CHECKS, runChecks };
