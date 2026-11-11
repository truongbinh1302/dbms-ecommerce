/*
  Giai đoạn 4 - hỏi đáp ở trang sản phẩm.
  ProductQuestions: khách đăng nhập hỏi về sản phẩm; cửa hàng trả lời thì câu hỏi hiện công khai và người hỏi
  nhận thông báo 'question_answered'. Câu hỏi chưa trả lời chỉ người hỏi thấy. Admin ẩn được câu không phù hợp.
  UserID cho phép NULL: khi khách xoá tài khoản, câu đã trả lời được giữ (không còn gắn với người hỏi),
  câu chưa trả lời bị xoá.
  Chạy lại nhiều lần vẫn an toàn.
*/
IF OBJECT_ID(N'dbo.ProductQuestions', N'U') IS NULL
BEGIN
CREATE TABLE dbo.ProductQuestions (
  QuestionID INT IDENTITY(1,1) CONSTRAINT PK_ProductQuestions PRIMARY KEY,
  ProductID INT NOT NULL CONSTRAINT FK_ProductQuestions_Products REFERENCES dbo.Products(ProductID),
  UserID INT NULL CONSTRAINT FK_ProductQuestions_Users REFERENCES dbo.Users(UserID),
  AskerName NVARCHAR(50) NOT NULL,
  Question NVARCHAR(1000) NOT NULL,
  Answer NVARCHAR(2000) NULL,
  AnsweredBy INT NULL,
  Status NVARCHAR(20) NOT NULL CONSTRAINT DF_ProductQuestions_Status DEFAULT N'pending',
  CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ProductQuestions_CreatedAt DEFAULT SYSDATETIME(),
  AnsweredAt DATETIME2 NULL,
  CONSTRAINT CK_ProductQuestions_Status CHECK (Status IN (N'pending', N'answered', N'hidden')),
  CONSTRAINT CK_ProductQuestions_Answer CHECK (Status <> N'answered' OR Answer IS NOT NULL)
);
CREATE INDEX IX_ProductQuestions_Product ON dbo.ProductQuestions(ProductID, Status, AnsweredAt DESC);
CREATE INDEX IX_ProductQuestions_Status ON dbo.ProductQuestions(Status, CreatedAt);
CREATE INDEX IX_ProductQuestions_User ON dbo.ProductQuestions(UserID, Status);
END
GO

-- Thông báo: thêm loại 'question_answered'.
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_Notifications_Type' AND definition NOT LIKE N'%question_answered%'
)
  ALTER TABLE dbo.Notifications DROP CONSTRAINT CK_Notifications_Type;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Notifications_Type')
  ALTER TABLE dbo.Notifications ADD CONSTRAINT CK_Notifications_Type
    CHECK (Type IN (N'price_drop', N'order_status', N'service_update', N'back_in_stock', N'question_answered'));
GO
