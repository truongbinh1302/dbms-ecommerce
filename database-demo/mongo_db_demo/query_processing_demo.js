use ecommerce_mongo

// 1. SIMPLE QUERY
db.products.find(
    { category: "Camera", price: { $lt: 10000000 } },
    { name: 1, price: 1, stock: 1 }
).explain("executionStats")

// 2. JOIN QUERY ($lookup)
db.orders.aggregate([
    { $match: { status: "Delivered" } },
    { $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "customerId",
        as: "customer"
    }},
    { $lookup: {
        from: "orderitems",
        localField: "orderId",
        foreignField: "orderId",
        as: "items"
    }},
    { $unwind: "$customer" },
    { $unwind: "$items" },
    { $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "productId",
        as: "product"
    }},
    { $unwind: "$product" },
    { $project: {
        orderId: 1,
        customerName: "$customer.name",
        productName: "$product.name",
        quantity: "$items.quantity",
        unitPrice: "$items.unitPrice",
        status: 1
    }}
]).explain("executionStats")

// 3. AGGREGATE QUERY
db.orderitems.aggregate([
    { $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "productId",
        as: "product"
    }},
    { $unwind: "$product" },
    { $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "orderId",
        as: "order"
    }},
    { $unwind: "$order" },
    { $group: {
        _id: "$product.category",
        totalOrders: { $addToSet: "$orderId" },
        totalQuantity: { $sum: "$quantity" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$unitPrice"] } },
        avgPrice: { $avg: "$unitPrice" }
    }},
    { $project: {
        category: "$_id",
        totalOrders: { $size: "$totalOrders" },
        totalQuantity: 1,
        totalRevenue: 1,
        avgPrice: { $round: ["$avgPrice", 0] }
    }},
    { $sort: { totalRevenue: -1 } }
]).explain("executionStats")


// 4. SUBQUERY ($expr + $lookup với pipeline)
db.products.aggregate([
    { $lookup: {
        from: "products",
        let: { catId: "$category" },
        pipeline: [
            { $match: { $expr: { $eq: ["$category", "$$catId"] } } },
            { $group: { _id: null, avgPrice: { $avg: "$price" } } }
        ],
        as: "categoryStats"
    }},
    { $unwind: "$categoryStats" },
    { $match: {
        $expr: { $gt: ["$price", "$categoryStats.avgPrice"] }
    }},
    { $project: {
        name: 1,
        price: 1,
        category: 1,
        avgCategoryPrice: { $round: ["$categoryStats.avgPrice", 0] }
    }},
    { $sort: { price: -1 } }
]).explain("executionStats")

// 5. COMPLEX QUERY
db.orders.aggregate([
    { $lookup: {
        from: "orderitems",
        localField: "orderId",
        foreignField: "orderId",
        as: "items"
    }},
    { $unwind: "$items" },
    { $group: {
        _id: "$customerId",
        totalOrders: { $addToSet: "$orderId" },
        totalSpent: { $sum: { $multiply: ["$items.quantity", "$items.unitPrice"] } }
    }},
    { $project: {
        customerId: "$_id",
        totalOrders: { $size: "$totalOrders" },
        totalSpent: 1
    }},
    { $sort: { totalSpent: -1 } },
    { $limit: 5 },
    { $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "customerId",
        as: "customer"
    }},
    { $unwind: "$customer" },
    { $project: {
        customerName: "$customer.name",
        totalOrders: 1,
        totalSpent: 1
    }}
]).explain("executionStats")

//Tạo Index 
db.orders.createIndex({ customerId: 1 })
db.orders.createIndex({ orderId: 1 })
db.orderitems.createIndex({ orderId: 1 })
db.orderitems.createIndex({ productId: 1 })
db.products.createIndex({ productId: 1 })
db.customers.createIndex({ customerId: 1 })