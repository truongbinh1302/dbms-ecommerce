USE ecommerce_db;
GO

-- Xóa hết index cũ để demo từ đầu
DROP INDEX IF EXISTS IX_Products_CategoryID ON Products;
DROP INDEX IF EXISTS IX_Products_Price ON Products;
DROP INDEX IF EXISTS IX_Products_Category_Price ON Products;
DROP INDEX IF EXISTS IX_Products_Category_Price_Cover ON Products;
GO

-- 1. SINGLE FIELD INDEX
-- TRƯỚC
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price FROM Products WHERE CategoryID = 3;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

-- KHỞI TẠO INDEX
CREATE INDEX IX_Products_CategoryID ON Products(CategoryID) INCLUDE (Name, Price);
GO

-- SAU
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price 
FROM Products WITH (INDEX(IX_Products_CategoryID))
WHERE CategoryID = 3;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

-- 2. RANGE INDEX
-- TRƯỚC
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price FROM Products 
WHERE Price BETWEEN 5000000 AND 20000000;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

-- Tạo range Index
CREATE INDEX IX_Products_Price ON Products(Price) INCLUDE(Name);
GO

-- SAU
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price 
FROM Products WITH (INDEX(IX_Products_Price))
WHERE Price BETWEEN 5000000 AND 20000000;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

-- 3. COMPOSITE INDEX
-- TRƯỚC
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price FROM Products 
WHERE CategoryID = 2 AND Price < 10000000;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

-- Khởi tạo composite index
CREATE INDEX IX_Products_Category_Price 
ON Products(CategoryID, Price) INCLUDE(Name);
GO

-- SAU
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price 
FROM Products WITH (INDEX(IX_Products_Category_Price))
WHERE CategoryID = 2 AND Price < 10000000;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

-- 4. SORTING INDEX
-- TRƯỚC
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price FROM Products 
WHERE CategoryID = 1
ORDER BY Price DESC;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO

CREATE INDEX IX_Products_Category_Price_Desc 
ON Products(CategoryID ASC, Price DESC) INCLUDE(Name);
GO

-- SAU
SET STATISTICS TIME ON; SET STATISTICS IO ON;
SELECT ProductID, Name, Price 
FROM Products WITH (INDEX(IX_Products_Category_Price_Desc))
WHERE CategoryID = 1
ORDER BY Price DESC;
SET STATISTICS TIME OFF; SET STATISTICS IO OFF;
GO


USE ecommerce_db;
GO

-- Bảng khách hàng
CREATE TABLE Customers (
    CustomerID  INT PRIMARY KEY IDENTITY,
    Name        NVARCHAR(200) NOT NULL,
    Email       NVARCHAR(200),
    Phone       NVARCHAR(20),
    CreatedAt   DATETIME DEFAULT GETDATE()
);

-- Bảng đơn hàng
CREATE TABLE Orders (
    OrderID     INT PRIMARY KEY IDENTITY,
    CustomerID  INT REFERENCES Customers(CustomerID),
    OrderDate   DATETIME DEFAULT GETDATE(),
    Status      NVARCHAR(50) DEFAULT N'Pending',
    TotalAmount DECIMAL(15,0)
);

-- Bảng chi tiết đơn hàng
CREATE TABLE OrderItems (
    OrderItemID INT PRIMARY KEY IDENTITY,
    OrderID     INT REFERENCES Orders(OrderID),
    ProductID   INT REFERENCES Products(ProductID),
    Quantity    INT NOT NULL,
    UnitPrice   DECIMAL(15,0) NOT NULL
);
GO

-- Insert 1000 khách hàng
DECLARE @i INT = 1;
WHILE @i <= 1000
BEGIN
    INSERT INTO Customers (Name, Email, Phone)
    VALUES (
        N'Khách hàng ' + CAST(@i AS NVARCHAR),
        'customer' + CAST(@i AS NVARCHAR) + '@email.com',
        '09' + RIGHT('00000000' + CAST(@i AS NVARCHAR), 8)
    );
    SET @i = @i + 1;
END
GO

-- Insert 5000 đơn hàng
DECLARE @i INT = 1;
WHILE @i <= 5000
BEGIN
    INSERT INTO Orders (CustomerID, Status, TotalAmount)
    VALUES (
        (@i % 1000) + 1,
        CASE @i % 4
            WHEN 0 THEN N'Pending'
            WHEN 1 THEN N'Confirmed'
            WHEN 2 THEN N'Shipped'
            ELSE N'Delivered'
        END,
        ROUND(RAND(CHECKSUM(NEWID())) * 50000000 + 100000, -3)
    );
    SET @i = @i + 1;
END
GO

-- Insert 15000 order items
DECLARE @i INT = 1;
WHILE @i <= 15000
BEGIN
    INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice)
    VALUES (
        (@i % 5000) + 1,
        (@i % 50000) + 1,
        FLOOR(RAND(CHECKSUM(NEWID())) * 5) + 1,
        ROUND(RAND(CHECKSUM(NEWID())) * 10000000 + 100000, -3)
    );
    SET @i = @i + 1;
END
GO

-- Kiểm tra
SELECT 'Customers' AS [Table], COUNT(*) AS Total FROM Customers
UNION ALL
SELECT 'Orders', COUNT(*) FROM Orders
UNION ALL
SELECT 'OrderItems', COUNT(*) FROM OrderItems;
GO