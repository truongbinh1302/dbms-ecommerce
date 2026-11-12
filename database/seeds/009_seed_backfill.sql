/*
  Chạy sau cùng khi nạp dữ liệu mẫu: bổ sung những gì API luôn ghi kèm khi tạo đơn thật,
  để dữ liệu mẫu qua được "Kiểm tra toàn vẹn dữ liệu" trên trang quản trị.
  - Mã đơn BT + ngày + ID cho đơn mẫu chưa có mã (đơn tạo qua API có thêm 4 ký tự ngẫu nhiên).
  - Một dòng lịch sử trạng thái (020_order_status_history.sql) cho đơn mẫu chưa có lịch sử.
  Chạy lại nhiều lần vẫn an toàn.
*/
UPDATE dbo.Orders
SET OrderCode = CONCAT(N'BT', CONVERT(CHAR(8), CreatedAt, 112), RIGHT(CONCAT(N'000000', OrderID), 6))
WHERE OrderCode IS NULL;
GO

IF OBJECT_ID(N'dbo.OrderStatusHistory', N'U') IS NOT NULL
INSERT INTO dbo.OrderStatusHistory (OrderID, FromStatus, ToStatus, ChangedBy, Note, ChangedAt)
SELECT o.OrderID, NULL, o.Status, N'system', N'Dữ liệu mẫu', o.UpdatedAt
FROM dbo.Orders o
WHERE NOT EXISTS (SELECT 1 FROM dbo.OrderStatusHistory h WHERE h.OrderID = o.OrderID);
GO
