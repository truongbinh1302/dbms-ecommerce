/*
  BinhTinhStore DBMS assignment schema
  DBMS: SQL Server
  Purpose: executable application schema + topic demos for indexing, query processing, transaction, concurrency, backup/recovery.
*/

IF DB_ID(N'ecommerce_dbms') IS NULL
BEGIN
  CREATE DATABASE ecommerce_dbms;
END
GO

USE ecommerce_dbms;
GO

IF OBJECT_ID(N'dbo.Customers', N'V') IS NOT NULL DROP VIEW dbo.Customers;
-- Bảng thêm ở 006_cart_and_search.sql tham chiếu Users/Products nên phải xoá trước.
IF OBJECT_ID(N'dbo.CartItems', N'U') IS NOT NULL DROP TABLE dbo.CartItems;
IF OBJECT_ID(N'dbo.VoucherUsages', N'U') IS NOT NULL DROP TABLE dbo.VoucherUsages;
IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NOT NULL DROP TABLE dbo.OrderItems;
IF OBJECT_ID(N'dbo.Orders', N'U') IS NOT NULL DROP TABLE dbo.Orders;
IF OBJECT_ID(N'dbo.Vouchers', N'U') IS NOT NULL DROP TABLE dbo.Vouchers;
IF OBJECT_ID(N'dbo.Products', N'U') IS NOT NULL DROP TABLE dbo.Products;
IF OBJECT_ID(N'dbo.Categories', N'U') IS NOT NULL DROP TABLE dbo.Categories;
IF OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL DROP TABLE dbo.Users;
GO

CREATE TABLE dbo.Users (
  UserID INT IDENTITY(1,1) CONSTRAINT PK_Users PRIMARY KEY,
  FullName NVARCHAR(200) NOT NULL,
  Email NVARCHAR(200) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
  Password NVARCHAR(255) NOT NULL,
  Phone NVARCHAR(20) NULL,
  Role NVARCHAR(20) NOT NULL CONSTRAINT DF_Users_Role DEFAULT N'customer',
  Address NVARCHAR(MAX) NULL,
  RefreshToken NVARCHAR(800) NULL,
  IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSDATETIME(),
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSDATETIME()
);
GO

CREATE TABLE dbo.Categories (
  CategoryID INT IDENTITY(1,1) CONSTRAINT PK_Categories PRIMARY KEY,
  Name NVARCHAR(100) NOT NULL,
  Slug NVARCHAR(120) NOT NULL CONSTRAINT UQ_Categories_Slug UNIQUE,
  Icon NVARCHAR(50) NULL
);
GO

CREATE TABLE dbo.Products (
  ProductID INT IDENTITY(1,1) CONSTRAINT PK_Products PRIMARY KEY,
  Name NVARCHAR(220) NOT NULL,
  Slug NVARCHAR(240) NOT NULL CONSTRAINT UQ_Products_Slug UNIQUE,
  Brand NVARCHAR(100) NULL,
  Description NVARCHAR(MAX) NULL,
  Price DECIMAL(18,2) NOT NULL,
  OldPrice DECIMAL(18,2) NULL,
  Stock INT NOT NULL CONSTRAINT DF_Products_Stock DEFAULT 0,
  CategoryID INT NOT NULL CONSTRAINT FK_Products_Categories REFERENCES dbo.Categories(CategoryID),
  Specs NVARCHAR(MAX) NULL,
  Images NVARCHAR(MAX) NULL,
  IsFeatured BIT NOT NULL CONSTRAINT DF_Products_IsFeatured DEFAULT 0,
  IsDeleted BIT NOT NULL CONSTRAINT DF_Products_IsDeleted DEFAULT 0,
  Version INT NOT NULL CONSTRAINT DF_Products_Version DEFAULT 0,
  Rating DECIMAL(3,2) NOT NULL CONSTRAINT DF_Products_Rating DEFAULT 0,
  ReviewsCount INT NOT NULL CONSTRAINT DF_Products_ReviewsCount DEFAULT 0,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSDATETIME(),
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_Products_Price CHECK (Price >= 0),
  CONSTRAINT CK_Products_Stock CHECK (Stock >= 0)
);
GO

