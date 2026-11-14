USE ecommerce_dbms;
GO

/*
  Bổ sung cho 013 (14/11/2026):
  1) Sửa các giá và thông số trước đó còn ước tính: đối chiếu lại GearVN, trang hãng (GIGABYTE, ASUS, MSI) và
     GPU-Monkey / BuildCores. Mẫu nào shop lớn không còn bán thì ngừng bán và thay bằng mẫu đang bán.
     Số khe M.2 của mainboard khai báo bằng số tối thiểu chắc chắn có (ít hơn hoặc bằng thực tế), để Build PC
     không hứa lắp được nhiều ổ hơn máy có.
  2) Ảnh minh hoạ SVG (vẽ theo loại sản phẩm, scripts/generate-product-images.js) cho mọi sản phẩm thật chưa có ảnh.
     Không ghi đè ảnh quản trị đã tải lên.
  3) Phiên đấu giá còn mở mà giá khởi điểm dưới 40% giá niêm yết hiện tại (mở theo giá RAM cũ) thì huỷ,
     trả sản phẩm về kho, báo người đã trả giá; rồi mở đợt mới theo giá hiện tại.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Retire TABLE (Slug NVARCHAR(240) PRIMARY KEY);
INSERT INTO @Retire (Slug) VALUES
  (N'asus-prime-rtx-5070-12g'), (N'asus-tuf-rtx-5080-16g'), (N'seasonic-focus-gx-850'),
  (N'asus-prime-b650m-a-wifi-ii'), (N'msi-pro-b650-p-wifi'), (N'asrock-b650i-lightning-wifi'),
  (N'gigabyte-b760m-ds3h-ddr4'), (N'msi-pro-b760m-a-wifi'), (N'samsung-870-evo-500gb'),
  (N'deepcool-ak400'), (N'thermalright-peerless-assassin-120-se');

UPDATE p
SET IsDeleted = 1, IsFeatured = 0, Version = Version + 1, UpdatedAt = GETDATE()
FROM dbo.Products p
JOIN @Retire r ON r.Slug = p.Slug
WHERE p.IsDeleted = 0
  AND NOT EXISTS (SELECT 1 FROM dbo.Auctions a WHERE a.ProductID = p.ProductID AND a.Status IN (N'active', N'won'));

DECLARE @Seed TABLE (
  Slug NVARCHAR(240) NOT NULL PRIMARY KEY,
  Name NVARCHAR(220) NULL,
  Brand NVARCHAR(100) NULL,
  Description NVARCHAR(400) NULL,
  Price DECIMAL(18,2) NOT NULL,
  OldPrice DECIMAL(18,2) NULL,
  Stock INT NOT NULL,
  CategorySlug NVARCHAR(50) NOT NULL,
  Specs NVARCHAR(400) NULL,
  SpecJson NVARCHAR(600) NULL,
  M2Size NVARCHAR(10) NULL,
  PcieGen TINYINT NULL
);

INSERT INTO @Seed (Slug, Name, Brand, Description, Price, OldPrice, Stock, CategorySlug, Specs, SpecJson, M2Size, PcieGen) VALUES
-- ===== Giá đã đối chiếu lại =====
(N'gigabyte-rtx-5070-ti-16g', NULL, NULL, NULL, 44990000, 45990000, 8, N'components', NULL, NULL, NULL, NULL),
(N'corsair-rm750e', NULL, NULL, NULL, 2890000, NULL, 25, N'components', NULL, NULL, NULL, NULL),
(N'corsair-rm1000e', NULL, NULL, NULL, 4590000, 5190000, 10, N'components', NULL, NULL, NULL, NULL),
(N'msi-mag-a650bn', NULL, NULL, NULL, 1190000, 1390000, 35, N'components', NULL, NULL, NULL, NULL),
(N'asus-prime-b550m-a', NULL, NULL, NULL, 2490000, 3990000, 25, N'components', NULL, NULL, NULL, NULL),
(N'seagate-barracuda-2tb', NULL, NULL, NULL, 3990000, 4490000, 30, N'storage', NULL, NULL, NULL, NULL),
-- Chiều dài card theo trang hãng / GPU-Monkey / BuildCores
(N'zotac-rtx-5050-twin-edge-oc-8g', NULL, NULL, NULL, 8990000, 9490000, 20, N'components', NULL,
  N'{"type":"gpu","vramGB":8,"lengthMm":221,"powerW":130}', NULL, NULL),
(N'asus-prime-rx-9070-xt-oc-16g', NULL, NULL, NULL, 23490000, 24990000, 8, N'components', NULL,
  N'{"type":"gpu","vramGB":16,"lengthMm":312,"powerW":304}', NULL, NULL),
-- Số khe M.2 tối thiểu chắc chắn có
(N'gigabyte-b850m-aorus-elite-wifi6e', NULL, NULL, NULL, 5390000, 6090000, 20, N'components', NULL,
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}', NULL, NULL),
(N'gigabyte-b850-aorus-elite-wifi7', NULL, NULL, NULL, 6290000, 7190000, 12, N'components', NULL,
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"ATX","memorySlots":4,"m2Slots":3}', NULL, NULL),
(N'gigabyte-z890-eagle-wifi7', NULL, NULL, NULL, 6990000, 7990000, 10, N'components', NULL,
  N'{"type":"mainboard","socket":"LGA1851","memoryType":"DDR5","formFactor":"ATX","memorySlots":4,"m2Slots":3}', NULL, NULL),

-- ===== Mẫu đang bán thay mẫu ngừng bán =====
(N'gigabyte-rtx-5070-windforce-oc-sff-12g', N'GIGABYTE GeForce RTX 5070 WINDFORCE OC SFF 12G', N'GIGABYTE', N'Card đồ hoạ RTX 5070 12GB cho chơi game 2K, chuẩn SFF-Ready (dài tối đa 304mm).', 29990000, 30990000, 12, N'components',
  N'["12GB GDDR7", "DLSS 4", "SFF-Ready"]',
  N'{"type":"gpu","vramGB":12,"lengthMm":304,"powerW":250}', NULL, NULL),
(N'asus-prime-rtx-5080-16g', N'ASUS Prime GeForce RTX 5080 16GB', N'ASUS', N'Card đồ hoạ cao cấp 16GB cho chơi game 4K, dựng phim và AI, chuẩn SFF-Ready.', 51990000, 53990000, 5, N'components',
  N'["16GB GDDR7", "DLSS 4", "Cần nguồn 850W"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":304,"powerW":360}', NULL, NULL),
(N'msi-b650m-gaming-plus-wifi', N'MSI B650M GAMING PLUS WIFI', N'MSI', N'Mainboard mATX socket AM5, 4 khe DDR5, Wi-Fi.', 4290000, 5990000, 20, N'components',
  N'["AM5", "mATX", "DDR5", "Wi-Fi"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}', NULL, NULL),
(N'gigabyte-b650m-gaming-plus-wifi', N'GIGABYTE B650M GAMING PLUS WIFI', N'GIGABYTE', N'Mainboard mATX socket AM5 giá tốt, 4 khe DDR5, Wi-Fi.', 3990000, 4190000, 25, N'components',
  N'["AM5", "mATX", "DDR5", "Wi-Fi"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}', NULL, NULL),
(N'gigabyte-b850i-aorus-pro', N'GIGABYTE B850I AORUS PRO', N'GIGABYTE', N'Mainboard Mini-ITX socket AM5, 2 khe DDR5, cho case nhỏ gọn.', 8190000, 8990000, 6, N'components',
  N'["AM5", "Mini-ITX", "DDR5", "2 khe RAM"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"ITX","memorySlots":2,"m2Slots":2}', NULL, NULL),
(N'msi-pro-b760m-e-ddr4', N'MSI PRO B760M-E DDR4', N'MSI', N'Mainboard mATX socket LGA1700 giá rẻ, 2 khe DDR4.', 2390000, 2690000, 30, N'components',
  N'["LGA1700", "mATX", "DDR4", "2 khe RAM"]',
  N'{"type":"mainboard","socket":"LGA1700","memoryType":"DDR4","formFactor":"mATX","memorySlots":2,"m2Slots":1}', NULL, NULL),
(N'asus-prime-b760m-a-d4-csm', N'ASUS PRIME B760M-A D4-CSM', N'ASUS', N'Mainboard mATX socket LGA1700, 4 khe DDR4.', 2890000, 3190000, 25, N'components',
  N'["LGA1700", "mATX", "DDR4", "4 khe RAM"]',
  N'{"type":"mainboard","socket":"LGA1700","memoryType":"DDR4","formFactor":"mATX","memorySlots":4,"m2Slots":2}', NULL, NULL),
(N'msi-mag-b760m-mortar-ii-wifi-ddr5', N'MSI MAG B760M MORTAR II WIFI DDR5', N'MSI', N'Mainboard mATX socket LGA1700, 4 khe DDR5, Wi-Fi.', 4490000, 4590000, 15, N'components',
  N'["LGA1700", "mATX", "DDR5", "Wi-Fi"]',
  N'{"type":"mainboard","socket":"LGA1700","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}', NULL, NULL),
(N'pny-cs900-500gb', N'PNY CS900 500GB SATA', N'PNY', N'SSD SATA 2.5 inch 500GB cho máy không còn khe M.2.', 2890000, 3090000, 25, N'storage',
  N'["500GB", "SATA", "2.5 inch"]',
  N'{"type":"storage","capacityGB":500,"storageInterface":"SATA"}', NULL, NULL),
(N'corsair-rm850e', N'Corsair RM850e 850W ATX 3.1 80 Plus Gold', N'Corsair', N'Nguồn 850W full modular chuẩn ATX 3.1 cho card cao cấp.', 2990000, 3690000, 15, N'components',
  N'["850W", "80 Plus Gold", "ATX 3.1"]',
  N'{"type":"psu","psuWatts":850}', NULL, NULL),
(N'deepcool-ak400-digital-argb', N'Deepcool AK400 DIGITAL ARGB', N'Deepcool', N'Tản khí tháp đơn cao 155mm, màn hình nhiệt độ CPU.', 990000, NULL, 30, N'components',
  N'["Tháp đơn", "Cao 155mm", "ARGB"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700,LGA1851","heightMm":155}', NULL, NULL),
(N'cooler-master-hyper-620s', N'Cooler Master Hyper 620S', N'Cooler Master', N'Tản khí tháp đôi 2 quạt cho CPU cao cấp, cao 158mm.', 790000, 990000, 20, N'components',
  N'["Tháp đôi", "2 quạt", "Cao 158mm"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700,LGA1851","heightMm":158}', NULL, NULL),
(N'id-cooling-se-214-xt-argb', N'ID-COOLING SE-214-XT ARGB', N'ID-COOLING', N'Tản khí tháp đơn giá rẻ, cao 150mm.', 390000, 430000, 40, N'components',
  N'["Tháp đơn", "Cao 150mm", "ARGB"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700,LGA1851","heightMm":150}', NULL, NULL);

INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, s.Price, s.OldPrice, SYSDATETIME()
FROM @Seed s
JOIN dbo.Products p ON p.Slug = s.Slug
WHERE p.Price <> s.Price OR ISNULL(p.OldPrice, -1) <> ISNULL(s.OldPrice, -1);

UPDATE p
SET Price = s.Price, OldPrice = s.OldPrice, Version = p.Version + 1, UpdatedAt = GETDATE()
FROM dbo.Products p
JOIN @Seed s ON s.Slug = p.Slug
WHERE p.Price <> s.Price OR ISNULL(p.OldPrice, -1) <> ISNULL(s.OldPrice, -1);

INSERT INTO dbo.Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured, Rating, ReviewsCount)
SELECT s.Name, s.Slug, s.Brand, s.Description, s.Price, s.OldPrice, s.Stock, c.CategoryID, s.Specs, N'[]', 0, 0, 0
FROM @Seed s
JOIN dbo.Categories c ON c.Slug = s.CategorySlug
WHERE s.Name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.Products p WHERE p.Slug = s.Slug);

DECLARE @Specs TABLE (
  ProductID INT PRIMARY KEY,
  ComponentType NVARCHAR(20), Socket NVARCHAR(20), MemoryType NVARCHAR(10), FormFactor NVARCHAR(10),
  SupportedFormFactors NVARCHAR(50), SupportedSockets NVARCHAR(100), PowerW INT, PsuWatts INT,
  LengthMm INT, MaxGpuLengthMm INT, HeightMm INT, MaxCoolerHeightMm INT, MemorySlots INT, Modules INT,
  CapacityGB INT, M2Slots INT, StorageInterface NVARCHAR(10), HasIntegratedGraphics BIT, IncludesCooler BIT,
  Tier TINYINT, VramGB INT, M2Size NVARCHAR(10), PcieGen TINYINT
);

INSERT INTO @Specs
SELECT p.ProductID, j.*, s.M2Size, s.PcieGen
FROM @Seed s
JOIN dbo.Products p ON p.Slug = s.Slug
CROSS APPLY OPENJSON(s.SpecJson) WITH (
  ComponentType NVARCHAR(20) '$.type',
  Socket NVARCHAR(20) '$.socket',
  MemoryType NVARCHAR(10) '$.memoryType',
  FormFactor NVARCHAR(10) '$.formFactor',
  SupportedFormFactors NVARCHAR(50) '$.supportedFormFactors',
  SupportedSockets NVARCHAR(100) '$.supportedSockets',
  PowerW INT '$.powerW',
  PsuWatts INT '$.psuWatts',
  LengthMm INT '$.lengthMm',
  MaxGpuLengthMm INT '$.maxGpuLengthMm',
  HeightMm INT '$.heightMm',
  MaxCoolerHeightMm INT '$.maxCoolerHeightMm',
  MemorySlots INT '$.memorySlots',
  Modules INT '$.modules',
  CapacityGB INT '$.capacityGB',
  M2Slots INT '$.m2Slots',
  StorageInterface NVARCHAR(10) '$.storageInterface',
  HasIntegratedGraphics BIT '$.hasIntegratedGraphics',
  IncludesCooler BIT '$.includesCooler',
  Tier TINYINT '$.tier',
  VramGB INT '$.vramGB'
) AS j
WHERE s.SpecJson IS NOT NULL;

DELETE cs FROM dbo.ComponentSpecs cs JOIN @Specs s ON s.ProductID = cs.ProductID;
INSERT INTO dbo.ComponentSpecs (
  ProductID, ComponentType, Socket, MemoryType, FormFactor, SupportedFormFactors, SupportedSockets, PowerW, PsuWatts,
  LengthMm, MaxGpuLengthMm, HeightMm, MaxCoolerHeightMm, MemorySlots, Modules, CapacityGB, M2Slots, StorageInterface,
  HasIntegratedGraphics, IncludesCooler, Tier, VramGB, M2Size, PcieGen
)
SELECT * FROM @Specs;

INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, p.Price, p.OldPrice, p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID);

INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedAt)
SELECT p.ProductID, p.Stock, p.Stock, N'opening', N'Tồn đầu kỳ khi nạp dữ liệu mẫu', p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.StockMovements m WHERE m.ProductID = p.ProductID);

SELECT (SELECT COUNT(*) FROM @Seed) AS CatalogRows, (SELECT COUNT(*) FROM dbo.ComponentSpecs) AS ComponentSpecs;
GO

/*
  Ảnh minh hoạ: mỗi sản phẩm thật (không phải 50.000 "Demo Product") có file frontend-app/public/images/products/<slug>.svg
  do scripts/generate-product-images.js sinh từ chính các file seed. Chỉ gắn cho sản phẩm chưa có ảnh.
  Sản phẩm không có file riêng (do quản trị thêm) hiện ảnh theo danh mục ở giao diện.
*/
SET NOCOUNT ON;

