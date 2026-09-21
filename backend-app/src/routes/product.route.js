const express = require('express');
const productController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const router = express.Router();

// Public routes
router.get('/', productController.getProducts);
router.get('/suggestions', productController.getProductSuggestions);
router.get('/:id', productController.getProductById);

// Admin routes
router.post('/admin/products', authenticate, authorize('admin'), productController.createProduct);
router.patch('/admin/products/:id', authenticate, authorize('admin'), productController.updateProduct);
router.delete('/admin/products/:id', authenticate, authorize('admin'), productController.deleteProduct);
router.patch('/admin/products/:id/stock', authenticate, authorize('admin'), productController.updateStock);

// Image upload route
router.post('/admin/upload', authenticate, authorize('admin'), upload.single('image'), productController.uploadProductImage);

module.exports = router;