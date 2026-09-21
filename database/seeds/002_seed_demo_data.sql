USE ecommerce_dbms;
GO

SET NOCOUNT ON;

-- Demo password for both seeded accounts is: password
DECLARE @PasswordHash NVARCHAR(255) = N'$2a$10$LMLgKTcM2wnRcg4gUMhsv./SbIGmL.n5IXoSfCRYSsH5y.rRDuEZ6';

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'admin@btstore.local')
BEGIN
  INSERT INTO dbo.Users (FullName, Email, Password, Phone, Role, Address)
  VALUES (N'Admin BinhTinhStore', N'admin@btstore.local', @PasswordHash, N'0900000001', N'admin', N'Ho Chi Minh City');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'customer@btstore.local')
BEGIN
  INSERT INTO dbo.Users (FullName, Email, Password, Phone, Role, Address)
  VALUES (N'Customer Demo', N'customer@btstore.local', @PasswordHash, N'0900000002', N'customer', N'268 Ly Thuong Kiet, Quan 10, TP.HCM');
END;

DECLARE @i INT = 3;
WHILE @i <= 1002
BEGIN
  INSERT INTO dbo.Users (FullName, Email, Password, Phone, Role, Address)
  VALUES (
    N'Customer ' + CAST(@i AS NVARCHAR(10)),
    N'customer' + CAST(@i AS NVARCHAR(10)) + N'@btstore.local',
    @PasswordHash,
    N'09' + RIGHT(N'00000000' + CAST(@i AS NVARCHAR(10)), 8),
    N'customer',
    N'Ho Chi Minh City'
  );
  SET @i += 1;
END;
GO

INSERT INTO dbo.Categories (Name, Slug, Icon) VALUES
(N'PC Gaming', N'pc-gaming', N'desktop'),
(N'Gaming Laptops', N'gaming-laptops', N'laptop'),
(N'Office Laptops', N'office-laptops', N'laptop'),
(N'Monitors', N'monitors', N'monitor'),
(N'Keyboards', N'keyboards', N'keyboard'),
(N'Mice', N'mice', N'mouse'),
(N'Headsets', N'headsets', N'headset'),
(N'Components', N'components', N'cpu'),
(N'Storage', N'storage', N'database'),
(N'Networking', N'networking', N'wifi'),
(N'Cameras', N'cameras', N'camera'),
(N'Printers', N'printers', N'printer'),
(N'Chairs', N'chairs', N'chair'),
(N'Smart Devices', N'smart-devices', N'sparkles'),
(N'Accessories', N'accessories', N'box');
GO

