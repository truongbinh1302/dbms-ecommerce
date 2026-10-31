const mongoose = require('mongoose');

/**
 * Review Schema - MongoDB Model for Product Reviews
 * - productId: SQL Server Product ID (Number, for cross-DB reference)
 * - userId: SQL Server User ID (Number, for cross-DB reference)
 * - rating: 1-5 star rating
 * - title: Review title
 * - content: Review content/description
 * - helpful_count: Number of users who found this review helpful
 * - helpful_by: User IDs that marked the review helpful (hidden from queries)
 * - timestamps: createdAt, updatedAt
 */
const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: Number,
      required: [true, 'Product ID is required'],
      index: true,
    },
    userId: {
      type: Number,
      required: [true, 'User ID is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must not exceed 5'],
    },
    title: {
      type: String,
      required: [true, 'Review title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    content: {
      type: String,
      required: [true, 'Review content is required'],
      trim: true,
      minlength: [10, 'Content must be at least 10 characters'],
      maxlength: [2000, 'Content cannot exceed 2000 characters'],
    },
    helpful_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Danh sách UserID đã bấm "hữu ích", để mỗi người chỉ tính một lần.
    // select: false để không lộ danh sách người dùng ra API công khai.
    helpful_by: {
      type: [Number],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    collection: 'reviews',
  }
);

/**
 * Unique compound index: Prevents duplicate reviews from same user for same product
 */
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

/**
 * Composite indexes for common queries
 */
reviewSchema.index({ createdAt: -1 }); // Sort by newest first
reviewSchema.index({ rating: 1, createdAt: -1 }); // Filter by rating then sort

/**
 * Instance method to convert to safe object (exclude internal MongoDB fields if needed)
 */
reviewSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return obj;
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
