const express = require('express');
const reviewController = require('../controllers/review.controller');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.get('/admin', authenticate, authorize('admin'), reviewController.listForAdmin);
router.patch('/admin/:reviewId', authenticate, authorize('admin'), reviewController.moderate);
router.get('/my', authenticate, reviewController.getMyReviews);
router.get('/products/:productId', reviewController.getProductReviews);
router.get('/products/:productId/eligibility', authenticate, reviewController.getEligibility);
router.post('/products/:productId', authenticate, reviewController.createReview);
router.patch('/:reviewId', authenticate, reviewController.updateReview);
router.delete('/:reviewId', authenticate, reviewController.deleteReview);
router.patch('/:reviewId/helpful', authenticate, reviewController.markHelpful);

module.exports = router;
