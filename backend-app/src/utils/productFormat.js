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
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
});

module.exports = { parseJson, formatProduct };
