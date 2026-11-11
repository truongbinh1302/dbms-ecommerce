const afterSalesService = require('../services/afterSales.service');
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
  getOptions: handle(() => afterSalesService.getOptions(), 'Service options retrieved'),
  estimateTradeIn: handle((req) => afterSalesService.estimateTradeIn(req.body || {}), 'Trade-in estimate'),
  createRequest: handle((req) => afterSalesService.createRequest(req.user.id, req.body || {}), 'Service request created', 201),
  listMine: handle((req) => afterSalesService.listMyRequests(req.user.id), 'Service requests retrieved'),
  getMine: handle((req) => afterSalesService.getRequest(req.params.id, { userId: req.user.id }), 'Service request retrieved'),
  cancelMine: handle((req) => afterSalesService.cancelMyRequest(req.user.id, req.params.id, req.body?.reason), 'Service request cancelled'),
  listAll: handle((req) => afterSalesService.listRequests(req.query), 'Service requests retrieved'),
  update: handle((req) => afterSalesService.updateRequest(req.params.id, req.body || {}, req.user.id), 'Service request updated'),
};