DECLARE @HasImage TABLE (Slug NVARCHAR(240) PRIMARY KEY);
INSERT INTO @HasImage (Slug)
SELECT value FROM OPENJSON(N'["amd-radeon-rx-7600-8gb", "amd-ryzen-5-5600", "amd-ryzen-5-5600x", "amd-ryzen-5-7600", "amd-ryzen-5-9600x", "amd-ryzen-7-7700", "amd-ryzen-7-7800x3d", "amd-ryzen-7-9700x", "amd-ryzen-7-9800x3d", "amd-ryzen-9-7900x", "amd-ryzen-9-9900x", "asrock-b650i-lightning-wifi", "asus-prime-b550m-a", "asus-prime-b650m-a-wifi-ii", "asus-prime-b760m-a-d4-csm", "asus-prime-rtx-5070-12g", "asus-prime-rtx-5080-16g", "asus-prime-rx-9070-xt-oc-16g", "asus-rog-zephyrus-g16-gu606", "asus-tuf-rtx-5080-16g", "binhtinh-aio-240", "binhtinh-air-m", "binhtinh-compact-m", "binhtinh-flow-a", "binhtinh-low-profile-47", "binhtinh-mini-c1", "bt-rtx-5070-gaming-pc", "cloud-alpha-wireless", "cooler-master-hyper-620s", "cooler-master-mwe-gold-850-v2", "corsair-cv550", "corsair-cx650", "corsair-rm1000e", "corsair-rm750e", "corsair-rm850e", "corsair-vengeance-32gb-ddr4-3200", "corsair-vengeance-64gb-ddr5-6000", "creator-studio-pc-pro", "crucial-16gb-ddr4-3200-sodimm", "crucial-32gb-kit-2x16gb-ddr4-3200-sodimm", "crucial-32gb-kit-2x16gb-ddr5-5600-sodimm", "crucial-64gb-kit-2x32gb-ddr5-5600-sodimm", "crucial-mx500-1tb", "deepcool-ak400", "deepcool-ak400-digital-argb", "dell-ultrasharp-u2724de", "gigabyte-b650m-gaming-plus-wifi", "gigabyte-b760m-ds3h-ddr4", "gigabyte-b850-aorus-elite-wifi7", "gigabyte-b850i-aorus-pro", "gigabyte-b850m-aorus-elite-wifi6e", "gigabyte-b860m-ds3h-ddr5", "gigabyte-rtx-4060-ti-16g", "gigabyte-rtx-5070-ti-16g", "gigabyte-rtx-5070-windforce-oc-sff-12g", "gigabyte-rx-9060-xt-gaming-oc-8g", "gigabyte-rx-9070-gaming-oc-16g", "gigabyte-z890-eagle-wifi7", "gskill-flare-x5-32gb-ddr5-6000", "hyperx-cloud-alpha-2-wireless", "id-cooling-se-214-xt-argb", "intel-arc-b580-12gb", "intel-core-i3-12100f", "intel-core-i5-12400", "intel-core-i5-14400f", "intel-core-i7-14700k", "intel-core-ultra-5-225", "intel-core-ultra-5-250k-plus", "intel-core-ultra-7-270k-plus", "keychron-k5m-brown", "keychron-k8-pro", "kingston-fury-beast-16gb-ddr4-3200", "kingston-fury-beast-16gb-ddr5-5200", "kingston-fury-beast-32gb-ddr5-5600", "kingston-fury-impact-16gb-ddr5-5600-sodimm", "kingston-fury-impact-32gb-ddr5-5600-sodimm", "kingston-fury-impact-8gb-ddr4-3200-sodimm", "kingston-fury-impact-8gb-ddr5-5600-sodimm", "kingston-nv3-1tb", "kingston-nv3-500gb", "klevv-cras-c710-256gb", "legion-slim-5", "lenovo-legion-5-15iax11", "lenovo-thinkbook-14-g8-ial", "logitech-brio-4k", "logitech-g-pro-x-superlight", "logitech-g-pro-x-superlight-2", "msi-b650m-gaming-plus-wifi", "msi-mag-a650bn", "msi-mag-b760m-mortar-ii-wifi-ddr5", "msi-pro-b650-p-wifi", "msi-pro-b760m-a-wifi", "msi-pro-b760m-e-ddr4", "msi-pro-z790-a-wifi", "msi-rtx-3060-ventus-2x-12g", "msi-rtx-4060-ventus-2x-8g", "msi-rtx-5060-ventus-2x-oc-8g", "odyssey-27-240hz", "pny-cs900-500gb", "samsung-870-evo-500gb", "samsung-9100-pro-1tb", "samsung-990-pro-2tb", "samsung-odyssey-oled-g6-27-360hz", "seagate-barracuda-2tb", "seasonic-focus-gx-850", "teamgroup-64gb-4x16gb-ddr4-3200", "thermalright-peerless-assassin-120-se", "thinkbook-14-g7", "ultrasharp-27-4k-usb-c", "wd-black-sn770m-1tb-2230", "wd-blue-sn580-1tb", "zephyrus-g16-oled", "zotac-rtx-5050-twin-edge-oc-8g", "zotac-rtx-5060-ti-16g-twin-edge-oc"]');

