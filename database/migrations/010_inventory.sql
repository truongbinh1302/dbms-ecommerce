/*
  Giai đoạn 4 - sổ kho.
  1) StockReceipts + StockReceiptItems: phiếu nhập kho (nhà cung cấp, giá vốn từng dòng).
     ReceiptCode là cột tính toán NK000001, NK000002...
  2) StockMovements: mọi lần tồn kho thay đổi đều ghi một dòng (nhập, bán, huỷ đơn trả kho,
     điều chỉnh tay), kèm tồn sau thay đổi. Tổng Change của một sản phẩm luôn bằng Stock.
     Bảng nhật ký nên OrderID / ReceiptID / CreatedBy không đặt khoá ngoại
     (xoá đơn thử hoặc tài khoản không bị chặn vì nhật ký).
  Không dùng trigger vì các câu INSERT ... OUTPUT của API sẽ lỗi khi bảng có trigger.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.StockReceipts', N'U') IS NULL
BEGIN
CREATE TABLE dbo.StockReceipts (
  ReceiptID INT IDENTITY(1,1) CONSTRAINT PK_StockReceipts PRIMARY KEY,
  ReceiptCode AS (CAST(N'NK' + RIGHT(N'000000' + CAST(ReceiptID AS NVARCHAR(10)), 6) AS NVARCHAR(12))) PERSISTED,
  Supplier NVARCHAR(200) NOT NULL,
  Note NVARCHAR(500) NULL,
  TotalQuantity INT NOT NULL CONSTRAINT DF_StockReceipts_TotalQuantity DEFAULT 0,
  TotalCost DECIMAL(18,2) NOT NULL CONSTRAINT DF_StockReceipts_TotalCost DEFAULT 0,
  CreatedBy INT NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_StockReceipts_CreatedAt DEFAULT SYSDATETIME()
);
CREATE INDEX IX_StockReceipts_CreatedAt ON dbo.StockReceipts(CreatedAt DESC);
END
GO

IF OBJECT_ID(N'dbo.StockReceiptItems', N'U') IS NULL
BEGIN
CREATE TABLE dbo.StockReceiptItems (
  ReceiptID INT NOT NULL CONSTRAINT FK_StockReceiptItems_Receipts REFERENCES dbo.StockReceipts(ReceiptID),
  ProductID INT NOT NULL CONSTRAINT FK_StockReceiptItems_Products REFERENCES dbo.Products(ProductID),
  Quantity INT NOT NULL,
  UnitCost DECIMAL(18,2) NOT NULL,
  CONSTRAINT PK_StockReceiptItems PRIMARY KEY (ReceiptID, ProductID),
  CONSTRAINT CK_StockReceiptItems_Quantity CHECK (Quantity BETWEEN 1 AND 100000),
  CONSTRAINT CK_StockReceiptItems_UnitCost CHECK (UnitCost >= 0)
);
CREATE INDEX IX_StockReceiptItems_Product ON dbo.StockReceiptItems(ProductID);
END
GO

IF OBJECT_ID(N'dbo.StockMovements', N'U') IS NULL
BEGIN
CREATE TABLE dbo.StockMovements (
  MovementID BIGINT IDENTITY(1,1) CONSTRAINT PK_StockMovements PRIMARY KEY,
  ProductID INT NOT NULL CONSTRAINT FK_StockMovements_Products REFERENCES dbo.Products(ProductID),
  Change INT NOT NULL,
  StockAfter INT NOT NULL,
  Reason NVARCHAR(20) NOT NULL,
  OrderID INT NULL,
  ReceiptID INT NULL,
  Note NVARCHAR(300) NULL,
  CreatedBy INT NULL,
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_StockMovements_CreatedAt DEFAULT SYSDATETIME(),
  CONSTRAINT CK_StockMovements_Reason CHECK (Reason IN (N'opening', N'receipt', N'sale', N'cancel', N'adjust')),
  CONSTRAINT CK_StockMovements_StockAfter CHECK (StockAfter >= 0)
);
CREATE INDEX IX_StockMovements_Product_Time ON dbo.StockMovements(ProductID, CreatedAt DESC);
CREATE INDEX IX_StockMovements_Time ON dbo.StockMovements(CreatedAt) INCLUDE (ProductID, Change, Reason);
END
GO

-- Tồn đầu kỳ cho sản phẩm đã có, để tổng Change khớp với Stock hiện tại.
INSERT INTO dbo.StockMovements (ProductID, Change, StockAfter, Reason, Note, CreatedAt)
SELECT p.ProductID, p.Stock, p.Stock, N'opening', N'Tồn đầu kỳ khi bắt đầu ghi sổ kho', p.CreatedAt
FROM dbo.Products p
WHERE NOT EXISTS (SELECT 1 FROM dbo.StockMovements m WHERE m.ProductID = p.ProductID);
GO
