/*
  Giai đoạn 5 - "Máy này chạy được gì?", "Nên mua lúc nào?" và nâng cấp laptop.
  1) LaptopModels: thông số nâng cấp theo model laptop (RAM hàn/khe rời, khe M.2) để tư vấn nâng cấp
     và ước tính khả năng chạy phần mềm. ProductID có giá trị khi cửa hàng đang bán model đó.
  2) ComponentSpecs: thêm loại 'laptop_ram' (RAM SO-DIMM cho laptop, không dùng cho Build PC desktop)
     và kích thước, đời PCIe của ổ M.2 (2280/2242/2230).
  3) BuildWatches: khách theo dõi tổng giá cả một cấu hình, báo khi cả bộ rẻ đi.
  4) Notifications: thêm loại 'build_price_drop'.
  5) SeedHistory: run-seed.js ghi file seed đã nạp, để lần sau chỉ nạp file mới (không nạp lại 50.000 sản phẩm).
  6) Products.IsGenerated: 50.000 "Demo Product" sinh tự động để thử chỉ mục. Trang khách, tìm kiếm và trợ lý AI
     mặc định bỏ qua chúng (vẫn xem được khi gọi API với includeGenerated=true).
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.LaptopModels', N'U') IS NULL
BEGIN
CREATE TABLE dbo.LaptopModels (
  LaptopModelID INT IDENTITY(1,1) CONSTRAINT PK_LaptopModels PRIMARY KEY,
  Slug NVARCHAR(80) NOT NULL CONSTRAINT UQ_LaptopModels_Slug UNIQUE,
  Brand NVARCHAR(40) NOT NULL,
  Name NVARCHAR(120) NOT NULL,
  -- Các chuỗi (cách nhau bởi |) có thể xuất hiện ở dòng "System Model" của DxDiag, không phân biệt hoa thường.
  MatchKeys NVARCHAR(300) NULL,
  ProductID INT NULL CONSTRAINT FK_LaptopModels_Products REFERENCES dbo.Products(ProductID),
  CpuName NVARCHAR(80) NOT NULL,
  CpuThreads INT NOT NULL,
  GpuName NVARCHAR(80) NULL,
  VramGB INT NULL,
  RamGB INT NOT NULL,
  RamType NVARCHAR(10) NOT NULL,
  RamSolderedGB INT NOT NULL CONSTRAINT DF_LaptopModels_RamSoldered DEFAULT 0,
  RamSlots INT NOT NULL CONSTRAINT DF_LaptopModels_RamSlots DEFAULT 0,
  MaxRamGB INT NOT NULL,
  M2Slots INT NOT NULL CONSTRAINT DF_LaptopModels_M2Slots DEFAULT 1,
  M2Size NVARCHAR(10) NULL,
  PcieGen TINYINT NULL,
  StorageGB INT NOT NULL,
  UnifiedMemory BIT NOT NULL CONSTRAINT DF_LaptopModels_Unified DEFAULT 0,
  Note NVARCHAR(300) NULL,
  CONSTRAINT CK_LaptopModels_Ram CHECK (RamGB > 0 AND RamSolderedGB >= 0 AND RamSolderedGB <= RamGB AND MaxRamGB >= RamGB),
  CONSTRAINT CK_LaptopModels_Slots CHECK (RamSlots BETWEEN 0 AND 4 AND M2Slots BETWEEN 0 AND 4),
  -- Máy không có khe RAM rời thì toàn bộ RAM là RAM hàn.
  CONSTRAINT CK_LaptopModels_Soldered CHECK (RamSlots > 0 OR RamSolderedGB = RamGB),
  CONSTRAINT CK_LaptopModels_RamType CHECK (RamType IN (N'DDR4', N'DDR5', N'LPDDR4X', N'LPDDR5', N'LPDDR5X')),
  CONSTRAINT CK_LaptopModels_M2Size CHECK (M2Size IS NULL OR M2Size IN (N'2230', N'2242', N'2280')),
  CONSTRAINT CK_LaptopModels_Cpu CHECK (CpuThreads BETWEEN 2 AND 64),
  CONSTRAINT CK_LaptopModels_Vram CHECK (VramGB IS NULL OR VramGB BETWEEN 1 AND 48)
);
-- Một sản phẩm của cửa hàng ứng với tối đa một model.
CREATE UNIQUE INDEX UX_LaptopModels_Product ON dbo.LaptopModels(ProductID) WHERE ProductID IS NOT NULL;
END
GO

-- ComponentSpecs: loại 'laptop_ram' (RAM SO-DIMM). Ràng buộc cũ không có loại này thì tạo lại.
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_ComponentSpecs_Type' AND definition NOT LIKE N'%laptop_ram%'
)
  ALTER TABLE dbo.ComponentSpecs DROP CONSTRAINT CK_ComponentSpecs_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ComponentSpecs_Type')
  ALTER TABLE dbo.ComponentSpecs ADD CONSTRAINT CK_ComponentSpecs_Type
    CHECK (ComponentType IN (N'cpu', N'mainboard', N'ram', N'gpu', N'storage', N'psu', N'case', N'cooler', N'laptop_ram'));
GO

IF COL_LENGTH('dbo.ComponentSpecs', 'M2Size') IS NULL
  ALTER TABLE dbo.ComponentSpecs ADD M2Size NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.ComponentSpecs', 'PcieGen') IS NULL
  ALTER TABLE dbo.ComponentSpecs ADD PcieGen TINYINT NULL;
GO

IF OBJECT_ID(N'dbo.BuildWatches', N'U') IS NULL
BEGIN
CREATE TABLE dbo.BuildWatches (
  BuildWatchID INT IDENTITY(1,1) CONSTRAINT PK_BuildWatches PRIMARY KEY,
  UserID INT NOT NULL CONSTRAINT FK_BuildWatches_Users REFERENCES dbo.Users(UserID),
  Title NVARCHAR(120) NULL,
  -- [{"productId":1,"quantity":2}, ...] chỉ gồm linh kiện cần mua.
  ItemsJson NVARCHAR(MAX) NOT NULL,
  TotalAtWatch DECIMAL(18,2) NOT NULL,
  LastNotifiedTotal DECIMAL(18,2) NULL,
  LastNotifiedAt DATETIME2 NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_BuildWatches_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_BuildWatches_Items CHECK (ISJSON(ItemsJson) = 1),
  CONSTRAINT CK_BuildWatches_Total CHECK (TotalAtWatch > 0)
);
CREATE INDEX IX_BuildWatches_User ON dbo.BuildWatches(UserID, BuildWatchID DESC);
END
GO

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Notifications_Type' AND definition NOT LIKE N'%build_price_drop%'
)
  ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Type')
  ALTER TABLE dbo.Notifications ADD CONSTRAINT CK_Notifications_Type
    CHECK (Type IN (N'price_drop', N'order_status', N'service_update', N'back_in_stock', N'question_answered', N'review', N'build_price_drop'));
GO

IF OBJECT_ID(N'dbo.SeedHistory', N'U') IS NULL
BEGIN
CREATE TABLE dbo.SeedHistory (
  FileName NVARCHAR(200) NOT NULL CONSTRAINT PK_SeedHistory PRIMARY KEY,
  AppliedAt DATETIME2 NOT NULL CONSTRAINT DF_SeedHistory_AppliedAt DEFAULT SYSDATETIME()
);
END
GO

IF COL_LENGTH('dbo.Products', 'IsGenerated') IS NULL
  ALTER TABLE dbo.Products ADD IsGenerated BIT NOT NULL CONSTRAINT DF_Products_IsGenerated DEFAULT 0;
GO
-- Database đã nạp dữ liệu mẫu: đánh dấu ngay. Database mới: seed 010 đánh dấu sau khi 002 sinh sản phẩm.
UPDATE dbo.Products SET IsGenerated = 1 WHERE IsGenerated = 0 AND Slug LIKE N'demo-product-%';
GO
