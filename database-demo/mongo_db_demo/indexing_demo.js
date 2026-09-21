
// 1. SINGLE FIELD INDEX
// TRƯỚC khi có index
db.products.find(
    { category: "Laptop" },
    { name: 1, price: 1 }
).explain("executionStats")
// Ghi lại: executionTimeMillis, totalDocsExamined, stage

// Tạo index
db.products.createIndex({ category: 1 })

// SAU khi có index
db.products.find(
    { category: "Laptop" },
    { name: 1, price: 1 }
).explain("executionStats")
// So sánh: executionTimeMillis, totalDocsExamined, stage

// 2. RANGE INDEX
// TRƯỚC
db.products.find(
    { price: { $gte: 5000000, $lte: 20000000 } },
    { name: 1, price: 1 }
).explain("executionStats")

// Tạo index
db.products.createIndex({ price: 1 })

// SAU
db.products.find(
    { price: { $gte: 5000000, $lte: 20000000 } },
    { name: 1, price: 1 }
).explain("executionStats")

// 3. COMPOSITE INDEX
// TRƯỚC
db.products.find(
    { category: "Gaming", price: { $lt: 10000000 } },
    { name: 1, price: 1 }
).explain("executionStats")

// Tạo index
db.products.createIndex({ category: 1, price: 1 })

// SAU
db.products.find(
    { category: "Gaming", price: { $lt: 10000000 } },
    { name: 1, price: 1 }
).explain("executionStats")

// 4. SORTING INDEX
// TRƯỚC
db.products.find(
    { category: "Camera" },
    { name: 1, price: 1 }
).sort({ price: -1 }).explain("executionStats")

// Tạo index (hỗ trợ sort)
db.products.createIndex({ category: 1, price: -1 })

// SAU
db.products.find(
    { category: "Camera" },
    { name: 1, price: 1 }
).sort({ price: -1 }).explain("executionStats")
