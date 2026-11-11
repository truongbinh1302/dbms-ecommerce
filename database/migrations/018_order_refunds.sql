/*
  Giai đoạn 4 - hoàn tiền cho đơn đã thanh toán rồi bị huỷ.
  Đơn VNPay đã trả tiền mà bị huỷ (khách/admin huỷ, hoặc tiền về sau khi đơn quá hạn) có PaymentStatus = 'refund_required'.
  Admin hoàn tiền ở cổng thanh toán/ngân hàng rồi ghi nhận ở đây: số tiền, mã giao dịch hoàn, thời điểm.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF COL_LENGTH(N'dbo.Orders', N'RefundAmount') IS NULL
  ALTER TABLE dbo.Orders ADD RefundAmount DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.Orders', N'RefundReference') IS NULL
  ALTER TABLE dbo.Orders ADD RefundReference NVARCHAR(100) NULL;
GO
IF COL_LENGTH(N'dbo.Orders', N'RefundedAt') IS NULL
  ALTER TABLE dbo.Orders ADD RefundedAt DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_PaymentStatus' AND object_id = OBJECT_ID(N'dbo.Orders'))
  CREATE INDEX IX_Orders_PaymentStatus ON dbo.Orders(PaymentStatus) INCLUDE (OrderID, Total);
GO
