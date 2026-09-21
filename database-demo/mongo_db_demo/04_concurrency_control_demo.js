/*
  Topic 4 - MongoDB concurrency control demo.
  Demonstrates atomic conditional update to prevent overselling.
  Run with: mongosh ecommerce_mongo 04_concurrency_control_demo.js
*/

use('ecommerce_mongo');

db.products.updateOne({ productId: 1 }, { $set: { stock: 1 } });
printjson({ before: db.products.findOne({ productId: 1 }, { productId: 1, name: 1, stock: 1 }) });

function buyOne(label) {
  const result = db.products.updateOne(
    { productId: 1, stock: { $gte: 1 } },
    { $inc: { stock: -1 }, $set: { updatedAt: new Date() } }
  );
  printjson({ label, matched: result.matchedCount, modified: result.modifiedCount });
}

buyOne('Request A');
buyOne('Request B');

printjson({ after: db.products.findOne({ productId: 1 }, { productId: 1, name: 1, stock: 1 }) });
print('Expected: only one request modifies the document; the second request is rejected because stock is no longer >= 1.');
