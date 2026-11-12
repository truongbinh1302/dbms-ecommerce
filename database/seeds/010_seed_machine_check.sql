USE ecommerce_dbms;
GO

/*
  Giai đoạn 5 - dữ liệu cho "Máy này chạy được gì?" và nâng cấp laptop.
  1) RAM laptop (SO-DIMM) và ổ M.2 2230 để gợi ý nâng cấp laptop.
  2) Kích thước và đời PCIe của các ổ M.2 có sẵn (đều là 2280, PCIe 4.0).
  3) Thông số nâng cấp của một số model laptop phổ biến (bảng LaptopModels), gắn với laptop cửa hàng đang bán.
     Số khe RAM, RAM hàn, mức tối đa và số khe M.2 lấy theo trang thông số của hãng (Lenovo PSREF, ASUS, Dell, MSI)
     và bài tháo máy của LaptopMedia, Kingston; cấu hình bán ra (RAM, SSD) là một bản phổ biến.
     Giá linh kiện mang tính minh hoạ cho bài demo. Cần đối chiếu lại trước khi dùng để bán thật.
  Chạy lại nhiều lần vẫn an toàn.
*/
SET NOCOUNT ON;

DECLARE @ComponentsCat INT = (SELECT CategoryID FROM dbo.Categories WHERE Slug = N'components');
DECLARE @StorageCat INT = (SELECT CategoryID FROM dbo.Categories WHERE Slug = N'storage');

DECLARE @Seed TABLE (
  Slug NVARCHAR(240) NOT NULL PRIMARY KEY,
  Name NVARCHAR(220) NOT NULL,
  Brand NVARCHAR(100) NOT NULL,
  Description NVARCHAR(400) NOT NULL,
  Price DECIMAL(18,2) NOT NULL,
  OldPrice DECIMAL(18,2) NULL,
  Stock INT NOT NULL,
  CategorySlug NVARCHAR(50) NOT NULL,
  Specs NVARCHAR(400) NOT NULL,
  ComponentType NVARCHAR(20) NOT NULL,
  MemoryType NVARCHAR(10) NULL,
  CapacityGB INT NOT NULL,
  Modules INT NULL,
  StorageInterface NVARCHAR(10) NULL,
  M2Size NVARCHAR(10) NULL,
  PcieGen TINYINT NULL
);

INSERT INTO @Seed VALUES
(N'kingston-fury-impact-8gb-ddr5-5600-sodimm', N'Kingston FURY Impact 8GB DDR5 5600 SO-DIMM', N'Kingston', N'RAM laptop DDR5 1 thanh 8GB.', 790000, 890000, 60, N'components',
  N'["8GB", "DDR5 5600", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR5', 8, 1, NULL, NULL, NULL),
(N'kingston-fury-impact-16gb-ddr5-5600-sodimm', N'Kingston FURY Impact 16GB DDR5 5600 SO-DIMM', N'Kingston', N'RAM laptop DDR5 1 thanh 16GB.', 1390000, 1590000, 50, N'components',
  N'["16GB", "DDR5 5600", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR5', 16, 1, NULL, NULL, NULL),
(N'kingston-fury-impact-32gb-ddr5-5600-sodimm', N'Kingston FURY Impact 32GB DDR5 5600 SO-DIMM', N'Kingston', N'RAM laptop DDR5 1 thanh 32GB.', 2690000, 2990000, 25, N'components',
  N'["32GB", "DDR5 5600", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR5', 32, 1, NULL, NULL, NULL),
(N'crucial-32gb-kit-2x16gb-ddr5-5600-sodimm', N'Crucial 32GB Kit (2x16GB) DDR5 5600 SO-DIMM', N'Crucial', N'Bộ RAM laptop DDR5 2 thanh 16GB, chạy kênh đôi.', 2790000, 3090000, 30, N'components',
  N'["32GB (2x16GB)", "DDR5 5600", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR5', 32, 2, NULL, NULL, NULL),
