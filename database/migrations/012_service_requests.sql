/*
  Giai đoạn 4 - dịch vụ sau bán.
  ServiceRequests: một bảng cho ba loại yêu cầu của khách
    - home_service : kỹ thuật tại nhà / lắp đặt tại nhà (ngày + khung giờ, địa chỉ)
    - trade_in     : thu cũ đổi mới (thông tin máy cũ, giá ước tính, giá chốt sau khi kiểm tra)
    - warranty     : yêu cầu bảo hành theo số serial đã đăng ký
  Code là cột tính toán DV000001...
  ServiceRequestEvents: lịch sử trạng thái và ghi chú, khách xem được dòng IsCustomerVisible = 1.
  Index lọc IX_ServiceRequests_Slot dùng khi đếm lịch hẹn của một khung giờ (khoá UPDLOCK, HOLDLOCK
  để hai khách không cùng đặt vượt số kỹ thuật viên).
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.ServiceRequests', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ServiceRequests (
  RequestID INT IDENTITY(1,1) CONSTRAINT PK_ServiceRequests PRIMARY KEY,
  Code AS (CAST(N'DV' + RIGHT(N'000000' + CAST(RequestID AS NVARCHAR(10)), 6) AS NVARCHAR(12))) PERSISTED,
  UserID INT NOT NULL CONSTRAINT FK_ServiceRequests_Users REFERENCES dbo.Users(UserID),
  Type NVARCHAR(20) NOT NULL,
  Status NVARCHAR(20) NOT NULL CONSTRAINT DF_ServiceRequests_Status DEFAULT N'new',
  ServiceKind NVARCHAR(40) NULL,
  OrderID INT NULL,
  SerialNumber NVARCHAR(60) NULL,
  ScheduledDate DATE NULL,
  TimeSlot NVARCHAR(20) NULL,
  Address NVARCHAR(MAX) NULL,
  ContactPhone NVARCHAR(20) NULL,
  Description NVARCHAR(1000) NULL,
  DeviceInfo NVARCHAR(MAX) NULL,
  EstimateLow DECIMAL(18,2) NULL,
  EstimateHigh DECIMAL(18,2) NULL,
  FinalPrice DECIMAL(18,2) NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ServiceRequests_CreatedAt DEFAULT SYSDATETIME(),
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_ServiceRequests_UpdatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_ServiceRequests_Type CHECK (Type IN (N'home_service', N'trade_in', N'warranty')),
  CONSTRAINT CK_ServiceRequests_Status CHECK (Status IN (N'new', N'confirmed', N'in_progress', N'completed', N'cancelled')),
  CONSTRAINT CK_ServiceRequests_Schedule CHECK (Type <> N'home_service' OR (ScheduledDate IS NOT NULL AND TimeSlot IS NOT NULL)),
  CONSTRAINT CK_ServiceRequests_Serial CHECK (Type <> N'warranty' OR SerialNumber IS NOT NULL),
  CONSTRAINT CK_ServiceRequests_Prices CHECK ((EstimateLow IS NULL OR EstimateLow >= 0) AND (FinalPrice IS NULL OR FinalPrice >= 0))
);
CREATE INDEX IX_ServiceRequests_User ON dbo.ServiceRequests(UserID, CreatedAt DESC);
CREATE INDEX IX_ServiceRequests_Status ON dbo.ServiceRequests(Status, Type, CreatedAt DESC);
CREATE INDEX IX_ServiceRequests_Slot ON dbo.ServiceRequests(ScheduledDate, TimeSlot)
  INCLUDE (Status) WHERE Type = N'home_service';
CREATE INDEX IX_ServiceRequests_Serial ON dbo.ServiceRequests(SerialNumber) WHERE SerialNumber IS NOT NULL;
END
GO

IF OBJECT_ID(N'dbo.ServiceRequestEvents', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ServiceRequestEvents (
  EventID INT IDENTITY(1,1) CONSTRAINT PK_ServiceRequestEvents PRIMARY KEY,
  RequestID INT NOT NULL CONSTRAINT FK_ServiceRequestEvents_Requests REFERENCES dbo.ServiceRequests(RequestID),
  Status NVARCHAR(20) NOT NULL,
  Note NVARCHAR(500) NULL,
  IsCustomerVisible BIT NOT NULL CONSTRAINT DF_ServiceRequestEvents_Visible DEFAULT 1,
  CreatedBy INT NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ServiceRequestEvents_CreatedAt DEFAULT SYSDATETIME()
);
CREATE INDEX IX_ServiceRequestEvents_Request ON dbo.ServiceRequestEvents(RequestID, EventID);
END
GO
