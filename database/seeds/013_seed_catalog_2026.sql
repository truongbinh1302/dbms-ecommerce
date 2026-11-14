USE ecommerce_dbms;
GO

/*
  Cập nhật catalog theo thị trường tháng 11/2026 (giá tham khảo GearVN và vài shop lớn, ngày 14/11/2026,
  làm tròn; nguồn ghi ở docs/cap-nhat-catalog-2026.md).
  1) Ngừng bán (IsDeleted = 1) các mẫu cũ đã hết hàng ngoài thị trường hoặc có đời mới thay thế.
     Đơn hàng, đánh giá, lịch sử giá của chúng vẫn giữ nguyên. Không đụng sản phẩm đang có phiên đấu giá mở.
  2) Cập nhật giá hàng còn bán. Mỗi lần đổi giá ghi một mốc PriceHistory như khi quản trị sửa giá.
  3) Thêm đời mới: Ryzen 9000, Core Ultra 200S / 200S Plus (LGA1851), B850 / B860 / Z890, RTX 50, RX 9000,
     SSD Gen5, laptop 2026 và vài phụ kiện thay mẫu cũ.
  4) Tản nhiệt hỗ trợ LGA1851 (dùng chung ngàm với LGA1700).
  5) Model laptop mới cho "Máy chạy được gì?", gắn với sản phẩm đang bán.
  6) Mở một đợt đấu giá RAM mới nếu không còn phiên nào đang mở.
  Chạy lại an toàn: sản phẩm có rồi (theo Slug) chỉ cập nhật, không thêm trùng.
  Giá RAM và SSD tăng mạnh từ cuối 2025 vì nhu cầu AI: bộ DDR5 32GB nay khoảng 10 triệu.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Retire TABLE (Slug NVARCHAR(240) PRIMARY KEY);
INSERT INTO @Retire (Slug) VALUES
  -- CPU / mainboard đời cũ có bản mới thay
  (N'amd-ryzen-5-5600'), (N'amd-ryzen-7-7700'), (N'amd-ryzen-9-7900x'), (N'msi-pro-z790-a-wifi'),
  -- Card đồ hoạ đời RTX 40 / RX 7000 / RTX 3060 đã thay bằng RTX 50 và RX 9000
  (N'amd-radeon-rx-7600-8gb'), (N'msi-rtx-4060-ventus-2x-8g'), (N'msi-rtx-3060-ventus-2x-12g'), (N'gigabyte-rtx-4060-ti-16g'),
  -- Ổ và nguồn không còn bán
  (N'wd-blue-sn580-1tb'), (N'crucial-mx500-1tb'), (N'corsair-cv550'),
  -- Sản phẩm trưng bày đời cũ
  (N'zephyrus-g16-oled'), (N'legion-slim-5'), (N'thinkbook-14-g7'), (N'ultrasharp-27-4k-usb-c'), (N'odyssey-27-240hz'),
  (N'keychron-k8-pro'), (N'logitech-g-pro-x-superlight'), (N'cloud-alpha-wireless');

UPDATE p
SET IsDeleted = 1, IsFeatured = 0, Version = Version + 1, UpdatedAt = GETDATE()
FROM dbo.Products p
JOIN @Retire r ON r.Slug = p.Slug
WHERE p.IsDeleted = 0
  AND NOT EXISTS (SELECT 1 FROM dbo.Auctions a WHERE a.ProductID = p.ProductID AND a.Status IN (N'active', N'won'));

/*
  Name, Description, Specs để NULL: giữ như cũ, chỉ đổi giá. SpecJson NULL: không đổi thông số Build PC.
  OldPrice: giá niêm yết trước giảm của shop (NULL nếu shop không giảm).
*/
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
  IsFeatured BIT NOT NULL DEFAULT 0,
  M2Size NVARCHAR(10) NULL,
  PcieGen TINYINT NULL
);