(N'crucial-64gb-kit-2x32gb-ddr5-5600-sodimm', N'Crucial 64GB Kit (2x32GB) DDR5 5600 SO-DIMM', N'Crucial', N'Bộ RAM laptop DDR5 2 thanh 32GB cho máy chạy AI, máy ảo.', 5490000, 5990000, 12, N'components',
  N'["64GB (2x32GB)", "DDR5 5600", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR5', 64, 2, NULL, NULL, NULL),
(N'kingston-fury-impact-8gb-ddr4-3200-sodimm', N'Kingston FURY Impact 8GB DDR4 3200 SO-DIMM', N'Kingston', N'RAM laptop DDR4 1 thanh 8GB.', 590000, 690000, 60, N'components',
  N'["8GB", "DDR4 3200", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR4', 8, 1, NULL, NULL, NULL),
(N'crucial-16gb-ddr4-3200-sodimm', N'Crucial 16GB DDR4 3200 SO-DIMM', N'Crucial', N'RAM laptop DDR4 1 thanh 16GB.', 990000, 1190000, 45, N'components',
  N'["16GB", "DDR4 3200", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR4', 16, 1, NULL, NULL, NULL),
(N'crucial-32gb-kit-2x16gb-ddr4-3200-sodimm', N'Crucial 32GB Kit (2x16GB) DDR4 3200 SO-DIMM', N'Crucial', N'Bộ RAM laptop DDR4 2 thanh 16GB, chạy kênh đôi.', 1890000, 2190000, 25, N'components',
  N'["32GB (2x16GB)", "DDR4 3200", "SO-DIMM", "Laptop"]', N'laptop_ram', N'DDR4', 32, 2, NULL, NULL, NULL),
(N'wd-black-sn770m-1tb-2230', N'WD_BLACK SN770M 1TB M.2 2230', N'WD', N'SSD NVMe PCIe 4.0 cỡ M.2 2230 cho máy có khe ngắn.', 2490000, 2790000, 20, N'storage',
  N'["1TB", "M.2 2230", "PCIe 4.0"]', N'storage', NULL, 1000, NULL, N'M.2', N'2230', 4);

INSERT INTO dbo.Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured, Rating, ReviewsCount)
SELECT s.Name, s.Slug, s.Brand, s.Description, s.Price, s.OldPrice, s.Stock,
       CASE WHEN s.CategorySlug = N'storage' THEN @StorageCat ELSE @ComponentsCat END,
       s.Specs, N'[]', 0, 0, 0
FROM @Seed s
WHERE NOT EXISTS (SELECT 1 FROM dbo.Products p WHERE p.Slug = s.Slug);

MERGE dbo.ComponentSpecs AS cs
USING (
  SELECT p.ProductID, s.ComponentType, s.MemoryType, s.CapacityGB, s.Modules, s.StorageInterface, s.M2Size, s.PcieGen
  FROM @Seed s JOIN dbo.Products p ON p.Slug = s.Slug
) AS src ON cs.ProductID = src.ProductID
WHEN MATCHED THEN
  UPDATE SET ComponentType = src.ComponentType, MemoryType = src.MemoryType, CapacityGB = src.CapacityGB,
             Modules = src.Modules, StorageInterface = src.StorageInterface, M2Size = src.M2Size, PcieGen = src.PcieGen
WHEN NOT MATCHED THEN
  INSERT (ProductID, ComponentType, MemoryType, CapacityGB, Modules, StorageInterface, M2Size, PcieGen)
  VALUES (src.ProductID, src.ComponentType, src.MemoryType, src.CapacityGB, src.Modules, src.StorageInterface, src.M2Size, src.PcieGen);

-- Ổ M.2 có sẵn từ 003: đều là cỡ 2280, PCIe 4.0.
UPDATE cs SET M2Size = N'2280', PcieGen = 4
FROM dbo.ComponentSpecs cs
JOIN dbo.Products p ON p.ProductID = cs.ProductID
WHERE cs.ComponentType = N'storage' AND cs.StorageInterface = N'M.2' AND cs.M2Size IS NULL
  AND p.Slug IN (N'kingston-nv3-500gb', N'wd-blue-sn580-1tb', N'samsung-990-pro-2tb');

-- Mốc giá đầu tiên và tồn đầu kỳ cho sản phẩm vừa thêm.
INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, p.Price, p.OldPrice, p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID);

