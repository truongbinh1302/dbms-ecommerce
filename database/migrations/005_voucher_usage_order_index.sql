/*
  Giai đoạn 0 - sửa luồng tiền.
  Khi huỷ đơn, hệ thống xoá dòng VoucherUsages của đơn đó để trả lượt voucher.
  Index theo OrderID giúp lệnh DELETE chỉ khoá đúng dòng của đơn đang huỷ
  thay vì quét cả bảng (tránh chờ khoá chéo với các đơn đang được tạo).
  Chạy lại nhiều lần vẫn an toàn.
*/
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_VoucherUsages_OrderID'
    AND object_id = OBJECT_ID('dbo.VoucherUsages')
)
BEGIN
CREATE INDEX IX_VoucherUsages_OrderID
ON dbo.VoucherUsages(OrderID)
INCLUDE (VoucherID);
END
GO
