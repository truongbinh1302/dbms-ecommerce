/*
  Giai đoạn 4 - báo khi có hàng.
  StockWatches: khách bấm "Báo khi có hàng" ở sản phẩm đang hết. Khi tồn kho > 0, server ghi thông báo
  'back_in_stock' và xoá lượt chờ trong cùng một transaction (mỗi lượt chờ chỉ báo một lần).
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.StockWatches', N'U') IS NULL
BEGIN
CREATE TABLE dbo.StockWatches (
  UserID INT NOT NULL CONSTRAINT FK_StockWatches_Users REFERENCES dbo.Users(UserID),
  ProductID INT NOT NULL CONSTRAINT FK_StockWatches_Products REFERENCES dbo.Products(ProductID),
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_StockWatches_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT PK_StockWatches PRIMARY KEY (UserID, ProductID)
);
CREATE INDEX IX_StockWatches_Product ON dbo.StockWatches(ProductID);
END
GO

-- Thông báo: thêm loại 'back_in_stock'.
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Notifications_Type' AND definition NOT LIKE N'%back_in_stock%'
)
  ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Type')
  ALTER TABLE dbo.Notifications ADD CONSTRAINT CK_Notifications_Type
    CHECK (Type IN (N'price_drop', N'order_status', N'service_update', N'back_in_stock'));
GO