IF OBJECT_ID(N'dbo.StockMovements', N'U') IS NOT NULL
INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedAt)
SELECT p.ProductID, p.Stock, p.Stock, N'opening', N'Tồn đầu kỳ khi nạp dữ liệu mẫu', p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.StockMovements m WHERE m.ProductID = p.ProductID);
GO

/*
  Model laptop. MatchKeys: chuỗi có thể có ở dòng "System Model" của DxDiag (Lenovo ghi mã máy như 82XV).
  Cột theo thứ tự: Slug, Brand, Name, MatchKeys, ProductSlug, CpuName, CpuThreads, GpuName, VramGB,
  RamGB, RamType, RamSolderedGB, RamSlots, MaxRamGB, M2Slots, M2Size, PcieGen, StorageGB, UnifiedMemory, Note.
*/
DECLARE @Models TABLE (
  Slug NVARCHAR(80) PRIMARY KEY, Brand NVARCHAR(40), Name NVARCHAR(120), MatchKeys NVARCHAR(300), ProductSlug NVARCHAR(240),
  CpuName NVARCHAR(80), CpuThreads INT, GpuName NVARCHAR(80), VramGB INT,
  RamGB INT, RamType NVARCHAR(10), RamSolderedGB INT, RamSlots INT, MaxRamGB INT,
  M2Slots INT, M2Size NVARCHAR(10), PcieGen TINYINT, StorageGB INT, UnifiedMemory BIT, Note NVARCHAR(300)
);

INSERT INTO @Models VALUES
(N'asus-rog-zephyrus-g16-gu605', N'ASUS', N'ROG Zephyrus G16 (2024) GU605', N'GU605|Zephyrus G16 GU605', N'zephyrus-g16-oled',
  N'Intel Core Ultra 9 185H', 22, N'NVIDIA GeForce RTX 4070 Laptop GPU', 8,
  32, N'LPDDR5X', 32, 0, 32, 2, N'2280', 4, 1000, 0, N'RAM LPDDR5X hàn trên mainboard (bản 16 GB hoặc 32 GB): chọn đủ dung lượng ngay khi mua.'),
(N'lenovo-legion-slim-5-16aph8', N'Lenovo', N'Legion Slim 5 16APH8', N'82Y9|Legion Slim 5 16APH8', N'legion-slim-5',
  N'AMD Ryzen 7 7840HS', 16, N'NVIDIA GeForce RTX 4060 Laptop GPU', 8,
  16, N'DDR5', 0, 2, 32, 2, N'2280', 4, 512, 0, NULL),
(N'lenovo-thinkbook-14-g7-iml', N'Lenovo', N'ThinkBook 14 G7 IML', N'21MR|ThinkBook 14 G7 IML', N'thinkbook-14-g7',
  N'Intel Core Ultra 7 155H', 22, N'Intel Arc Graphics (tích hợp)', NULL,
  16, N'DDR5', 0, 2, 64, 2, N'2280', 4, 512, 0, N'Card Intel Arc tích hợp chỉ bật khi RAM chạy kênh đôi (2 thanh, từ 16 GB).'),
(N'lenovo-loq-15irh8', N'Lenovo', N'LOQ 15IRH8', N'82XV|LOQ 15IRH8', NULL,
  N'Intel Core i5-13420H', 12, N'NVIDIA GeForce RTX 4050 Laptop GPU', 6,
  8, N'DDR5', 0, 2, 16, 2, N'2280', 4, 512, 0, N'Hai khe SSD: một khe 2242 và một khe 2280, đều PCIe 4.0. Lenovo công bố RAM tối đa 16 GB.'),
(N'asus-tuf-gaming-a15-fa507', N'ASUS', N'TUF Gaming A15 (2023) FA507', N'FA507|TUF Gaming A15 FA507', NULL,
  N'AMD Ryzen 7 7735HS', 16, N'NVIDIA GeForce RTX 4060 Laptop GPU', 8,
  16, N'DDR5', 0, 2, 32, 2, N'2280', 4, 512, 0, NULL),
