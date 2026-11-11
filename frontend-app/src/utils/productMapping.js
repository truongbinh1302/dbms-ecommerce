/*
  Chuyển sản phẩm từ API (SQL Server) sang dạng giao diện dùng.
  Tên, thông số, giá luôn lấy đúng từ DB; chỉ biểu tượng minh hoạ là suy ra từ danh mục/hãng.
*/

export function normalizeText(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function getDemoVisualKind(productId, categorySlug = '', brand = '') {
  const slug = normalizeText(categorySlug)
  const brandText = normalizeText(brand)
  const id = Math.abs(Number(productId) || 0)

  if (brandText.includes('viewsonic') || brandText.includes('samsung') || brandText.includes('lg')) {
    return 'monitor'
  }

  if (brandText.includes('logitech')) {
    return id % 2 === 0 ? 'mouse' : 'keyboard'
  }

  if (brandText.includes('lenovo') || brandText.includes('asus') || brandText.includes('acer') || brandText.includes('msi')) {
    return 'laptop'
  }

  if (brandText.includes('hp') || brandText.includes('dell')) {
    return id % 2 === 0 ? 'desktop' : 'laptop'
  }

  if (slug.includes('laptop')) return 'laptop'
  if (slug.includes('monitor') || slug.includes('screen') || slug.includes('man-hinh')) return 'monitor'
  if (slug.includes('mouse') || slug.includes('chuot')) return 'mouse'
  if (slug.includes('keyboard') || slug.includes('ban-phim')) return 'keyboard'
  if (slug.includes('headset') || slug.includes('tai-nghe')) return 'headset'

  const kinds = ['desktop', 'laptop', 'monitor', 'keyboard', 'mouse', 'headset']
  return kinds[id % kinds.length]
}

export function mapApiProductToStoreProduct(product) {
  const id = Number(product.id || product.ProductID || product.productId)
  const categorySlug = product.category?.slug || product.CategorySlug || product.categorySlug || ''
  const brand = product.brand || product.Brand || ''
  const listPrice = Number(product.price ?? product.Price ?? 0)
  // Hot Deal đang chạy và còn suất: hiển thị giá khuyến mãi, gạch giá niêm yết hiện tại
  // (không gạch "giá gốc" cũ để mức giảm hiển thị đúng số tiền khách thật sự được bớt).
  const promotion = product.promotion || null
  const promoActive = Boolean(promotion)
    && promotion.status !== 'upcoming'
    && promotion.remaining !== 0
    && Number(promotion.salePrice) > 0
    && Number(promotion.salePrice) < listPrice
  const price = promoActive ? Number(promotion.salePrice) : listPrice
  // Chỉ hiện giá gốc khi DB có giá gốc thật và cao hơn giá bán; không tự bịa giá gốc.
  const rawOldPrice = Number(product.oldPrice ?? product.OldPrice ?? 0)
  const oldPrice = promoActive ? listPrice : rawOldPrice > price ? rawOldPrice : null
  const specs = Array.isArray(product.specs) ? product.specs.map(String) : []

  return {
    id,
    name: product.name || product.Name || `Sản phẩm #${id}`,
    brand,
    price,
    listPrice,
    oldPrice,
    promotion: promotion ? { ...promotion, active: promoActive } : null,
    stock: Number(product.stock ?? product.Stock ?? 0),
    specs,
    description: product.description || '',
    images: Array.isArray(product.images) ? product.images : [],
    badge: promoActive ? 'Hot Deal' : product.isFeatured ? 'Nổi bật' : '',
    // Điểm sao tính từ đánh giá thật của người đã mua (0 khi chưa có đánh giá).
    rating: Number(product.rating ?? product.Rating ?? 0),
    reviews: Number(product.reviewsCount ?? product.ReviewsCount ?? 0),
    visual: { kind: getDemoVisualKind(id, categorySlug, brand) },
    categorySlug,
    categoryName: product.category?.name || '',
  }
}
