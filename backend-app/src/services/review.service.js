const mongoose = require('mongoose');
const Review = require('../models/review.model');
const { pool, getPool, sql } = require('../config/db.sql');
const notificationService = require('./notification.service');

// Đánh giá đang hiện công khai (bản ghi cũ chưa có trường hidden cũng tính là hiện).
const VISIBLE = { hidden: { $ne: true } };

/**
 * Review Service - Handles all review-related business logic
 * - Manages review CRUD operations with MongoDB
 * - Validates user purchases via SQL Server cross-database queries
 * - Handles aggregation pipelines for complex queries
 */

/**
 * Get paginated reviews for a product
 * @param {number} productId - Product ID to fetch reviews for
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Number of reviews per page (default: 10)
 * @returns {Promise} - { reviews, total, page, pages }
 */
const getProductReviews = async (productId, page = 1, limit = 10) => {
  try {
    // Validate inputs
    if (!productId || productId <= 0) {
      throw new Error('Invalid product ID');
    }

    const pageNum = Math.max(1, page);
    const pageSize = Math.min(Math.max(1, limit), 100); // Limit max 100 per page
    const skip = (pageNum - 1) * pageSize;

    // Get total count
    const total = await Review.countDocuments({ productId, ...VISIBLE });

    // Aggregation pipeline for reviews with statistics
    const reviews = await Review.aggregate([
      { $match: { productId, ...VISIBLE } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $project: {
          _id: 1,
          productId: 1,
          userId: 1,
          rating: 1,
          title: 1,
          content: 1,
          helpful_count: 1,
          storeReply: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      reviews,
      total,
      page: pageNum,
      pages: totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1,
    };
  } catch (error) {
    throw new Error(`Failed to fetch product reviews: ${error.message}`);
  }
};

/**
 * Get reviews grouped by rating with statistics
 * @param {number} productId - Product ID
 * @returns {Promise} - { overall_rating, total_reviews, rating_breakdown }
 */
const getReviewStatistics = async (productId) => {
  try {
    if (!productId || productId <= 0) {
      throw new Error('Invalid product ID');
    }

    const stats = await Review.aggregate([
      { $match: { productId, ...VISIBLE } },
      {
        $group: {
          _id: '$productId',
          overall_rating: { $avg: '$rating' },
          total_reviews: { $sum: 1 },
          helpful_count: { $sum: '$helpful_count' },
          rating_1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          rating_2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          rating_3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          rating_4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          rating_5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          overall_rating: { $round: ['$overall_rating', 2] },
          total_reviews: 1,
          helpful_count: 1,
          rating_breakdown: {
            '1': '$rating_1',
            '2': '$rating_2',
            '3': '$rating_3',
            '4': '$rating_4',
            '5': '$rating_5',
          },
        },
      },
    ]);

    return stats[0] || {
      overall_rating: 0,
      total_reviews: 0,
      helpful_count: 0,
      rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  } catch (error) {
    throw new Error(`Failed to fetch review statistics: ${error.message}`);
  }
};

/**
 * Validate if user has purchased the product
 * Cross-database query: checks SQL Server Orders table
 * @param {number} userId - User ID from SQL Server
 * @param {number} productId - Product ID from SQL Server
 * @returns {Promise<boolean>} - True if user purchased the product
 */
const validateUserPurchase = async (userId, productId) => {
  try {
    if (!userId || userId <= 0 || !productId || productId <= 0) {
      throw new Error('Invalid user ID or product ID');
    }

    // Query SQL Server to check if user has purchased this product
    // Assumes database schema with Orders and OrderItems tables
    const result = await pool
      .request()
      .input('userId', userId)
      .input('productId', productId)
      .query(`
        SELECT COUNT(*) AS purchase_count
        FROM Orders o
        INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
        WHERE o.UserID = @userId 
          AND oi.ProductID = @productId
          AND o.Status IN ('delivered', 'completed')
      `);

    return result.recordset[0]?.purchase_count > 0;
  } catch (error) {
    throw new Error(`Failed to validate user purchase: ${error.message}`);
  }
};

/**
 * Add a new review for a product
 * @param {number} productId - Product ID
 * @param {number} userId - User ID (from JWT token)
 * @param {object} reviewData - { rating, title, content }
 * @returns {Promise} - Created review object
 */
const addReview = async (productId, userId, reviewData) => {
  try {
    // Validate inputs
    if (!productId || productId <= 0) {
      throw new Error('Invalid product ID');
    }
    if (!userId || userId <= 0) {
      throw new Error('Invalid user ID');
    }
    const rating = Number(reviewData.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Số sao phải từ 1 đến 5');
    }
    if (!reviewData.title || String(reviewData.title).trim().length === 0) {
      throw new Error('Vui lòng nhập tiêu đề đánh giá');
    }
    if (!reviewData.content || String(reviewData.content).trim().length < 10) {
      throw new Error('Nội dung đánh giá cần ít nhất 10 ký tự');
    }

    // Step 1: Validate user has purchased this product
    const hasPurchased = await validateUserPurchase(userId, productId);
    if (!hasPurchased) {
      throw new Error('Chỉ khách đã nhận hàng sản phẩm này mới đánh giá được');
    }

    // Step 2: Check if user already has a review for this product
    const existingReview = await Review.findOne({ productId, userId });
    if (existingReview) {
      throw new Error('Bạn đã đánh giá sản phẩm này rồi, hãy sửa đánh giá cũ');
    }

    // Step 3: Create new review
    const review = new Review({
      productId,
      userId,
      rating,
      title: String(reviewData.title).trim().slice(0, 200),
      content: String(reviewData.content).trim().slice(0, 2000),
    });

    const savedReview = await review.save();
    await syncProductRating(productId);
    return savedReview;
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Update a review (owner or admin only)
 * @param {number} reviewId - Review MongoDB ObjectId
 * @param {number} userId - User ID making the update (for authorization)
 * @param {object} updateData - { rating, title, content }
 * @returns {Promise} - Updated review object
 */
const updateReview = async (reviewId, userId, updateData) => {
  try {
    if (!reviewId) {
      throw new Error('Invalid review ID');
    }

    // Find review and check ownership
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new Error('Review not found');
    }
    if (review.userId !== userId) {
      throw new Error('Unauthorized: You can only update your own reviews');
    }

    // Update allowed fields
    if (updateData.rating && (updateData.rating < 1 || updateData.rating > 5)) {
      throw new Error('Rating must be between 1 and 5');
    }

    const updates = {};
    if (updateData.rating) updates.rating = updateData.rating;
    if (updateData.title) updates.title = updateData.title.trim();
    if (updateData.content) updates.content = updateData.content.trim();

    const updatedReview = await Review.findByIdAndUpdate(reviewId, updates, {
      new: true,
      runValidators: true,
    });

    await syncProductRating(review.productId);
    return updatedReview;
  } catch (error) {
    throw new Error(`Failed to update review: ${error.message}`);
  }
};

/**
 * Delete a review (owner or admin only)
 * @param {number} reviewId - Review MongoDB ObjectId
 * @param {number} userId - User ID making the deletion (for authorization)
 * @returns {Promise<boolean>} - True if deleted
 */
const deleteReview = async (reviewId, userId) => {
  try {
    if (!reviewId) {
      throw new Error('Invalid review ID');
    }

    // Find review and check ownership
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new Error('Review not found');
    }
    if (review.userId !== userId) {
      throw new Error('Unauthorized: You can only delete your own reviews');
    }

    // Hard delete
    await Review.findByIdAndDelete(reviewId);
    await syncProductRating(review.productId);
    return true;
  } catch (error) {
    throw new Error(`Failed to delete review: ${error.message}`);
  }
};

/**
 * Đánh dấu review là hữu ích. Mỗi người dùng chỉ được tính một lần:
 * điều kiện `helpful_by: { $ne: userId }` và $addToSet chạy trong cùng một lệnh
 * findOneAndUpdate nên hai request đồng thời của cùng một người không cộng hai lần.
 * @param {string} reviewId - Review MongoDB ObjectId
 * @param {number} userId - SQL Server User ID của người bấm
 * @returns {Promise} - Updated review document
 */
const markHelpful = async (reviewId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(String(reviewId))) {
    const err = new Error('Invalid review ID');
    err.status = 400;
    throw err;
  }

  const voterId = Number(userId);
  const updatedReview = await Review.findOneAndUpdate(
    { _id: reviewId, helpful_by: { $ne: voterId } },
    { $addToSet: { helpful_by: voterId }, $inc: { helpful_count: 1 } },
    { new: true }
  );

  if (updatedReview) {
    return updatedReview;
  }

  const exists = await Review.exists({ _id: reviewId });
  const err = new Error(exists ? 'You already marked this review as helpful' : 'Review not found');
  err.status = exists ? 409 : 404;
  throw err;
};

/**
 * Get reviews by user
 * @param {number} userId - User ID
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Number of reviews per page (default: 10)
 * @returns {Promise} - { reviews, total, page, pages }
 */
const getUserReviews = async (userId, page = 1, limit = 10) => {
  try {
    if (!userId || userId <= 0) {
      throw new Error('Invalid user ID');
    }

    const pageNum = Math.max(1, page);
    const pageSize = Math.min(Math.max(1, limit), 100);
    const skip = (pageNum - 1) * pageSize;

    const total = await Review.countDocuments({ userId });

    const reviews = await Review.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    const totalPages = Math.ceil(total / pageSize);

    return {
      reviews,
      total,
      page: pageNum,
      pages: totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1,
    };
  } catch (error) {
    throw new Error(`Failed to fetch user reviews: ${error.message}`);
  }
};

/**
 * Get a single review by ID
 * @param {number} reviewId - Review MongoDB ObjectId
 * @returns {Promise} - Review object or null
 */
const getReviewById = async (reviewId) => {
  try {
    if (!reviewId) {
      throw new Error('Invalid review ID');
    }

    const review = await Review.findById(reviewId);
    return review;
  } catch (error) {
    throw new Error(`Failed to fetch review: ${error.message}`);
  }
};

/*
  Điểm sao và số đánh giá trong bảng Products (dùng để hiển thị, sắp xếp) được tính từ review thật
  ở MongoDB. Trước đây là số seed cố định, không khớp với đánh giá của khách.
*/
const ratingSummary = (rows) => {
  const map = new Map();
  for (const row of rows) {
    map.set(Number(row._id), { rating: Math.round(Number(row.avg) * 100) / 100, count: Number(row.count) });
  }
  return map;
};

/** Tính lại điểm của một sản phẩm sau khi review được thêm, sửa, xoá. */
const syncProductRating = async (productId) => {
  const id = Number(productId);
  const rows = await Review.aggregate([
    { $match: { productId: id, ...VISIBLE } },
    { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const summary = ratingSummary(rows).get(id) || { rating: 0, count: 0 };
  await new sql.Request(getPool())
    .input('id', sql.Int, id)
    .input('rating', sql.Decimal(3, 2), summary.rating)
    .input('count', sql.Int, summary.count)
    .query('UPDATE Products SET Rating = @rating, ReviewsCount = @count WHERE ProductID = @id');
  return summary;
};

/** Đồng bộ toàn bộ điểm sao từ MongoDB (chạy khi khởi động). Trả về số sản phẩm đã sửa. */
const syncAllProductRatings = async () => {
  const rows = await Review.aggregate([
    { $match: VISIBLE },
    { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const payload = JSON.stringify([...ratingSummary(rows)].map(([productId, value]) => ({ productId, ...value })));
  const result = await new sql.Request(getPool())
    .input('payload', sql.NVarChar(sql.MAX), payload)
    .query(`
      WITH rv AS (
        SELECT productId, rating, [count]
        FROM OPENJSON(@payload) WITH (productId INT, rating DECIMAL(3,2), [count] INT)
      )
      UPDATE p
      SET Rating = COALESCE(r.rating, 0), ReviewsCount = COALESCE(r.[count], 0)
      FROM Products p
      LEFT JOIN rv r ON r.productId = p.ProductID
      WHERE p.Rating <> COALESCE(r.rating, 0) OR p.ReviewsCount <> COALESCE(r.[count], 0);
      SELECT @@ROWCOUNT AS changed;
    `);
  return result.recordset[0].changed;
};

/** Khách đã đăng nhập có viết đánh giá cho sản phẩm này được không. */
const getReviewEligibility = async (productId, userId) => {
  const existing = await Review.findOne({ productId: Number(productId), userId: Number(userId) }).lean();
  if (existing) {
    return {
      canReview: false,
      reason: 'already_reviewed',
      reviewId: String(existing._id),
      ...(existing.hidden ? { hidden: true, hiddenReason: existing.hiddenReason } : {}),
    };
  }
  const purchased = await validateUserPurchase(Number(userId), Number(productId));
  return purchased ? { canReview: true, reason: null } : { canReview: false, reason: 'not_purchased' };
};

/* ---------------- Kiểm duyệt của cửa hàng ---------------- */

const HIDE_REASONS = {
  spam: 'quảng cáo hoặc spam',
  offensive: 'ngôn từ xúc phạm',
  personal_info: 'chứa thông tin cá nhân',
  off_topic: 'không liên quan tới sản phẩm',
};
const ADMIN_FILTERS = ['all', 'visible', 'hidden', 'needs_reply'];
// Đánh giá thấp (1-2 sao) đang hiện mà cửa hàng chưa phản hồi: nên trả lời sớm.
const NEEDS_REPLY = { ...VISIBLE, rating: { $lte: 2 }, 'storeReply.content': { $exists: false } };

const httpError = (status, message, data = null) => {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  return err;
};

const cleanReply = (value) => String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Kiểm tra yêu cầu kiểm duyệt: { hidden?: boolean, reason?: string, reply?: string|null }.
 * reply là chuỗi rỗng hoặc null thì xoá phản hồi; không gửi reply thì giữ nguyên.
 */
const validateModeration = (payload = {}) => {
  const change = {};
  if (payload.hidden !== undefined) {
    if (typeof payload.hidden !== 'boolean') throw httpError(400, 'hidden phải là true hoặc false');
    change.hidden = payload.hidden;
    if (payload.hidden) {
      if (!Object.hasOwn(HIDE_REASONS, payload.reason)) throw httpError(400, 'Hãy chọn lý do ẩn đánh giá');
      change.reason = payload.reason;
    }
  }
  if (payload.reply !== undefined) {
    const reply = payload.reply === null ? '' : cleanReply(payload.reply);
    if (reply && reply.length < 2) throw httpError(400, 'Phản hồi quá ngắn');
    if (reply.length > 1000) throw httpError(400, 'Phản hồi tối đa 1000 ký tự');
    change.reply = reply;
  }
  if (!Object.keys(change).length) throw httpError(400, 'Không có thay đổi nào');
  return change;
};

const lookupNames = async (productIds, userIds) => {
  const result = await new sql.Request(getPool())
    .input('products', sql.NVarChar(sql.MAX), JSON.stringify(productIds))
    .input('users', sql.NVarChar(sql.MAX), JSON.stringify(userIds))
    .query(`
      SELECT ProductID, Name FROM Products WHERE ProductID IN (SELECT CAST(value AS INT) FROM OPENJSON(@products));
      SELECT UserID, FullName, Email FROM Users WHERE UserID IN (SELECT CAST(value AS INT) FROM OPENJSON(@users));
    `);
  return {
    products: new Map(result.recordsets[0].map((row) => [Number(row.ProductID), row.Name])),
    users: new Map(result.recordsets[1].map((row) => [Number(row.UserID), { fullName: row.FullName, email: row.Email }])),
  };
};

const formatAdminReview = (review, names) => ({
  id: String(review._id),
  productId: review.productId,
  productName: names.products.get(Number(review.productId)) || null,
  userId: review.userId,
  author: names.users.get(Number(review.userId)) || null,
  rating: review.rating,
  title: review.title,
  content: review.content,
  helpfulCount: review.helpful_count || 0,
  hidden: review.hidden === true,
  hiddenReason: review.hiddenReason || null,
  hiddenAt: review.hiddenAt || null,
  storeReply: review.storeReply?.content ? { content: review.storeReply.content, repliedAt: review.storeReply.repliedAt } : null,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

/** Danh sách đánh giá cho admin (mới nhất trước), kèm tên sản phẩm, người viết và số đánh giá thấp chưa phản hồi. */
const listForAdmin = async ({ filter = 'all', page = 1, limit = 20 } = {}) => {
  const key = String(filter || 'all');
  if (!ADMIN_FILTERS.includes(key)) throw httpError(400, 'Bộ lọc không hợp lệ');
  const match = { all: {}, visible: VISIBLE, hidden: { hidden: true }, needs_reply: NEEDS_REPLY }[key];
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(Math.max(1, Number(limit) || 20), 50);
  const [reviews, total, needsReply] = await Promise.all([
    Review.find(match).sort({ createdAt: -1 }).skip((pageNum - 1) * pageSize).limit(pageSize).lean(),
    Review.countDocuments(match),
    Review.countDocuments(NEEDS_REPLY),
  ]);
  const names = reviews.length
    ? await lookupNames([...new Set(reviews.map((item) => item.productId))], [...new Set(reviews.map((item) => item.userId))])
    : { products: new Map(), users: new Map() };
  return {
    items: reviews.map((item) => formatAdminReview(item, names)),
    total,
    page: pageNum,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    needsReply,
  };
};

/**
 * Admin ẩn/hiện lại đánh giá và/hoặc phản hồi công khai.
 * Ẩn hoặc hiện lại thì tính lại điểm sao. Khách được báo khi đánh giá bị ẩn (kèm lý do)
 * và khi cửa hàng phản hồi lần đầu (sửa phản hồi thì không báo lại).
 */
const moderateReview = async (reviewId, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(String(reviewId))) throw httpError(400, 'Mã đánh giá không hợp lệ');
  const change = validateModeration(payload);
  const set = {};
  const unset = {};
  if (change.hidden === true) Object.assign(set, { hidden: true, hiddenReason: change.reason, hiddenAt: new Date() });
  if (change.hidden === false) Object.assign(set, { hidden: false, hiddenReason: null, hiddenAt: null });
  if (change.reply) Object.assign(set, { 'storeReply.content': change.reply, 'storeReply.repliedAt': new Date() });
  if (change.reply === '') unset.storeReply = 1;

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  // Lấy bản trước khi sửa để biết trạng thái cũ (đã ẩn chưa, đã phản hồi chưa).
  const before = await Review.findByIdAndUpdate(reviewId, update, { new: false, runValidators: true }).lean();
  if (!before) throw httpError(404, 'Không tìm thấy đánh giá');
  const after = await Review.findById(reviewId).lean();

  const wasHidden = before.hidden === true;
  if (change.hidden !== undefined && change.hidden !== wasHidden) await syncProductRating(before.productId);

  const names = await lookupNames([before.productId], [before.userId]);
  const productName = names.products.get(Number(before.productId)) || 'sản phẩm';
  if (change.hidden === true && !wasHidden) {
    await notificationService.notify(null, {
      userId: before.userId,
      type: 'review',
      title: `Đánh giá của bạn về ${productName} đã bị ẩn`,
      body: `Lý do: ${HIDE_REASONS[change.reason]}. Nếu bạn thấy chưa đúng, hãy liên hệ cửa hàng.`,
      link: `/san-pham/${before.productId}`,
    });
  }
  if (change.reply && !before.storeReply?.content && after.hidden !== true) {
    await notificationService.notify(null, {
      userId: before.userId,
      type: 'review',
      title: `Cửa hàng đã phản hồi đánh giá của bạn về ${productName}`,
      body: change.reply,
      link: `/san-pham/${before.productId}`,
    });
  }
  return formatAdminReview(after, names);
};

module.exports = {
  HIDE_REASONS,
  validateModeration,
  listForAdmin,
  moderateReview,
  syncProductRating,
  syncAllProductRatings,
  getReviewEligibility,
  getProductReviews,
  getReviewStatistics,
  validateUserPurchase,
  addReview,
  updateReview,
  deleteReview,
  markHelpful,
  getUserReviews,
  getReviewById,
};
