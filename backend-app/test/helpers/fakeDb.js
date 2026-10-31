/*
  DB giả lập trong bộ nhớ cho unit test của order.service.
  Không kiểm tra cú pháp SQL (việc đó do test/integration chạy trên SQL Server thật),
  chỉ mô phỏng kết quả của đúng các câu lệnh mà service đang dùng, để kiểm tra
  luồng xử lý: tính tiền, voucher, hoàn kho, rollback, idempotency của VNPay.
  Câu SQL lạ sẽ ném lỗi, nên nếu service đổi câu lệnh thì test báo ngay.
*/

const path = require('path');

const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();

const createStore = () => ({
  users: [{ UserID: 1, IsActive: true }],
  products: [],
  vouchers: [],
  orders: [],
  orderItems: [],
  voucherUsages: [],
  cartItems: [],
  nextOrderId: 1,
});

const createFakeDb = () => {
  const state = { store: createStore(), queries: [] };

  const handlers = [
    [/^SELECT UserID FROM Users WHERE UserID = @userId AND IsActive = 1$/, ({ userId }, s) =>
      s.users.filter((u) => u.UserID === userId && u.IsActive)],

    [/^SELECT ProductID, Name, Price, Stock FROM Products WITH \(UPDLOCK, ROWLOCK\) WHERE ProductID = @productId AND IsDeleted = 0$/,
      ({ productId }, s) => s.products.filter((p) => p.ProductID === productId && !p.IsDeleted)],

    [/^SELECT ProductID, Name, Price, Stock FROM Products WHERE ProductID IN \(.*\) AND IsDeleted = 0$/, (inputs, s) => {
      const ids = Object.keys(inputs).filter((k) => /^id\d+$/.test(k)).map((k) => inputs[k]);
      return s.products.filter((p) => ids.includes(p.ProductID) && !p.IsDeleted);
    }],

    [/^SELECT VoucherID, .* FROM Vouchers (WITH \(UPDLOCK, ROWLOCK\) )?WHERE Code = @code$/, ({ code }, s) =>
      s.vouchers
        .filter((v) => v.Code === code)
        .map((v) => ({ ...v, IsInDateRange: v.IsInDateRange !== false }))],

    [/^INSERT INTO Orders \(/, (i, s) => {
      const order = {
        OrderID: s.nextOrderId++,
        UserID: i.userId,
        PaymentMethod: i.paymentMethod,
        Status: i.status,
        PaymentStatus: 'unpaid',
        Subtotal: i.subtotal,
        Discount: i.discount,
        ShippingFee: i.shippingFee,
        Total: i.total,
        ShippingAddress: i.shippingAddress,
        Note: i.note,
        VNPayTxnRef: null,
        CreatedAt: new Date(),
        ageMinutes: 0,
      };
      s.orders.push(order);
      return [{ OrderID: order.OrderID, CreatedAt: order.CreatedAt }];
    }],

    [/^UPDATE Orders SET OrderCode = @orderCode/, ({ orderId, orderCode }, s) => {
      s.orders.find((o) => o.OrderID === orderId).OrderCode = orderCode;
      return [];
    }],

    [/^INSERT INTO OrderItems/, (i, s) => {
      s.orderItems.push({ OrderID: i.orderId, ProductID: i.productId, Quantity: i.quantity, UnitPrice: i.unitPrice });
      return [];
    }],

    [/^UPDATE Products SET Stock = Stock - @quantity/, ({ productId, quantity }, s) => {
      const p = s.products.find((x) => x.ProductID === productId);
      if (p.Stock - quantity < 0) throw new Error('CHECK constraint CK_Products_Stock');
      p.Stock -= quantity;
      return [];
    }],

    [/^UPDATE Products SET Stock = Stock \+ @quantity/, ({ productId, quantity }, s) => {
      s.products.find((x) => x.ProductID === productId).Stock += quantity;
      return [];
    }],

    [/^UPDATE Vouchers SET UsedCount = UsedCount \+ 1 WHERE VoucherID = @voucherId$/, ({ voucherId }, s) => {
      s.vouchers.find((v) => v.VoucherID === voucherId).UsedCount += 1;
      return [];
    }],

    [/^INSERT INTO VoucherUsages/, (i, s) => {
      s.voucherUsages.push({ VoucherID: i.voucherId, UserID: i.userId, OrderID: i.orderId });
      return [];
    }],

    [/^SELECT OrderID, UserID, Status, PaymentMethod, PaymentStatus, Total, VNPayTxnRef FROM Orders WITH \(UPDLOCK, ROWLOCK\) WHERE OrderID = @orderId( AND UserID = @userId)?$/,
      ({ orderId, userId }, s) => s.orders
        .filter((o) => o.OrderID === orderId && (userId === undefined || o.UserID === userId))
        .map((o) => ({ ...o }))],

    [/^SELECT ProductID, Quantity FROM OrderItems WHERE OrderID = @orderId ORDER BY ProductID$/, ({ orderId }, s) =>
      s.orderItems.filter((it) => it.OrderID === orderId).sort((a, b) => a.ProductID - b.ProductID)],

    [/^DELETE FROM VoucherUsages OUTPUT DELETED.VoucherID WHERE OrderID = @orderId$/, ({ orderId }, s) => {
      const removed = s.voucherUsages.filter((u) => u.OrderID === orderId);
      s.voucherUsages = s.voucherUsages.filter((u) => u.OrderID !== orderId);
      return removed.map((u) => ({ VoucherID: u.VoucherID }));
    }],

    [/^UPDATE Vouchers SET UsedCount = CASE WHEN UsedCount > 0 THEN UsedCount - 1 ELSE 0 END WHERE VoucherID = @voucherId$/,
      ({ voucherId }, s) => {
        const v = s.vouchers.find((x) => x.VoucherID === voucherId);
        v.UsedCount = Math.max(0, v.UsedCount - 1);
        return [];
      }],

    [/^UPDATE Orders SET Status = 'cancelled', CancelReason = @reason, PaymentStatus = @paymentStatus, UpdatedAt = GETDATE\(\) OUTPUT INSERTED.UpdatedAt WHERE OrderID = @orderId$/,
      ({ orderId, reason, paymentStatus }, s) => {
        const o = s.orders.find((x) => x.OrderID === orderId);
        Object.assign(o, { Status: 'cancelled', CancelReason: reason, PaymentStatus: paymentStatus, UpdatedAt: new Date() });
        return [{ UpdatedAt: o.UpdatedAt }];
      }],

    [/^UPDATE Orders SET PaymentStatus = @paymentStatus, Status = @status, VNPayTxnRef = @txnRef, UpdatedAt = GETDATE\(\) WHERE OrderID = @orderId$/,
      ({ orderId, paymentStatus, status, txnRef }, s) => {
        Object.assign(s.orders.find((x) => x.OrderID === orderId), { PaymentStatus: paymentStatus, Status: status, VNPayTxnRef: txnRef });
        return [];
      }],

    [/^UPDATE Orders SET PaymentStatus = @paymentStatus, VNPayTxnRef = COALESCE\(@txnRef, VNPayTxnRef\)/,
      ({ orderId, paymentStatus, txnRef, status }, s) => {
        const o = s.orders.find((x) => x.OrderID === orderId);
        o.PaymentStatus = paymentStatus;
        if (txnRef) o.VNPayTxnRef = txnRef;
        if (status) o.Status = status;
        return [];
      }],

    [/^DELETE FROM CartItems WHERE UserID = @userId AND ProductID IN \(.*\)$/, (inputs, s) => {
      const ids = Object.keys(inputs).filter((k) => /^p\d+$/.test(k)).map((k) => inputs[k]);
      s.cartItems = s.cartItems.filter((c) => !(c.UserID === inputs.userId && ids.includes(c.ProductID)));
      return [];
    }],

    [/^DELETE FROM CartItems WHERE UserID = @userId$/, ({ userId }, s) => {
      s.cartItems = s.cartItems.filter((c) => c.UserID !== userId);
      return [];
    }],

    [/^SELECT ProductID FROM Products WHERE ProductID IN \(.*\) AND IsDeleted = 0$/, (inputs, s) => {
      const ids = Object.keys(inputs).filter((k) => /^id\d+$/.test(k)).map((k) => inputs[k]);
      return s.products.filter((p) => ids.includes(p.ProductID) && !p.IsDeleted).map((p) => ({ ProductID: p.ProductID }));
    }],

    [/^INSERT INTO CartItems \(UserID, ProductID, Quantity\) VALUES/, ({ userId, productId, quantity }, s) => {
      if (quantity < 1 || quantity > 99) throw new Error('CHECK constraint CK_CartItems_Quantity');
      s.cartItems.push({ UserID: userId, ProductID: productId, Quantity: quantity, UpdatedAt: new Date() });
      return [];
    }],

    [/^SELECT ci.ProductID AS id, ci.Quantity AS cartQuantity, .* FROM CartItems ci JOIN Products p ON p.ProductID = ci.ProductID LEFT JOIN Categories c ON c.CategoryID = p.CategoryID WHERE ci.UserID = @userId AND p.IsDeleted = 0 ORDER BY ci.UpdatedAt DESC, ci.ProductID$/,
      ({ userId }, s) => s.cartItems
        .filter((c) => c.UserID === userId)
        .map((c) => ({ c, p: s.products.find((p) => p.ProductID === c.ProductID) }))
        .filter(({ p }) => p && !p.IsDeleted)
        .map(({ c, p }) => ({ ...p, id: p.ProductID, cartQuantity: c.Quantity, cartUpdatedAt: c.UpdatedAt }))],

    [/^SELECT OrderID FROM Orders WHERE Status = 'pending_payment' AND PaymentStatus NOT IN \('paid', 'refund_required'\) AND CreatedAt < DATEADD\(MINUTE, -@minutes, SYSDATETIME\(\)\)$/,
      ({ minutes }, s) => s.orders
        .filter((o) => o.Status === 'pending_payment' && !['paid', 'refund_required'].includes(o.PaymentStatus) && o.ageMinutes > minutes)
        .map((o) => ({ OrderID: o.OrderID }))],

    [/^SELECT OrderID, Status, PaymentMethod, PaymentStatus, Total, DATEDIFF\(SECOND, SYSDATETIME\(\), DATEADD\(MINUTE, @minutes, CreatedAt\)\) AS SecondsLeft FROM Orders WHERE OrderID = @orderId AND UserID = @userId$/,
      ({ orderId, userId, minutes }, s) => s.orders
        .filter((o) => o.OrderID === orderId && o.UserID === userId)
        .map((o) => ({ ...o, SecondsLeft: (minutes - o.ageMinutes) * 60 }))],
  ];

  const run = (text, inputs) => {
    const sqlText = normalize(text);
    state.queries.push(sqlText);
    const match = handlers.find(([pattern]) => pattern.test(sqlText));
    if (!match) {
      throw new Error(`fakeDb: unhandled SQL: ${sqlText}`);
    }
    return { recordset: match[1](inputs, state.store) };
  };

  class Transaction {
    constructor() {
      this.snapshot = null;
      this.done = false;
    }

    async begin() {
      this.snapshot = structuredClone(state.store);
    }

    async commit() {
      this.done = true;
    }

    async rollback() {
      if (this.done) throw new Error('Transaction already finished');
      state.store = this.snapshot;
      this.done = true;
    }
  }

  class Request {
    constructor() {
      this.inputs = {};
    }

    input(name, type, value) {
      this.inputs[name] = value;
      return this;
    }

    async query(text) {
      return run(text, this.inputs);
    }
  }

  const type = (name) => Object.assign((...args) => ({ name, args }), { typeName: name });

  const sql = {
    Transaction,
    Request,
    Int: type('Int'),
    NVarChar: type('NVarChar'),
    Decimal: type('Decimal'),
    DateTime2: type('DateTime2'),
    ISOLATION_LEVEL: { READ_COMMITTED: 'READ_COMMITTED' },
  };

  return {
    state,
    module: { sql, getPool: () => ({}), connectSQL: async () => ({}) },
  };
};

const SERVICES_USING_DB = ['order.service', 'voucher.service', 'pricing.service', 'cart.service'];

/**
 * Nạp các service với DB giả: thay module config/db.sql trong require.cache.
 * Mỗi lần gọi trả về bản service mới gắn với một DB giả mới.
 */
const loadServicesWithFakeDb = (names) => {
  const fake = createFakeDb();
  const src = path.join(__dirname, '..', '..', 'src');
  const dbPath = require.resolve(path.join(src, 'config', 'db.sql'));
  const servicePaths = SERVICES_USING_DB.map((name) => require.resolve(path.join(src, 'services', name)));

  servicePaths.forEach((p) => delete require.cache[p]);
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fake.module };

  const services = Object.fromEntries(names.map((name) => [name, require(path.join(src, 'services', name))]));

  delete require.cache[dbPath];
  servicePaths.forEach((p) => delete require.cache[p]);

  return { services, db: fake.state };
};

const loadOrderServiceWithFakeDb = () => {
  const { services, db } = loadServicesWithFakeDb(['order.service', 'cart.service']);
  return { orderService: services['order.service'], cartService: services['cart.service'], db };
};

module.exports = { loadOrderServiceWithFakeDb, loadServicesWithFakeDb };
