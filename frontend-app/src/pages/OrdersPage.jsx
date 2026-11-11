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

// Tab lọc đơn: slug trên URL (#/don-hang?trang-thai=dang-giao) → các trạng thái gửi lên API.
const TABS = [
  { slug: '', label: 'Tất cả', statuses: [] },
  { slug: 'dang-xu-ly', label: 'Đang xử lý', statuses: ['pending', 'pending_payment', 'confirmed', 'processing'] },
  { slug: 'dang-giao', label: 'Đang giao', statuses: ['shipped'] },
  { slug: 'da-giao', label: 'Đã giao', statuses: ['delivered'] },
  { slug: 'da-huy', label: 'Đã huỷ', statuses: ['cancelled'] },
]

const ordersHref = (tab, page = 1) => {
  const params = new URLSearchParams()
  if (tab) params.set('trang-thai', tab)
  if (page > 1) params.set('trang', String(page))
  const query = params.toString()
  return hrefFor(`/don-hang${query ? `?${query}` : ''}`)
}

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

export default function OrdersPage({ currentUser, onRequireLogin, page = 1, paymentResult = '', tab = '' }) {
  const userId = currentUser?.id
  const activeTab = TABS.find((item) => item.slug === tab) || TABS[0]
  const requestKey = `${userId}:${page}:${activeTab.slug}`
  const [state, setState] = useState({ key: null, items: [], totalPages: 0, counts: null, error: '' })

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    const params = { page: String(page), limit: String(PAGE_SIZE) }
    if (activeTab.statuses.length) params.status = activeTab.statuses.join(',')
    fetchMyOrders(params)
      .then((result) => {
        if (!cancelled) {
          setState({ key: requestKey, items: result.items || [], totalPages: result.pagination?.totalPages || 0, counts: result.counts || null, error: '' })
        }
      })
      .catch((err) => {
        if (!cancelled) setState((current) => ({ ...current, key: requestKey, items: [], totalPages: 0, error: err.message }))
      })
    return () => {
      cancelled = true
    }
  }, [userId, page, requestKey, activeTab])

  if (!userId) {
    return <LoginRequired onRequireLogin={onRequireLogin} />
  }

  const loading = state.key !== requestKey

  return (
    <section className="space-y-4 rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <h1 className="text-2xl font-black text-slate-900">Đơn hàng của tôi</h1>
      <PaymentResultBanner code={paymentResult} />

      <nav aria-label="Lọc đơn theo trạng thái" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((item) => {
          const count = state.counts
            ? (item.statuses.length
              ? item.statuses.reduce((sum, key) => sum + (state.counts[key] || 0), 0)
              : Object.values(state.counts).reduce((sum, value) => sum + value, 0))
            : null
          const active = item.slug === activeTab.slug
          return (
            <a
              key={item.slug || 'all'}
              href={ordersHref(item.slug)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {item.label}{count !== null ? ` (${count})` : ''}
            </a>
          )
        })}
      </nav>

      {state.error ? <p className="text-red-600">{state.error}</p> : null}
      {loading ? <p className="text-slate-500">Đang tải đơn hàng...</p> : null}

      {!loading && !state.error && state.items.length === 0 ? (
        activeTab.slug ? (
          <p className="text-slate-600">Không có đơn nào ở mục “{activeTab.label}”.</p>
        ) : (
          <p className="text-slate-500">
            Bạn chưa có đơn hàng nào. <a href={hrefFor('/')} className="font-bold text-red-600">Bắt đầu mua sắm</a>
          </p>
        )
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
          {page > 1 ? <a href={ordersHref(activeTab.slug, page - 1)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">Trang trước</a> : null}
          <span className="text-slate-600">Trang {page}/{state.totalPages}</span>
          {page < state.totalPages ? <a href={ordersHref(activeTab.slug, page + 1)} className="rounded-xl border border-slate-200 px-4 py-2 font-semibold">Trang sau</a> : null}
        </nav>
      ) : null}
    </section>
  )
}
