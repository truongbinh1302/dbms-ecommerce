const reviewService = require('../services/review.service');
const { success, error } = require('../utils/response');

const getProductReviews = async (req, res) => {
  try {
    const productId = Number(req.params.productId || req.query.productId);
    const { page = 1, limit = 10 } = req.query;
    const [reviews, statistics] = await Promise.all([
      reviewService.getProductReviews(productId, Number(page), Number(limit)),
      reviewService.getReviewStatistics(productId),
    ]);
    return success(res, { ...reviews, statistics }, 'Reviews retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const createReview = async (req, res) => {
  try {
    const productId = Number(req.params.productId || req.body.productId);
    const review = await reviewService.addReview(productId, req.user.id, req.body);
    return success(res, review, 'Review created successfully', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const updateReview = async (req, res) => {
  try {
    const review = await reviewService.updateReview(req.params.reviewId, req.user.id, req.body);
    return success(res, review, 'Review updated successfully');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const deleteReview = async (req, res) => {
  try {
    await reviewService.deleteReview(req.params.reviewId, req.user.id);
    return success(res, { reviewId: req.params.reviewId }, 'Review deleted successfully');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const markHelpful = async (req, res) => {
  try {
    const review = await reviewService.markHelpful(req.params.reviewId, req.user.id);
    return success(res, review, 'Review marked helpful');
  } catch (err) {
    return error(res, err.message, err.status || 400);
  }
};

const getMyReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await reviewService.getUserReviews(req.user.id, Number(page), Number(limit));
    return success(res, result, 'User reviews retrieved successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  markHelpful,
  getMyReviews,
};
