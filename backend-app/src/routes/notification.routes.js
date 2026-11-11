const express = require('express');
const controller = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth');

// Thông báo trong tài khoản và theo dõi giá: cần đăng nhập.
const router = express.Router();
router.use(authenticate);

router.get('/', controller.list);
router.patch('/read-all', controller.readAll);
router.patch('/:id/read', controller.readOne);
router.get('/price-watches', controller.listWatches);
router.post('/price-watches', controller.watch);
router.delete('/price-watches/:productId', controller.unwatch);

module.exports = router;
