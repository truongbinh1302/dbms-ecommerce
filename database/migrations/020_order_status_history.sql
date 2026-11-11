/*
  Giai đoạn 4 - lịch sử trạng thái đơn hàng.
  Mỗi lần đơn đổi trạng thái (đặt hàng, thanh toán xong, admin chuyển trạng thái, khách huỷ, quá hạn thanh toán...)
  API ghi một dòng trong cùng transaction với lệnh đổi trạng thái, nên lịch sử không thể lệch với đơn.
  Không dùng trigger: các lệnh UPDATE/INSERT Orders có mệnh đề OUTPUT không INTO, SQL Server không cho dùng
  chung với trigger trên bảng đó.
  Đơn có sẵn: ghi một dòng trạng thái hiện tại (thời điểm UpdatedAt) để trang đơn vẫn có mốc.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.OrderStatusHistory', N'U') IS NULL
BEGIN
CREATE TABLE dbo.OrderStatusHistory (
  HistoryID INT IDENTITY(1,1) CONSTRAINT PK_OrderStatusHistory PRIMARY KEY,
  OrderID INT NOT NULL CONSTRAINT FK_OrderStatusHistory_Orders REFERENCES dbo.Orders(OrderID) ON DELETE CASCADE,
  FromStatus NVARCHAR(50) NULL,
  ToStatus NVARCHAR(50) NOT NULL,
  ChangedBy NVARCHAR(20) NOT NULL CONSTRAINT DF_OrderStatusHistory_ChangedBy DEFAULT N'system',
  Note NVARCHAR(500) NULL,
  ChangedAt DATETIME2 NOT NULL CONSTRAINT DF_OrderStatusHistory_ChangedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_OrderStatusHistory_ChangedBy CHECK (ChangedBy IN (N'customer', N'admin', N'payment', N'system'))
);
CREATE INDEX IX_OrderStatusHistory_Order ON dbo.OrderStatusHistory(OrderID, HistoryID);
END
GO

INSERT INTO dbo.OrderStatusHistory (OrderID, FromStatus, ToStatus, ChangedBy, Note, ChangedAt)
SELECT o.OrderID, NULL, o.Status, N'system', N'Trạng thái lúc bắt đầu ghi lịch sử', o.UpdatedAt
FROM dbo.Orders o
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderStatusHistory h WHERE h.OrderID = o.OrderID);
GO