INSERT INTO @Seed (Slug, Name, Brand, Description, Price, OldPrice, Stock, CategorySlug, Specs, SpecJson, IsFeatured, M2Size, PcieGen) VALUES
-- ===== Giá mới cho hàng còn bán =====
(N'amd-ryzen-5-7600', NULL, NULL, NULL, 5790000, 5990000, 35, N'components', NULL, NULL, 0, NULL, NULL),
(N'amd-ryzen-7-7800x3d', NULL, NULL, NULL, 11990000, 12990000, 15, N'components', NULL, NULL, 0, NULL, NULL),
(N'intel-core-i3-12100f', NULL, NULL, NULL, 3290000, 3990000, 50, N'components', NULL, NULL, 0, NULL, NULL),
(N'intel-core-i5-12400', NULL, NULL, NULL, 5490000, 5990000, 45, N'components', NULL, NULL, 0, NULL, NULL),
(N'intel-core-i5-14400f', NULL, NULL, NULL, 5190000, 5990000, 30, N'components', NULL, NULL, 0, NULL, NULL),
(N'intel-core-i7-14700k', NULL, NULL, NULL, 12290000, 13590000, 10, N'components', NULL, NULL, 0, NULL, NULL),
(N'asus-prime-b550m-a', NULL, NULL, NULL, 2590000, 2890000, 25, N'components', NULL, NULL, 0, NULL, NULL),
(N'asus-prime-b650m-a-wifi-ii', NULL, NULL, NULL, 3990000, 4490000, 25, N'components', NULL, NULL, 0, NULL, NULL),
(N'msi-pro-b650-p-wifi', NULL, NULL, NULL, 4490000, 4990000, 20, N'components', NULL, NULL, 0, NULL, NULL),
(N'asrock-b650i-lightning-wifi', NULL, NULL, NULL, 5490000, 5990000, 8, N'components', NULL, NULL, 0, NULL, NULL),
(N'gigabyte-b760m-ds3h-ddr4', NULL, NULL, NULL, 2790000, 2990000, 30, N'components', NULL, NULL, 0, NULL, NULL),
(N'msi-pro-b760m-a-wifi', NULL, NULL, NULL, 3490000, 3990000, 20, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-fury-beast-16gb-ddr4-3200', NULL, NULL, NULL, 3990000, 4590000, 30, N'components', NULL, NULL, 0, NULL, NULL),
(N'corsair-vengeance-32gb-ddr4-3200', NULL, NULL, NULL, 6990000, 7990000, 20, N'components', NULL, NULL, 0, NULL, NULL),
(N'teamgroup-64gb-4x16gb-ddr4-3200', NULL, NULL, NULL, 13490000, 14990000, 6, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-fury-beast-16gb-ddr5-5200', NULL, NULL, NULL, 6490000, 6990000, 20, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-fury-beast-32gb-ddr5-5600', NULL, NULL, NULL, 9990000, 10490000, 15, N'components', NULL, NULL, 0, NULL, NULL),
(N'gskill-flare-x5-32gb-ddr5-6000', NULL, NULL, NULL, 10490000, 11490000, 12, N'components', NULL, NULL, 0, NULL, NULL),
(N'corsair-vengeance-64gb-ddr5-6000', NULL, NULL, NULL, 19490000, 21490000, 5, N'components', NULL, NULL, 0, NULL, NULL),
(N'intel-arc-b580-12gb', NULL, NULL, NULL, 8990000, 9990000, 15, N'components', NULL, NULL, 0, NULL, NULL),
(N'asus-prime-rtx-5070-12g', NULL, NULL, NULL, 26990000, 28990000, 12, N'components', NULL, NULL, 0, NULL, NULL),
(N'gigabyte-rtx-5070-ti-16g', NULL, NULL, NULL, 40990000, 41990000, 8, N'components', NULL, NULL, 0, NULL, NULL),
(N'asus-tuf-rtx-5080-16g', NULL, NULL, NULL, 60990000, 64990000, 5, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-nv3-500gb', NULL, NULL, NULL, 3890000, 5490000, 40, N'storage', NULL, NULL, 0, NULL, NULL),
(N'samsung-870-evo-500gb', NULL, NULL, NULL, 2890000, 3190000, 25, N'storage', NULL, NULL, 0, NULL, NULL),
(N'samsung-990-pro-2tb', N'Samsung 990 Pro 2TB', N'Samsung', N'SSD NVMe PCIe 4.0 cao cấp, đọc 7.450MB/s.', 16990000, 17990000, 20, N'storage', N'["2TB", "PCIe 4.0", "7450MB/s"]', NULL, 0, NULL, NULL),
(N'seagate-barracuda-2tb', NULL, NULL, NULL, 2590000, 2890000, 30, N'storage', NULL, NULL, 0, NULL, NULL),
(N'msi-mag-a650bn', NULL, NULL, NULL, 1290000, 1490000, 35, N'components', NULL, NULL, 0, NULL, NULL),
(N'corsair-rm750e', NULL, NULL, NULL, 2590000, 2890000, 25, N'components', NULL, NULL, 0, NULL, NULL),
(N'seasonic-focus-gx-850', NULL, NULL, NULL, 3290000, 3590000, 15, N'components', NULL, NULL, 0, NULL, NULL),
(N'corsair-rm1000e', NULL, NULL, NULL, 3990000, 4590000, 10, N'components', NULL, NULL, 0, NULL, NULL),
(N'deepcool-ak400', NULL, NULL, NULL, 790000, 990000, 40, N'components', NULL, NULL, 0, NULL, NULL),
(N'thermalright-peerless-assassin-120-se', NULL, NULL, NULL, 790000, 890000, 30, N'components', NULL, NULL, 0, NULL, NULL),
-- RAM và SSD laptop (giá SO-DIMM tăng theo RAM máy bàn)
(N'kingston-fury-impact-8gb-ddr5-5600-sodimm', NULL, NULL, NULL, 3490000, 3890000, 30, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-fury-impact-16gb-ddr5-5600-sodimm', NULL, NULL, NULL, 6490000, 6990000, 25, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-fury-impact-32gb-ddr5-5600-sodimm', NULL, NULL, NULL, 11990000, 12990000, 10, N'components', NULL, NULL, 0, NULL, NULL),
(N'crucial-32gb-kit-2x16gb-ddr5-5600-sodimm', NULL, NULL, NULL, 12990000, 13990000, 12, N'components', NULL, NULL, 0, NULL, NULL),
(N'crucial-64gb-kit-2x32gb-ddr5-5600-sodimm', NULL, NULL, NULL, 25990000, 27990000, 4, N'components', NULL, NULL, 0, NULL, NULL),
(N'kingston-fury-impact-8gb-ddr4-3200-sodimm', NULL, NULL, NULL, 1990000, 2590000, 40, N'components', NULL, NULL, 0, NULL, NULL),
(N'crucial-16gb-ddr4-3200-sodimm', NULL, NULL, NULL, 3390000, 3990000, 30, N'components', NULL, NULL, 0, NULL, NULL),
(N'crucial-32gb-kit-2x16gb-ddr4-3200-sodimm', NULL, NULL, NULL, 6990000, 7990000, 15, N'components', NULL, NULL, 0, NULL, NULL),
(N'wd-black-sn770m-1tb-2230', NULL, NULL, NULL, 5490000, 5990000, 15, N'storage', NULL, NULL, 0, NULL, NULL),
-- Máy bộ của cửa hàng ráp từ linh kiện đời mới
(N'bt-rtx-5070-gaming-pc', N'BT RTX 5070 Gaming PC', N'BinhTinh',
  N'PC chơi game 2K: Ryzen 7 9700X, RTX 5070 12GB, 32GB DDR5 6000, SSD 1TB, nguồn 750W Gold.',
  59990000, 63990000, 10, N'pc-gaming', N'["Ryzen 7 9700X", "RTX 5070", "32GB RAM", "1TB NVMe"]', NULL, 1, NULL, NULL),
(N'creator-studio-pc-pro', N'Creator Studio PC Pro', N'BinhTinh',
  N'Máy trạm dựng phim, render và chạy AI: Core Ultra 9 285K, RTX 5080 16GB, 64GB DDR5, SSD 2TB.',
  124990000, 132990000, 4, N'pc-gaming', N'["Core Ultra 9 285K", "RTX 5080", "64GB RAM", "2TB NVMe"]', NULL, 1, NULL, NULL),
(N'logitech-brio-4k', N'Logitech Brio 4K', N'Logitech', N'Webcam 4K HDR cho họp online và livestream, hỗ trợ Windows Hello.',
  4590000, NULL, 20, N'cameras', N'["4K", "HDR", "Windows Hello"]', NULL, 0, NULL, NULL),

-- ===== Hàng mới =====
-- CPU. tier: 1 = phổ thông, 2 = nhiều nhân cho lập trình/đồ hoạ, 3 = cao cấp. powerW: công suất tối đa (PPT/PL2).
(N'amd-ryzen-5-5600x', N'AMD Ryzen 5 5600X', N'AMD', N'CPU 6 nhân 12 luồng socket AM4 dùng RAM DDR4 (rẻ hơn DDR5 nhiều), kèm tản Wraith Stealth.', 4690000, 4990000, 25, N'components',
  N'["6 nhân 12 luồng", "AM4", "DDR4", "Kèm tản"]',
  N'{"type":"cpu","socket":"AM4","powerW":88,"hasIntegratedGraphics":false,"includesCooler":true,"tier":1}', 0, NULL, NULL),
(N'amd-ryzen-5-9600x', N'AMD Ryzen 5 9600X', N'AMD', N'CPU Zen 5 6 nhân 12 luồng socket AM5, có nhân đồ hoạ, không kèm tản.', 7900000, 8190000, 30, N'components',
  N'["6 nhân 12 luồng", "AM5", "DDR5", "Có iGPU", "Không kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":88,"hasIntegratedGraphics":true,"includesCooler":false,"tier":1}', 0, NULL, NULL),
(N'amd-ryzen-7-9700x', N'AMD Ryzen 7 9700X', N'AMD', N'CPU Zen 5 8 nhân 16 luồng cho lập trình, đồ hoạ và chơi game, không kèm tản.', 9990000, 11990000, 25, N'components',
  N'["8 nhân 16 luồng", "AM5", "DDR5", "Có iGPU", "Không kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":88,"hasIntegratedGraphics":true,"includesCooler":false,"tier":2}', 0, NULL, NULL),
(N'amd-ryzen-7-9800x3d', N'AMD Ryzen 7 9800X3D', N'AMD', N'CPU chơi game 8 nhân với 3D V-Cache thế hệ 2, không kèm tản.', 13890000, 16990000, 12, N'components',
  N'["8 nhân 16 luồng", "AM5", "3D V-Cache", "Không kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":162,"hasIntegratedGraphics":true,"includesCooler":false,"tier":3}', 0, NULL, NULL),
(N'amd-ryzen-9-9900x', N'AMD Ryzen 9 9900X', N'AMD', N'CPU 12 nhân 24 luồng cho dựng phim, render, không kèm tản.', 12690000, 13690000, 10, N'components',
  N'["12 nhân 24 luồng", "AM5", "DDR5", "Không kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":162,"hasIntegratedGraphics":true,"includesCooler":false,"tier":3}', 0, NULL, NULL),
(N'intel-core-ultra-5-225', N'Intel Core Ultra 5 225', N'Intel', N'CPU 10 nhân socket LGA1851, có nhân đồ hoạ, kèm tản. Chỉ dùng RAM DDR5.', 5490000, 6890000, 30, N'components',
  N'["10 nhân 10 luồng", "LGA1851", "DDR5", "Có iGPU", "Kèm tản"]',
  N'{"type":"cpu","socket":"LGA1851","powerW":121,"hasIntegratedGraphics":true,"includesCooler":true,"tier":1}', 0, NULL, NULL),
(N'intel-core-ultra-5-250k-plus', N'Intel Core Ultra 5 250K Plus', N'Intel', N'CPU Arrow Lake Refresh 18 nhân socket LGA1851, mở khoá ép xung, không kèm tản.', 7190000, 8090000, 25, N'components',
  N'["18 nhân 18 luồng", "LGA1851", "DDR5", "Có iGPU", "Không kèm tản"]',
  N'{"type":"cpu","socket":"LGA1851","powerW":159,"hasIntegratedGraphics":true,"includesCooler":false,"tier":2}', 0, NULL, NULL),
(N'intel-core-ultra-7-270k-plus', N'Intel Core Ultra 7 270K Plus', N'Intel', N'CPU Arrow Lake Refresh 24 nhân socket LGA1851 cho máy trạm, không kèm tản.', 9990000, 11990000, 15, N'components',
  N'["24 nhân 24 luồng", "LGA1851", "DDR5", "Có iGPU", "Không kèm tản"]',
  N'{"type":"cpu","socket":"LGA1851","powerW":250,"hasIntegratedGraphics":true,"includesCooler":false,"tier":3}', 0, NULL, NULL),
-- Mainboard
(N'gigabyte-b850m-aorus-elite-wifi6e', N'GIGABYTE B850M AORUS ELITE WIFI6E', N'GIGABYTE', N'Mainboard mATX socket AM5, 4 khe DDR5, Wi-Fi 6E, 3 khe M.2.', 5390000, 6090000, 20, N'components',
  N'["AM5", "mATX", "DDR5", "Wi-Fi 6E"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":3}', 0, NULL, NULL),
(N'gigabyte-b850-aorus-elite-wifi7', N'GIGABYTE B850 AORUS ELITE WIFI7', N'GIGABYTE', N'Mainboard ATX socket AM5, 4 khe DDR5, Wi-Fi 7, 3 khe M.2.', 6290000, 7190000, 12, N'components',
  N'["AM5", "ATX", "DDR5", "Wi-Fi 7"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"ATX","memorySlots":4,"m2Slots":3}', 0, NULL, NULL),
(N'gigabyte-b860m-ds3h-ddr5', N'GIGABYTE B860M DS3H DDR5', N'GIGABYTE', N'Mainboard mATX socket LGA1851 cho Core Ultra 200S, 4 khe DDR5.', 4190000, 4290000, 25, N'components',
  N'["LGA1851", "mATX", "DDR5", "2 khe M.2"]',
  N'{"type":"mainboard","socket":"LGA1851","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}', 0, NULL, NULL),
(N'gigabyte-z890-eagle-wifi7', N'GIGABYTE Z890 EAGLE WIFI7', N'GIGABYTE', N'Mainboard ATX socket LGA1851, 4 khe DDR5, Wi-Fi 7, ép xung CPU dòng K.', 6990000, 7990000, 10, N'components',
  N'["LGA1851", "ATX", "DDR5", "Wi-Fi 7"]',
  N'{"type":"mainboard","socket":"LGA1851","memoryType":"DDR5","formFactor":"ATX","memorySlots":4,"m2Slots":3}', 0, NULL, NULL),
-- Card đồ hoạ (lengthMm: chiều dài card, powerW: công suất card)
(N'zotac-rtx-5050-twin-edge-oc-8g', N'ZOTAC GeForce RTX 5050 Twin Edge OC 8GB', N'ZOTAC', N'Card đồ hoạ RTX 5050 8GB cho eSports 1080p, nhỏ gọn.', 8990000, 9490000, 20, N'components',
  N'["8GB GDDR6", "DLSS 4", "1080p"]',
  N'{"type":"gpu","vramGB":8,"lengthMm":210,"powerW":130}', 0, NULL, NULL),
(N'msi-rtx-5060-ventus-2x-oc-8g', N'MSI GeForce RTX 5060 Ventus 2X OC 8GB', N'MSI', N'Card đồ hoạ RTX 5060 8GB cho chơi game 1080p.', 10990000, 11990000, 25, N'components',
  N'["8GB GDDR7", "DLSS 4", "1080p"]',
  N'{"type":"gpu","vramGB":8,"lengthMm":197,"powerW":145}', 0, NULL, NULL),
(N'zotac-rtx-5060-ti-16g-twin-edge-oc', N'ZOTAC GeForce RTX 5060 Ti 16GB Twin Edge OC', N'ZOTAC', N'Card đồ hoạ 16GB VRAM cho chơi game 1440p và chạy mô hình AI cỡ vừa.', 19990000, 21990000, 12, N'components',
  N'["16GB GDDR7", "DLSS 4", "1440p"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":221,"powerW":180}', 0, NULL, NULL),
(N'gigabyte-rx-9060-xt-gaming-oc-8g', N'GIGABYTE Radeon RX 9060 XT Gaming OC 8GB', N'GIGABYTE', N'Card đồ hoạ Radeon RX 9060 XT 8GB cho chơi game 1080p.', 11990000, 12490000, 15, N'components',
  N'["8GB GDDR6", "FSR 4", "1080p"]',
  N'{"type":"gpu","vramGB":8,"lengthMm":281,"powerW":160}', 0, NULL, NULL),
(N'gigabyte-rx-9070-gaming-oc-16g', N'GIGABYTE Radeon RX 9070 Gaming OC 16GB', N'GIGABYTE', N'Card đồ hoạ Radeon RX 9070 16GB cho chơi game 1440p.', 20490000, 22990000, 8, N'components',
  N'["16GB GDDR6", "FSR 4", "1440p"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":288,"powerW":220}', 0, NULL, NULL),
(N'asus-prime-rx-9070-xt-oc-16g', N'ASUS Prime Radeon RX 9070 XT OC 16GB', N'ASUS', N'Card đồ hoạ Radeon RX 9070 XT 16GB cho chơi game 1440p và 4K.', 23490000, 24990000, 8, N'components',
  N'["16GB GDDR6", "FSR 4", "1440p/4K"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":313,"powerW":304}', 0, NULL, NULL),
-- Ổ cứng
(N'kingston-nv3-1tb', N'Kingston NV3 1TB NVMe', N'Kingston', N'SSD NVMe M.2 PCIe 4.0 1TB.', 4990000, 5990000, 40, N'storage',
  N'["1TB", "M.2 2280", "PCIe 4.0"]',
  N'{"type":"storage","capacityGB":1000,"storageInterface":"M.2"}', 0, N'2280', 4),
(N'samsung-9100-pro-1tb', N'Samsung 9100 PRO 1TB', N'Samsung', N'SSD NVMe PCIe 5.0, đọc tới 14.700MB/s, cần khe M.2 Gen5 để chạy hết tốc độ.', 8690000, 9490000, 10, N'storage',
  N'["1TB", "PCIe 5.0", "14700MB/s"]',
  N'{"type":"storage","capacityGB":1000,"storageInterface":"M.2"}', 0, N'2280', 5),
(N'klevv-cras-c710-256gb', N'KLEVV CRAS C710 256GB NVMe', N'KLEVV', N'SSD NVMe M.2 256GB giá rẻ cho máy văn phòng.', 490000, NULL, 30, N'storage',
  N'["256GB", "M.2 2280", "PCIe 3.0"]',
  N'{"type":"storage","capacityGB":256,"storageInterface":"M.2"}', 0, N'2280', 3),
-- Nguồn
(N'corsair-cx650', N'Corsair CX650 650W 80 Plus Bronze', N'Corsair', N'Nguồn 650W cho máy văn phòng và card tầm trung.', 1390000, 1690000, 30, N'components',
  N'["650W", "80 Plus Bronze"]',
  N'{"type":"psu","psuWatts":650}', 0, NULL, NULL),
(N'cooler-master-mwe-gold-850-v2', N'Cooler Master MWE Gold 850 V2 ATX 3.1', N'Cooler Master', N'Nguồn 850W full modular, chuẩn ATX 3.1 cho card RTX 50.', 2990000, 3090000, 15, N'components',
  N'["850W", "80 Plus Gold", "ATX 3.1", "Full modular"]',
  N'{"type":"psu","psuWatts":850}', 0, NULL, NULL),
-- Laptop
(N'asus-rog-zephyrus-g16-gu606', N'ASUS ROG Zephyrus G16 (2026) GU606', N'ASUS',
  N'Laptop chơi game mỏng nhẹ: Core Ultra 9 386H, RTX 5060 8GB, 32GB LPDDR5X, SSD 1TB, màn 16" 2.5K OLED.',
  89990000, NULL, 6, N'gaming-laptops', N'["Core Ultra 9 386H", "RTX 5060 8GB", "32GB RAM", "16\" 2.5K OLED"]', NULL, 1, NULL, NULL),
(N'lenovo-legion-5-15iax11', N'Lenovo Legion 5 15IAX11', N'Lenovo',
  N'Laptop chơi game: Core Ultra 7 251HX, RTX 5060 8GB, 24GB DDR5, SSD 512GB, màn 15.3" OLED 165Hz.',
  62990000, 66990000, 10, N'gaming-laptops', N'["Core Ultra 7 251HX", "RTX 5060 8GB", "24GB RAM", "OLED 165Hz"]', NULL, 1, NULL, NULL),
(N'lenovo-thinkbook-14-g8-ial', N'Lenovo ThinkBook 14 G8 IAL', N'Lenovo',
  N'Laptop văn phòng 14": Core Ultra 7 255H, 16GB DDR5, SSD 512GB, màn WUXGA chống chói.',
  26990000, 28490000, 25, N'office-laptops', N'["Core Ultra 7 255H", "16GB RAM", "512GB SSD", "14\" WUXGA"]', NULL, 0, NULL, NULL),
-- Màn hình, phím, chuột, tai nghe
(N'dell-ultrasharp-u2724de', N'Dell UltraSharp U2724DE', N'Dell', N'Màn hình 27" 2K IPS Black 120Hz, hub USB-C 90W và cổng mạng cho văn phòng, đồ hoạ.',
  12490000, 12990000, 20, N'monitors', N'["27 inch", "2K 120Hz", "USB-C 90W", "IPS Black"]', NULL, 1, NULL, NULL),
(N'samsung-odyssey-oled-g6-27-360hz', N'Samsung Odyssey OLED G6 27" 360Hz', N'Samsung', N'Màn hình chơi game QD-OLED 27" 2K 360Hz, phản hồi 0,03ms.',
  16490000, 24990000, 15, N'monitors', N'["27 inch", "QHD OLED", "360Hz", "0.03ms"]', NULL, 1, NULL, NULL),
(N'keychron-k5m-brown', N'Keychron K5M (Brown switch)', N'Keychron', N'Bàn phím cơ không dây full-size, switch Brown, kết nối Bluetooth và dây.',
  2690000, NULL, 40, N'keyboards', N'["Full-size", "Bluetooth", "Brown switch"]', NULL, 0, NULL, NULL),
(N'logitech-g-pro-x-superlight-2', N'Logitech G Pro X Superlight 2', N'Logitech', N'Chuột chơi game không dây siêu nhẹ 60g, cảm biến HERO 2.',
  3190000, 3890000, 60, N'mice', N'["Không dây", "60g", "HERO 2"]', NULL, 1, NULL, NULL),
(N'hyperx-cloud-alpha-2-wireless', N'HyperX Cloud Alpha 2 Wireless', N'HyperX', N'Tai nghe chơi game không dây, pin dài, driver kép.',
  8190000, 8390000, 15, N'headsets', N'["Không dây", "Driver kép", "Pin dài"]', NULL, 0, NULL, NULL);

-- Mốc giá mới cho sản phẩm có sẵn đổi giá (như khi quản trị sửa giá).
INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, s.Price, s.OldPrice, SYSDATETIME()
FROM @Seed s
JOIN dbo.Products p ON p.Slug = s.Slug
WHERE p.Price <> s.Price OR ISNULL(p.OldPrice, -1) <> ISNULL(s.OldPrice, -1);

UPDATE p
SET Name = COALESCE(s.Name, p.Name),
    Brand = COALESCE(s.Brand, p.Brand),
    Description = COALESCE(s.Description, p.Description),
    Specs = COALESCE(s.Specs, p.Specs),
    Price = s.Price,
    OldPrice = s.OldPrice,
    IsFeatured = CASE WHEN s.Name IS NULL THEN p.IsFeatured ELSE s.IsFeatured END,
    Version = p.Version + 1,
    UpdatedAt = GETDATE()
FROM dbo.Products p
JOIN @Seed s ON s.Slug = p.Slug
WHERE p.Price <> s.Price OR ISNULL(p.OldPrice, -1) <> ISNULL(s.OldPrice, -1)
   OR (s.Name IS NOT NULL AND (p.Name <> s.Name OR p.Description <> s.Description OR p.Specs <> s.Specs));

INSERT INTO dbo.Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured, Rating, ReviewsCount)
SELECT s.Name, s.Slug, s.Brand, s.Description, s.Price, s.OldPrice, s.Stock, c.CategoryID, s.Specs, N'[]', s.IsFeatured, 0, 0
FROM @Seed s
JOIN dbo.Categories c ON c.Slug = s.CategorySlug
WHERE s.Name IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.Products p WHERE p.Slug = s.Slug);

