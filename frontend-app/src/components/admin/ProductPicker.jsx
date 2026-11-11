import { useEffect, useRef, useState } from 'react'
import { fetchProducts } from '../../api/client'
import { formatCurrency } from '../../utils/format'

const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'

// Ô chọn sản phẩm: gõ tên để tìm trong catalog (không gồm sản phẩm đã ẩn).
export default function ProductPicker({ value, onSelect, label }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function search(text) {
    setQuery(text)
    window.clearTimeout(timer.current)
    if (text.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = window.setTimeout(async () => {
      try {
        const data = await fetchProducts({ q: text.trim(), limit: 6 })
        setResults(Array.isArray(data?.items) ? data.items : [])
        setOpen(true)
      } catch {
        setResults([])
      }
    }, 250)
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-white">{value.name}</span>
          <span className="text-xs text-slate-400">Mã {value.id} · tồn {value.stock}</span>
        </span>
        <button type="button" onClick={() => onSelect(null)} className="shrink-0 text-xs font-bold text-slate-300 hover:text-white">
          Đổi
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => search(event.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Gõ tên sản phẩm..."
        aria-label={label}
        className={FIELD}
      />
      {open && results.length ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-900 py-1 shadow-xl" role="listbox">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect({ id: product.id, name: product.name, stock: product.stock, price: product.price })
                  setQuery('')
                  setResults([])
                  setOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                <span className="block truncate text-white">{product.name}</span>
                <span className="text-xs text-slate-400">Mã {product.id} · tồn {product.stock} · giá bán {formatCurrency(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
