import { useEffect, useState } from 'react'
import { fetchAdminReturns, updateAdminReturn } from '../../api/client'
import { formatCurrency } from '../../utils/format'
import { RETURN_KIND_LABELS, RETURN_REASON_LABELS, RETURN_STATUS_LABELS, formatDateTime } from '../../utils/orderLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const SELECT = 'rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white'

const TONES = {
  pending: 'bg-amber-500/15 text-amber-200',
  approved: 'bg-sky-500/15 text-sky-200',
  received: 'bg-violet-500/15 text-violet-200',
  completed: 'bg-emerald-500/15 text-emerald-200',
  rejected: 'bg-red-500/15 text-red-200',
  cancelled: 'bg-white/10 text-slate-300',
}
const FILTERS = [
  ['pending,approved,received', 'Đang xử lý'],
  ['pending', 'Chờ duyệt'],
  ['completed', 'Hoàn tất'],
  ['rejected,cancelled', 'Từ chối / khách huỷ'],
  ['', 'Tất cả'],
]

function ReturnRow({ request, token, onChanged }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ note: '', refund: '', restock: false })
  const [state, setState] = useState({ busy: false, error: '' })
  const itemsValue = request.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  async function apply(status) {
    setState({ busy: true, error: '' })
    try {
      await updateAdminReturn(request.id, {
        status,
        adminNote: form.note || undefined,
        restock: status === 'received' ? form.restock : undefined,
        refundAmount: status === 'completed' && request.kind === 'refund' && form.refund !== '' ? Number(form.refund) : undefined,
      }, token)
      setForm({ note: '', refund: '', restock: false })
      setState({ busy: false, error: '' })
      onChanged()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không cập nhật được' })
    }
  }

  const actions = {
    pending: [['approved', 'Duyệt yêu cầu'], ['rejected', 'Từ chối']],
    approved: [['received', 'Đã nhận hàng'], ['rejected', 'Từ chối']],
    received: [['completed', request.kind === 'refund' ? 'Đã hoàn tiền, hoàn tất' : 'Đã gửi hàng đổi, hoàn tất']],
  }[request.status] || []

  return (
    <li className="py-3">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full flex-wrap items-start justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-white">{request.code} · {RETURN_KIND_LABELS[request.kind]} · đơn {request.orderCode || `#${request.orderId}`}</span>
          <span className="block text-xs text-slate-400">
            {request.customerName} · {request.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')} · {formatDateTime(request.createdAt)}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${TONES[request.status] || TONES.cancelled}`}>{RETURN_STATUS_LABELS[request.status]}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
          <p>Lý do: {RETURN_REASON_LABELS[request.reason]}</p>
          <p>Mô tả của khách: {request.description}</p>
          <p>Giá trị hàng: {formatCurrency(itemsValue)}{request.restocked ? ' · đã nhập lại kho' : ''}</p>
          {request.adminNote ? <p>Ghi chú gửi khách: {request.adminNote}</p> : null}
          {request.refundAmount !== null ? <p className="font-semibold text-white">Đã hoàn: {formatCurrency(request.refundAmount)}</p> : null}

          {actions.length ? (
            <div className="space-y-2">
              <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} maxLength={500} placeholder="Ghi chú gửi khách (bắt buộc khi từ chối)" aria-label={`Ghi chú ${request.code}`} className={FIELD} />
              {request.status === 'approved' ? (
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={form.restock} onChange={(event) => setForm((current) => ({ ...current, restock: event.target.checked }))} />
                  Hàng còn bán được: nhập lại kho khi nhận
                </label>
              ) : null}
              {request.status === 'received' && request.kind === 'refund' ? (
                <input type="number" min="0" step="any" value={form.refund} onChange={(event) => setForm((current) => ({ ...current, refund: event.target.value }))} placeholder={`Số tiền hoàn (mặc định ${formatCurrency(itemsValue)})`} aria-label={`Số tiền hoàn ${request.code}`} className={FIELD} />
              ) : null}
              {request.status === 'received' && request.kind === 'exchange' ? (
                <p className="text-xs text-slate-400">Hoàn tất sẽ trừ kho sản phẩm mới gửi cho khách.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {actions.map(([status, label]) => (
                  <button
                    key={status}
                    type="button"
                    disabled={state.busy || (status === 'rejected' && !form.note.trim())}
                    onClick={() => apply(status)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${status === 'rejected' ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-slate-950 hover:bg-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {state.error ? <p className="text-xs font-semibold text-red-300" role="alert">{state.error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/* Yêu cầu đổi trả của khách. Mặc định hiện các yêu cầu đang xử lý. */
export default function ReturnsPanel({ token }) {
  const [status, setStatus] = useState(FILTERS[0][0])
  const [version, setVersion] = useState(0)
  const [list, setList] = useState({ key: '', items: [], total: 0, error: '' })
  const key = `${status}|${version}`

  useEffect(() => {
    let cancelled = false
    fetchAdminReturns({ status, limit: 50 }, token)
      .then((data) => !cancelled && setList({ key, items: data.items || [], total: data.pagination?.totalItems || 0, error: '' }))
      .catch((err) => !cancelled && setList({ key, items: [], total: 0, error: err.message || 'Không tải được yêu cầu đổi trả' }))
    return () => {
      cancelled = true
    }
  }, [status, key, token])

  return (
    <section className={PANEL} aria-labelledby="returns-panel-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="returns-panel-title" className="text-2xl font-black">Đổi trả</h3>
          <p className="text-sm text-slate-400">Khách gửi từ trang đơn hàng trong hạn đổi trả</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc yêu cầu đổi trả" className={SELECT}>
          {FILTERS.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
        </select>
      </div>

      {list.key !== key ? <p className="mt-4 text-sm text-slate-400">Đang tải...</p> : null}
      {list.error ? <p className="mt-4 text-sm font-semibold text-red-300" role="alert">{list.error}</p> : null}
      {list.key === key && !list.error && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-400">Không có yêu cầu nào.</p> : null}
      {list.items.length ? (
        <ul className="mt-3 divide-y divide-white/10">
          {list.items.map((request) => (
            <ReturnRow key={request.id} request={request} token={token} onChanged={() => setVersion((value) => value + 1)} />
          ))}
        </ul>
      ) : null}
      {list.total > list.items.length ? <p className="mt-3 text-xs text-slate-400">Đang hiện {list.items.length}/{list.total} yêu cầu mới nhất.</p> : null}
    </section>
  )
}
