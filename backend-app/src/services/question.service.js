const { getPool, sql } = require('../config/db.sql');
const notificationService = require('./notification.service');

/*
  Hỏi đáp ở trang sản phẩm.
  - Khách đăng nhập gửi câu hỏi; câu chưa trả lời chỉ người hỏi thấy (tối đa MAX_PENDING câu chờ mỗi người).
  - Admin trả lời → câu hiện công khai, người hỏi nhận thông báo; hoặc ẩn câu không phù hợp.
  - Tên hiển thị chỉ là tên gọi (chữ cuối của họ tên), không lộ họ tên đầy đủ hay email.
*/

const MAX_PENDING = 5;
const QUESTION_STATUSES = ['pending', 'answered', 'hidden'];

const createHttpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const cleanText = (value, max) => String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/** "Trương Hữu Quốc Gia Bình" → "Bình". Tên trống thì "Khách hàng". */
const displayName = (fullName) => {
  const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1].slice(0, 50) : 'Khách hàng';
};

const validateQuestion = (text) => {
  const question = cleanText(text, 1000);
  if (question.length < 10) throw createHttpError(400, 'Câu hỏi cần ít nhất 10 ký tự');
  return question;
};

const formatQuestion = (row, { includeProduct = false } = {}) => ({
  id: row.QuestionID,
  question: row.Question,
  answer: row.Answer,
  askedBy: row.AskerName,
  status: row.Status,
  createdAt: row.CreatedAt,
  answeredAt: row.AnsweredAt,
  ...(includeProduct ? { productId: row.ProductID, productName: row.ProductName } : {}),
});

/** Câu đã trả lời của sản phẩm (công khai) và câu đang chờ của chính người xem. */
const listForProduct = async (productId, viewerId = null) => {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(400, 'Sản phẩm không hợp lệ');
  const result = await new sql.Request(getPool())
    .input('productId', sql.Int, id)
    .input('viewerId', sql.Int, viewerId ? Number(viewerId) : null)
    .query(`
      SELECT TOP (50) QuestionID, Question, Answer, AskerName, Status, CreatedAt, AnsweredAt
      FROM ProductQuestions
      WHERE ProductID = @productId AND Status = N'answered'
      ORDER BY AnsweredAt DESC;
      SELECT QuestionID, Question, Answer, AskerName, Status, CreatedAt, AnsweredAt
      FROM ProductQuestions
      WHERE ProductID = @productId AND Status = N'pending' AND UserID = @viewerId
      ORDER BY CreatedAt DESC;
    `);
  return {
    items: result.recordsets[0].map((row) => formatQuestion(row)),
    mine: result.recordsets[1].map((row) => formatQuestion(row)),
  };
};

