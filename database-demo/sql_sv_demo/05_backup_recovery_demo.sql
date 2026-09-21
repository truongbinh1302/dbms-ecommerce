/*
  Topic 5 - Backup and recovery demo on SQL Server
  Change @BackupPath to an existing SQL Server writable folder before running.
*/
USE master;
GO

DECLARE @BackupPath NVARCHAR(4000) = N'C:\\DBMS_Backup\\ecommerce_dbms_full.bak';

-- 1. Full backup
BACKUP DATABASE ecommerce_dbms
TO DISK = @BackupPath
WITH INIT, FORMAT, NAME = N'ecommerce_dbms full backup';
GO

USE ecommerce_dbms;
GO
SELECT TOP 3 ProductID, Name, Stock FROM dbo.Products ORDER BY ProductID;
GO

-- 2. Simulate accidental data change
UPDATE dbo.Products SET Stock = 0 WHERE ProductID IN (1, 2, 3);
SELECT N'After accidental update' AS StepName, ProductID, Name, Stock FROM dbo.Products WHERE ProductID IN (1, 2, 3);
GO

/*
  3. Restore database.
  Close all other connections to ecommerce_dbms before running this part.
*/
-- USE master;
-- ALTER DATABASE ecommerce_dbms SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
-- RESTORE DATABASE ecommerce_dbms
-- FROM DISK = N'C:\DBMS_Backup\ecommerce_dbms_full.bak'
-- WITH REPLACE, RECOVERY;
-- ALTER DATABASE ecommerce_dbms SET MULTI_USER;
-- GO
-- USE ecommerce_dbms;
-- SELECT N'After restore' AS StepName, ProductID, Name, Stock FROM dbo.Products WHERE ProductID IN (1, 2, 3);
-- GO
