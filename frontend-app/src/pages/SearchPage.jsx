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
  { value: 'rating', label: 'Đánh giá cao' },
  { value: 'newest', label: 'Mới về' },
]

// Khoảng giá theo triệu đồng: "2-5" là 2–5 triệu, "20-" là từ 20 triệu.
const PRICE_RANGES = [
  { value: '', label: 'Mọi mức giá' },
  { value: '0-2', label: 'Dưới 2 triệu' },
  { value: '2-5', label: '2 – 5 triệu' },
  { value: '5-10', label: '5 – 10 triệu' },
  { value: '10-20', label: '10 – 20 triệu' },
  { value: '20-', label: 'Trên 20 triệu' },
]

function priceParams(range) {
  const match = /^(\d+)-(\d*)$/.exec(range || '')
  if (!match) return {}
  const params = {}
  if (Number(match[1]) > 0) params.minPrice = String(Number(match[1]) * 1000000)
  if (match[2]) params.maxPrice = String(Number(match[2]) * 1000000)
  return params
}

function searchHref(query, sort, page, filters = {}) {
  const params = new URLSearchParams({ q: query })
  if (sort && sort !== 'relevance') params.set('sap-xep', sort)
  if (filters.price) params.set('gia', filters.price)
  if (filters.inStock) params.set('con-hang', '1')
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
  price = '',
  inStock = false,
  favoriteIds,
  onToggleFavorite,
  onAddToCart,
  onQuickView,
  onView,
  onProductsLoaded,
}) {
  const filters = { price: PRICE_RANGES.some((range) => range.value === price) ? price : '', inStock }
  const requestKey = JSON.stringify({ query, sort, page, ...filters })
  const [state, setState] = useState({ key: null, items: [], total: 0, totalPages: 0, error: '' })

  useEffect(() => {
    if (!query) return undefined

    let cancelled = false
    const filterParams = JSON.parse(requestKey)
    fetchProducts({
      q: query,
      sort,
      page: String(page),
      limit: String(PAGE_SIZE),
      ...priceParams(filterParams.price),
      ...(filterParams.inStock ? { inStock: 'true' } : {}),
    })
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
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-red-600">Kết quả tìm kiếm</div>
          <h1 className="mt-2 text-3xl font-black text-slate-900">
            {loading ? `Đang tìm “${query}”...` : `${state.total.toLocaleString('vi-VN')} sản phẩm cho “${query}”`}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            Mức giá
            <select
              value={filters.price}
              onChange={(event) => {
                window.location.hash = searchHref(query, sort, 1, { ...filters, price: event.target.value })
              }}
              className="rounded-xl border border-slate-200 px-3 py-2"
            >
              {PRICE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.inStock}
              onChange={(event) => {
                window.location.hash = searchHref(query, sort, 1, { ...filters, inStock: event.target.checked })
              }}
            />
            Chỉ hàng còn
          </label>
          <label className="flex items-center gap-2">
            Sắp xếp
            <select
              value={sort}
              onChange={(event) => {
                window.location.hash = searchHref(query, event.target.value, 1, filters)
              }}
              className="rounded-xl border border-slate-200 px-3 py-2"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {state.error ? <p className="mt-6 text-red-600">{state.error}</p> : null}

      {!loading && !state.error && state.items.length === 0 ? (
        <div className="mt-6 rounded-[30px] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
          {filters.price || filters.inStock
            ? 'Không có sản phẩm khớp với bộ lọc. Thử bỏ lọc giá hoặc lọc hàng còn.'
            : 'Không có sản phẩm khớp. Thử bớt từ khoá hoặc gõ tên hãng, ví dụ “Logitech”, “màn hình 27”.'}
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
            <a href={searchHref(query, sort, page - 1, filters)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">
              Trang trước
            </a>
          ) : null}
          <span className="text-slate-500">Trang {page}/{state.totalPages}</span>
          {page < state.totalPages ? (
            <a href={searchHref(query, sort, page + 1, filters)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">
              Trang sau
            </a>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
