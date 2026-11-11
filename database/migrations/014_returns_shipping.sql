/*
  Giai đoạn 4 - giao vận và đổi trả.
  1) Orders: đơn vị vận chuyển, mã vận đơn, thời điểm giao cho vận chuyển và thời điểm khách nhận.
     DeliveredAt là mốc tính hạn đổi trả (RETURN_DAYS ngày, theo Chính sách đổi trả).
  2) ReturnRequests + ReturnRequestItems: khách gửi yêu cầu đổi hoặc trả từ trang đơn hàng.
     Tổng số lượng yêu cầu (trừ yêu cầu bị từ chối hoặc khách tự huỷ) không vượt số đã mua; server khoá dòng
     đơn hàng khi tạo yêu cầu nên hai yêu cầu gửi cùng lúc không vượt được.
  3) Sổ kho thêm hai lý do: 'return' (hàng trả về nhập lại kho) và 'exchange' (xuất hàng mới đổi cho khách).
  Chạy lại nhiều lần vẫn an toàn.
*/
IF COL_LENGTH(N'dbo.Orders', N'ShippingCarrier') IS NULL
  ALTER TABLE dbo.Orders ADD ShippingCarrier NVARCHAR(50) NULL;
GO
IF COL_LENGTH(N'dbo.Orders', N'TrackingCode') IS NULL
  ALTER TABLE dbo.Orders ADD TrackingCode NVARCHAR(60) NULL;
GO
IF COL_LENGTH(N'dbo.Orders', N'ShippedAt') IS NULL
  ALTER TABLE dbo.Orders ADD ShippedAt DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.Orders', N'DeliveredAt') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD DeliveredAt DATETIME2 NULL;
END
GO

-- Đơn đã giao trước khi có cột: lấy lần cập nhật cuối làm thời điểm giao (gần đúng nhất có thể).
UPDATE dbo.Orders SET DeliveredAt = UpdatedAt WHERE Status = N'delivered' AND DeliveredAt IS NULL;
GO

IF OBJECT_ID(N'dbo.ReturnRequests', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ReturnRequests (
  ReturnID INT IDENTITY(1,1) CONSTRAINT PK_ReturnRequests PRIMARY KEY,
  ReturnCode AS (CAST(N'TH' + RIGHT(N'000000' + CAST(ReturnID AS NVARCHAR(10)), 6) AS NVARCHAR(12))) PERSISTED,
  OrderID INT NOT NULL CONSTRAINT FK_ReturnRequests_Orders REFERENCES dbo.Orders(OrderID),
  UserID INT NOT NULL CONSTRAINT FK_ReturnRequests_Users REFERENCES dbo.Users(UserID),
  Kind NVARCHAR(20) NOT NULL,
  Reason NVARCHAR(30) NOT NULL,
  Description NVARCHAR(1000) NOT NULL,
  Status NVARCHAR(20) NOT NULL CONSTRAINT DF_ReturnRequests_Status DEFAULT N'pending',
  Restocked BIT NOT NULL CONSTRAINT DF_ReturnRequests_Restocked DEFAULT 0,
  RefundAmount DECIMAL(18,2) NULL,
  AdminNote NVARCHAR(500) NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReturnRequests_CreatedAt DEFAULT SYSDATETIME(),
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReturnRequests_UpdatedAt DEFAULT SYSDATETIME(),
  ResolvedAt DATETIME2 NULL,
  CONSTRAINT CK_ReturnRequests_Kind CHECK (Kind IN (N'exchange', N'refund')),
  CONSTRAINT CK_ReturnRequests_Reason CHECK (Reason IN (N'defective', N'wrong_item', N'not_as_described')),
  CONSTRAINT CK_ReturnRequests_Status CHECK (Status IN (N'pending', N'approved', N'received', N'completed', N'rejected', N'cancelled')),
  CONSTRAINT CK_ReturnRequests_Refund CHECK (RefundAmount IS NULL OR RefundAmount >= 0)
);
CREATE INDEX IX_ReturnRequests_Order ON dbo.ReturnRequests(OrderID);
CREATE INDEX IX_ReturnRequests_User ON dbo.ReturnRequests(UserID, CreatedAt DESC);
CREATE INDEX IX_ReturnRequests_Status ON dbo.ReturnRequests(Status, CreatedAt DESC);
END
GO

IF OBJECT_ID(N'dbo.ReturnRequestItems', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ReturnRequestItems (
  ReturnID INT NOT NULL CONSTRAINT FK_ReturnRequestItems_Returns REFERENCES dbo.ReturnRequests(ReturnID),
  ProductID INT NOT NULL CONSTRAINT FK_ReturnRequestItems_Products REFERENCES dbo.Products(ProductID),
  Quantity INT NOT NULL,
  UnitPrice DECIMAL(18,2) NOT NULL,
  CONSTRAINT PK_ReturnRequestItems PRIMARY KEY (ReturnID, ProductID),
  CONSTRAINT CK_ReturnRequestItems_Quantity CHECK (Quantity > 0)
);
END
GO

-- Sổ kho: thêm lý do 'return' và 'exchange'.
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_StockMovements_Reason' AND definition NOT LIKE N'%exchange%'
)
  ALTER TABLE dbo.StockMovements DROP CONSTRAINT CK_StockMovements_Reason;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StockMovements_Reason')
  ALTER TABLE dbo.StockMovements ADD CONSTRAINT CK_StockMovements_Reason
    CHECK (Reason IN (N'opening', N'receipt', N'sale', N'cancel', N'adjust', N'return', N'exchange'));
GO
