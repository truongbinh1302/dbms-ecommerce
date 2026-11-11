const express = require('express');
const productController = require('../controllers/product.controller');
const { authenticate, authorize, optionalAuthenticate } = require('../middlewares/auth');
const questionController = require('../controllers/question.controller');
const upload = require('../middlewares/upload');

const router = express.Router();

// Public routes
router.get('/', productController.getProducts);
router.get('/suggestions', productController.getProductSuggestions);
// Hỏi đáp: route admin khai báo trước /:id/questions để "admin" không bị hiểu là mã sản phẩm.
router.get('/admin/questions', authenticate, authorize('admin'), questionController.listForAdmin);
router.patch('/admin/questions/:questionId', authenticate, authorize('admin'), questionController.moderate);
router.get('/:id/questions', optionalAuthenticate, questionController.listForProduct);
router.post('/:id/questions', authenticate, questionController.ask);
router.get('/:id/price-history', productController.getPriceHistory);
router.get('/:id', productController.getProductById);

// Admin routes
router.post('/admin/products', authenticate, authorize('admin'), productController.createProduct);
router.patch('/admin/products/:id', authenticate, authorize('admin'), productController.updateProduct);
router.delete('/admin/products/:id', authenticate, authorize('admin'), productController.deleteProduct);
router.patch('/admin/products/:id/stock', authenticate, authorize('admin'), productController.updateStock);

// Image upload route
router.post('/admin/upload', authenticate, authorize('admin'), upload.single('image'), productController.uploadProductImage);

module.exports = router;