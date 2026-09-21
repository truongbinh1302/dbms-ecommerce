USE ecommerce_dbms;
GO

SET NOCOUNT ON;

DECLARE @DemoAdminPasswordHash NVARCHAR(255) = N'$2a$10$LMLgKTcM2wnRcg4gUMhsv./SbIGmL.n5IXoSfCRYSsH5y.rRDuEZ6';

MERGE dbo.Users WITH (HOLDLOCK) AS target
USING (SELECT N'admin@btstore.local' AS Email) AS source
ON target.Email = source.Email
WHEN MATCHED THEN
  UPDATE SET
    Password = @DemoAdminPasswordHash,
    Role = N'admin',
    IsActive = 1,
    UpdatedAt = SYSDATETIME()
WHEN NOT MATCHED THEN
  INSERT (FullName, Email, Password, Phone, Role, Address, IsActive)
  VALUES (N'Admin BinhTinhStore', N'admin@btstore.local', @DemoAdminPasswordHash, N'0900000001', N'admin', N'Ho Chi Minh City', 1);

SELECT UserID, FullName, Email, Role, IsActive
FROM dbo.Users
WHERE Email = N'admin@btstore.local';
GO