UPDATE p
SET Images = N'["/images/products/' + p.Slug + N'.svg"]', Version = Version + 1, UpdatedAt = GETDATE()
FROM dbo.Products p
JOIN @HasImage h ON h.Slug = p.Slug
WHERE p.IsGenerated = 0
  AND (p.Images IS NULL OR LTRIM(RTRIM(p.Images)) IN (N'', N'[]'));

SELECT COUNT(*) AS ProductsWithImages FROM dbo.Products WHERE IsGenerated = 0 AND Images LIKE N'%/images/products/%';
GO

/*
  Phiên đấu giá còn mở theo giá RAM cũ (giá khởi điểm dưới 40% giá niêm yết hiện tại): huỷ như quản trị bấm huỷ.
  Database cài mới không có phiên nào như vậy (012 đã dùng giá mới).
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @now DATETIME2(3) = SYSDATETIME();
DECLARE @admin INT = (SELECT TOP 1 UserID FROM dbo.Users WHERE Email = N'admin@btstore.local');
DECLARE @Outdated TABLE (AuctionID INT PRIMARY KEY, ProductID INT, Title NVARCHAR(150));

BEGIN TRANSACTION;

INSERT INTO @Outdated (AuctionID, ProductID, Title)
SELECT a.AuctionID, a.ProductID, a.Title
FROM dbo.Auctions a WITH (UPDLOCK, HOLDLOCK)
JOIN dbo.Products p ON p.ProductID = a.ProductID
WHERE a.Status = N'active'
  AND a.StartingPrice < p.Price * 0.4;

UPDATE a
SET Status = N'cancelled', EndedAt = @now, Version = a.Version + 1, UpdatedAt = @now
FROM dbo.Auctions a
JOIN @Outdated o ON o.AuctionID = a.AuctionID;

-- Trả sản phẩm về kho (mỗi phiên giữ 1 cái), ghi sổ kho như khi huỷ phiên.
DECLARE @auctionId INT, @productId INT;
DECLARE outdated_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT AuctionID, ProductID FROM @Outdated;
OPEN outdated_cursor;
FETCH NEXT FROM outdated_cursor INTO @auctionId, @productId;
WHILE @@FETCH_STATUS = 0
BEGIN
  UPDATE dbo.Products SET Stock = Stock + 1, Version = Version + 1, UpdatedAt = GETDATE() WHERE ProductID = @productId;
  INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
  SELECT @productId, 1, Stock, N'auction', N'Huỷ phiên đấu giá #' + CAST(@auctionId AS NVARCHAR(10)) + N' (mở theo giá RAM cũ)', @admin
  FROM dbo.Products WHERE ProductID = @productId;
  FETCH NEXT FROM outdated_cursor INTO @auctionId, @productId;
END
CLOSE outdated_cursor;
DEALLOCATE outdated_cursor;

INSERT INTO dbo.Notifications (UserID, Type, Title, Body, Link)
SELECT DISTINCT b.UserID, N'auction', LEFT(N'Phiên đấu giá đã huỷ: ' + o.Title, 200),
       N'Phiên mở theo giá RAM cũ nên cửa hàng huỷ và mở đợt mới theo giá hiện tại. Lượt trả giá của bạn không bị tính.',
       N'/dau-gia/' + CAST(o.AuctionID AS NVARCHAR(10))
FROM @Outdated o
JOIN dbo.AuctionBids b ON b.AuctionID = o.AuctionID
JOIN dbo.Users u ON u.UserID = b.UserID AND u.IsActive = 1;

COMMIT TRANSACTION;

SELECT COUNT(*) AS CancelledOutdatedAuctions FROM @Outdated;

-- Đợt mới theo giá hiện tại khi không còn phiên nào đang mở hoặc sắp mở.
IF EXISTS (SELECT 1 FROM dbo.Auctions WHERE Status = N'active' AND EndsAt > SYSDATETIME())
BEGIN
  PRINT 'Active auctions exist, skip new round';
  RETURN;
END

DECLARE @Plan TABLE (
  Code NVARCHAR(10) PRIMARY KEY, Slug NVARCHAR(240), Title NVARCHAR(150), Description NVARCHAR(1000),
  StartingPrice DECIMAL(18,2), BidIncrement DECIMAL(18,2), BuyNowPrice DECIMAL(18,2) NULL,
  StartMinutes INT, EndMinutes INT
);
INSERT INTO @Plan VALUES
  (N'C1', N'kingston-fury-beast-32gb-ddr5-5600', N'Kingston FURY Beast 32GB DDR5 5600 - đợt tháng 11',
   N'Bộ 2 thanh 16GB DDR5 5600 cho mainboard DDR5 (AM5, LGA1851, Intel 12-14 bản DDR5). Giá niêm yết đang khoảng 10 triệu.',
   6000000, 100000, 9490000, -10, 48 * 60),
  (N'C2', N'gskill-flare-x5-32gb-ddr5-6000', N'G.Skill Flare X5 32GB DDR5 6000 cho Ryzen 9000',
   N'Kit 2x16GB DDR5 6000 hồ sơ EXPO, hợp Ryzen 7000/9000. Hàng mới, bảo hành chính hãng.',
   6500000, 100000, 9990000, -5, 6 * 60),
  (N'C3', N'corsair-vengeance-64gb-ddr5-6000', N'Corsair Vengeance 64GB DDR5 6000 - cho máy chạy AI',
   N'Kit 2x32GB DDR5 6000, đủ RAM cho Docker, máy ảo và mô hình AI chạy trên CPU.',
   12000000, 200000, 18490000, -5, 24 * 60),
  (N'C4', N'corsair-vengeance-32gb-ddr4-3200', N'Corsair Vengeance LPX 32GB DDR4 3200 - nâng cấp máy cũ',
   N'Kit 2x16GB DDR4 3200 cho mainboard DDR4 (AM4, Intel đời 12-14 bản DDR4).',
   4000000, 100000, NULL, -5, 72 * 60),
  (N'C5', N'crucial-32gb-kit-2x16gb-ddr5-5600-sodimm', N'Crucial 32GB DDR5 5600 SO-DIMM cho laptop',
   N'Kit 2x16GB SO-DIMM DDR5 cho laptop có 2 khe RAM (xem "Máy chạy được gì?" để biết laptop của bạn nâng được không). Phiên mở vào ngày mai.',
   7500000, 100000, NULL, 24 * 60, 72 * 60);

DECLARE @code NVARCHAR(10), @newAuction INT, @planProduct INT;
DECLARE plan_cursor CURSOR LOCAL FAST_FORWARD FOR
  SELECT pl.Code, p.ProductID FROM @Plan pl JOIN dbo.Products p ON p.Slug = pl.Slug AND p.IsDeleted = 0 AND p.Stock > 0
  ORDER BY pl.Code;
OPEN plan_cursor;
FETCH NEXT FROM plan_cursor INTO @code, @planProduct;
WHILE @@FETCH_STATUS = 0
BEGIN
  INSERT INTO dbo.Auctions (ProductID, Title, Description, StartingPrice, BidIncrement, BuyNowPrice, StartsAt, EndsAt, ScheduledEndsAt, CreatedBy)
  SELECT @planProduct, Title, Description, StartingPrice, BidIncrement, BuyNowPrice,
         DATEADD(MINUTE, StartMinutes, @now), DATEADD(MINUTE, EndMinutes, @now), DATEADD(MINUTE, EndMinutes, @now), @admin
  FROM @Plan WHERE Code = @code;
  SET @newAuction = SCOPE_IDENTITY();

  UPDATE dbo.Products SET Stock = Stock - 1, Version = Version + 1, UpdatedAt = GETDATE() WHERE ProductID = @planProduct;
  INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
  SELECT @planProduct, -1, Stock, N'auction', N'Giữ cho phiên đấu giá #' + CAST(@newAuction AS NVARCHAR(10)), @admin
  FROM dbo.Products WHERE ProductID = @planProduct;

  FETCH NEXT FROM plan_cursor INTO @code, @planProduct;
END
CLOSE plan_cursor;
DEALLOCATE plan_cursor;

PRINT 'Seeded new RAM auction round';
GO

/* Lịch sử giá mẫu cho sản phẩm vừa thêm (cùng cách 011/013). */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @targets TABLE (
  ProductID INT PRIMARY KEY, Price DECIMAL(18,2) NOT NULL, OldPrice DECIMAL(18,2) NULL,
  Kind NVARCHAR(10) NOT NULL, Points INT NOT NULL, LastDays INT NOT NULL
);

