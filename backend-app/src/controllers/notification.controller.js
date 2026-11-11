const notificationService = require('../services/notification.service');
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
  list: handle((req) => notificationService.listMine(req.user.id, req.query), 'Notifications retrieved'),
  readAll: handle((req) => notificationService.markRead(req.user.id), 'Notifications marked as read'),
  readOne: handle((req) => notificationService.markRead(req.user.id, req.params.id), 'Notification marked as read'),
  listWatches: handle((req) => notificationService.listWatches(req.user.id), 'Price watches retrieved'),
  watch: handle((req) => notificationService.watchProduct(req.user.id, req.body || {}), 'Watching price', 201),
  unwatch: handle((req) => notificationService.unwatchProduct(req.user.id, req.params.productId), 'Stopped watching price'),
};
