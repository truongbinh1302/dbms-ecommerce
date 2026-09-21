/*
  Topic 3 - MongoDB transaction demo.
  Transactions require MongoDB replica set or sharded cluster.
  Run with: mongosh ecommerce_mongo 03_transaction_demo.js
*/

use('ecommerce_mongo');

const session = db.getMongo().startSession();
const sessionDb = session.getDatabase('ecommerce_mongo');

try {
  session.startTransaction();

  const product = sessionDb.products.findOne({ productId: 1 });
  if (!product || product.stock < 1) {
    throw new Error('Insufficient stock - transaction will abort');
  }

  const orderId = Number(new Date().getTime());
  sessionDb.orders.insertOne({
    orderId,
    customerId: 2,
    status: 'pending',
    paymentMethod: 'cod',
    createdAt: new Date(),
  });
  sessionDb.orderitems.insertOne({
    orderId,
    productId: 1,
    quantity: 1,
    unitPrice: product.price,
  });
  sessionDb.products.updateOne({ productId: 1 }, { $inc: { stock: -1 } });

  session.commitTransaction();
  printjson({ result: 'COMMIT success', orderId, stockAfter: db.products.findOne({ productId: 1 }).stock });
} catch (err) {
  session.abortTransaction();
  printjson({ result: 'ROLLBACK/ABORT success', message: err.message });
} finally {
  session.endSession();
}