-- Thông số Build PC cho linh kiện mới (cùng cách 003 tách JSON).
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

-- LGA1851 dùng chung ngàm tản với LGA1700.
UPDATE dbo.ComponentSpecs
SET SupportedSockets = SupportedSockets + N',LGA1851'
WHERE ComponentType = N'cooler'
  AND SupportedSockets LIKE N'%LGA1700%'
  AND SupportedSockets NOT LIKE N'%LGA1851%';

-- Mốc giá đầu tiên và tồn đầu kỳ cho sản phẩm mới.
INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, p.Price, p.OldPrice, p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID);

INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedAt)
SELECT p.ProductID, p.Stock, p.Stock, N'opening', N'Tồn đầu kỳ khi nạp dữ liệu mẫu', p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.StockMovements m WHERE m.ProductID = p.ProductID);

SELECT
  (SELECT COUNT(*) FROM dbo.Products p JOIN @Retire r ON r.Slug = p.Slug WHERE p.IsDeleted = 1) AS Retired,
  (SELECT COUNT(*) FROM @Seed) AS CatalogRows,
  (SELECT COUNT(*) FROM dbo.ComponentSpecs) AS ComponentSpecs;
GO

/*
  Model laptop 2026 cho "Máy chạy được gì?" (thông số theo trang Lenovo PSREF, ASUS và shop bán).
  Model cũ vẫn giữ để khách dùng máy cũ tra cứu, chỉ bỏ liên kết tới sản phẩm đã ngừng bán.
*/
SET NOCOUNT ON;