INSERT INTO @targets (ProductID, Price, OldPrice, Kind, Points, LastDays)
SELECT p.ProductID, p.Price, p.OldPrice,
       CASE
         WHEN cs.ComponentType IN (N'ram', N'laptop_ram', N'storage') OR c.Slug = N'storage' THEN N'memory'
         WHEN cs.ComponentType = N'gpu' THEN N'gpu'
         ELSE N'other'
       END,
       5 + ABS(CHECKSUM(p.ProductID, N'points')) % 6,
       2 + ABS(CHECKSUM(p.ProductID, N'last')) % 20
FROM dbo.Products p
LEFT JOIN dbo.ComponentSpecs cs ON cs.ProductID = p.ProductID
LEFT JOIN dbo.Categories c ON c.CategoryID = p.CategoryID
WHERE p.IsDeleted = 0
  AND p.IsGenerated = 0
  AND (SELECT COUNT(*) FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID) = 1
  AND EXISTS (SELECT 1 FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID AND h.Price = p.Price);

DECLARE @series TABLE (ProductID INT, K INT, DaysAgo INT, Factor DECIMAL(9,4), PRIMARY KEY (ProductID, K));

WITH n AS (SELECT v AS K FROM (VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)) x(v))
INSERT INTO @series (ProductID, K, DaysAgo, Factor)
SELECT t.ProductID, n.K,
       CASE WHEN n.K = t.Points - 1 THEN t.LastDays
            ELSE t.LastDays + (t.Points - 1 - n.K) * (170 - t.LastDays) / (t.Points - 1) - ABS(CHECKSUM(t.ProductID, n.K, N'day')) % 5
       END,
       CASE WHEN n.K = t.Points - 1 THEN 1.0
            WHEN t.Kind = N'memory' THEN 0.66 + 0.34 * n.K / (t.Points - 1) + (ABS(CHECKSUM(t.ProductID, n.K, N'f')) % 41 - 20) / 1000.0
            WHEN t.Kind = N'gpu' THEN 1.12 - 0.12 * n.K / (t.Points - 1) + (ABS(CHECKSUM(t.ProductID, n.K, N'f')) % 41 - 20) / 1000.0
            ELSE 1.0 + (ABS(CHECKSUM(t.ProductID, n.K, N'f')) % 121 - 60) / 1000.0
       END
FROM @targets t
JOIN n ON n.K < t.Points;

BEGIN TRANSACTION;

DELETE h FROM dbo.PriceHistory h JOIN @targets t ON t.ProductID = h.ProductID;

INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT s.ProductID,
       CASE WHEN s.K = t.Points - 1 THEN t.Price ELSE ROUND(t.Price * s.Factor / 10000, 0) * 10000 END,
       CASE WHEN s.K = t.Points - 1 THEN t.OldPrice ELSE NULL END,
       DATEADD(MINUTE, -(ABS(CHECKSUM(s.ProductID, s.K, N'minute')) % 600), DATEADD(DAY, -s.DaysAgo, SYSDATETIME()))
FROM @series s
JOIN @targets t ON t.ProductID = s.ProductID;

COMMIT TRANSACTION;

SELECT COUNT(*) AS NewProductsWithPriceHistory FROM @targets;
GO