const askQuestion = async (userId, productId, text) => {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(400, 'Sản phẩm không hợp lệ');
  const question = validateQuestion(text);
  const user = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .query('SELECT FullName FROM Users WHERE UserID = @userId AND IsActive = 1');
  if (!user.recordset[0]) throw createHttpError(404, 'Không tìm thấy tài khoản');

  // Đếm câu đang chờ và thêm câu mới trong một transaction (khoá HOLDLOCK) để không vượt giới hạn khi gửi dồn.
  const result = await new sql.Request(getPool())
    .input('userId', sql.Int, Number(userId))
    .input('productId', sql.Int, id)
    .input('askerName', sql.NVarChar(50), displayName(user.recordset[0].FullName))
    .input('question', sql.NVarChar(1000), question)
    .input('max', sql.Int, MAX_PENDING)
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @pending INT = (
        SELECT COUNT(*) FROM ProductQuestions WITH (UPDLOCK, HOLDLOCK)
        WHERE UserID = @userId AND Status = N'pending'
      );
      DECLARE @exists BIT = CASE WHEN EXISTS (SELECT 1 FROM Products WHERE ProductID = @productId AND IsDeleted = 0) THEN 1 ELSE 0 END;
      DECLARE @created TABLE (QuestionID INT, AskerName NVARCHAR(50), Question NVARCHAR(1000), Answer NVARCHAR(2000),
                              Status NVARCHAR(20), CreatedAt DATETIME2, AnsweredAt DATETIME2);
      IF @pending < @max AND @exists = 1
        INSERT INTO ProductQuestions (ProductID, UserID, AskerName, Question)
        OUTPUT INSERTED.QuestionID, INSERTED.AskerName, INSERTED.Question, INSERTED.Answer, INSERTED.Status,
               INSERTED.CreatedAt, INSERTED.AnsweredAt INTO @created
        VALUES (@productId, @userId, @askerName, @question);
      COMMIT TRANSACTION;
      SELECT @pending AS Pending, @exists AS ProductExists;
      SELECT * FROM @created;
    `);
  const check = result.recordsets[0][0];
  if (!check.ProductExists) throw createHttpError(404, 'Không tìm thấy sản phẩm');
  if (Number(check.Pending) >= MAX_PENDING) {
    throw createHttpError(409, `Bạn đang có ${MAX_PENDING} câu hỏi chờ trả lời, vui lòng chờ cửa hàng trả lời trước`, { code: 'too_many_pending' });
  }
  return formatQuestion(result.recordsets[1][0]);
};

const listForAdmin = async ({ status = 'pending', limit = 50 } = {}) => {
  const filter = String(status || 'pending');
  if (!QUESTION_STATUSES.includes(filter)) throw createHttpError(400, 'Trạng thái không hợp lệ');
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const result = await new sql.Request(getPool())
    .input('status', sql.NVarChar(20), filter)
    .input('limit', sql.Int, safeLimit)
    .query(`
      SELECT TOP (@limit) q.QuestionID, q.ProductID, p.Name AS ProductName, q.Question, q.Answer, q.AskerName,
             q.Status, q.CreatedAt, q.AnsweredAt
      FROM ProductQuestions q JOIN Products p ON p.ProductID = q.ProductID
      WHERE q.Status = @status
      ORDER BY CASE WHEN @status = N'pending' THEN q.CreatedAt END ASC, q.QuestionID DESC;
      SELECT COUNT(*) AS Pending FROM ProductQuestions WHERE Status = N'pending';
    `);
  return {
    items: result.recordsets[0].map((row) => formatQuestion(row, { includeProduct: true })),
    pendingCount: Number(result.recordsets[1][0].Pending),
  };
};

/** Admin trả lời (đăng công khai, báo người hỏi) hoặc ẩn câu hỏi. */
const moderateQuestion = async (adminId, questionId, payload = {}) => {
  const hide = payload.hidden === true;
  const answer = hide ? null : cleanText(payload.answer, 2000);
  if (!hide && (!answer || answer.length < 2)) throw createHttpError(400, 'Hãy nhập câu trả lời');

  const transaction = new sql.Transaction(getPool());
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const updated = await new sql.Request(transaction)
      .input('id', sql.Int, Number(questionId) || 0)
      .input('answer', sql.NVarChar(2000), answer)
      .input('adminId', sql.Int, adminId ? Number(adminId) : null)
      .input('hide', sql.Bit, hide ? 1 : 0)
      .query(`
        UPDATE q
        SET Status = CASE WHEN @hide = 1 THEN N'hidden' ELSE N'answered' END,
            Answer = CASE WHEN @hide = 1 THEN Answer ELSE @answer END,
            AnsweredBy = CASE WHEN @hide = 1 THEN AnsweredBy ELSE @adminId END,
            AnsweredAt = CASE WHEN @hide = 1 THEN AnsweredAt ELSE SYSDATETIME() END
        OUTPUT INSERTED.QuestionID, INSERTED.ProductID, INSERTED.UserID, INSERTED.Question, INSERTED.Answer,
               INSERTED.AskerName, INSERTED.Status, INSERTED.CreatedAt, INSERTED.AnsweredAt, DELETED.Status AS PreviousStatus
        FROM ProductQuestions q WITH (UPDLOCK, ROWLOCK)
        WHERE q.QuestionID = @id
      `);
    const row = updated.recordset[0];
    if (!row) throw createHttpError(404, 'Không tìm thấy câu hỏi');
    // Báo người hỏi khi câu hỏi được trả lời lần đầu (sửa câu trả lời thì không báo lại).
    if (!hide && row.UserID && row.PreviousStatus !== 'answered') {
      const product = await new sql.Request(transaction)
        .input('productId', sql.Int, row.ProductID)
        .query('SELECT Name FROM Products WHERE ProductID = @productId');
      await notificationService.notify(transaction, {
        userId: row.UserID,
        type: 'question_answered',
        title: `Cửa hàng đã trả lời câu hỏi về ${product.recordset[0]?.Name || 'sản phẩm'}`,
        body: answer,
        link: `/san-pham/${row.ProductID}`,
      });
    }
    await transaction.commit();
    return formatQuestion(row);
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
};

module.exports = {
  MAX_PENDING,
  displayName,
  validateQuestion,
  listForProduct,
  askQuestion,
  listForAdmin,
  moderateQuestion,
};