DECLARE @Models TABLE (
  Slug NVARCHAR(80) PRIMARY KEY, Brand NVARCHAR(40), Name NVARCHAR(120), MatchKeys NVARCHAR(300), ProductSlug NVARCHAR(240),
  CpuName NVARCHAR(80), CpuThreads INT, GpuName NVARCHAR(80), VramGB INT,
  RamGB INT, RamType NVARCHAR(10), RamSolderedGB INT, RamSlots INT, MaxRamGB INT,
  M2Slots INT, M2Size NVARCHAR(10), PcieGen TINYINT, StorageGB INT, UnifiedMemory BIT, Note NVARCHAR(300)
);

INSERT INTO @Models VALUES
(N'asus-rog-zephyrus-g16-gu606', N'ASUS', N'ROG Zephyrus G16 (2026) GU606', N'GU606|Zephyrus G16 GU606', N'asus-rog-zephyrus-g16-gu606',
  N'Intel Core Ultra 9 386H', 16, N'NVIDIA GeForce RTX 5060 Laptop GPU', 8,
  32, N'LPDDR5X', 32, 0, 64, 2, N'2280', 4, 1000, 0, N'RAM LPDDR5X hàn trên mainboard (bản 32 GB hoặc 64 GB): chọn đủ dung lượng ngay khi mua. Hai khe SSD M.2 2280 PCIe 4.0.'),
