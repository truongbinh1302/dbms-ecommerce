// Định dạng một dòng Products (SQL) thành object trả cho API. Dùng chung cho sản phẩm và giỏ hàng.
const parseJson = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const nullableNumber = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * Chương trình Hot Deal đang chạy của sản phẩm (cột Promo* từ promotion.service.promoApply), hoặc null.
 * `price` của sản phẩm vẫn là giá niêm yết; giao diện hiển thị salePrice khi có khuyến mãi.
 */
const formatPromotion = (row) => {
  if (row.PromoID === null || row.PromoID === undefined) return null;
  const quantityLimit = nullableNumber(row.PromoQuantityLimit);
  const soldCount = Number(row.PromoSoldCount || 0);
  return {
    id: row.PromoID,
    name: row.PromoName,
    salePrice: Number(row.PromoSalePrice),
    endsAt: row.PromoEndsAt,
    quantityLimit,
    soldCount,
    remaining: quantityLimit === null ? null : Math.max(quantityLimit - soldCount, 0),
    perOrderLimit: nullableNumber(row.PromoPerOrderLimit),
    status: 'running',
  };
};

const formatProduct = (row) => ({
  id: row.id ?? row.ProductID,
  name: row.Name,
  slug: row.Slug,
  brand: row.Brand,
  description: row.Description,
  price: Number(row.Price || 0),
  oldPrice: row.OldPrice === null || row.OldPrice === undefined ? null : Number(row.OldPrice),
  stock: Number(row.Stock || 0),
  specs: parseJson(row.Specs, []),
  images: parseJson(row.Images, []),
  isFeatured: Boolean(row.IsFeatured),
  rating: Number(row.Rating || 0),
  reviewsCount: Number(row.ReviewsCount || 0),
  category: {
    id: row.categoryId ?? row.CategoryID,
    name: row.categoryName,
    slug: row.categorySlug,
  },
  promotion: formatPromotion(row),
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
});

module.exports = { parseJson, formatProduct, formatPromotion };