(N'acer-nitro-v-15-anv15-51', N'Acer', N'Nitro V 15 ANV15-51', N'ANV15-51|Nitro ANV15-51', NULL,
  N'Intel Core i5-13420H', 12, N'NVIDIA GeForce RTX 4050 Laptop GPU', 6,
  8, N'DDR5', 0, 2, 32, 2, N'2280', 4, 512, 0, N'Khe SSD thứ hai chạy PCIe 3.0.'),
(N'dell-inspiron-15-3530', N'Dell', N'Inspiron 15 3530', N'Inspiron 15 3530', NULL,
  N'Intel Core i5-1334U', 12, N'Intel Iris Xe Graphics (tích hợp)', NULL,
  8, N'DDR4', 0, 2, 16, 1, N'2280', NULL, 512, 0, N'Khe M.2 nhận cả ổ 2230 và 2280.'),
(N'asus-vivobook-15-x1504va', N'ASUS', N'Vivobook 15 X1504VA', N'X1504VA', NULL,
  N'Intel Core i5-1335U', 12, N'Intel Iris Xe Graphics (tích hợp)', NULL,
  8, N'DDR4', 8, 1, 16, 1, N'2280', NULL, 512, 0, N'8 GB RAM hàn trên mainboard và 1 khe SO-DIMM trống.'),
(N'msi-thin-gf63-12ve', N'MSI', N'Thin GF63 12VE', N'GF63 Thin 12VE|Thin GF63 12VE', NULL,
  N'Intel Core i5-12450H', 12, N'NVIDIA GeForce RTX 4050 Laptop GPU', 6,
  16, N'DDR4', 0, 2, 64, 1, N'2280', 4, 512, 0, N'Có thêm một khe ổ 2,5 inch SATA.'),
(N'apple-macbook-air-13-m3', N'Apple', N'MacBook Air 13 inch M3', NULL, NULL,
  N'Apple M3 (CPU 8 nhân)', 8, N'Apple M3 GPU 10 nhân', NULL,
  16, N'LPDDR5', 16, 0, 16, 0, NULL, NULL, 256, 1, N'Bộ nhớ hợp nhất và SSD hàn trên mainboard.');

MERGE dbo.LaptopModels AS m
USING (
  SELECT s.*, p.ProductID
  FROM @Models s
  LEFT JOIN dbo.Products p ON p.Slug = s.ProductSlug AND p.IsDeleted = 0
) AS src ON m.Slug = src.Slug
WHEN MATCHED THEN
  UPDATE SET Brand = src.Brand, Name = src.Name, MatchKeys = src.MatchKeys, ProductID = src.ProductID,
             CpuName = src.CpuName, CpuThreads = src.CpuThreads, GpuName = src.GpuName, VramGB = src.VramGB,
             RamGB = src.RamGB, RamType = src.RamType, RamSolderedGB = src.RamSolderedGB, RamSlots = src.RamSlots,
             MaxRamGB = src.MaxRamGB, M2Slots = src.M2Slots, M2Size = src.M2Size, PcieGen = src.PcieGen,
             StorageGB = src.StorageGB, UnifiedMemory = src.UnifiedMemory, Note = src.Note
WHEN NOT MATCHED THEN
  INSERT (Slug, Brand, Name, MatchKeys, ProductID, CpuName, CpuThreads, GpuName, VramGB, RamGB, RamType, RamSolderedGB,
          RamSlots, MaxRamGB, M2Slots, M2Size, PcieGen, StorageGB, UnifiedMemory, Note)
  VALUES (src.Slug, src.Brand, src.Name, src.MatchKeys, src.ProductID, src.CpuName, src.CpuThreads, src.GpuName, src.VramGB,
          src.RamGB, src.RamType, src.RamSolderedGB, src.RamSlots, src.MaxRamGB, src.M2Slots, src.M2Size, src.PcieGen,
          src.StorageGB, src.UnifiedMemory, src.Note);

SELECT (SELECT COUNT(*) FROM dbo.LaptopModels) AS LaptopModels,
       (SELECT COUNT(*) FROM dbo.ComponentSpecs WHERE ComponentType = N'laptop_ram') AS LaptopRam;
GO
