const { getPool, sql } = require('../config/db.sql');
const { success, error } = require('../utils/response');

const getDashboard = async (req, res) => {
  try {
    const pool = getPool();

    const summary = await new sql.Request(pool).query(`
      SELECT
        (SELECT COUNT(*) FROM Users WHERE IsActive = 1) AS totalUsers,
        (SELECT COUNT(*) FROM Products WHERE IsDeleted = 0) AS totalProducts,
        (SELECT COUNT(*) FROM Orders) AS totalOrders,
        (SELECT ISNULL(SUM(Total), 0) FROM Orders WHERE Status IN ('delivered', 'completed')) AS deliveredRevenue,
        (SELECT COUNT(*) FROM Products WHERE Stock <= 5 AND IsDeleted = 0) AS lowStockProducts
    `);

    const revenueByCategory = await new sql.Request(pool).query(`
      SELECT TOP 10 c.Name AS categoryName,
             COUNT(DISTINCT o.OrderID) AS totalOrders,
             SUM(oi.Quantity) AS totalQuantity,
             SUM(oi.Quantity * oi.UnitPrice) AS totalRevenue
      FROM OrderItems oi
      JOIN Products p ON oi.ProductID = p.ProductID
      JOIN Categories c ON p.CategoryID = c.CategoryID
      JOIN Orders o ON oi.OrderID = o.OrderID
      WHERE o.Status IN ('delivered', 'completed')
      GROUP BY c.Name
      ORDER BY totalRevenue DESC
    `);

    const topProducts = await new sql.Request(pool).query(`
      SELECT TOP 10 p.ProductID AS id, p.Name AS name, p.Brand AS brand,
             SUM(oi.Quantity) AS totalQuantity,
             SUM(oi.Quantity * oi.UnitPrice) AS totalRevenue,
             (SELECT AVG(CAST(r.Rating AS FLOAT)) FROM Products r WHERE r.CategoryID = p.CategoryID) AS avgCategoryRating
      FROM OrderItems oi
      JOIN Products p ON oi.ProductID = p.ProductID
      JOIN Orders o ON oi.OrderID = o.OrderID
      WHERE o.Status IN ('delivered', 'completed')
      GROUP BY p.ProductID, p.Name, p.Brand, p.CategoryID
      ORDER BY totalQuantity DESC
    `);

    return success(res, {
      summary: summary.recordset[0],
      revenueByCategory: revenueByCategory.recordset,
      topProducts: topProducts.recordset,
    }, 'Analytics dashboard retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { getDashboard };
