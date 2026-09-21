/*
  Topic 4 - Concurrency control demo on SQL Server
  Open two SSMS query windows and run Session A and Session B as instructed.
*/
USE ecommerce_dbms;
GO

-- Reset product stock before testing.
UPDATE dbo.Products SET Stock = 1 WHERE ProductID = 1;
SELECT ProductID, Name, Stock FROM dbo.Products WHERE ProductID = 1;
GO

/*
UNSAFE CASE - Lost update / overselling risk
Run this block in Session A, then within 5 seconds run the Session B unsafe block below.
*/
-- SESSION A - UNSAFE
-- BEGIN TRAN;
-- DECLARE @stockA INT;
-- SELECT @stockA = Stock FROM dbo.Products WHERE ProductID = 1;
-- WAITFOR DELAY '00:00:05';
-- IF @stockA >= 1
--   UPDATE dbo.Products SET Stock = @stockA - 1 WHERE ProductID = 1;
-- COMMIT TRAN;
-- SELECT 'Session A unsafe committed' AS Result, Stock FROM dbo.Products WHERE ProductID = 1;

-- SESSION B - UNSAFE
-- BEGIN TRAN;
-- DECLARE @stockB INT;
-- SELECT @stockB = Stock FROM dbo.Products WHERE ProductID = 1;
-- IF @stockB >= 1
--   UPDATE dbo.Products SET Stock = @stockB - 1 WHERE ProductID = 1;
-- COMMIT TRAN;
-- SELECT 'Session B unsafe committed' AS Result, Stock FROM dbo.Products WHERE ProductID = 1;

/*
SAFE CASE - Strict locking with UPDLOCK, ROWLOCK
Reset stock to 1. Run Session A safe block, then Session B safe block while A is waiting.
Session B must wait until Session A commits and then observe Stock = 0, so it cannot sell again.
*/
-- RESET BEFORE SAFE TEST
-- UPDATE dbo.Products SET Stock = 1 WHERE ProductID = 1;

-- SESSION A - SAFE
-- BEGIN TRAN;
-- DECLARE @safeStockA INT;
-- SELECT @safeStockA = Stock
-- FROM dbo.Products WITH (UPDLOCK, ROWLOCK)
-- WHERE ProductID = 1;
-- WAITFOR DELAY '00:00:05';
-- IF @safeStockA >= 1
--   UPDATE dbo.Products SET Stock = Stock - 1, Version = Version + 1 WHERE ProductID = 1;
-- COMMIT TRAN;
-- SELECT 'Session A safe committed' AS Result, Stock FROM dbo.Products WHERE ProductID = 1;

-- SESSION B - SAFE
-- BEGIN TRAN;
-- DECLARE @safeStockB INT;
-- SELECT @safeStockB = Stock
-- FROM dbo.Products WITH (UPDLOCK, ROWLOCK)
-- WHERE ProductID = 1;
-- IF @safeStockB >= 1
--   UPDATE dbo.Products SET Stock = Stock - 1, Version = Version + 1 WHERE ProductID = 1;
-- ELSE
--   PRINT 'Session B rejected because stock is no longer available';
-- COMMIT TRAN;
-- SELECT 'Session B safe finished' AS Result, Stock FROM dbo.Products WHERE ProductID = 1;
GO
