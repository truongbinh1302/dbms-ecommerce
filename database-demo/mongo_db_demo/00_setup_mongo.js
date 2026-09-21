/*
  BinhTinhStore MongoDB dataset for DBMS assignment.
  Run with: mongosh ecommerce_mongo 00_setup_mongo.js
*/

use('ecommerce_mongo');

db.products.drop();
db.customers.drop();
db.orders.drop();
db.orderitems.drop();
db.reviews.drop();
db.product_logs.drop();

const categories = [
  'PC Gaming', 'Gaming Laptops', 'Office Laptops', 'Monitors', 'Keyboards',
  'Mice', 'Headsets', 'Components', 'Storage', 'Networking', 'Cameras',
  'Printers', 'Chairs', 'Smart Devices', 'Accessories'
];
const brands = ['ASUS', 'Lenovo', 'Dell', 'Logitech', 'Samsung', 'MSI', 'HP', 'BinhTinh'];

const products = [];
for (let i = 1; i <= 50000; i += 1) {
  products.push({
    productId: i,
    name: i === 1 ? 'BT RTX 5070 Gaming PC' : `Demo Product ${i}`,
    slug: i === 1 ? 'bt-rtx-5070-gaming-pc' : `demo-product-${i}`,
    category: categories[(i - 1) % categories.length],
    brand: brands[i % brands.length],
    price: (Math.floor(Math.random() * 50000) + 500) * 1000,
    stock: i === 1 ? 1 : Math.floor(Math.random() * 500) + 1,
    specs: ['Generated', 'DBMS demo', 'Index test'],
    rating: Math.round((3 + Math.random() * 2) * 10) / 10,
    reviewsCount: Math.floor(Math.random() * 250),
    createdAt: new Date(),
  });
}
db.products.insertMany(products, { ordered: false });

const customers = [];
for (let i = 1; i <= 1000; i += 1) {
  customers.push({ customerId: i, name: `Customer ${i}`, email: `customer${i}@btstore.local` });
}
db.customers.insertMany(customers, { ordered: false });

const orders = [];
const orderitems = [];
for (let i = 1; i <= 5000; i += 1) {
  const status = ['pending', 'confirmed', 'delivered', 'shipped'][i % 4];
  orders.push({ orderId: i, customerId: (i % 1000) + 1, status, createdAt: new Date() });
  for (let line = 1; line <= 3; line += 1) {
    const productId = ((i * 7 + line * 13) % 50000) + 1;
    const quantity = ((i + line) % 3) + 1;
    const product = products[productId - 1];
    orderitems.push({ orderItemId: (i - 1) * 3 + line, orderId: i, productId, quantity, unitPrice: product.price });
  }
}
db.orders.insertMany(orders, { ordered: false });
db.orderitems.insertMany(orderitems, { ordered: false });

db.reviews.insertMany([
  { productId: 1, userId: 2, rating: 5, title: 'Build PC rat on', content: 'San pham dung nhu cau gaming va demo review tren MongoDB.', helpful_count: 3, createdAt: new Date(), updatedAt: new Date() },
  { productId: 3, userId: 5, rating: 4, title: 'Man hinh dep', content: 'Laptop co man hinh OLED dep, phu hop cho demo document database.', helpful_count: 1, createdAt: new Date(), updatedAt: new Date() },
]);

db.products.createIndex({ category: 1 });
db.products.createIndex({ price: 1 });
db.products.createIndex({ category: 1, price: 1 });
db.products.createIndex({ category: 1, price: -1 });
db.customers.createIndex({ customerId: 1 }, { unique: true });
db.orders.createIndex({ orderId: 1 }, { unique: true });
db.orders.createIndex({ customerId: 1, status: 1 });
db.orderitems.createIndex({ orderId: 1 });
db.orderitems.createIndex({ productId: 1 });
db.reviews.createIndex({ productId: 1, userId: 1 }, { unique: true });
db.reviews.createIndex({ productId: 1, rating: 1, createdAt: -1 });
db.product_logs.createIndex({ productId: 1, createdAt: -1 });

printjson({
  products: db.products.countDocuments(),
  customers: db.customers.countDocuments(),
  orders: db.orders.countDocuments(),
  orderitems: db.orderitems.countDocuments(),
  reviews: db.reviews.countDocuments(),
});
