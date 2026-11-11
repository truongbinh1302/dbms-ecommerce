/*
  Giai đoạn 4 - theo dõi giá và thông báo trong tài khoản.
  1) Notifications: thông báo cho khách (giá giảm, đơn hàng đổi trạng thái, yêu cầu dịch vụ được cập nhật).
  2) PriceWatches: khách theo dõi giá một sản phẩm. TargetPrice NULL = báo khi giá thấp hơn lúc bắt đầu theo dõi.
     LastNotifiedPrice chặn báo trùng: chỉ báo lại khi giá xuống thấp hơn lần báo trước,
     hoặc sau khi giá đã tăng trở lại.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
BEGIN
CREATE TABLE dbo.Notifications (
  NotificationID BIGINT IDENTITY(1,1) CONSTRAINT PK_Notifications PRIMARY KEY,
  UserID INT NOT NULL CONSTRAINT FK_Notifications_Users REFERENCES dbo.Users(UserID),
  Type NVARCHAR(30) NOT NULL,
  Title NVARCHAR(200) NOT NULL,
  Body NVARCHAR(500) NULL,
  Link NVARCHAR(200) NULL,
  IsRead BIT NOT NULL CONSTRAINT DF_Notifications_IsRead DEFAULT 0,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_Notifications_Type CHECK (Type IN (N'price_drop', N'order_status', N'service_update'))
);
CREATE INDEX IX_Notifications_User ON dbo.Notifications(UserID, NotificationID DESC) INCLUDE (IsRead);
END
GO

IF OBJECT_ID(N'dbo.PriceWatches', N'U') IS NULL
BEGIN
CREATE TABLE dbo.PriceWatches (
  UserID INT NOT NULL CONSTRAINT FK_PriceWatches_Users REFERENCES dbo.Users(UserID),
  ProductID INT NOT NULL CONSTRAINT FK_PriceWatches_Products REFERENCES dbo.Products(ProductID),
  PriceAtWatch DECIMAL(18,2) NOT NULL,
  TargetPrice DECIMAL(18,2) NULL,
  LastNotifiedPrice DECIMAL(18,2) NULL,
  LastNotifiedAt DATETIME2 NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_PriceWatches_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT PK_PriceWatches PRIMARY KEY (UserID, ProductID),
  CONSTRAINT CK_PriceWatches_Target CHECK (TargetPrice IS NULL OR TargetPrice > 0)
);
CREATE INDEX IX_PriceWatches_Product ON dbo.PriceWatches(ProductID);
END
GO
