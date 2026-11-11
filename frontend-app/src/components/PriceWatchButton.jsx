import { useEffect, useState } from 'react'
import { fetchPriceWatches, unwatchPrice, watchPrice } from '../api/client'
import { formatCurrency } from '../utils/format'

/* Theo dõi giá ở trang sản phẩm: báo trong mục Thông báo khi giá giảm (hoặc xuống tới giá mong muốn). */
export default function PriceWatchButton({ productId, currentPrice, currentUser, onRequireLogin }) {
  const userId = currentUser?.id
  const [watch, setWatch] = useState({ key: '', data: null })
  const [form, setForm] = useState({ open: false, target: '', busy: false, error: '' })
  const key = `${userId}:${productId}`

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchPriceWatches()
      .then((items) => {
        if (!cancelled) setWatch({ key, data: (items || []).find((item) => item.productId === Number(productId)) || null })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, productId, key])

  const current = watch.key === key ? watch.data : null

  async function handleWatch(event) {
    event.preventDefault()
    setForm((state) => ({ ...state, busy: true, error: '' }))
    try {
      const target = form.target === '' ? null : Number(form.target)
      const saved = await watchPrice(Number(productId), target)
      setWatch({ key, data: { productId: Number(productId), targetPrice: saved.targetPrice, priceAtWatch: saved.priceAtWatch } })
      setForm({ open: false, target: '', busy: false, error: '' })
    } catch (err) {
      setForm((state) => ({ ...state, busy: false, error: err.message || 'Không lưu được' }))
    }
  }

  async function handleUnwatch() {
    setForm((state) => ({ ...state, busy: true, error: '' }))
    try {
      await unwatchPrice(Number(productId))
      setWatch({ key, data: null })
    } catch (err) {
      setForm((state) => ({ ...state, error: err.message || 'Không bỏ theo dõi được' }))
    }
    setForm((state) => ({ ...state, busy: false }))
  }

  if (current) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
          Đang theo dõi giá · {current.targetPrice ? `báo khi còn ${formatCurrency(current.targetPrice)}` : 'báo khi giá giảm'}
        </span>
        <button type="button" onClick={handleUnwatch} disabled={form.busy} className="text-xs font-bold text-slate-500 hover:text-red-600 hover:underline">
          Bỏ theo dõi
        </button>
      </div>
    )
  }

  if (!form.open) {
    return (
      <button
        type="button"
        onClick={() => (userId ? setForm((state) => ({ ...state, open: true })) : onRequireLogin())}
        className="mt-3 text-sm font-bold text-red-600 hover:underline"
      >
        Theo dõi giá, báo khi giảm
      </button>
    )
  }

  return (
    <form onSubmit={handleWatch} className="mt-3 rounded-2xl border border-slate-200 p-3 text-sm" noValidate>
      <label className="block font-semibold text-slate-700">
        Báo khi giá còn (để trống: báo khi giá giảm bất kỳ)
        <input
          type="number"
          min="1"
          step="any"
          inputMode="numeric"
          value={form.target}
          onChange={(event) => setForm((state) => ({ ...state, target: event.target.value }))}
          placeholder={`Thấp hơn ${formatCurrency(currentPrice)}`}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
        />
      </label>
      {form.error ? <p className="mt-1 text-xs font-semibold text-red-600" role="alert">{form.error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={form.busy} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">Theo dõi</button>
        <button type="button" onClick={() => setForm({ open: false, target: '', busy: false, error: '' })} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500">Thôi</button>
      </div>
    </form>
  )
}
