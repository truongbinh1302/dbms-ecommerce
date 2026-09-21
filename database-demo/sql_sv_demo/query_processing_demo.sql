USE ecommerce_db;
GO

SET STATISTICS TIME ON;
SET STATISTICS IO ON;

-- 1. SIMPLE QUERY
-- Truy vấn đơn giản: lấy sản phẩm theo danh mục
SELECT ProductID, Name, Price, Stock
FROM Products
WHERE CategoryID = 3
AND Price < 10000000;
GO

-- 2. JOIN QUERY
-- Lấy thông tin đơn hàng kèm tên khách hàng và sản phẩm
SELECT 
    o.OrderID,
    c.Name AS CustomerName,
    p.Name AS ProductName,
    oi.Quantity,
    oi.UnitPrice,
    o.Status
FROM Orders o
JOIN Customers c ON o.CustomerID = c.CustomerID
JOIN OrderItems oi ON o.OrderID = oi.OrderID
JOIN Products p ON oi.ProductID = p.ProductID
WHERE o.Status = N'Delivered'
ORDER BY o.OrderID;
GO

-- 3. AGGREGATE QUERY
-- Thống kê doanh thu theo danh mục sản phẩm
SELECT 
    cat.Name AS Category,
    COUNT(DISTINCT o.OrderID) AS TotalOrders,
    SUM(oi.Quantity) AS TotalQuantity,
    SUM(oi.Quantity * oi.UnitPrice) AS TotalRevenue,
    AVG(oi.UnitPrice) AS AvgPrice
FROM OrderItems oi
JOIN Products p ON oi.ProductID = p.ProductID
JOIN Categories cat ON p.CategoryID = cat.CategoryID
JOIN Orders o ON oi.OrderID = o.OrderID
GROUP BY cat.Name
ORDER BY TotalRevenue DESC;
GO

-- 4. SUBQUERY
-- Lấy sản phẩm có giá cao hơn giá trung bình của danh mục
SELECT 
    p.ProductID,
    p.Name,
    p.Price,
    cat.Name AS Category,
    (SELECT AVG(p2.Price) 
     FROM Products p2 
     WHERE p2.CategoryID = p.CategoryID) AS AvgCategoryPrice
FROM Products p
JOIN Categories cat ON p.CategoryID = cat.CategoryID
WHERE p.Price > (
    SELECT AVG(p2.Price) 
    FROM Products p2 
    WHERE p2.CategoryID = p.CategoryID
)
ORDER BY p.Price DESC;
GO

-- 5. COMPLEX QUERY
-- Top 5 khách hàng chi tiêu nhiều nhất 
-- kèm số đơn hàng và sản phẩm yêu thích
SELECT TOP 5
    c.CustomerID,
    c.Name AS CustomerName,
    COUNT(DISTINCT o.OrderID) AS TotalOrders,
    SUM(oi.Quantity * oi.UnitPrice) AS TotalSpent,
    (SELECT TOP 1 p2.Name 
     FROM OrderItems oi2
     JOIN Products p2 ON oi2.ProductID = p2.ProductID
     JOIN Orders o2 ON oi2.OrderID = o2.OrderID
     WHERE o2.CustomerID = c.CustomerID
     GROUP BY p2.Name
     ORDER BY SUM(oi2.Quantity) DESC) AS FavoriteProduct
FROM Customers c
JOIN Orders o ON c.CustomerID = o.CustomerID
JOIN OrderItems oi ON o.OrderID = oi.OrderID
GROUP BY c.CustomerID, c.Name
ORDER BY TotalSpent DESC;
GO

SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;
GO