/*
  Giai đoạn 3 - điều khoản mua hàng (Luật Thương mại điện tử 122/2025/QH15, Điều 12:
  trước khi đặt, người mua phải được xem và đồng ý các điều khoản của hợp đồng).
  Orders.TermsVersion ghi phiên bản điều khoản khách đã đồng ý khi đặt đơn.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF COL_LENGTH('dbo.Orders', 'TermsVersion') IS NULL
BEGIN
ALTER TABLE dbo.Orders ADD TermsVersion NVARCHAR(20) NULL;
END
GO
