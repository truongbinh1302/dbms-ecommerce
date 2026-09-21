/*
  Incremental patch for admin product management and image upload.
  Safe to run on an existing ecommerce_dbms database without dropping data.
*/
USE ecommerce_dbms;
GO

IF COL_LENGTH('dbo.Products', 'Images') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD Images NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.Products', 'Rating') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD Rating DECIMAL(3,2) NOT NULL CONSTRAINT DF_Products_Rating_Patch DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.Products', 'ReviewsCount') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD ReviewsCount INT NOT NULL CONSTRAINT DF_Products_ReviewsCount_Patch DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.Products', 'IsFeatured') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD IsFeatured BIT NOT NULL CONSTRAINT DF_Products_IsFeatured_Patch DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.Products', 'IsDeleted') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Products_IsDeleted_Patch DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.Products', 'Version') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD Version INT NOT NULL CONSTRAINT DF_Products_Version_Patch DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.Products', 'UpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.Products ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Products_UpdatedAt_Patch DEFAULT SYSDATETIME();
END
GO

IF COL_LENGTH('dbo.Orders', 'PaymentMethod') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD PaymentMethod NVARCHAR(50) NOT NULL CONSTRAINT DF_Orders_PaymentMethod_Patch DEFAULT N'cod';
END
GO

IF COL_LENGTH('dbo.Orders', 'PaymentStatus') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD PaymentStatus NVARCHAR(50) NOT NULL CONSTRAINT DF_Orders_PaymentStatus_Patch DEFAULT N'unpaid';
END
GO

IF COL_LENGTH('dbo.Orders', 'VNPayTxnRef') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD VNPayTxnRef NVARCHAR(100) NULL;
END
GO

IF COL_LENGTH('dbo.Orders', 'UpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.Orders ADD UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Orders_UpdatedAt_Patch DEFAULT SYSDATETIME();
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Products_Brand' AND object_id = OBJECT_ID('dbo.Products'))
BEGIN
  CREATE INDEX IX_Products_Brand ON dbo.Products(Brand) INCLUDE (Name, Price);
END
GO

-- Ensure demo admin remains usable for local testing.
DECLARE @DemoAdminPasswordHash NVARCHAR(255) = N'$2a$10$LMLgKTcM2wnRcg4gUMhsv./SbIGmL.n5IXoSfCRYSsH5y.rRDuEZ6';

IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = N'admin@btstore.local')
BEGIN
  UPDATE dbo.Users
  SET Password = @DemoAdminPasswordHash,
      Role = N'admin',
      IsActive = 1,
      UpdatedAt = SYSDATETIME()
  WHERE Email = N'admin@btstore.local';
END
ELSE
BEGIN
  INSERT INTO dbo.Users (FullName, Email, Password, Phone, Role, Address, IsActive)
  VALUES (N'Admin BinhTinhStore', N'admin@btstore.local', @DemoAdminPasswordHash, N'0900000001', N'admin', N'Ho Chi Minh City', 1);
END
GO
