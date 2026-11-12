const machineService = require('../services/machine.service');
const { success, error } = require('../utils/response');

const handle = (fn, message) => async (req, res) => {
  try {
    return success(res, await fn(req), message);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data, { expose: true });
    return error(res, err.message);
  }
};

module.exports = {
  listLaptops: handle(() => machineService.listLaptopModels(), 'Laptop models retrieved'),
  analyze: handle((req) => machineService.analyzeMachine(req.body || {}), 'Machine analyzed'),
  forBuild: handle((req) => machineService.capabilitiesForBuild((req.body || {}).items), 'Capabilities estimated'),
  forProduct: handle((req) => machineService.capabilitiesForProduct(req.params.id), 'Capabilities estimated'),
};
