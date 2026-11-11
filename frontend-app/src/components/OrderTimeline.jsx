import { ORDER_STATUS_LABELS, formatDateTime, labelOf } from '../utils/orderLabels'

// Các bước của một đơn bình thường; đơn VNPay bắt đầu ở "Chờ thanh toán" thay cho "Chờ xác nhận".
const STEPS = [
  { status: 'pending', label: 'Đặt hàng' },
  { status: 'confirmed', label: 'Đã xác nhận' },
  { status: 'processing', label: 'Đang chuẩn bị hàng' },
  { status: 'shipped', label: 'Đang giao' },
  { status: 'delivered', label: 'Đã giao' },
]

const ACTORS = {
  customer: { customer: 'Bạn', admin: 'Khách' },
  admin: { customer: 'Cửa hàng', admin: 'Admin' },
  payment: { customer: 'VNPay', admin: 'VNPay' },
  system: { customer: 'Hệ thống', admin: 'Hệ thống' },
}

const stepIndex = (status) => (status === 'pending_payment' ? 0 : STEPS.findIndex((step) => step.status === status))

/** Lúc đơn tới mỗi bước: lần đầu có trong lịch sử, không có thì lấy mốc lưu trên đơn (đơn cũ). */
function reachedAt(order, history, step) {
  const first = history.find((item) => (step.status === 'pending' ? stepIndex(item.status) === 0 : item.status === step.status))
  if (step.status === 'pending') return order.CreatedAt
  if (first) return first.at
  if (step.status === 'shipped') return order.shippedAt || null
  if (step.status === 'delivered') return order.deliveredAt || null
  return null
}

/*
  Tiến trình và lịch sử trạng thái đơn hàng.
  audience = 'customer' (trang đơn của khách) hoặc 'admin' (khung chi tiết đơn trong trang quản trị).
*/
export default function OrderTimeline({ order, audience = 'customer', dark = false }) {
  const history = Array.isArray(order.history) ? order.history : []
  const cancelled = order.Status === 'cancelled'
  const current = stepIndex(order.Status)
  const muted = dark ? 'text-slate-300' : 'text-slate-600'
  const strong = dark ? 'text-white' : 'text-slate-900'

  return (
    <div className="space-y-4">
      {!cancelled && current >= 0 ? (
        <ol className="grid gap-3 sm:grid-cols-5" aria-label="Tiến trình đơn hàng">
          {STEPS.map((step, index) => {
            const done = index <= current
            const at = done ? reachedAt(order, history, step) : null
            const label = index === 0 && order.Status === 'pending_payment' ? 'Chờ thanh toán' : step.label
            return (
              <li key={step.status} aria-current={index === current ? 'step' : undefined} className="flex items-start gap-3 sm:flex-col sm:gap-2">
                <span className="flex items-center sm:w-full">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? 'bg-red-600 text-white' : dark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-600'}`}
                    aria-hidden="true"
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className={`ml-2 hidden h-0.5 flex-1 rounded-full sm:block ${index < current ? 'bg-red-600' : dark ? 'bg-white/10' : 'bg-slate-200'}`} aria-hidden="true" />
                  ) : null}
                </span>
                <span className="text-sm">
                  <span className={`block font-bold ${done ? strong : muted}`}>
                    {label}
                    <span className="sr-only">{done ? (index === current ? ' (hiện tại)' : ' (đã qua)') : ' (chưa tới)'}</span>
                  </span>
                  {at ? <span className={`block text-xs ${muted}`}>{formatDateTime(at)}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}

      {history.length ? (
        <details className="group" open={audience === 'admin' || cancelled}>
          <summary className={`cursor-pointer text-sm font-bold ${strong}`}>Lịch sử trạng thái ({history.length})</summary>
          <ol className={`mt-2 space-y-2 border-l-2 pl-4 text-sm ${dark ? 'border-white/10' : 'border-slate-200'}`}>
            {history.map((item, index) => (
              <li key={`${item.at}-${index}`}>
                <span className={`font-semibold ${strong}`}>{labelOf(ORDER_STATUS_LABELS, item.status)}</span>
                <span className={muted}> · {formatDateTime(item.at)} · {ACTORS[item.by]?.[audience] || item.by}</span>
                {item.note ? <span className={`block ${muted}`}>{item.note}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}
