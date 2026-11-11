/*
  Giai đoạn 4 - kiểm duyệt đánh giá.
  Đánh giá nằm ở MongoDB (ẩn/hiện, phản hồi của cửa hàng lưu cùng đánh giá); ở SQL chỉ cần thêm loại thông báo
  'review' để báo khách khi đánh giá bị ẩn (kèm lý do) hoặc khi cửa hàng phản hồi.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Notifications_Type' AND definition NOT LIKE N'%''review''%'
)
  ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Type')
  ALTER TABLE dbo.Notifications ADD CONSTRAINT CK_Notifications_Type
    CHECK (Type IN (N'price_drop', N'order_status', N'service_update', N'back_in_stock', N'question_answered', N'review'));
GO
