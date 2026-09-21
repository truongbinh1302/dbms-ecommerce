const { error } = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

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