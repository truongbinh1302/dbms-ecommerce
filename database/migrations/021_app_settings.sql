/*
  Giai đoạn 4 - cài đặt do admin chỉnh trên trang quản trị (hiện dùng cho trợ lý mua hàng).
  Giá trị bí mật (khoá OpenAI) được API mã hoá AES-256-GCM trước khi lưu; bảng không bao giờ chứa khoá dạng rõ.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.AppSettings', N'U') IS NULL
BEGIN
CREATE TABLE dbo.AppSettings (
  SettingKey NVARCHAR(100) NOT NULL CONSTRAINT PK_AppSettings PRIMARY KEY,
  SettingValue NVARCHAR(MAX) NULL,
  IsSecret BIT NOT NULL CONSTRAINT DF_AppSettings_IsSecret DEFAULT 0,
  UpdatedBy INT NULL CONSTRAINT FK_AppSettings_Users REFERENCES dbo.Users(UserID) ON DELETE SET NULL,
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppSettings_UpdatedAt DEFAULT SYSDATETIME()
);
END
GO
