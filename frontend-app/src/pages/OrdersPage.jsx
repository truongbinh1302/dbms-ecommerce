import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { fetchMyOrders } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  describePaymentResult,
  formatDateTime,
  labelOf,
  statusTone,
} from '../utils/orderLabels'

const PAGE_SIZE = 10

export function PaymentResultBanner({ code }) {
  const result = describePaymentResult(code)
  if (!result) return null
  const tone = {
    success: 'bg-emerald-50 text-emerald-800',
    warning: 'bg-amber-50 text-amber-800',
    error: 'bg-red-50 text-red-700',
  }[result.tone]
  return <p className={`rounded-2xl px-4 py-3 text-sm ${tone}`} role="status">{result.text}</p>
}

export function LoginRequired({ onRequireLogin }) {
  return (
    <PageMessage
      title="Đăng nhập để xem đơn hàng"
      description="Đơn hàng gắn với tài khoản của bạn."
      action={(
        <button type="button" onClick={onRequireLogin} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white">
          Đăng nhập
        </button>
      )}
    />
  )
}

export default function OrdersPage({ currentUser, onRequireLogin, page = 1, paymentResult = '' }) {
  const userId = currentUser?.id
  const requestKey = `${userId}:${page}`
  const [state, setState] = useState({ key: null, items: [], totalPages: 0, error: '' })

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMyOrders({ page: String(page), limit: String(PAGE_SIZE) })
      .then((result) => {
        if (!cancelled) {
          setState({ key: requestKey, items: result.items || [], totalPages: result.pagination?.totalPages || 0, error: '' })
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ key: requestKey, items: [], totalPages: 0, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [userId, page, requestKey])

  if (!userId) {
    return <LoginRequired onRequireLogin={onRequireLogin} />
  }

  const loading = state.key !== requestKey

  return (
    <section className="space-y-4 rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <h1 className="text-2xl font-black text-slate-900">Đơn hàng của tôi</h1>
      <PaymentResultBanner code={paymentResult} />

      {state.error ? <p className="text-red-600">{state.error}</p> : null}
      {loading ? <p className="text-slate-500">Đang tải đơn hàng...</p> : null}

      {!loading && !state.error && state.items.length === 0 ? (
        <p className="text-slate-500">
          Bạn chưa có đơn hàng nào. <a href={hrefFor('/')} className="font-bold text-red-600">Bắt đầu mua sắm</a>
        </p>
      ) : null}

      {state.items.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {state.items.map((order) => (
            <li key={order.id}>
              <a href={hrefFor(`/don-hang/${order.id}`)} className="flex flex-col gap-2 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-bold text-slate-900">{order.orderCode || `#${order.id}`}</div>
                  <div className="text-sm text-slate-500">
                    {formatDateTime(order.CreatedAt)} · {order.itemCount} sản phẩm · {labelOf(PAYMENT_METHOD_LABELS, order.PaymentMethod)}
                    {order.PaymentMethod === 'vnpay' ? ` (${labelOf(PAYMENT_STATUS_LABELS, order.PaymentStatus)})` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone(order.Status)}`}>
                    {labelOf(ORDER_STATUS_LABELS, order.Status)}
                  </span>
                  <span className="font-black text-red-600">{formatCurrency(order.Total)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {state.totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="Phân trang">
          {page > 1 ? <a href={hrefFor(`/don-hang?trang=${page - 1}`)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">Trang trước</a> : null}
          <span className="text-slate-500">Trang {page}/{state.totalPages}</span>
          {page < state.totalPages ? <a href={hrefFor(`/don-hang?trang=${page + 1}`)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">Trang sau</a> : null}
        </nav>
      ) : null}
    </section>
  )
}
