/*
  Giai đoạn 3 - quyền xoá tài khoản (Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15, hiệu lực 01/01/2026).
  Khi khách xoá tài khoản: xoá giỏ hàng, đánh giá, gỡ liên kết báo giá; thông tin hồ sơ
  (tên, email, SĐT, địa chỉ, mật khẩu) bị thay bằng giá trị vô danh và tài khoản bị khoá.
  Đơn hàng được giữ lại vì là chứng từ bán hàng pháp luật kế toán, thuế yêu cầu lưu.
  DeletedAt ghi thời điểm xoá để đối soát.
  PrivacyConsentAt ghi thời điểm khách tự tích đồng ý Chính sách bảo mật khi đăng ký
  (luật yêu cầu chứng minh được sự đồng ý; ô đồng ý không được tích sẵn).
  Chạy lại nhiều lần vẫn an toàn.
*/
IF COL_LENGTH('dbo.Users', 'DeletedAt') IS NULL
BEGIN
ALTER TABLE dbo.Users ADD DeletedAt DATETIME2 NULL;
END
GO

IF COL_LENGTH('dbo.Users', 'PrivacyConsentAt') IS NULL
BEGIN
ALTER TABLE dbo.Users ADD PrivacyConsentAt DATETIME2 NULL;
END
GO
