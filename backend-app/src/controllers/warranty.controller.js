const warrantyService = require('../services/warranty.service');
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
  lookupWarranty: handle((req) => warrantyService.lookupWarranty(req.params.serial), 'Warranty retrieved'),
  getMyWarranties: handle((req) => warrantyService.getMyWarranties(req.user.id), 'Warranties retrieved'),
  registerWarranty: handle((req) => warrantyService.registerWarranty(req.body || {}), 'Warranty registered', 201),
};
