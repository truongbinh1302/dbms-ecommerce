import { useEffect, useState } from 'react'
import { fetchAdminOrders, fetchAdminQuestions, fetchAdminReturns, fetchAdminReviews, fetchAdminServiceRequests, fetchLowStock } from '../../api/client'

const OPEN_ORDER_STATUSES = 'pending,pending_payment,confirmed,processing'

const valueOf = (result, read) => (result.status === 'fulfilled' ? read(result.value) : null)

/*
  Việc cần làm: đếm những thứ đang chờ cửa hàng xử lý, mỗi ô dẫn tới đúng mục.
  Lấy từ các API sẵn có (chỉ đọc), ô nào lỗi thì hiện "—" thay vì số sai.
*/
export default function TodoPanel({ token, version = 0, onOpenOrders }) {
  const [counts, setCounts] = useState({ version: -1, data: null })

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      fetchAdminOrders({ status: OPEN_ORDER_STATUSES, limit: 1 }, token),
      fetchAdminReturns({ status: 'pending,approved,received', limit: 1 }, token),
      fetchAdminQuestions({ status: 'pending', limit: 1 }, token),
      fetchAdminServiceRequests({ status: 'open', limit: 200 }, token),
      fetchLowStock({ threshold: 5, limit: 100 }, token),
      fetchAdminReviews({ filter: 'needs_reply', limit: 1 }, token),
    ]).then(([orders, returns, questions, services, lowStock, reviews]) => {
      if (cancelled) return
      setCounts({
        version,
        data: {
          orders: valueOf(orders, (value) => Number(value.pagination?.totalItems || 0)),
          refunds: valueOf(orders, (value) => Number(value.refundRequired || 0)),
          returns: valueOf(returns, (value) => Number(value.pagination?.totalItems || 0)),
          questions: valueOf(questions, (value) => Number(value.pendingCount || 0)),
          reviews: valueOf(reviews, (value) => Number(value.needsReply || 0)),
          services: valueOf(services, (value) => (Array.isArray(value) ? value.length : 0)),
          // Sắp hết (≤ 5) mà có bán trong 30 ngày hoặc có khách đang chờ hàng: cần nhập thêm.
          lowStock: valueOf(lowStock, (value) => (value.items || []).filter((item) => item.sold30 > 0 || item.waiting > 0).length),
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [token, version])

  const data = counts.data
  const tiles = [
    { key: 'orders', label: 'Đơn cần xử lý', hint: 'chờ xác nhận, chờ thanh toán, đang chuẩn bị', href: '#admin-orders', onClick: () => onOpenOrders?.({ status: OPEN_ORDER_STATUSES, payment: '' }) },
    { key: 'refunds', label: 'Đơn chờ hoàn tiền', hint: 'khách đã trả, đơn đã huỷ', href: '#admin-orders', onClick: () => onOpenOrders?.({ status: '', payment: 'refund_required' }), urgent: true },
    { key: 'returns', label: 'Yêu cầu đổi trả', hint: 'chờ duyệt, chờ nhận hàng, chờ hoàn tất', href: '#admin-returns' },
    { key: 'questions', label: 'Câu hỏi chờ trả lời', hint: 'ở trang sản phẩm', href: '#admin-questions' },
    { key: 'reviews', label: 'Đánh giá thấp chưa phản hồi', hint: '1-2 sao, đang hiện', href: '#admin-reviews' },
    { key: 'services', label: 'Yêu cầu dịch vụ đang mở', hint: 'kỹ thuật tại nhà, thu cũ, bảo hành', href: '#admin-services' },
    { key: 'lowStock', label: 'Hàng cần nhập thêm', hint: 'còn ≤ 5, có bán trong 30 ngày hoặc có khách chờ', href: '#admin-stock' },
  ]

  return (
    <section aria-labelledby="todo-title">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">Hôm nay</p>
      <h2 id="todo-title" className="mt-2 text-3xl font-black">Việc cần làm</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const value = data ? data[tile.key] : undefined
          const active = typeof value === 'number' && value > 0
          return (
            <li key={tile.key}>
              <a
                href={tile.href}
                onClick={tile.onClick}
                className={`block h-full rounded-3xl border p-4 transition hover:bg-white/10 ${active && tile.urgent ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}
              >
                <span className="block text-3xl font-black tabular-nums">{value === undefined ? '…' : value === null ? '—' : value >= 100 ? '100+' : value}</span>
                <span className="mt-1 block text-sm font-bold">{tile.label}</span>
                <span className="block text-xs text-slate-300">{tile.hint}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
