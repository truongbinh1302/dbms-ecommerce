const crypto = require('crypto');

const success = (res, data, message = 'OK', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};

/*
  Lỗi 5xx: ghi một dòng JSON vào log (mã lỗi, request, chi tiết) để tra cứu, và ở production
  chỉ trả cho khách thông báo chung kèm mã lỗi, không lộ câu SQL hay đường dẫn file.
  Lỗi 4xx là lỗi của request nên trả nguyên thông báo như trước.
*/
const logServerError = (res, message, statusCode) => {
    const errorId = crypto.randomBytes(4).toString('hex');
    const req = res.req || {};
    console.error(JSON.stringify({
        level: 'error',
        errorId,
        time: new Date().toISOString(),
        status: statusCode,
        method: req.method,
        path: req.originalUrl,
        userId: req.user ? req.user.id : undefined,
        message: String(message),
    }));
    return errorId;
};

const error = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
    let publicMessage = message;
    let errorId;
    if (statusCode >= 500) {
        errorId = logServerError(res, message, statusCode);
        if (process.env.NODE_ENV === 'production') {
            publicMessage = 'Hệ thống đang gặp lỗi, vui lòng thử lại sau';
        }
    }
    const response = { success: false, message: publicMessage };
    if (errorId) response.errorId = errorId;
    if (errors) response.errors = errors;
    return res.status(statusCode).json(response);
};

module.exports = { success, error };
