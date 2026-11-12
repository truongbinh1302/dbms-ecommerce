/*
  Đấu giá (bắt đầu với RAM trong lúc khan hiếm, dùng được cho mọi sản phẩm).
  - Mỗi phiên bán 1 sản phẩm. Lúc tạo phiên, 1 cái được giữ khỏi kho (sổ kho lý do 'auction').
  - Khách nhập giá tối đa; hệ thống tự trả thay mỗi lần một bước giá (đặt giá tự động kiểu eBay).
    Giá hiện tại = min(giá tối đa cao nhất, giá tối đa cao nhì + bước giá). Bằng nhau thì ai đặt trước thắng.
  - Có người trả giá trong ExtendSeconds giây cuối thì phiên kéo dài thêm ExtendSeconds giây (chống trả giá phút chót).
  - Trạng thái: active → won (chờ người thắng đặt hàng trước PaymentDueAt) → ordered;
    hoặc unsold (không ai trả giá), expired (người thắng không đặt hàng kịp), cancelled (quản trị huỷ).
    unsold, expired, cancelled trả hàng về kho.
  - Mọi lần trả giá nằm trong AuctionBids, chỉ thêm, không sửa, để đối soát.
*/

IF OBJECT_ID(N'dbo.Auctions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Auctions (
    AuctionID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Auctions PRIMARY KEY,
    ProductID INT NOT NULL CONSTRAINT FK_Auctions_Products REFERENCES dbo.Products(ProductID),
    Title NVARCHAR(150) NOT NULL,
    Description NVARCHAR(1000) NULL,
    StartingPrice DECIMAL(18,2) NOT NULL,
    BidIncrement DECIMAL(18,2) NOT NULL,
    BuyNowPrice DECIMAL(18,2) NULL,
    StartsAt DATETIME2(3) NOT NULL,
    EndsAt DATETIME2(3) NOT NULL,
    ScheduledEndsAt DATETIME2(3) NOT NULL,
    ExtendSeconds INT NOT NULL CONSTRAINT DF_Auctions_ExtendSeconds DEFAULT 120,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Auctions_Status DEFAULT N'active',
    CurrentPrice DECIMAL(18,2) NULL,
    LeaderUserID INT NULL CONSTRAINT FK_Auctions_Leader REFERENCES dbo.Users(UserID),
    BidCount INT NOT NULL CONSTRAINT DF_Auctions_BidCount DEFAULT 0,
    WinnerUserID INT NULL CONSTRAINT FK_Auctions_Winner REFERENCES dbo.Users(UserID),
    WinningPrice DECIMAL(18,2) NULL,
    EndedAt DATETIME2(3) NULL,
    PaymentDueAt DATETIME2(3) NULL,
    OrderID INT NULL CONSTRAINT FK_Auctions_Orders REFERENCES dbo.Orders(OrderID),
    Version INT NOT NULL CONSTRAINT DF_Auctions_Version DEFAULT 0,
    CreatedBy INT NULL,
    CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Auctions_CreatedAt DEFAULT SYSDATETIME(),
    UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_Auctions_UpdatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT CK_Auctions_Prices CHECK (StartingPrice > 0 AND BidIncrement > 0 AND (BuyNowPrice IS NULL OR BuyNowPrice > StartingPrice)),
    CONSTRAINT CK_Auctions_Times CHECK (EndsAt > StartsAt AND ScheduledEndsAt > StartsAt),
    CONSTRAINT CK_Auctions_Extend CHECK (ExtendSeconds BETWEEN 0 AND 600),
    CONSTRAINT CK_Auctions_Status CHECK (Status IN (N'active', N'won', N'ordered', N'unsold', N'expired', N'cancelled')),
    CONSTRAINT CK_Auctions_BidCount CHECK (BidCount >= 0),
    -- Người dẫn đầu luôn đi kèm giá hiện tại; phiên đã có người thắng thì có giá thắng.
    CONSTRAINT CK_Auctions_Leader CHECK ((LeaderUserID IS NULL AND CurrentPrice IS NULL) OR (LeaderUserID IS NOT NULL AND CurrentPrice IS NOT NULL)),
    CONSTRAINT CK_Auctions_Winner CHECK (Status NOT IN (N'won', N'ordered') OR (WinnerUserID IS NOT NULL AND WinningPrice IS NOT NULL AND PaymentDueAt IS NOT NULL))
  );
  CREATE INDEX IX_Auctions_Status_EndsAt ON dbo.Auctions(Status, EndsAt);
  CREATE INDEX IX_Auctions_Product ON dbo.Auctions(ProductID);
