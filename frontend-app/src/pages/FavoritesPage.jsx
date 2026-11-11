import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import ProductCard from '../components/ProductCard'
import { fetchProductsByIds } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { mapApiProductToStoreProduct } from '../utils/productMapping'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

/*
  Sản phẩm yêu thích (lưu trên trình duyệt này). Giá, tồn kho lấy mới từ máy chủ mỗi lần mở trang.
  Bỏ yêu thích ngay trên trang thì thẻ biến mất, không tải lại cả danh sách.
*/
export default function FavoritesPage({ favoriteIds, onToggleFavorite, onAddToCart, onQuickView, onView, onProductsLoaded }) {
  const [loaded, setLoaded] = useState({ products: [], requested: '', error: '' })
  const hasProduct = (id) => loaded.products.some((product) => Number(product.id) === Number(id))
  // Chỉ gọi máy chủ khi có sản phẩm yêu thích chưa được tải (lần đầu, hoặc vừa thêm ở tab khác).
  const fetchKey = favoriteIds.some((id) => !hasProduct(id)) ? favoriteIds.join(',') : ''

  useEffect(() => {
    if (!fetchKey) return undefined
    let cancelled = false
    fetchProductsByIds(fetchKey.split(',').map(Number))
      .then((data) => {
        if (cancelled) return
        const products = (Array.isArray(data) ? data : data.items || []).map(mapApiProductToStoreProduct)
        onProductsLoaded?.(products)
        setLoaded({ products, requested: fetchKey, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setLoaded((current) => ({ ...current, requested: fetchKey, error: err.message || 'Không tải được sản phẩm' }))
      })
    return () => {
      cancelled = true
    }
  }, [fetchKey, onProductsLoaded])

  if (!favoriteIds.length) {
    return (
      <PageMessage
        title="Chưa có sản phẩm yêu thích"
        description="Bấm biểu tượng trái tim ở thẻ sản phẩm để lưu lại và xem sau. Danh sách được lưu trên trình duyệt này."
        action={<a href={hrefFor('/')} className="font-bold text-red-600">Xem sản phẩm</a>}
      />
    )
  }
  if (fetchKey && loaded.requested !== fetchKey) return <PageMessage title="Đang tải..." />
  if (loaded.error && !loaded.products.length) return <PageMessage title="Không tải được sản phẩm" description={loaded.error} />

  const products = favoriteIds.map((id) => loaded.products.find((product) => Number(product.id) === Number(id))).filter(Boolean)
  const unavailable = favoriteIds.filter((id) => !hasProduct(id))

  return (
    <section className={CARD} aria-labelledby="favorites-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="favorites-title" className="text-2xl font-black text-slate-900">Sản phẩm yêu thích</h1>
          <p className="mt-1 text-sm text-slate-600">{products.length} sản phẩm · lưu trên trình duyệt này, giá và tồn kho cập nhật theo cửa hàng.</p>
        </div>
      </div>
      {unavailable.length ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{unavailable.length} sản phẩm trong danh sách đã ngừng bán.</span>
          <button type="button" onClick={() => unavailable.forEach((id) => onToggleFavorite(id))} className="font-bold underline hover:text-red-700">
            Bỏ khỏi danh sách
          </button>
        </div>
      ) : null}
      {products.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isFavorite
              onToggleFavorite={onToggleFavorite}
              onAddToCart={onAddToCart}
              onQuickView={onQuickView}
              onView={onView}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
