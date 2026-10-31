import { useEffect, useState } from 'react'
import ProductCard from '../components/ProductCard'
import PageMessage from '../components/PageMessage'
import { fetchProducts } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { mapApiProductToStoreProduct } from '../utils/productMapping'

const PAGE_SIZE = 24

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Phù hợp nhất' },
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
]

function searchHref(query, sort, page) {
  const params = new URLSearchParams({ q: query })
  if (sort && sort !== 'relevance') params.set('sap-xep', sort)
  if (page > 1) params.set('trang', String(page))
  return hrefFor(`/tim-kiem?${params}`)
}

/*
  Kết quả tìm kiếm trên toàn catalog (server tìm không dấu theo SearchText),
  có phân trang và sắp xếp. Trạng thái nằm trên URL nên bấm Back vẫn giữ trang cũ.
*/
export default function SearchPage({
  query,
  sort = 'relevance',
  page = 1,
  favoriteIds,
  onToggleFavorite,
  onAddToCart,
  onQuickView,
  onView,
  onProductsLoaded,
}) {
  const requestKey = JSON.stringify({ query, sort, page })
  const [state, setState] = useState({ key: null, items: [], total: 0, totalPages: 0, error: '' })

  useEffect(() => {
    if (!query) return undefined

    let cancelled = false
    fetchProducts({ q: query, sort, page: String(page), limit: String(PAGE_SIZE) })
      .then((result) => {
        if (cancelled) return
        const items = (result.items || []).map(mapApiProductToStoreProduct)
        setState({
          key: requestKey,
          items,
          total: result.pagination?.totalItems ?? items.length,
          totalPages: result.pagination?.totalPages ?? 1,
          error: '',
        })
        if (onProductsLoaded) onProductsLoaded(items)
      })
      .catch((err) => {
        if (!cancelled) setState({ key: requestKey, items: [], total: 0, totalPages: 0, error: err.message })
      })

    return () => {
      cancelled = true
    }
  }, [query, sort, page, requestKey, onProductsLoaded])

  if (!query) {
    return <PageMessage title="Bạn muốn tìm gì?" description="Gõ tên sản phẩm, hãng hoặc thông số vào ô tìm kiếm phía trên." />
  }

  const loading = state.key !== requestKey

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">Kết quả tìm kiếm</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">
            {loading ? `Đang tìm “${query}”...` : `${state.total.toLocaleString('vi-VN')} sản phẩm cho “${query}”`}
          </h1>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Sắp xếp
          <select
            value={sort}
            onChange={(event) => {
              window.location.hash = searchHref(query, event.target.value, 1)
            }}
            className="rounded-xl border border-slate-200 px-3 py-2"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {state.error ? <p className="mt-6 text-red-600">{state.error}</p> : null}

      {!loading && !state.error && state.items.length === 0 ? (
        <div className="mt-6 rounded-[30px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
          Không có sản phẩm khớp. Thử bớt từ khoá hoặc gõ tên hãng, ví dụ “Logitech”, “màn hình 27”.
        </div>
      ) : null}

      {state.items.length > 0 ? (
        <div className={`mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
          {state.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isFavorite={favoriteIds.includes(product.id)}
              onToggleFavorite={onToggleFavorite}
              onAddToCart={onAddToCart}
              onQuickView={onQuickView}
              onView={onView}
            />
          ))}
        </div>
      ) : null}

      {state.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3 text-sm" aria-label="Phân trang">
          {page > 1 ? (
            <a href={searchHref(query, sort, page - 1)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">
              Trang trước
            </a>
          ) : null}
          <span className="text-slate-500">Trang {page}/{state.totalPages}</span>
          {page < state.totalPages ? (
            <a href={searchHref(query, sort, page + 1)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">
              Trang sau
            </a>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