CREATE TABLE dbo.Orders (
  OrderID INT IDENTITY(1,1) CONSTRAINT PK_Orders PRIMARY KEY,
  OrderCode NVARCHAR(30) NULL,
  UserID INT NOT NULL CONSTRAINT FK_Orders_Users REFERENCES dbo.Users(UserID),
  CustomerID AS UserID PERSISTED,
  Status NVARCHAR(50) NOT NULL CONSTRAINT DF_Orders_Status DEFAULT N'pending',
  PaymentMethod NVARCHAR(50) NOT NULL CONSTRAINT DF_Orders_PaymentMethod DEFAULT N'cod',
  PaymentStatus NVARCHAR(50) NOT NULL CONSTRAINT DF_Orders_PaymentStatus DEFAULT N'unpaid',
  VNPayTxnRef NVARCHAR(100) NULL,
  Subtotal DECIMAL(18,2) NOT NULL CONSTRAINT DF_Orders_Subtotal DEFAULT 0,
  Discount DECIMAL(18,2) NOT NULL CONSTRAINT DF_Orders_Discount DEFAULT 0,
  ShippingFee DECIMAL(18,2) NOT NULL CONSTRAINT DF_Orders_ShippingFee DEFAULT 0,
  Total DECIMAL(18,2) NOT NULL CONSTRAINT DF_Orders_Total DEFAULT 0,
  ShippingAddress NVARCHAR(MAX) NULL,
  Note NVARCHAR(500) NULL,
  CancelReason NVARCHAR(500) NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Orders_CreatedAt DEFAULT SYSDATETIME(),
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Orders_UpdatedAt DEFAULT SYSDATETIME()
);
GO

CREATE TABLE dbo.OrderItems (
  OrderItemID INT IDENTITY(1,1) CONSTRAINT PK_OrderItems PRIMARY KEY,
  OrderID INT NOT NULL CONSTRAINT FK_OrderItems_Orders REFERENCES dbo.Orders(OrderID),
  ProductID INT NOT NULL CONSTRAINT FK_OrderItems_Products REFERENCES dbo.Products(ProductID),
  Quantity INT NOT NULL,
  UnitPrice DECIMAL(18,2) NOT NULL,
  CONSTRAINT CK_OrderItems_Quantity CHECK (Quantity > 0),
  CONSTRAINT CK_OrderItems_UnitPrice CHECK (UnitPrice >= 0)
);
GO

CREATE TABLE dbo.Vouchers (
  VoucherID INT IDENTITY(1,1) CONSTRAINT PK_Vouchers PRIMARY KEY,
  Code NVARCHAR(50) NOT NULL CONSTRAINT UQ_Vouchers_Code UNIQUE,
  DiscountType NVARCHAR(20) NOT NULL,
  DiscountValue DECIMAL(18,2) NOT NULL,
  MinOrderAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_Vouchers_MinOrderAmount DEFAULT 0,
  MaxDiscount DECIMAL(18,2) NULL,
  UsageLimit INT NULL,
  UsedCount INT NOT NULL CONSTRAINT DF_Vouchers_UsedCount DEFAULT 0,
  StartDate DATETIME2 NULL,
  EndDate DATETIME2 NULL,
  IsActive BIT NOT NULL CONSTRAINT DF_Vouchers_IsActive DEFAULT 1
);
GO

CREATE TABLE dbo.VoucherUsages (
  UsageID INT IDENTITY(1,1) CONSTRAINT PK_VoucherUsages PRIMARY KEY,
  VoucherID INT NOT NULL CONSTRAINT FK_VoucherUsages_Vouchers REFERENCES dbo.Vouchers(VoucherID),
  UserID INT NOT NULL CONSTRAINT FK_VoucherUsages_Users REFERENCES dbo.Users(UserID),
  OrderID INT NOT NULL CONSTRAINT FK_VoucherUsages_Orders REFERENCES dbo.Orders(OrderID),
  UsedAt DATETIME2 NOT NULL CONSTRAINT DF_VoucherUsages_UsedAt DEFAULT SYSDATETIME()
);
GO

CREATE VIEW dbo.Customers AS
SELECT UserID AS CustomerID, FullName AS Name, Email, Phone, Address, CreatedAt
FROM dbo.Users
WHERE Role = N'customer';
GO

CREATE INDEX IX_Users_Role ON dbo.Users(Role);
CREATE INDEX IX_Products_CategoryID ON dbo.Products(CategoryID) INCLUDE (Name, Price, Stock);
CREATE INDEX IX_Products_Price ON dbo.Products(Price) INCLUDE (Name, CategoryID);
CREATE INDEX IX_Products_Category_Price ON dbo.Products(CategoryID, Price) INCLUDE (Name, Brand, Stock);
CREATE INDEX IX_Products_Category_Price_Desc ON dbo.Products(CategoryID ASC, Price DESC) INCLUDE (Name, Stock);
CREATE INDEX IX_Products_Brand ON dbo.Products(Brand) INCLUDE (Name, Price);
CREATE INDEX IX_Orders_UserID_CreatedAt ON dbo.Orders(UserID, CreatedAt DESC) INCLUDE (Status, Total);
CREATE INDEX IX_Orders_Status ON dbo.Orders(Status) INCLUDE (OrderID, UserID, Total);
CREATE UNIQUE INDEX UX_Orders_OrderCode ON dbo.Orders(OrderCode) WHERE OrderCode IS NOT NULL;
CREATE INDEX IX_OrderItems_OrderID ON dbo.OrderItems(OrderID) INCLUDE (ProductID, Quantity, UnitPrice);
CREATE INDEX IX_OrderItems_ProductID ON dbo.OrderItems(ProductID) INCLUDE (OrderID, Quantity, UnitPrice);
GO