INSERT INTO dbo.Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured, Rating, ReviewsCount)
VALUES
(N'BT RTX 5070 Gaming PC', N'bt-rtx-5070-gaming-pc', N'BinhTinh', N'Gaming PC for 2K e-sports and AAA games.', 33990000, 35990000, 25, 1, N'["Ryzen 7", "RTX 5070", "32GB RAM", "1TB NVMe"]', N'[]', 1, 4.80, 128),
(N'Creator Studio PC Pro', N'creator-studio-pc-pro', N'BinhTinh', N'Workstation for rendering and AI workloads.', 48990000, 52990000, 12, 1, N'["Core i9", "RTX 5080", "64GB RAM", "2TB NVMe"]', N'[]', 1, 4.90, 89),
(N'Zephyrus G16 OLED', N'zephyrus-g16-oled', N'ASUS', N'Portable gaming laptop with OLED display.', 44990000, 46990000, 18, 2, N'["Core Ultra 9", "RTX 4070", "OLED", "1.8kg"]', N'[]', 1, 4.70, 73),
(N'Legion Slim 5', N'legion-slim-5', N'Lenovo', N'Balanced laptop for gaming and work.', 32990000, 34990000, 30, 2, N'["Ryzen 7", "RTX 4060", "165Hz", "16GB RAM"]', N'[]', 1, 4.60, 91),
(N'ThinkBook 14 G7', N'thinkbook-14-g7', N'Lenovo', N'Office laptop for students and business users.', 18990000, 20990000, 60, 3, N'["Core 7", "16GB RAM", "512GB SSD", "1.4kg"]', N'[]', 0, 4.50, 45),
(N'UltraSharp 27 4K USB-C', N'ultrasharp-27-4k-usb-c', N'Dell', N'4K monitor for office and creator workflows.', 11990000, 12990000, 40, 4, N'["27 inch", "4K", "USB-C", "IPS"]', N'[]', 1, 4.70, 66),
(N'Odyssey 27 240Hz', N'odyssey-27-240hz', N'Samsung', N'High refresh monitor for FPS gaming.', 8990000, 9990000, 55, 4, N'["27 inch", "240Hz", "QHD", "1ms"]', N'[]', 1, 4.60, 58),
(N'Keychron K8 Pro', N'keychron-k8-pro', N'Keychron', N'Wireless mechanical keyboard.', 2590000, 2990000, 100, 5, N'["TKL", "Hot swap", "Bluetooth", "RGB"]', N'[]', 0, 4.80, 102),
(N'Logitech G Pro X Superlight', N'logitech-g-pro-x-superlight', N'Logitech', N'Ultra-light wireless gaming mouse.', 2890000, 3290000, 95, 6, N'["Wireless", "63g", "Hero sensor"]', N'[]', 1, 4.90, 188),
(N'Cloud Alpha Wireless', N'cloud-alpha-wireless', N'HyperX', N'Wireless headset with long battery life.', 3690000, 4290000, 50, 7, N'["Wireless", "300h battery", "DTS"]', N'[]', 0, 4.50, 37),
(N'Samsung 990 Pro 2TB', N'samsung-990-pro-2tb', N'Samsung', N'High-end NVMe SSD.', 4690000, 5290000, 80, 9, N'["2TB", "PCIe 4.0", "7450MB/s"]', N'[]', 0, 4.80, 76),
(N'Logitech Brio 4K', N'logitech-brio-4k', N'Logitech', N'4K webcam for meetings and streaming.', 3990000, 4490000, 45, 11, N'["4K", "HDR", "Windows Hello"]', N'[]', 0, 4.40, 29);
GO

DECLARE @ProductIndex INT = 13;
DECLARE @CategoryCount INT = (SELECT COUNT(*) FROM dbo.Categories);
WHILE @ProductIndex <= 50000
BEGIN
  DECLARE @CategoryID INT = ((@ProductIndex - 1) % @CategoryCount) + 1;
  DECLARE @Price DECIMAL(18,2) = CAST((ABS(CHECKSUM(NEWID())) % 50000000) + 500000 AS DECIMAL(18,2));
  INSERT INTO dbo.Products (Name, Slug, Brand, Description, Price, OldPrice, Stock, CategoryID, Specs, Images, IsFeatured, Rating, ReviewsCount)
  VALUES (
    N'Demo Product ' + CAST(@ProductIndex AS NVARCHAR(10)),
    N'demo-product-' + CAST(@ProductIndex AS NVARCHAR(10)),
    CASE @ProductIndex % 8 WHEN 0 THEN N'ASUS' WHEN 1 THEN N'Lenovo' WHEN 2 THEN N'Dell' WHEN 3 THEN N'Logitech' WHEN 4 THEN N'Samsung' WHEN 5 THEN N'MSI' WHEN 6 THEN N'HP' ELSE N'BinhTinh' END,
    N'Generated product for DBMS performance experiments.',
    @Price,
    @Price + 1000000,
    ABS(CHECKSUM(NEWID())) % 500 + 1,
    @CategoryID,
    N'["Generated", "DBMS demo", "Index test"]',
    N'[]',
    CASE WHEN @ProductIndex % 97 = 0 THEN 1 ELSE 0 END,
    CAST((ABS(CHECKSUM(NEWID())) % 20 + 30) / 10.0 AS DECIMAL(3,2)),
    ABS(CHECKSUM(NEWID())) % 250
  );
  SET @ProductIndex += 1;
