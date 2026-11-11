USE ecommerce_dbms;
GO

/*
  Linh kiện mẫu cho tính năng Build PC (giai đoạn 2).
  - Mỗi dòng gồm thông tin sản phẩm và chuỗi JSON thông số kỹ thuật; phần cuối file
    tách JSON đó bằng OPENJSON để ghi vào bảng ComponentSpecs.
  - Thông số (socket, chiều dài card, công suất...) và giá mang tính minh hoạ cho bài demo,
    cần đối chiếu trang nhà sản xuất trước khi dùng để bán thật.
  - Chạy lại nhiều lần vẫn an toàn: sản phẩm đã có (theo Slug) thì chỉ cập nhật thông số.
  - Samsung 990 Pro 2TB đã có trong 002 nên chỉ bổ sung thông số, không thêm sản phẩm mới.
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
  SpecJson NVARCHAR(600) NOT NULL
);

INSERT INTO @Seed (Slug, Name, Brand, Description, Price, OldPrice, Stock, CategorySlug, Specs, SpecJson) VALUES
-- CPU. tier: 1 = phổ thông, 2 = nhiều nhân cho lập trình/đồ hoạ, 3 = cao cấp. powerW: công suất tối đa (PPT/PL2).
(N'amd-ryzen-5-5600', N'AMD Ryzen 5 5600', N'AMD', N'CPU 6 nhân 12 luồng socket AM4, kèm tản Wraith Stealth.', 2490000, 2890000, 40, N'components',
  N'["6 nhân 12 luồng", "AM4", "DDR4", "Kèm tản"]',
  N'{"type":"cpu","socket":"AM4","powerW":88,"hasIntegratedGraphics":false,"includesCooler":true,"tier":1}'),
(N'amd-ryzen-5-7600', N'AMD Ryzen 5 7600', N'AMD', N'CPU 6 nhân 12 luồng socket AM5, có nhân đồ hoạ, kèm tản Wraith Stealth.', 4990000, 5490000, 35, N'components',
  N'["6 nhân 12 luồng", "AM5", "DDR5", "Có iGPU", "Kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":88,"hasIntegratedGraphics":true,"includesCooler":true,"tier":1}'),
(N'amd-ryzen-7-7700', N'AMD Ryzen 7 7700', N'AMD', N'CPU 8 nhân 16 luồng socket AM5, có nhân đồ hoạ, kèm tản Wraith Prism.', 7290000, 7990000, 25, N'components',
  N'["8 nhân 16 luồng", "AM5", "DDR5", "Có iGPU", "Kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":88,"hasIntegratedGraphics":true,"includesCooler":true,"tier":2}'),
(N'amd-ryzen-7-7800x3d', N'AMD Ryzen 7 7800X3D', N'AMD', N'CPU chơi game 8 nhân với 3D V-Cache, không kèm tản.', 10490000, 11290000, 15, N'components',
  N'["8 nhân 16 luồng", "AM5", "3D V-Cache", "Không kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":162,"hasIntegratedGraphics":true,"includesCooler":false,"tier":2}'),
(N'amd-ryzen-9-7900x', N'AMD Ryzen 9 7900X', N'AMD', N'CPU 12 nhân 24 luồng cho dựng phim, render, không kèm tản.', 9990000, 11490000, 12, N'components',
  N'["12 nhân 24 luồng", "AM5", "DDR5", "Không kèm tản"]',
  N'{"type":"cpu","socket":"AM5","powerW":230,"hasIntegratedGraphics":true,"includesCooler":false,"tier":3}'),
(N'intel-core-i3-12100f', N'Intel Core i3-12100F', N'Intel', N'CPU 4 nhân 8 luồng giá rẻ, không có nhân đồ hoạ, kèm tản.', 1990000, 2290000, 50, N'components',
  N'["4 nhân 8 luồng", "LGA1700", "Không iGPU", "Kèm tản"]',
  N'{"type":"cpu","socket":"LGA1700","powerW":89,"hasIntegratedGraphics":false,"includesCooler":true,"tier":1}'),
(N'intel-core-i5-12400', N'Intel Core i5-12400', N'Intel', N'CPU 6 nhân 12 luồng có nhân đồ hoạ UHD 730, kèm tản.', 3690000, 4190000, 45, N'components',
  N'["6 nhân 12 luồng", "LGA1700", "Có iGPU", "Kèm tản"]',
  N'{"type":"cpu","socket":"LGA1700","powerW":117,"hasIntegratedGraphics":true,"includesCooler":true,"tier":1}'),
(N'intel-core-i5-14400f', N'Intel Core i5-14400F', N'Intel', N'CPU 10 nhân 16 luồng, không có nhân đồ hoạ, kèm tản.', 4590000, 5190000, 30, N'components',
  N'["10 nhân 16 luồng", "LGA1700", "Không iGPU", "Kèm tản"]',
  N'{"type":"cpu","socket":"LGA1700","powerW":148,"hasIntegratedGraphics":false,"includesCooler":true,"tier":2}'),
(N'intel-core-i7-14700k', N'Intel Core i7-14700K', N'Intel', N'CPU 20 nhân 28 luồng mở khoá ép xung, không kèm tản.', 9490000, 10490000, 10, N'components',
  N'["20 nhân 28 luồng", "LGA1700", "Có iGPU", "Không kèm tản"]',
  N'{"type":"cpu","socket":"LGA1700","powerW":253,"hasIntegratedGraphics":true,"includesCooler":false,"tier":3}'),

-- Mainboard
(N'asus-prime-b550m-a', N'ASUS PRIME B550M-A', N'ASUS', N'Mainboard mATX socket AM4, 4 khe DDR4, 2 khe M.2.', 2390000, 2690000, 25, N'components',
  N'["AM4", "mATX", "DDR4", "2 khe M.2"]',
  N'{"type":"mainboard","socket":"AM4","memoryType":"DDR4","formFactor":"mATX","memorySlots":4,"m2Slots":2}'),
(N'asus-prime-b650m-a-wifi-ii', N'ASUS PRIME B650M-A WIFI II', N'ASUS', N'Mainboard mATX socket AM5, 4 khe DDR5, Wi-Fi 6.', 4290000, 4690000, 25, N'components',
  N'["AM5", "mATX", "DDR5", "Wi-Fi 6"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}'),
(N'msi-pro-b650-p-wifi', N'MSI PRO B650-P WIFI', N'MSI', N'Mainboard ATX socket AM5, 4 khe DDR5, 3 khe M.2.', 4790000, 5290000, 20, N'components',
  N'["AM5", "ATX", "DDR5", "3 khe M.2"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"ATX","memorySlots":4,"m2Slots":3}'),
(N'asrock-b650i-lightning-wifi', N'ASRock B650I Lightning WiFi', N'ASRock', N'Mainboard Mini-ITX socket AM5, 2 khe DDR5.', 5490000, 5990000, 8, N'components',
  N'["AM5", "Mini-ITX", "DDR5", "2 khe RAM"]',
  N'{"type":"mainboard","socket":"AM5","memoryType":"DDR5","formFactor":"ITX","memorySlots":2,"m2Slots":2}'),
(N'gigabyte-b760m-ds3h-ddr4', N'GIGABYTE B760M DS3H DDR4', N'GIGABYTE', N'Mainboard mATX socket LGA1700, 4 khe DDR4.', 2690000, 2990000, 30, N'components',
  N'["LGA1700", "mATX", "DDR4", "2 khe M.2"]',
  N'{"type":"mainboard","socket":"LGA1700","memoryType":"DDR4","formFactor":"mATX","memorySlots":4,"m2Slots":2}'),
(N'msi-pro-b760m-a-wifi', N'MSI PRO B760M-A WIFI', N'MSI', N'Mainboard mATX socket LGA1700, 4 khe DDR5, Wi-Fi 6E.', 3990000, 4390000, 20, N'components',
  N'["LGA1700", "mATX", "DDR5", "Wi-Fi 6E"]',
  N'{"type":"mainboard","socket":"LGA1700","memoryType":"DDR5","formFactor":"mATX","memorySlots":4,"m2Slots":2}'),
(N'msi-pro-z790-a-wifi', N'MSI PRO Z790-A WIFI', N'MSI', N'Mainboard ATX socket LGA1700, 4 khe DDR5, 4 khe M.2, hỗ trợ ép xung CPU.', 6490000, 7190000, 10, N'components',
  N'["LGA1700", "ATX", "DDR5", "4 khe M.2"]',
  N'{"type":"mainboard","socket":"LGA1700","memoryType":"DDR5","formFactor":"ATX","memorySlots":4,"m2Slots":4}'),

-- RAM (capacityGB là tổng dung lượng của bộ kit)
(N'kingston-fury-beast-16gb-ddr4-3200', N'Kingston FURY Beast 16GB (2x8GB) DDR4 3200', N'Kingston', N'Bộ RAM DDR4 2 thanh 8GB.', 990000, 1190000, 60, N'components',
  N'["16GB", "2x8GB", "DDR4", "3200MHz"]',
  N'{"type":"ram","memoryType":"DDR4","capacityGB":16,"modules":2}'),
(N'corsair-vengeance-32gb-ddr4-3200', N'Corsair Vengeance LPX 32GB (2x16GB) DDR4 3200', N'Corsair', N'Bộ RAM DDR4 2 thanh 16GB.', 1790000, 2090000, 40, N'components',
  N'["32GB", "2x16GB", "DDR4", "3200MHz"]',
  N'{"type":"ram","memoryType":"DDR4","capacityGB":32,"modules":2}'),
(N'teamgroup-64gb-4x16gb-ddr4-3200', N'TeamGroup T-Force Vulcan 64GB (4x16GB) DDR4 3200', N'TeamGroup', N'Bộ RAM DDR4 4 thanh 16GB, cần mainboard 4 khe.', 3490000, 3890000, 10, N'components',
  N'["64GB", "4x16GB", "DDR4", "3200MHz"]',
  N'{"type":"ram","memoryType":"DDR4","capacityGB":64,"modules":4}'),
(N'kingston-fury-beast-16gb-ddr5-5200', N'Kingston FURY Beast 16GB (2x8GB) DDR5 5200', N'Kingston', N'Bộ RAM DDR5 2 thanh 8GB.', 1490000, 1690000, 50, N'components',
  N'["16GB", "2x8GB", "DDR5", "5200MHz"]',
  N'{"type":"ram","memoryType":"DDR5","capacityGB":16,"modules":2}'),
(N'kingston-fury-beast-32gb-ddr5-5600', N'Kingston FURY Beast 32GB (2x16GB) DDR5 5600', N'Kingston', N'Bộ RAM DDR5 2 thanh 16GB.', 2690000, 2990000, 45, N'components',
  N'["32GB", "2x16GB", "DDR5", "5600MHz"]',
  N'{"type":"ram","memoryType":"DDR5","capacityGB":32,"modules":2}'),
(N'gskill-flare-x5-32gb-ddr5-6000', N'G.Skill Flare X5 32GB (2x16GB) DDR5 6000', N'G.Skill', N'Bộ RAM DDR5 6000 tối ưu cho Ryzen 7000.', 3190000, 3490000, 25, N'components',
  N'["32GB", "2x16GB", "DDR5", "6000MHz", "AMD EXPO"]',
  N'{"type":"ram","memoryType":"DDR5","capacityGB":32,"modules":2}'),
(N'corsair-vengeance-64gb-ddr5-6000', N'Corsair Vengeance 64GB (2x32GB) DDR5 6000', N'Corsair', N'Bộ RAM DDR5 2 thanh 32GB cho máy trạm, chạy AI local.', 5490000, 5990000, 15, N'components',
  N'["64GB", "2x32GB", "DDR5", "6000MHz"]',
  N'{"type":"ram","memoryType":"DDR5","capacityGB":64,"modules":2}'),

-- Card đồ hoạ (lengthMm: chiều dài card; powerW: công suất card)
(N'amd-radeon-rx-7600-8gb', N'Sapphire Pulse Radeon RX 7600 8GB', N'Sapphire', N'Card đồ hoạ 8GB cho chơi game Full HD.', 6490000, 6990000, 20, N'components',
  N'["8GB GDDR6", "Dài 240mm", "165W"]',
  N'{"type":"gpu","vramGB":8,"lengthMm":240,"powerW":165}'),
(N'msi-rtx-4060-ventus-2x-8g', N'MSI GeForce RTX 4060 Ventus 2X 8G', N'MSI', N'Card đồ hoạ RTX 4060 8GB, nhỏ gọn, tiết kiệm điện.', 7990000, 8690000, 30, N'components',
  N'["8GB GDDR6", "Dài 199mm", "115W", "DLSS 3"]',
  N'{"type":"gpu","vramGB":8,"lengthMm":199,"powerW":115}'),
(N'msi-rtx-3060-ventus-2x-12g', N'MSI GeForce RTX 3060 Ventus 2X 12G', N'MSI', N'Card đồ hoạ 12GB VRAM giá dễ tiếp cận cho AI local.', 7490000, 8290000, 18, N'components',
  N'["12GB GDDR6", "Dài 235mm", "170W"]',
  N'{"type":"gpu","vramGB":12,"lengthMm":235,"powerW":170}'),
(N'intel-arc-b580-12gb', N'Intel Arc B580 12GB', N'Intel', N'Card đồ hoạ 12GB cho chơi game 1440p và dựng video.', 7290000, 7790000, 12, N'components',
  N'["12GB GDDR6", "Dài 272mm", "190W", "AV1"]',
  N'{"type":"gpu","vramGB":12,"lengthMm":272,"powerW":190}'),
(N'gigabyte-rtx-4060-ti-16g', N'GIGABYTE GeForce RTX 4060 Ti Gaming OC 16G', N'GIGABYTE', N'Card đồ hoạ 16GB VRAM cho render và mô hình AI cỡ vừa.', 12990000, 13990000, 12, N'components',
  N'["16GB GDDR6", "Dài 281mm", "165W"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":281,"powerW":165}'),
(N'asus-prime-rtx-5070-12g', N'ASUS Prime GeForce RTX 5070 12G', N'ASUS', N'Card đồ hoạ RTX 5070 12GB cho chơi game 2K.', 16490000, 17490000, 15, N'components',
  N'["12GB GDDR7", "Dài 304mm", "250W", "DLSS 4"]',
  N'{"type":"gpu","vramGB":12,"lengthMm":304,"powerW":250}'),
(N'gigabyte-rtx-5070-ti-16g', N'GIGABYTE GeForce RTX 5070 Ti Windforce 16G', N'GIGABYTE', N'Card đồ hoạ 16GB cho đồ hoạ 3D và chơi game 4K.', 23990000, 25490000, 8, N'components',
  N'["16GB GDDR7", "Dài 304mm", "300W"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":304,"powerW":300}'),
(N'asus-tuf-rtx-5080-16g', N'ASUS TUF Gaming GeForce RTX 5080 16G', N'ASUS', N'Card đồ hoạ cao cấp 16GB, cần case dài và nguồn từ 850W.', 35990000, 37990000, 5, N'components',
  N'["16GB GDDR7", "Dài 348mm", "360W"]',
  N'{"type":"gpu","vramGB":16,"lengthMm":348,"powerW":360}'),

-- Ổ cứng (capacityGB, storageInterface M.2 hoặc SATA)
(N'kingston-nv3-500gb', N'Kingston NV3 500GB NVMe', N'Kingston', N'SSD NVMe M.2 500GB giá rẻ.', 890000, 1090000, 70, N'storage',
  N'["500GB", "M.2 NVMe", "PCIe 4.0"]',
  N'{"type":"storage","capacityGB":500,"storageInterface":"M.2"}'),
(N'samsung-870-evo-500gb', N'Samsung 870 EVO 500GB SATA', N'Samsung', N'SSD SATA 2.5 inch 500GB.', 1290000, 1490000, 40, N'storage',
  N'["500GB", "SATA", "2.5 inch"]',
  N'{"type":"storage","capacityGB":500,"storageInterface":"SATA"}'),
(N'wd-blue-sn580-1tb', N'WD Blue SN580 1TB NVMe', N'WD', N'SSD NVMe M.2 1TB.', 1590000, 1890000, 60, N'storage',
  N'["1TB", "M.2 NVMe", "PCIe 4.0"]',
  N'{"type":"storage","capacityGB":1000,"storageInterface":"M.2"}'),
(N'crucial-mx500-1tb', N'Crucial MX500 1TB SATA', N'Crucial', N'SSD SATA 2.5 inch 1TB cho máy không còn khe M.2.', 1790000, 1990000, 35, N'storage',
  N'["1TB", "SATA", "2.5 inch"]',
  N'{"type":"storage","capacityGB":1000,"storageInterface":"SATA"}'),
(N'samsung-990-pro-2tb', N'Samsung 990 Pro 2TB', N'Samsung', N'High-end NVMe SSD.', 4690000, 5290000, 80, N'storage',
  N'["2TB", "PCIe 4.0", "7450MB/s"]',
  N'{"type":"storage","capacityGB":2000,"storageInterface":"M.2"}'),
(N'seagate-barracuda-2tb', N'Seagate BarraCuda 2TB HDD', N'Seagate', N'Ổ cứng HDD 3.5 inch 2TB lưu trữ dữ liệu.', 1490000, 1690000, 30, N'storage',
  N'["2TB", "HDD", "SATA", "7200rpm"]',
  N'{"type":"storage","capacityGB":2000,"storageInterface":"SATA"}'),

-- Nguồn
(N'corsair-cv550', N'Corsair CV550 550W 80 Plus Bronze', N'Corsair', N'Nguồn 550W cho máy văn phòng, card tầm trung.', 1190000, 1390000, 40, N'components',
  N'["550W", "80 Plus Bronze"]',
  N'{"type":"psu","psuWatts":550}'),
(N'msi-mag-a650bn', N'MSI MAG A650BN 650W 80 Plus Bronze', N'MSI', N'Nguồn 650W.', 1390000, 1590000, 35, N'components',
  N'["650W", "80 Plus Bronze"]',
  N'{"type":"psu","psuWatts":650}'),
(N'corsair-rm750e', N'Corsair RM750e 750W 80 Plus Gold', N'Corsair', N'Nguồn 750W full modular.', 2490000, 2790000, 25, N'components',
  N'["750W", "80 Plus Gold", "Full modular"]',
  N'{"type":"psu","psuWatts":750}'),
(N'seasonic-focus-gx-850', N'Seasonic Focus GX-850 850W 80 Plus Gold', N'Seasonic', N'Nguồn 850W cho card cao cấp.', 3290000, 3590000, 15, N'components',
  N'["850W", "80 Plus Gold", "Full modular"]',
  N'{"type":"psu","psuWatts":850}'),
(N'corsair-rm1000e', N'Corsair RM1000e 1000W 80 Plus Gold', N'Corsair', N'Nguồn 1000W cho máy trạm nhiều card.', 4290000, 4690000, 8, N'components',
  N'["1000W", "80 Plus Gold", "Full modular"]',
  N'{"type":"psu","psuWatts":1000}'),

-- Tản nhiệt (heightMm: chiều cao tản khí; tản nước AIO tính theo chiều cao block bơm)
(N'binhtinh-low-profile-47', N'BinhTinh Low Profile 47', N'BinhTinh', N'Tản khí thấp 47mm cho case Mini-ITX.', 490000, 590000, 30, N'components',
  N'["Cao 47mm", "AM4/AM5/LGA1700"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700","heightMm":47}'),
(N'deepcool-ak400', N'Deepcool AK400', N'Deepcool', N'Tản khí tháp đơn, cao 155mm.', 690000, 790000, 40, N'components',
  N'["Cao 155mm", "AM4/AM5/LGA1700"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700","heightMm":155}'),
(N'thermalright-peerless-assassin-120-se', N'Thermalright Peerless Assassin 120 SE', N'Thermalright', N'Tản khí tháp đôi, cao 155mm.', 990000, 1190000, 30, N'components',
  N'["Cao 155mm", "Tháp đôi", "AM4/AM5/LGA1700"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700","heightMm":155}'),
(N'binhtinh-aio-240', N'BinhTinh AIO 240', N'BinhTinh', N'Tản nước AIO 240mm cho CPU cao cấp.', 1890000, 2190000, 15, N'components',
  N'["Tản nước 240mm", "AM4/AM5/LGA1700"]',
  N'{"type":"cooler","supportedSockets":"AM4,AM5,LGA1700","heightMm":30}'),

-- Vỏ case
(N'binhtinh-mini-c1', N'BinhTinh Mini C1 (Mini-ITX)', N'BinhTinh', N'Case Mini-ITX nhỏ gọn, card tối đa 280mm, tản tối đa 70mm.', 1290000, 1490000, 15, N'components',
  N'["Mini-ITX", "Card ≤ 280mm", "Tản ≤ 70mm"]',
  N'{"type":"case","supportedFormFactors":"ITX","maxGpuLengthMm":280,"maxCoolerHeightMm":70}'),
(N'binhtinh-compact-m', N'BinhTinh Compact M', N'BinhTinh', N'Case mATX giá rẻ, card tối đa 250mm, tản tối đa 150mm.', 690000, 790000, 40, N'components',
  N'["mATX/ITX", "Card ≤ 250mm", "Tản ≤ 150mm"]',
  N'{"type":"case","supportedFormFactors":"mATX,ITX","maxGpuLengthMm":250,"maxCoolerHeightMm":150}'),
(N'binhtinh-air-m', N'BinhTinh Air M', N'BinhTinh', N'Case mATX lưới thoáng khí, card tối đa 320mm, tản tối đa 160mm.', 990000, 1190000, 35, N'components',
  N'["mATX/ITX", "Card ≤ 320mm", "Tản ≤ 160mm"]',
  N'{"type":"case","supportedFormFactors":"mATX,ITX","maxGpuLengthMm":320,"maxCoolerHeightMm":160}'),
(N'binhtinh-flow-a', N'BinhTinh Flow A', N'BinhTinh', N'Case ATX, card tối đa 380mm, tản tối đa 170mm.', 1590000, 1890000, 25, N'components',
  N'["ATX/mATX/ITX", "Card ≤ 380mm", "Tản ≤ 170mm"]',
  N'{"type":"case","supportedFormFactors":"ATX,mATX,ITX","maxGpuLengthMm":380,"maxCoolerHeightMm":170}');

INSERT INTO dbo.Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured, Rating, ReviewsCount)
SELECT s.Name, s.Slug, s.Brand, s.Description, s.Price, s.OldPrice, s.Stock,
       CASE WHEN s.CategorySlug = N'storage' THEN @StorageCat ELSE @ComponentsCat END,
       s.Specs, N'[]', 0, 0, 0
FROM @Seed s
WHERE NOT EXISTS (SELECT 1 FROM dbo.Products p WHERE p.Slug = s.Slug);

DECLARE @Specs TABLE (
  ProductID INT PRIMARY KEY,
  ComponentType NVARCHAR(20), Socket NVARCHAR(20), MemoryType NVARCHAR(10), FormFactor NVARCHAR(10),
  SupportedFormFactors NVARCHAR(50), SupportedSockets NVARCHAR(100), PowerW INT, PsuWatts INT,
  LengthMm INT, MaxGpuLengthMm INT, HeightMm INT, MaxCoolerHeightMm INT, MemorySlots INT, Modules INT,
  CapacityGB INT, M2Slots INT, StorageInterface NVARCHAR(10), HasIntegratedGraphics BIT, IncludesCooler BIT,
  Tier TINYINT, VramGB INT
);

INSERT INTO @Specs
SELECT p.ProductID, j.*
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
) AS j;

DELETE cs FROM dbo.ComponentSpecs cs JOIN @Specs s ON s.ProductID = cs.ProductID;
INSERT INTO dbo.ComponentSpecs (
  ProductID, ComponentType, Socket, MemoryType, FormFactor, SupportedFormFactors, SupportedSockets, PowerW, PsuWatts,
  LengthMm, MaxGpuLengthMm, HeightMm, MaxCoolerHeightMm, MemorySlots, Modules, CapacityGB, M2Slots, StorageInterface,
  HasIntegratedGraphics, IncludesCooler, Tier, VramGB
)
SELECT * FROM @Specs;

-- Mốc giá đầu tiên cho linh kiện mới thêm (migration 007 chỉ ghi cho sản phẩm có sẵn lúc chạy).
INSERT INTO dbo.PriceHistory (ProductID, Price, OldPrice, ChangedAt)
SELECT p.ProductID, p.Price, p.OldPrice, p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.PriceHistory h WHERE h.ProductID = p.ProductID);

-- Tồn đầu kỳ trong sổ kho (010_inventory.sql) cho sản phẩm vừa nạp.
IF OBJECT_ID(N'dbo.StockMovements', N'U') IS NOT NULL
INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedAt)
SELECT p.ProductID, p.Stock, p.Stock, N'opening', N'Tồn đầu kỳ khi nạp dữ liệu mẫu', p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.StockMovements m WHERE m.ProductID = p.ProductID);

SELECT COUNT(*) AS ComponentSpecs FROM dbo.ComponentSpecs;
GO