(N'lenovo-legion-5-15iax11', N'Lenovo', N'Legion 5 15IAX11', N'83VK|Legion 5 15IAX11', N'lenovo-legion-5-15iax11',
  N'Intel Core Ultra 7 251HX', 18, N'NVIDIA GeForce RTX 5060 Laptop GPU', 8,
  24, N'DDR5', 0, 2, 32, 2, N'2280', 4, 512, 0, N'Ổ có sẵn nằm ở khe M.2 2242 PCIe 5.0; khe còn trống là M.2 2280 PCIe 4.0. Lenovo công bố RAM tối đa 32 GB.'),
(N'lenovo-thinkbook-14-g8-ial', N'Lenovo', N'ThinkBook 14 G8 IAL', N'21SJ|ThinkBook 14 G8 IAL', N'lenovo-thinkbook-14-g8-ial',
  N'Intel Core Ultra 7 255H', 16, N'Intel Arc 140T (tích hợp)', NULL,
  16, N'DDR5', 0, 2, 64, 2, N'2280', 4, 512, 0, N'Bản 16 GB lắp sẵn 2 thanh 8 GB (đủ 2 khe): lên 32 GB thì thay cả hai bằng bộ 2x16 GB. Ổ có sẵn là M.2 2242, khe còn lại nhận 2280.');

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

