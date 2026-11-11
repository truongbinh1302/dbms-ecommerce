/*
  Giai đoạn 2 - tính năng khác biệt.
  1) ComponentSpecs: thông số kỹ thuật của linh kiện để kiểm tra tương thích khi Build PC.
  2) PriceHistory: lịch sử giá, ghi mỗi khi giá sản phẩm thay đổi qua API.
     (Không dùng trigger vì các câu INSERT ... OUTPUT của API sẽ lỗi khi bảng có trigger.)
  3) BuildQuotes: báo giá cấu hình có hạn 48 giờ, chia sẻ được bằng mã.
     Orders.QuoteCode: đơn đặt theo báo giá nào (giá được giữ theo báo giá đó).
  4) Warranties: tra cứu bảo hành theo số serial.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.ComponentSpecs', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ComponentSpecs (
  ProductID INT NOT NULL
    CONSTRAINT PK_ComponentSpecs PRIMARY KEY
    CONSTRAINT FK_ComponentSpecs_Products REFERENCES dbo.Products(ProductID),
  ComponentType NVARCHAR(20) NOT NULL,
  Socket NVARCHAR(20) NULL,
  MemoryType NVARCHAR(10) NULL,
  FormFactor NVARCHAR(10) NULL,
  SupportedFormFactors NVARCHAR(50) NULL,
  SupportedSockets NVARCHAR(100) NULL,
  PowerW INT NULL,
  PsuWatts INT NULL,
  LengthMm INT NULL,
  MaxGpuLengthMm INT NULL,
  HeightMm INT NULL,
  MaxCoolerHeightMm INT NULL,
  MemorySlots INT NULL,
  Modules INT NULL,
  CapacityGB INT NULL,
  M2Slots INT NULL,
  StorageInterface NVARCHAR(10) NULL,
  HasIntegratedGraphics BIT NULL,
  IncludesCooler BIT NULL,
  Tier TINYINT NULL,
  VramGB INT NULL,
  CONSTRAINT CK_ComponentSpecs_Type CHECK (ComponentType IN (N'cpu', N'mainboard', N'ram', N'gpu', N'storage', N'psu', N'case', N'cooler'))
);
CREATE INDEX IX_ComponentSpecs_Type ON dbo.ComponentSpecs(ComponentType);
END
GO

IF OBJECT_ID(N'dbo.PriceHistory', N'U') IS NULL
BEGIN
CREATE TABLE dbo.PriceHistory (
  PriceHistoryID BIGINT IDENTITY(1,1) CONSTRAINT PK_PriceHistory PRIMARY KEY,
  ProductID INT NOT NULL CONSTRAINT FK_PriceHistory_Products REFERENCES dbo.Products(ProductID),
  Price DECIMAL(18,2) NOT NULL,
  OldPrice DECIMAL(18,2) NULL,
  ChangedAt DATETIME2 NOT NULL CONSTRAINT DF_PriceHistory_ChangedAt DEFAULT SYSDATETIME()
);
CREATE INDEX IX_PriceHistory_Product_Time ON dbo.PriceHistory(ProductID, ChangedAt DESC) INCLUDE (Price, OldPrice);
END
GO

-- Mốc giá đầu tiên cho sản phẩm đã có (lấy thời điểm tạo sản phẩm).
INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, p.Price, p.OldPrice, p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID);
GO

IF OBJECT_ID(N'dbo.BuildQuotes', N'U') IS NULL
BEGIN
CREATE TABLE dbo.BuildQuotes (
  QuoteID INT IDENTITY(1,1) CONSTRAINT PK_BuildQuotes PRIMARY KEY,
  Code NVARCHAR(20) NOT NULL CONSTRAINT UQ_BuildQuotes_Code UNIQUE,
  UserID INT NULL CONSTRAINT FK_BuildQuotes_Users REFERENCES dbo.Users(UserID),
  Title NVARCHAR(120) NULL,
  ItemsJson NVARCHAR(MAX) NOT NULL,
  Subtotal DECIMAL(18,2) NOT NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_BuildQuotes_CreatedAt DEFAULT SYSDATETIME(),
  ExpiresAt DATETIME2 NOT NULL
);
END
GO

-- Đơn đặt theo báo giá ghi lại mã báo giá để đối chiếu giá đã giữ.
IF COL_LENGTH('dbo.Orders', 'QuoteCode') IS NULL
BEGIN
ALTER TABLE dbo.Orders ADD QuoteCode NVARCHAR(20) NULL;
END
GO

IF OBJECT_ID(N'dbo.Warranties', N'U') IS NULL
BEGIN
CREATE TABLE dbo.Warranties (
  SerialNumber NVARCHAR(60) NOT NULL CONSTRAINT PK_Warranties PRIMARY KEY,
  ProductID INT NOT NULL CONSTRAINT FK_Warranties_Products REFERENCES dbo.Products(ProductID),
  OrderID INT NULL CONSTRAINT FK_Warranties_Orders REFERENCES dbo.Orders(OrderID),
  StartDate DATE NOT NULL,
  EndDate DATE NOT NULL,
  Note NVARCHAR(300) NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Warranties_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_Warranties_Dates CHECK (EndDate >= StartDate)
);
CREATE INDEX IX_Warranties_OrderID ON dbo.Warranties(OrderID);
END
GO
