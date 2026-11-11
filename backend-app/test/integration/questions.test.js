/*
  Test tích hợp: hỏi đáp ở trang sản phẩm trên SQL Server thật.
  Chạy:  cd backend-app && npm run test:db
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectSQL, getPool, sql } = require('../../src/config/db.sql');
const connectMongo = require('../../src/config/db.mongo');
const questionService = require('../../src/services/question.service');
const accountService = require('../../src/services/account.service');
const { hashPassword } = require('../../src/utils/hash');

const tag = `qa${Date.now()}`;
const PASSWORD = 'Question-test-123';
const ctx = { userIds: [], productId: null, adminId: null };

const query = async (text, inputs = {}) => {
  const request = new sql.Request(getPool());
  for (const [name, [type, value]] of Object.entries(inputs)) request.input(name, type, value);
  return (await request.query(text)).recordset;
};

const newUser = async (suffix, fullName) => {
  const [user] = await query(`
    INSERT INTO Users (FullName, Email, Password, Role) OUTPUT INSERTED.UserID
    VALUES (@name, @email, @password, N'customer')
  `, { name: [sql.NVarChar, fullName], email: [sql.NVarChar, `${tag}-${suffix}@btstore.test`], password: [sql.NVarChar, await hashPassword(PASSWORD)] });
  ctx.userIds.push(user.UserID);
  return user.UserID;
};

test.before(async () => {
  await connectSQL();
  await connectMongo();
  const [admin] = await query("SELECT UserID FROM Users WHERE Email = N'admin@btstore.local'");
  ctx.adminId = admin.UserID;
  const [category] = await query('SELECT TOP 1 CategoryID FROM Categories ORDER BY CategoryID');
  const [product] = await query(`
    INSERT INTO Products (Name, Slug, Price, Stock, CategoryID) OUTPUT INSERTED.ProductID
    VALUES (N'Card hỏi đáp test', @slug, 9000000, 3, @categoryId)
  `, { slug: [sql.NVarChar, `${tag}-product`], categoryId: [sql.Int, category.CategoryID] });
  ctx.productId = product.ProductID;
});

test.after(async () => {
  const users = ctx.userIds.join(',') || '0';
  await query(`
    DELETE FROM ProductQuestions WHERE ProductID = @productId;
    DELETE FROM Notifications WHERE UserID IN (${users});
    DELETE FROM Users WHERE UserID IN (${users});
    DELETE FROM Products WHERE ProductID = @productId;
  `, { productId: [sql.Int, ctx.productId] });
  await mongoose.disconnect();
  await getPool().close();
});

test('hỏi đáp: câu chờ chỉ người hỏi thấy; trả lời thì công khai và báo người hỏi', async () => {
  const lan = await newUser('lan', 'Nguyễn Thị Lan');
  const other = await newUser('other', 'Trần Văn Nam');
  await assert.rejects(questionService.askQuestion(lan, ctx.productId, 'còn ko?'), (err) => err.status === 400);
  await assert.rejects(questionService.askQuestion(lan, 99999999, 'Card này còn bảo hành bao lâu?'), (err) => err.status === 404);

  const asked = await questionService.askQuestion(lan, ctx.productId, 'Card này lắp được case mini-ITX không?');
  assert.deepEqual([asked.askedBy, asked.status, asked.answer], ['Lan', 'pending', null]);

  const forLan = await questionService.listForProduct(ctx.productId, lan);
  const forOther = await questionService.listForProduct(ctx.productId, other);
  const forGuest = await questionService.listForProduct(ctx.productId, null);
  assert.deepEqual([forLan.items.length, forLan.mine.length], [0, 1]);
  assert.deepEqual([forOther.items.length, forOther.mine.length, forGuest.mine.length], [0, 0, 0]);

  const pending = await questionService.listForAdmin({ status: 'pending' });
  assert.ok(pending.items.some((item) => item.id === asked.id && item.productId === ctx.productId));
  assert.ok(pending.pendingCount >= 1);

  await assert.rejects(questionService.moderateQuestion(ctx.adminId, asked.id, { answer: ' ' }), (err) => err.status === 400);
  const answered = await questionService.moderateQuestion(ctx.adminId, asked.id, { answer: 'Lắp được nếu case hỗ trợ card dài tới 200 mm.' });
  assert.equal(answered.status, 'answered');
  const [note] = await query("SELECT Title, Body, Link FROM Notifications WHERE UserID = @id AND Type = N'question_answered'", { id: [sql.Int, lan] });
  assert.match(note.Title, /Card hỏi đáp test/);
  assert.equal(note.Link, `/san-pham/${ctx.productId}`);

  // Sửa câu trả lời: không báo lại.
  await questionService.moderateQuestion(ctx.adminId, asked.id, { answer: 'Lắp được nếu case hỗ trợ card dài tới 200 mm (card này dài 199 mm).' });
  const notes = await query("SELECT COUNT(*) AS Total FROM Notifications WHERE UserID = @id AND Type = N'question_answered'", { id: [sql.Int, lan] });
  assert.equal(notes[0].Total, 1);

  const publicList = await questionService.listForProduct(ctx.productId, null);
  assert.deepEqual(publicList.items.map((item) => [item.askedBy, item.answer]), [['Lan', 'Lắp được nếu case hỗ trợ card dài tới 200 mm (card này dài 199 mm).']]);

  const spam = await questionService.askQuestion(other, ctx.productId, 'Mua ở đây có rẻ hơn chỗ khác không?');
  await questionService.moderateQuestion(ctx.adminId, spam.id, { hidden: true });
  assert.equal((await questionService.listForProduct(ctx.productId, other)).mine.length, 0, 'câu bị ẩn không hiện nữa');
});

test('hỏi đáp: tối đa 5 câu chờ mỗi người, kể cả khi gửi dồn cùng lúc', async () => {
  const minh = await newUser('minh', 'Lê Minh');
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => questionService.askQuestion(minh, ctx.productId, `Câu hỏi số ${index + 1} về card này?`)));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, questionService.MAX_PENDING);
  for (const item of results.filter((entry) => entry.status === 'rejected')) assert.equal(item.reason.status, 409);
});

test('xoá tài khoản: câu chờ bị xoá, câu đã trả lời giữ lại nhưng không còn gắn với người hỏi', async () => {
  const hoa = await newUser('hoa', 'Phạm Thị Hoa');
  const answeredQ = await questionService.askQuestion(hoa, ctx.productId, 'Card này có cần nguồn phụ 8 pin không?');
  const pendingQ = await questionService.askQuestion(hoa, ctx.productId, 'Card này có bản màu trắng không ạ?');
  await questionService.moderateQuestion(ctx.adminId, answeredQ.id, { answer: 'Cần một đầu nguồn 8 pin.' });

  const exported = await accountService.exportMyData(hoa);
  assert.equal(exported.productQuestions.length, 2);

  await accountService.deleteAccount(hoa, PASSWORD);
  const rows = await query('SELECT QuestionID, UserID, AskerName FROM ProductQuestions WHERE QuestionID IN (@a, @b)', {
    a: [sql.Int, answeredQ.id], b: [sql.Int, pendingQ.id],
  });
  assert.deepEqual(rows, [{ QuestionID: answeredQ.id, UserID: null, AskerName: 'Khách hàng' }]);
});
