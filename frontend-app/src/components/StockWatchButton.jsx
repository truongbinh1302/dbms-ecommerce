import { useEffect, useState } from 'react'
import { fetchStockWatches, unwatchStock, watchStock } from '../api/client'

/* Sản phẩm đang hết hàng: khách bấm để nhận thông báo khi hàng về (báo một lần). */
export default function StockWatchButton({ productId, currentUser, onRequireLogin }) {
  const userId = currentUser?.id
  const key = `${userId}:${productId}`
  const [state, setState] = useState({ key: '', waiting: false })
  const [action, setAction] = useState({ busy: false, error: '' })

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchStockWatches()
      .then((items) => {
        if (!cancelled) setState({ key, waiting: (items || []).some((item) => item.productId === Number(productId)) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, productId, key])

  const waiting = state.key === key && state.waiting

  async function toggle() {
    if (!userId) {
      onRequireLogin()
      return
    }
    setAction({ busy: true, error: '' })
    try {
      if (waiting) await unwatchStock(Number(productId))
      else await watchStock(Number(productId))
      setState({ key, waiting: !waiting })
      setAction({ busy: false, error: '' })
    } catch (err) {
      setAction({ busy: false, error: err.message || 'Không lưu được' })
    }
  }

  return (
    <div className="mt-2 text-sm" aria-live="polite">
      {waiting ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">Sẽ báo bạn khi có hàng</span>
          <button type="button" disabled={action.busy} onClick={toggle} className="text-xs font-bold text-slate-500 hover:text-red-600 hover:underline">Huỷ</button>
        </span>
      ) : (
        <button type="button" disabled={action.busy} onClick={toggle} className="rounded-2xl border border-red-600 px-4 py-2 font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
          Báo tôi khi có hàng
        </button>
      )}
      {action.error ? <p className="mt-1 text-xs font-semibold text-red-700" role="alert">{action.error}</p> : null}
    </div>
  )
}
