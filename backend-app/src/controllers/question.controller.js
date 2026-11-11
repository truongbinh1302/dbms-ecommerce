const questionService = require('../services/question.service');
const { success, error } = require('../utils/response');

const handle = (fn, message, statusCode = 200) => async (req, res) => {
  try {
    return success(res, await fn(req), message, statusCode);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

module.exports = {
  listForProduct: handle((req) => questionService.listForProduct(req.params.id, req.user ? req.user.id : null), 'Questions retrieved'),
  ask: handle((req) => questionService.askQuestion(req.user.id, req.params.id, (req.body || {}).question), 'Question sent', 201),
  listForAdmin: handle((req) => questionService.listForAdmin(req.query), 'Questions retrieved'),
  moderate: handle((req) => questionService.moderateQuestion(req.user.id, req.params.questionId, req.body || {}), 'Question updated'),
};
