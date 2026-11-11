const { error } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  // Lỗi 5xx được ghi log (kèm mã lỗi) trong error(); ở đây chỉ in thêm stack để dò lỗi.
  if (!err.status || err.status >= 500) console.error(err.stack || err);

  // Body JSON hỏng là lỗi của request, không phải lỗi máy chủ.
  if (err.type === 'entity.parse.failed') {
    return error(res, 'Dữ liệu gửi lên không phải JSON hợp lệ', 400);
  }

  if (err.code === 'EREQUEST' || err.code === 'ECONNCLOSED') {
    return error(res, 'Database connection error', 500);
  }

  if (err.name === 'ValidationError') {
    return error(res, 'Validation failed', 400, err.errors);
  }

  if (err.name === 'JsonWebTokenError') {
    return error(res, 'Invalid token', 401);
  }

  return error(res, err.message || 'Internal Server Error', err.status || 500);
};

module.exports = errorHandler;