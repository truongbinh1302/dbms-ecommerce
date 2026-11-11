USE ecommerce_dbms;
GO

/*
  Bảo đảm có tài khoản admin demo (admin@btstore.local / password) để chạy thử.
  Chỉ tạo khi chưa có. Bản cũ dùng MERGE đặt lại mật khẩu thành "password" mỗi lần migrate,
  nên đổi mật khẩu admin xong, chạy migration là mất. Khi chạy thật hãy đổi mật khẩu
  ngay sau lần migrate đầu (API ở production sẽ cảnh báo nếu admin còn mật khẩu demo).
*/
SET NOCOUNT ON;

DECLARE @DemoAdminPasswordHash NVARCHAR(255) = N'$2a$10$LMLgKTcM2wnRcg4gUMhsv./SbIGmL.n5IXoSfCRYSsH5y.rRDuEZ6';

IF NOT EXISTS (SELECT 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE Email = N'admin@btstore.local')
BEGIN
  INSERT INTO dbo.Users (FullName, Email, Password, Phone, Role, Address, IsActive)
  VALUES (N'Admin BinhTinhStore', N'admin@btstore.local', @DemoAdminPasswordHash, N'0900000001', N'admin', N'Ho Chi Minh City', 1);
END

SELECT UserID, FullName, Email, Role, IsActive
FROM dbo.Users
WHERE Email = N'admin@btstore.local';
GO
