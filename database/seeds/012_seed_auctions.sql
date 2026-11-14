USE ecommerce_dbms;
GO

/*
  Giai đoạn 5 - phiên đấu giá RAM mẫu (RAM đang khan hiếm và tăng giá).
  Giờ tính từ lúc nạp seed: vài phiên đang chạy (có sẵn lượt trả giá của khách mẫu customer3..6),
  một phiên chưa bắt đầu. Mỗi phiên giữ 1 sản phẩm khỏi kho (sổ kho lý do 'auction'), như khi quản trị mở phiên.
  Lượt trả giá mẫu tuân theo quy tắc đặt giá tự động: giá hiện tại = min(giá tối đa cao nhất, giá tối đa cao nhì + bước giá).
  Giá theo thị trường 11/2026 (bộ DDR5 32GB khoảng 10 triệu). Chỉ nạp khi chưa có phiên nào.
*/
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM dbo.Auctions)
BEGIN
  PRINT 'Auctions already exist, skip';
  RETURN;
END

DECLARE @now DATETIME2(3) = SYSDATETIME();
DECLARE @admin INT = (SELECT TOP 1 UserID FROM dbo.Users WHERE Email = N'admin@btstore.local');
DECLARE @c1 INT = (SELECT UserID FROM dbo.Users WHERE Email = N'customer5@btstore.local');
DECLARE @c2 INT = (SELECT UserID FROM dbo.Users WHERE Email = N'customer6@btstore.local');
DECLARE @c3 INT = (SELECT UserID FROM dbo.Users WHERE Email = N'customer3@btstore.local');
DECLARE @c4 INT = (SELECT UserID FROM dbo.Users WHERE Email = N'customer4@btstore.local');

DECLARE @Plan TABLE (
  Code NVARCHAR(10) PRIMARY KEY, Slug NVARCHAR(240), Title NVARCHAR(150), Description NVARCHAR(1000),
  StartingPrice DECIMAL(18,2), BidIncrement DECIMAL(18,2), BuyNowPrice DECIMAL(18,2) NULL,
  StartMinutes INT, EndMinutes INT
);
INSERT INTO @Plan VALUES
  (N'A1', N'kingston-fury-beast-32gb-ddr5-5600', N'Kingston FURY Beast 32GB DDR5 5600 - lô cuối tháng',
   N'Bộ 2 thanh 16GB DDR5 5600 cho mainboard DDR5 (AM5, Intel 12-14 dùng DDR5). Hàng mới, bảo hành chính hãng.',
   6000000, 100000, 9490000, -24 * 60, 48 * 60),
  (N'A2', N'gskill-flare-x5-32gb-ddr5-6000', N'G.Skill Flare X5 32GB DDR5 6000 cho Ryzen',
   N'Kit 2x16GB DDR5 6000 hồ sơ EXPO, hợp Ryzen 7000/9000. Hàng mới, bảo hành chính hãng.',
   6500000, 100000, 9990000, -120, 6 * 60),
  (N'A3', N'corsair-vengeance-64gb-ddr5-6000', N'Corsair Vengeance 64GB DDR5 6000 - cho máy chạy AI',
   N'Kit 2x32GB DDR5 6000, đủ RAM cho Docker, máy ảo và mô hình AI chạy trên CPU.',
   12000000, 200000, 18490000, -60, 24 * 60),
  (N'A4', N'crucial-32gb-kit-2x16gb-ddr5-5600-sodimm', N'Crucial 32GB DDR5 5600 SO-DIMM cho laptop',
   N'Kit 2x16GB SO-DIMM DDR5 cho laptop có 2 khe RAM (xem "Máy chạy được gì?" để biết laptop của bạn nâng được không).',
   7500000, 100000, NULL, -30, 72 * 60),
  (N'A5', N'corsair-vengeance-32gb-ddr4-3200', N'Corsair Vengeance LPX 32GB DDR4 3200 - nâng cấp máy cũ',
   N'Kit 2x16GB DDR4 3200 cho mainboard DDR4 (AM4, Intel đời 8-14 dùng DDR4). Phiên mở vào ngày mai.',
   4000000, 100000, NULL, 24 * 60, 72 * 60);

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

  -- Giữ 1 sản phẩm cho phiên.
  UPDATE dbo.Products SET Stock = Stock - 1, Version = Version + 1, UpdatedAt = GETDATE() WHERE ProductID = @productId;
  INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedBy)
  SELECT @productId, -1, Stock, N'auction', N'Giữ cho phiên đấu giá #' + CAST(@auctionId AS NVARCHAR(10)), @admin
  FROM dbo.Products WHERE ProductID = @productId;

  -- A1: customer5 đặt tối đa 6.300.000, customer6 đặt tối đa 6.600.000 → customer6 dẫn ở 6.400.000.
  IF @code = N'A1' AND @c1 IS NOT NULL AND @c2 IS NOT NULL
  BEGIN
    INSERT INTO dbo.AuctionMaxBids (AuctionID, UserID, MaxAmount, Since) VALUES
      (@auctionId, @c1, 6300000, DATEADD(HOUR, -20, @now)),
      (@auctionId, @c2, 6600000, DATEADD(HOUR, -10, @now));
    INSERT INTO dbo.AuctionBids (AuctionID, UserID, Amount, Kind, CreatedAt) VALUES
      (@auctionId, @c1, 6000000, N'bid', DATEADD(HOUR, -20, @now)),
      (@auctionId, @c2, 6400000, N'bid', DATEADD(HOUR, -10, @now));
    UPDATE dbo.Auctions SET CurrentPrice = 6400000, LeaderUserID = @c2, BidCount = 2, Version = 2 WHERE AuctionID = @auctionId;
  END

  -- A2: customer3 tối đa 6.900.000; customer4 trả 6.700.000 bị hệ thống trả thay customer3 lên 6.800.000.
  IF @code = N'A2' AND @c3 IS NOT NULL AND @c4 IS NOT NULL
  BEGIN
    INSERT INTO dbo.AuctionMaxBids (AuctionID, UserID, MaxAmount, Since) VALUES
      (@auctionId, @c3, 6900000, DATEADD(MINUTE, -90, @now)),
      (@auctionId, @c4, 6700000, DATEADD(MINUTE, -30, @now));
    INSERT INTO dbo.AuctionBids (AuctionID, UserID, Amount, Kind, CreatedAt) VALUES
      (@auctionId, @c3, 6500000, N'bid', DATEADD(MINUTE, -90, @now)),
      (@auctionId, @c4, 6700000, N'bid', DATEADD(MINUTE, -30, @now)),
      (@auctionId, @c3, 6800000, N'auto', DATEADD(MINUTE, -30, @now));
    UPDATE dbo.Auctions SET CurrentPrice = 6800000, LeaderUserID = @c3, BidCount = 3, Version = 3 WHERE AuctionID = @auctionId;
  END

  FETCH NEXT FROM plan_cursor INTO @code, @productId;
END
CLOSE plan_cursor;
DEALLOCATE plan_cursor;

PRINT 'Seeded RAM auctions';
GO
