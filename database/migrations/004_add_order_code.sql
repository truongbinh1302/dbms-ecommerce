IF COL_LENGTH('dbo.Orders', 'OrderCode') IS NULL
BEGIN
ALTER TABLE dbo.Orders
ADD OrderCode NVARCHAR(30) NULL;
END
GO

UPDATE dbo.Orders
SET OrderCode = CONCAT(
  CONVERT(CHAR(8), CreatedAt, 112),
  RIGHT('000000' + CAST(OrderID AS NVARCHAR(20)), 6)
)
WHERE OrderCode IS NULL;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'UX_Orders_OrderCode'
    AND object_id = OBJECT_ID('dbo.Orders')
)
BEGIN
CREATE UNIQUE INDEX UX_Orders_OrderCode
ON dbo.Orders(OrderCode)
WHERE OrderCode IS NOT NULL;
END
GO
