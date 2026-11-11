import { useEffect, useState } from 'react'
import { fetchProducts } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { toggleCompare, useCompareItems } from '../hooks/useCompare'
import { formatCurrency } from '../utils/format'
import { mapApiProductToStoreProduct } from '../utils/productMapping'

/* Sản phẩm cùng danh mục có giá gần nhất (còn hàng trước), kèm nút so sánh nhanh với sản phẩm đang xem.
   product là sản phẩm đã qua mapApiProductToStoreProduct (có categorySlug, price là giá khách trả). */
export default function SimilarProducts({ product }) {
  const slug = product.categorySlug || product.category?.slug || ''
  const key = `${product.id}:${slug}`
  const [state, setState] = useState({ key: '', items: [] })
  const compareItems = useCompareItems()

  useEffect(() => {
    if (!slug) return undefined
    let cancelled = false
    fetchProducts({ category: slug, limit: '24', sort: 'featured' })
      .then((result) => {
        if (cancelled) return
        const price = Number(product.price)
        const items = (result.items || [])
          .map(mapApiProductToStoreProduct)
          .filter((item) => Number(item.id) !== Number(product.id))
          .sort((a, b) => (b.stock > 0) - (a.stock > 0) || Math.abs(a.price - price) - Math.abs(b.price - price))
          .slice(0, 4)
        setState({ key, items })
      })
      .catch(() => !cancelled && setState({ key, items: [] }))
    return () => {
      cancelled = true
    }
  }, [key, slug, product.id, product.price])

  const items = state.key === key ? state.items : []
  if (items.length === 0) return null

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]" aria-labelledby="similar-title">
      <h2 id="similar-title" className="text-xl font-black text-slate-900">Sản phẩm cùng loại, giá gần</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const comparing = compareItems.some((entry) => entry.id === Number(item.id))
          return (
            <li key={item.id} className="flex flex-col rounded-2xl border border-slate-200 p-4 text-sm">
              <a href={hrefFor(`/san-pham/${item.id}`)} className="line-clamp-2 font-bold text-slate-900 hover:text-red-600">{item.name}</a>
              <p className="mt-2 font-black text-red-600">{formatCurrency(item.price)}</p>
              {item.oldPrice ? <p className="text-xs text-slate-500 line-through">{formatCurrency(item.oldPrice)}</p> : null}
              <p className={`mt-1 text-xs font-semibold ${item.stock > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{item.stock > 0 ? `Còn ${item.stock}` : 'Tạm hết hàng'}</p>
              <button
                type="button"
                aria-pressed={comparing}
                onClick={() => {
                  // Bắt đầu so sánh từ đây thì đưa luôn sản phẩm đang xem vào danh sách.
                  if (!comparing && !compareItems.some((entry) => entry.id === Number(product.id))) toggleCompare(product)
                  toggleCompare(item)
                }}
                className={`mt-auto pt-3 text-left text-xs font-bold ${comparing ? 'text-emerald-700' : 'text-slate-600 hover:text-red-600'}`}
              >
                {comparing ? '✓ Đang so sánh' : '+ So sánh với sản phẩm này'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