UPDATE m SET ProductID = NULL
FROM dbo.LaptopModels m
JOIN dbo.Products p ON p.ProductID = m.ProductID
WHERE p.IsDeleted = 1;

SELECT COUNT(*) AS LaptopModels FROM dbo.LaptopModels;
GO

/*
  Đợt đấu giá RAM mới theo giá thị trường hiện tại, chỉ khi không còn phiên nào đang mở hoặc sắp mở
  (database cài mới đã có các phiên của 012). Không có lượt trả giá sẵn.
*/
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM dbo.Auctions WHERE Status = N'active' AND EndsAt > SYSDATETIME())
BEGIN
  PRINT 'Active auctions exist, skip new round';
  RETURN;
END

DECLARE @now DATETIME2(3) = SYSDATETIME();
DECLARE @admin INT = (SELECT TOP 1 UserID FROM dbo.Users WHERE Email = N'admin@btstore.local');

DECLARE @Plan TABLE (
  Code NVARCHAR(10) PRIMARY KEY, Slug NVARCHAR(240), Title NVARCHAR(150), Description NVARCHAR(1000),
  StartingPrice DECIMAL(18,2), BidIncrement DECIMAL(18,2), BuyNowPrice DECIMAL(18,2) NULL,
  StartMinutes INT, EndMinutes INT
);
INSERT INTO @Plan VALUES
  (N'B1', N'kingston-fury-beast-32gb-ddr5-5600', N'Kingston FURY Beast 32GB DDR5 5600 - đợt tháng 11',
   N'Bộ 2 thanh 16GB DDR5 5600 cho mainboard DDR5 (AM5, LGA1851, Intel 12-14 bản DDR5). Giá niêm yết đang khoảng 10 triệu.',
   6000000, 100000, 9490000, -10, 48 * 60),
  (N'B2', N'gskill-flare-x5-32gb-ddr5-6000', N'G.Skill Flare X5 32GB DDR5 6000 cho Ryzen 9000',
   N'Kit 2x16GB DDR5 6000 hồ sơ EXPO, hợp Ryzen 7000/9000. Hàng mới, bảo hành chính hãng.',
   6500000, 100000, 9990000, -5, 6 * 60),
  (N'B3', N'crucial-32gb-kit-2x16gb-ddr5-5600-sodimm', N'Crucial 32GB DDR5 5600 SO-DIMM cho laptop',
   N'Kit 2x16GB SO-DIMM DDR5 cho laptop có 2 khe RAM (xem "Máy chạy được gì?" để biết laptop của bạn nâng được không). Phiên mở vào ngày mai.',
   7500000, 100000, NULL, 24 * 60, 72 * 60);

