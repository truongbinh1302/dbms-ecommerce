import { useEffect, useState } from 'react'
import { fetchAdminServiceRequests, updateAdminServiceRequest } from '../../api/client'
import { formatCurrency } from '../../utils/format'
import { SERVICE_TYPE_LABELS } from '../../utils/serviceLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const SELECT = 'rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white'

const STATUS = {
  new: { label: 'Mới', className: 'bg-amber-500/15 text-amber-200' },
  confirmed: { label: 'Đã xác nhận', className: 'bg-sky-500/15 text-sky-200' },
  in_progress: { label: 'Đang xử lý', className: 'bg-violet-500/15 text-violet-200' },
  completed: { label: 'Hoàn tất', className: 'bg-emerald-500/15 text-emerald-200' },
  cancelled: { label: 'Đã huỷ', className: 'bg-white/10 text-slate-300' },
}
const NEXT = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

function formatTime(value) {
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

function RequestRow({ request, token, onChanged }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ note: '', finalPrice: '', internal: false })
  const [state, setState] = useState({ busy: false, error: '' })
  const status = STATUS[request.status] || STATUS.new

  async function apply(nextStatus) {
    setState({ busy: true, error: '' })
    try {
      await updateAdminServiceRequest(request.id, {
        status: nextStatus || undefined,
        note: form.note,
        finalPrice: form.finalPrice === '' ? undefined : Number(form.finalPrice),
        internal: form.internal,
      }, token)
      setForm({ note: '', finalPrice: '', internal: false })
      setState({ busy: false, error: '' })
      onChanged()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không cập nhật được' })
    }
  }

  const address = request.address
  return (
    <li className="py-3">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full flex-wrap items-start justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block font-bold text-white">{request.code} · {SERVICE_TYPE_LABELS[request.type]} · {request.serviceLabel}</span>
          <span className="block text-xs text-slate-400">
            {request.customerName} · {request.contactPhone || 'không có SĐT'}
            {request.scheduledDate ? ` · hẹn ${request.scheduledDate.split('-').reverse().join('/')} ${request.timeSlot}` : ''}
            {request.serialNumber ? ` · serial ${request.serialNumber}` : ''}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
          {address ? <p>Địa chỉ: {address.street}, {address.ward}, {address.province} ({address.recipientName})</p> : null}
          {request.device ? (
            <p>
              Máy: {request.device.brandModel} · mua {formatCurrency(request.device.purchasePrice)} · dùng {request.device.ageMonths} tháng · {request.device.condition}
              {request.estimateLow !== null ? ` · ước tính ${formatCurrency(request.estimateLow)}–${formatCurrency(request.estimateHigh)}` : ''}
            </p>
          ) : null}
          {request.productName ? <p>Sản phẩm: {request.productName}{request.orderId ? ` (đơn #${request.orderId})` : ''}</p> : null}
          {request.description ? <p>Mô tả: {request.description}</p> : null}
          {request.finalPrice !== null ? <p className="font-semibold text-white">{request.type === 'trade_in' ? 'Giá chốt' : 'Chi phí'}: {formatCurrency(request.finalPrice)}</p> : null}
          <ol className="space-y-1 border-l border-white/10 pl-3 text-xs text-slate-400">
            {request.events.map((event, index) => (
              <li key={`${event.createdAt}-${index}`}>
                {STATUS[event.status]?.label || event.status} · {formatTime(event.createdAt)}{event.note ? ` · ${event.note}` : ''}{event.internal ? ' (nội bộ)' : ''}
              </li>
            ))}
          </ol>

          {NEXT[request.status].length || request.status === 'completed' ? (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                <input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} maxLength={500} placeholder="Ghi chú (khách xem được)" aria-label={`Ghi chú ${request.code}`} className={FIELD} />
                <input type="number" min="0" step="any" value={form.finalPrice} onChange={(event) => setForm((current) => ({ ...current, finalPrice: event.target.value }))} placeholder={request.type === 'trade_in' ? 'Giá chốt' : 'Chi phí'} aria-label={`Giá chốt ${request.code}`} className={FIELD} />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={form.internal} onChange={(event) => setForm((current) => ({ ...current, internal: event.target.checked }))} />
                Ghi chú nội bộ (khách không thấy)
              </label>
              <div className="flex flex-wrap gap-2">
                {NEXT[request.status].map((next) => (
                  <button key={next} type="button" disabled={state.busy} onClick={() => apply(next)} className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${next === 'cancelled' ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-slate-950 hover:bg-slate-200'}`}>
                    {next === 'cancelled' ? 'Huỷ yêu cầu' : `Chuyển sang: ${STATUS[next].label}`}
                  </button>
                ))}
                <button type="button" disabled={state.busy || (!form.note.trim() && form.finalPrice === '')} onClick={() => apply(null)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
                  Lưu ghi chú
                </button>
              </div>
              {state.error ? <p className="text-xs font-semibold text-red-300" role="alert">{state.error}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/* Yêu cầu dịch vụ sau bán: lịch tại nhà, thu cũ, bảo hành. Mặc định hiện các yêu cầu đang mở. */
export default function ServiceRequestsPanel({ token }) {
  const [filter, setFilter] = useState({ type: '', status: 'open' })
  const [version, setVersion] = useState(0)
  const [list, setList] = useState({ key: '', items: [], error: '' })
  const key = `${filter.type}|${filter.status}|${version}`

  useEffect(() => {
    let cancelled = false
    fetchAdminServiceRequests({ type: filter.type, status: filter.status, limit: 50 }, token)
      .then((items) => !cancelled && setList({ key, items: Array.isArray(items) ? items : [], error: '' }))
      .catch((err) => !cancelled && setList({ key, items: [], error: err.message || 'Không tải được yêu cầu' }))
    return () => {
      cancelled = true
    }
  }, [filter, key, token])

  return (
    <section className={PANEL} aria-labelledby="service-requests-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="service-requests-title" className="text-2xl font-black">Dịch vụ sau bán</h3>
          <p className="text-sm text-slate-400">Lịch kỹ thuật tại nhà, thu cũ đổi mới, yêu cầu bảo hành</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filter.type} onChange={(event) => setFilter((current) => ({ ...current, type: event.target.value }))} aria-label="Loại yêu cầu" className={SELECT}>
            <option value="">Mọi loại</option>
            {Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filter.status} onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value }))} aria-label="Trạng thái" className={SELECT}>
            <option value="open">Đang mở</option>
            <option value="">Tất cả</option>
            {Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      </div>
      {list.error ? <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{list.error}</p> : null}
      {list.key === key && !list.error && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-400">Không có yêu cầu nào.</p> : null}
      <ul className={`mt-3 divide-y divide-white/10 ${list.key !== key ? 'opacity-60' : ''}`}>
        {list.items.map((request) => (
          <RequestRow key={request.id} request={request} token={token} onChanged={() => setVersion((value) => value + 1)} />
        ))}
      </ul>
    </section>
  )
}