END
GO

-- Giá tối đa mỗi người đặt cho một phiên (bí mật, chỉ người đó thấy). Since: lúc đặt mức này, để phân xử khi bằng nhau.
IF OBJECT_ID(N'dbo.AuctionMaxBids', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuctionMaxBids (
    AuctionID INT NOT NULL CONSTRAINT FK_AuctionMaxBids_Auctions REFERENCES dbo.Auctions(AuctionID),
    UserID INT NOT NULL CONSTRAINT FK_AuctionMaxBids_Users REFERENCES dbo.Users(UserID),
    MaxAmount DECIMAL(18,2) NOT NULL,
    Since DATETIME2(3) NOT NULL,
    CONSTRAINT PK_AuctionMaxBids PRIMARY KEY (AuctionID, UserID),
    CONSTRAINT CK_AuctionMaxBids_Amount CHECK (MaxAmount > 0)
  );
  CREATE INDEX IX_AuctionMaxBids_Rank ON dbo.AuctionMaxBids(AuctionID, MaxAmount DESC, Since);
END
GO

-- Lịch sử trả giá công khai: 'bid' khách tự trả, 'auto' hệ thống trả thay theo giá tối đa, 'buy_now' mua ngay.
IF OBJECT_ID(N'dbo.AuctionBids', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuctionBids (
    BidID BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuctionBids PRIMARY KEY,
    AuctionID INT NOT NULL CONSTRAINT FK_AuctionBids_Auctions REFERENCES dbo.Auctions(AuctionID),
    UserID INT NOT NULL CONSTRAINT FK_AuctionBids_Users REFERENCES dbo.Users(UserID),
    Amount DECIMAL(18,2) NOT NULL,
    Kind NVARCHAR(10) NOT NULL,
    CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_AuctionBids_CreatedAt DEFAULT SYSDATETIME(),
    CONSTRAINT CK_AuctionBids_Amount CHECK (Amount > 0),
    CONSTRAINT CK_AuctionBids_Kind CHECK (Kind IN (N'bid', N'auto', N'buy_now'))
  );
  CREATE INDEX IX_AuctionBids_Auction ON dbo.AuctionBids(AuctionID, BidID DESC);
  CREATE INDEX IX_AuctionBids_User ON dbo.AuctionBids(UserID, AuctionID);
END
GO

-- Sổ kho: thêm lý do 'auction' (giữ hàng cho phiên đấu giá và trả lại khi phiên không bán được).
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_StockMovements_Reason' AND definition NOT LIKE N'%auction%'
)
  ALTER TABLE dbo.StockMovements DROP CONSTRAINT CK_StockMovements_Reason;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StockMovements_Reason')
  ALTER TABLE dbo.StockMovements ADD CONSTRAINT CK_StockMovements_Reason
    CHECK (Reason IN (N'opening', N'receipt', N'sale', N'cancel', N'adjust', N'return', N'exchange', N'auction'));
GO

-- Thông báo: thêm loại 'auction' (bị trả giá cao hơn, thắng phiên, phiên kết thúc, hết hạn đặt hàng).
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Notifications_Type' AND definition NOT LIKE N'%''auction''%'
)
  ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Type')
  ALTER TABLE dbo.Notifications ADD CONSTRAINT CK_Notifications_Type
    CHECK (Type IN (N'price_drop', N'order_status', N'service_update', N'back_in_stock', N'question_answered', N'review', N'build_price_drop', N'auction'));
GO