DECLARE @code NVARCHAR(10), @productId INT, @auctionId INT;
DECLARE plan_cursor CURSOR LOCAL FAST_FORWARD FOR
  SELECT pl.Code, p.ProductID FROM @Plan pl JOIN dbo.Products p ON p.Slug = pl.Slug AND p.IsDeleted = 0 AND p.Stock > 0
  ORDER BY pl.Code;
OPEN plan_cursor;
FETCH NEXT FROM plan_cursor INTO @code, @productId;
WHILE @@FETCH_STATUS = 0
BEGIN
  INSERT INTO dbo.Auctions (ProductID, Title, Description, StartingPrice, BidIncrement, BuyNowPrice, StartsAt, EndsAt, ScheduledEndsAt, CreatedBy)
  SELECT @productId, Title, Description, StartingPrice, BidIncrement, BuyNowPrice,
         DATEADD(MINUTE, StartMinutes, @now), DATEADD(MINUTE, EndMinutes, @now), DATEADD(MINUTE, EndMinutes, @now), @admin
  FROM @Plan WHERE Code = @code;
  SET @auctionId = SCOPE_IDENTITY();

  UPDATE dbo.Products SET Stock = Stock - 1, Version = Version + 1, UpdatedAt = GETDATE() WHERE ProductID = @productId;
  INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
  SELECT @productId, -1, Stock, N'auction', N'Giữ cho phiên đấu giá #' + CAST(@auctionId AS NVARCHAR(10)), @admin
  FROM dbo.Products WHERE ProductID = @productId;

  FETCH NEXT FROM plan_cursor INTO @code, @productId;
END
CLOSE plan_cursor;
DEALLOCATE plan_cursor;

PRINT 'Seeded new RAM auction round';
GO

/*
  Lịch sử giá mẫu cho sản phẩm mới thêm (cùng cách 011): chỉ sản phẩm còn đúng một mốc giá bằng giá hiện tại.
  RAM/SSD tăng giá trong 170 ngày qua, card đồ hoạ giảm nhẹ, hàng khác dao động.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @targets TABLE (
  ProductID INT PRIMARY KEY,
  Price DECIMAL(18,2) NOT NULL,
  OldPrice DECIMAL(18,2) NULL,
  Kind NVARCHAR(10) NOT NULL,
  Points INT NOT NULL,
  LastDays INT NOT NULL
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

DELETE h
FROM dbo.PriceHistory h
JOIN @targets t ON t.ProductID = h.ProductID;

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
