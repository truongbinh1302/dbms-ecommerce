/*
  Giai đoạn 1 - hoàn thiện luồng mua.
  1) CartItems: giỏ hàng lưu ở server cho khách đã đăng nhập (đổi máy không mất giỏ).
  2) Products.SearchText: chuỗi tên + hãng + thông số đã bỏ dấu để tìm kiếm không dấu.
     Backend tự điền cột này khi khởi động (backfillSearchText) và khi thêm/sửa sản phẩm.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.CartItems', N'U') IS NULL
BEGIN
CREATE TABLE dbo.CartItems (
  UserID INT NOT NULL CONSTRAINT FK_CartItems_Users REFERENCES dbo.Users(UserID),
  ProductID INT NOT NULL CONSTRAINT FK_CartItems_Products REFERENCES dbo.Products(ProductID),
  Quantity INT NOT NULL,
  UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_CartItems_UpdatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT PK_CartItems PRIMARY KEY (UserID, ProductID),
  CONSTRAINT CK_CartItems_Quantity CHECK (Quantity BETWEEN 1 AND 99)
);
END
GO

-- Collation nhị phân: chuỗi đã bỏ dấu, viết thường sẵn nên so sánh nhị phân vẫn đúng,
-- và LIKE '%từ%' trên 50.000 dòng nhanh hơn khoảng 10 lần so với collation mặc định (đo: 336 ms → 32–44 ms).
IF COL_LENGTH('dbo.Products', 'SearchText') IS NULL
BEGIN
ALTER TABLE dbo.Products ADD SearchText NVARCHAR(600) COLLATE Latin1_General_100_BIN2 NULL;
END
ELSE IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Products')
    AND name = 'SearchText'
    AND collation_name <> 'Latin1_General_100_BIN2'
)
BEGIN
ALTER TABLE dbo.Products ALTER COLUMN SearchText NVARCHAR(600) COLLATE Latin1_General_100_BIN2 NULL;
END
GO
