/*
  Giai đoạn 4 - khuyến mãi có thời hạn (Hot Deal).
  1) Promotions: chương trình có giờ bắt đầu / kết thúc. Dùng DATETIMEOFFSET và so với
     SYSDATETIMEOFFSET() nên đúng giờ dù máy chủ SQL đặt múi giờ nào.
  2) PromotionItems: giá khuyến mãi từng sản phẩm, số suất (QuantityLimit, NULL = không giới hạn),
     số đã bán (SoldCount) và giới hạn mỗi đơn (PerOrderLimit).
     CHECK SoldCount <= QuantityLimit: hai đơn tranh suất cuối cùng không thể cùng được giá khuyến mãi.
  3) OrderItems.PromotionID: dòng đơn được tính theo chương trình nào, để huỷ đơn thì trả lại suất.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.Promotions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.Promotions (
  PromotionID INT IDENTITY(1,1) CONSTRAINT PK_Promotions PRIMARY KEY,
  Name NVARCHAR(120) NOT NULL,
  StartsAt DATETIMEOFFSET(0) NOT NULL,
  EndsAt DATETIMEOFFSET(0) NOT NULL,
  IsActive BIT NOT NULL CONSTRAINT DF_Promotions_IsActive DEFAULT 1,
  CreatedBy INT NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Promotions_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_Promotions_Time CHECK (EndsAt > StartsAt)
);
CREATE INDEX IX_Promotions_Time ON dbo.Promotions(EndsAt, StartsAt) INCLUDE (IsActive, Name);
END
GO

IF OBJECT_ID(N'dbo.PromotionItems', N'U') IS NULL
BEGIN
CREATE TABLE dbo.PromotionItems (
  PromotionID INT NOT NULL CONSTRAINT FK_PromotionItems_Promotions REFERENCES dbo.Promotions(PromotionID),
  ProductID INT NOT NULL CONSTRAINT FK_PromotionItems_Products REFERENCES dbo.Products(ProductID),
  SalePrice DECIMAL(18,2) NOT NULL,
  QuantityLimit INT NULL,
  SoldCount INT NOT NULL CONSTRAINT DF_PromotionItems_SoldCount DEFAULT 0,
  PerOrderLimit INT NULL,
  CONSTRAINT PK_PromotionItems PRIMARY KEY (PromotionID, ProductID),
  CONSTRAINT CK_PromotionItems_SalePrice CHECK (SalePrice >= 0),
  CONSTRAINT CK_PromotionItems_QuantityLimit CHECK (QuantityLimit IS NULL OR QuantityLimit > 0),
  CONSTRAINT CK_PromotionItems_SoldCount CHECK (SoldCount >= 0 AND (QuantityLimit IS NULL OR SoldCount <= QuantityLimit)),
  CONSTRAINT CK_PromotionItems_PerOrderLimit CHECK (PerOrderLimit IS NULL OR PerOrderLimit > 0)
);
CREATE INDEX IX_PromotionItems_Product ON dbo.PromotionItems(ProductID) INCLUDE (SalePrice, QuantityLimit, SoldCount, PerOrderLimit);
END
GO

IF COL_LENGTH('dbo.OrderItems', 'PromotionID') IS NULL
BEGIN
ALTER TABLE dbo.OrderItems ADD PromotionID INT NULL;
END
GO