END;
GO

INSERT INTO dbo.Vouchers (Code, DiscountType, DiscountValue, MinOrderAmount, MaxDiscount, UsageLimit, StartDate, EndDate)
VALUES
(N'DBMS10', N'percent', 10, 1000000, 500000, 100, DATEADD(DAY, -1, SYSDATETIME()), DATEADD(DAY, 60, SYSDATETIME())),
(N'FREESHIP', N'amount', 30000, 500000, NULL, 500, DATEADD(DAY, -1, SYSDATETIME()), DATEADD(DAY, 60, SYSDATETIME()));
GO

-- Seed one delivered order for customer review demo.
INSERT INTO dbo.Orders (UserID, Status, PaymentMethod, PaymentStatus, Subtotal, Discount, ShippingFee, Total, ShippingAddress, Note)
VALUES (2, N'delivered', N'cod', N'paid', 33990000, 0, 0, 33990000, N'{"fullName":"Customer Demo","city":"HCM"}', N'Seed order for review demo');
DECLARE @FirstOrderID INT = SCOPE_IDENTITY();
INSERT INTO dbo.OrderItems (OrderID, ProductID, Quantity, UnitPrice)
VALUES (@FirstOrderID, 1, 1, 33990000);
GO

DECLARE @OrderIndex INT = 2;
WHILE @OrderIndex <= 5000
BEGIN
  DECLARE @UserID INT = ((@OrderIndex % 1000) + 3);
  DECLARE @Status NVARCHAR(50) = CASE WHEN @OrderIndex % 4 = 0 THEN N'pending' WHEN @OrderIndex % 4 = 1 THEN N'confirmed' WHEN @OrderIndex % 4 = 2 THEN N'delivered' ELSE N'shipped' END;
  INSERT INTO dbo.Orders (UserID, Status, PaymentMethod, PaymentStatus, ShippingAddress, Note)
  VALUES (@UserID, @Status, N'cod', CASE WHEN @Status = N'delivered' THEN N'paid' ELSE N'unpaid' END, N'{"city":"HCM"}', N'Generated order');

  DECLARE @OrderID INT = SCOPE_IDENTITY();
  DECLARE @Line INT = 1;
  WHILE @Line <= 3
  BEGIN
    DECLARE @Pid INT = (((@OrderIndex * 7 + @Line * 13) % 50000) + 1);
    DECLARE @Qty INT = ((@OrderIndex + @Line) % 3) + 1;
    DECLARE @UnitPrice DECIMAL(18,2) = (SELECT Price FROM dbo.Products WHERE ProductID = @Pid);
    INSERT INTO dbo.OrderItems (OrderID, ProductID, Quantity, UnitPrice)
    VALUES (@OrderID, @Pid, @Qty, @UnitPrice);
    SET @Line += 1;
  END;

  UPDATE dbo.Orders
  SET Subtotal = x.Subtotal,
      Total = x.Subtotal,
      UpdatedAt = SYSDATETIME()
  FROM dbo.Orders o
  CROSS APPLY (
    SELECT SUM(Quantity * UnitPrice) AS Subtotal
    FROM dbo.OrderItems oi
    WHERE oi.OrderID = o.OrderID
  ) x
  WHERE o.OrderID = @OrderID;

  SET @OrderIndex += 1;
END;
GO

UPDATE dbo.Products
SET Stock = 1
WHERE ProductID = 1;
GO

SELECT COUNT(*) AS Users FROM dbo.Users;
SELECT COUNT(*) AS Products FROM dbo.Products;
SELECT COUNT(*) AS Orders FROM dbo.Orders;
SELECT COUNT(*) AS OrderItems FROM dbo.OrderItems;
GO
