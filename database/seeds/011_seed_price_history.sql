USE ecommerce_dbms;
GO

/*
  Giai đoạn 5 - lịch sử giá mẫu cho "Nên mua lúc nào?".
  Dữ liệu demo chỉ có một mốc giá cho mỗi sản phẩm nên nhãn giá và biểu đồ đều phẳng. File này tạo
  5-10 lần đổi giá trong khoảng 170 ngày cho các sản phẩm thật trong seed (không đụng 50.000 "Demo Product"),
  theo xu hướng năm 2026 nêu trong tài liệu nghiên cứu: RAM và SSD tăng giá, card đồ hoạ giảm nhẹ, hàng khác dao động.
  Giá là số minh hoạ, sinh cố định theo mã sản phẩm (CHECKSUM) nên chạy lại cho cùng kết quả.

  Chỉ thay lịch sử của sản phẩm còn đúng một mốc giá bằng giá hiện tại (chưa ai đổi giá thật).
  Mốc mới nhất luôn là giá hiện tại, nên Products.Price vẫn khớp lần đổi giá cuối cùng.
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

-- Mốc k = 0 là cũ nhất, k = Points - 1 là giá hiện tại. Factor: giá mốc so với giá hiện tại.
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

SELECT COUNT(*) AS ProductsWithPriceHistory FROM @targets;
GO
