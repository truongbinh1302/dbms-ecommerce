const inventoryService = require('../services/inventory.service');
const reportService = require('../services/report.service');
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
  createReceipt: handle((req) => inventoryService.createReceipt(req.body || {}, req.user.id), 'Stock receipt created', 201),
  listReceipts: handle((req) => inventoryService.listReceipts(req.query), 'Stock receipts retrieved'),
  getReceipt: handle((req) => inventoryService.getReceipt(req.params.id), 'Stock receipt retrieved'),
  listLowStock: handle((req) => inventoryService.listLowStock(req.query), 'Low stock products retrieved'),
  listMovements: handle((req) => inventoryService.listMovements(req.query), 'Stock movements retrieved'),
  getDailyReport: handle((req) => reportService.getDailyReport(req.query), 'Daily report retrieved'),
};
