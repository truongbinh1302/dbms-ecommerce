const mongoose = require('mongoose');

/**
 * ProductLog Schema - MongoDB Model for Product Audit Trail
 * Tracks all changes to products (create, update, delete, restock, etc.)
 * - productId: SQL Server Product ID (Number, for cross-DB reference)
 * - action: Type of change (created, updated, deleted, restocked, etc.)
 * - previousValues: Snapshot of product state before change
 * - newValues: Snapshot of product state after change
 * - changedBy: SQL Server Admin User ID who made the change
 * - notes: Optional reason or description of the change
 * - timestamps: createdAt (auto-added)
 */
const productLogSchema = new mongoose.Schema(
  {
    productId: {
      type: Number,
      required: [true, 'Product ID is required'],
      index: true,
    },
    action: {
      type: String,
      enum: {
        values: ['created', 'updated', 'deleted', 'restocked', 'price_changed', 'stock_adjusted'],
        message: '{VALUE} is not a valid action',
      },
      required: [true, 'Action is required'],
      index: true,
    },
    previousValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    changedBy: {
      type: Number,
      required: [true, 'Admin User ID is required'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'product_logs',
  }
);

/**
 * Composite indexes for common queries
 */
productLogSchema.index({ productId: 1, createdAt: -1 }); // Get all logs for a product
productLogSchema.index({ action: 1, createdAt: -1 }); // Filter by action type
productLogSchema.index({ changedBy: 1 }); // Track changes by admin user

/**
 * Static method to create a log entry
 */
productLogSchema.statics.createLog = async function (logData) {
  try {
    const log = new this(logData);
    return await log.save();
  } catch (error) {
    throw new Error(`Failed to create product log: ${error.message}`);
  }
};

/**
 * Instance method to format log for API response
 */
productLogSchema.methods.toJSON = function () {
  return this.toObject();
};

const ProductLog = mongoose.model('ProductLog', productLogSchema);

module.exports = ProductLog;
