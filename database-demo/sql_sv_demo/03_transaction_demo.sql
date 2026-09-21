/*
  Topic 3 - Transaction demo on SQL Server
  Demonstrates ACID with COMMIT and ROLLBACK in the BinhTinhStore order flow.
*/
USE ecommerce_dbms;
GO

DECLARE @DemoUserID INT = 2;
DECLARE @DemoProductID INT = 1;

UPDATE dbo.Products SET Stock = 1 WHERE ProductID = @DemoProductID;
SELECT N'Before transaction' AS StepName, ProductID, Name, Stock FROM dbo.Products WHERE ProductID = @DemoProductID;
GO

-- Case 1: successful order: all operations commit together.
BEGIN TRY
  BEGIN TRAN;

  DECLARE @UserID INT = 2;
  DECLARE @ProductID INT = 1;
  DECLARE @Qty INT = 1;
  DECLARE @Price DECIMAL(18,2);
  DECLARE @Stock INT;

  SELECT @Price = Price, @Stock = Stock
  FROM dbo.Products WITH (UPDLOCK, ROWLOCK)
  WHERE ProductID = @ProductID AND IsDeleted = 0;

  IF @Stock < @Qty
    THROW 51000, 'Insufficient stock. Transaction will be rolled back.', 1;

  INSERT INTO dbo.Orders (UserID, Status, PaymentMethod, PaymentStatus, Subtotal, Discount, ShippingFee, Total, ShippingAddress, Note)
  VALUES (@UserID, N'pending', N'cod', N'unpaid', @Price * @Qty, 0, 0, @Price * @Qty, N'{"demo":"transaction commit"}', N'Transaction COMMIT demo');

  DECLARE @OrderID INT = SCOPE_IDENTITY();

  INSERT INTO dbo.OrderItems (OrderID, ProductID, Quantity, UnitPrice)
  VALUES (@OrderID, @ProductID, @Qty, @Price);

  UPDATE dbo.Products
  SET Stock = Stock - @Qty, Version = Version + 1, UpdatedAt = SYSDATETIME()
  WHERE ProductID = @ProductID;

  COMMIT TRAN;
  SELECT N'COMMIT success' AS Result, @OrderID AS OrderID;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  SELECT N'ROLLBACK because of error' AS Result, ERROR_MESSAGE() AS ErrorMessage;
END CATCH;
GO

SELECT N'After successful transaction' AS StepName, ProductID, Name, Stock FROM dbo.Products WHERE ProductID = 1;
GO

-- Case 2: failing order: no Order and no stock update must remain after rollback.
BEGIN TRY
  BEGIN TRAN;

  DECLARE @UserID2 INT = 2;
  DECLARE @ProductID2 INT = 1;
  DECLARE @Qty2 INT = 2;
  DECLARE @Price2 DECIMAL(18,2);
  DECLARE @Stock2 INT;

  SELECT @Price2 = Price, @Stock2 = Stock
  FROM dbo.Products WITH (UPDLOCK, ROWLOCK)
  WHERE ProductID = @ProductID2 AND IsDeleted = 0;

  IF @Stock2 < @Qty2
    THROW 51001, 'Insufficient stock. This case proves rollback.', 1;

  INSERT INTO dbo.Orders (UserID, Status, PaymentMethod, PaymentStatus, Subtotal, Total, ShippingAddress, Note)
  VALUES (@UserID2, N'pending', N'cod', N'unpaid', @Price2 * @Qty2, @Price2 * @Qty2, N'{"demo":"transaction rollback"}', N'This order should not exist');

  UPDATE dbo.Products SET Stock = Stock - @Qty2 WHERE ProductID = @ProductID2;

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  SELECT N'ROLLBACK success' AS Result, ERROR_MESSAGE() AS ErrorMessage;
END CATCH;
GO

SELECT N'After rollback case' AS StepName, ProductID, Name, Stock FROM dbo.Products WHERE ProductID = 1;
SELECT TOP 5 OrderID, Status, Note, CreatedAt FROM dbo.Orders WHERE Note LIKE N'%Transaction%' ORDER BY OrderID DESC;
GO
