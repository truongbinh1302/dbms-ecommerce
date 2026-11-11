const promotionService = require('../services/promotion.service');
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
  getActive: handle(() => promotionService.getActivePromotions(), 'Active promotions retrieved'),
  list: handle((req) => promotionService.listPromotions(req.query), 'Promotions retrieved'),
  get: handle((req) => promotionService.getPromotion(req.params.id), 'Promotion retrieved'),
  create: handle((req) => promotionService.createPromotion(req.body || {}, req.user.id), 'Promotion created', 201),
  stop: handle((req) => promotionService.stopPromotion(req.params.id), 'Promotion stopped'),
};
