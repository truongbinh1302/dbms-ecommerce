import { useState } from 'react'
import { cancelReturnRequest, createReturnRequest } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import {
  RETURN_KIND_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  formatDateTime,
  labelOf,
  returnTone,
} from '../utils/orderLabels'

const FIELD = 'w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500'

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

function ReturnForm({ order, onDone, onCancel, showToast }) {
  const remaining = new Map((order.returnWindow?.items || []).map((item) => [item.productId, item.remaining]))
  const lines = (order.items || []).filter((item) => (remaining.get(item.ProductID) || 0) > 0)
  const [picked, setPicked] = useState(() => (lines.length === 1 ? { [lines[0].ProductID]: 1 } : {}))
  const [form, setForm] = useState({ kind: 'exchange', reason: 'defective', description: '' })
  const [state, setState] = useState({ busy: false, error: '' })

  const items = Object.entries(picked).map(([productId, quantity]) => ({ productId: Number(productId), quantity }))
  const descriptionOk = form.description.trim().length >= 10

  async function submit(event) {
    event.preventDefault()
    if (items.length === 0) {
      setState({ busy: false, error: 'Hãy chọn sản phẩm cần đổi trả' })
      return
    }
    setState({ busy: true, error: '' })
    try {
      const created = await createReturnRequest(order.id, { ...form, items })
      showToast?.(`Đã gửi yêu cầu ${created.code}. Cửa hàng sẽ phản hồi sớm.`)
      onDone()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không gửi được yêu cầu' })
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border border-slate-200 p-4 text-sm">
      <fieldset className="min-w-0">
        <legend className="font-bold text-slate-900">Sản phẩm cần đổi trả</legend>
        <ul className="mt-2 space-y-2">
          {lines.map((item) => {
            const max = remaining.get(item.ProductID)
            const checked = picked[item.ProductID] !== undefined
            return (
              <li key={item.ProductID} className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setPicked((current) => {
                      const next = { ...current }
                      if (event.target.checked) next[item.ProductID] = 1
                      else delete next[item.ProductID]
                      return next
                    })}
                  />
                  <span className="min-w-0">{item.productName}</span>
                </label>
                {max > 1 ? (
                  <select
                    value={picked[item.ProductID] || 1}
                    disabled={!checked}
                    onChange={(event) => setPicked((current) => ({ ...current, [item.ProductID]: Number(event.target.value) }))}
                    aria-label={`Số lượng ${item.productName}`}
                    className="rounded-xl border border-slate-300 px-2 py-1 disabled:text-slate-400"
                  >
                    {Array.from({ length: max }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                ) : <span className="text-slate-500">× 1</span>}
              </li>
            )
          })}
        </ul>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="font-bold text-slate-900">Bạn muốn</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {Object.entries(RETURN_KIND_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="return-kind" value={value} checked={form.kind === value} onChange={() => setForm((current) => ({ ...current, kind: value }))} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="font-bold text-slate-900">Lý do</span>
        <select value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={`mt-1 ${FIELD}`}>
          {Object.entries(RETURN_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="font-bold text-slate-900">Mô tả tình trạng</span>
        <textarea
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          rows={3}
          maxLength={1000}
          required
          placeholder="Ví dụ: card không lên hình sau 2 ngày, đã thử khe PCIe khác"
          className={`mt-1 ${FIELD}`}
        />
        {!descriptionOk && form.description ? <span className="text-xs text-slate-500">Ít nhất 10 ký tự</span> : null}
      </label>

      <p className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-600">
        Giữ đủ hộp, phụ kiện và tem serial. Cửa hàng chịu phí vận chuyển với các lý do trên và sẽ liên hệ lấy hàng sau khi duyệt.
      </p>

      {state.error ? <p className="font-semibold text-red-700" role="alert">{state.error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={state.busy || !descriptionOk || items.length === 0} className="rounded-2xl bg-red-600 px-5 py-2.5 font-bold text-white disabled:bg-slate-300">
          Gửi yêu cầu
        </button>
        <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-300 px-5 py-2.5 font-bold text-slate-700">Để sau</button>
      </div>
    </form>
  )
}

/* Đổi trả ở trang chi tiết đơn: các yêu cầu đã gửi và form gửi yêu cầu mới khi còn hạn. */
export default function OrderReturns({ order, onChanged, showToast }) {
  const [formOpen, setFormOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const returns = order.returns || []
  const returnWindow = order.returnWindow
  if (order.Status !== 'delivered' && returns.length === 0) return null

  async function cancel(request) {
    if (!window.confirm(`Huỷ yêu cầu ${request.code}?`)) return
    setBusyId(request.id)
    try {
      await cancelReturnRequest(request.id)
      showToast?.('Đã huỷ yêu cầu đổi trả')
      onChanged()
    } catch (err) {
      showToast?.(err.message || 'Không huỷ được yêu cầu')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm" aria-labelledby="returns-title">
      <h2 id="returns-title" className="font-bold text-slate-900">Đổi trả</h2>

      {returns.length ? (
        <ul className="mt-3 space-y-3">
          {returns.map((request) => (
            <li key={request.id} className="rounded-2xl bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900">{request.code} · {labelOf(RETURN_KIND_LABELS, request.kind)}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${returnTone(request.status)}`}>{labelOf(RETURN_STATUS_LABELS, request.status)}</span>
              </div>
              <p className="mt-1 text-slate-600">
                {request.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')} · {labelOf(RETURN_REASON_LABELS, request.reason)}
              </p>
              <p className="mt-1 text-slate-500">Gửi lúc {formatDateTime(request.createdAt)}: {request.description}</p>
              {request.adminNote ? <p className="mt-1 text-slate-700">Cửa hàng: {request.adminNote}</p> : null}
              {request.status === 'completed' && request.refundAmount !== null ? (
                <p className="mt-1 font-semibold text-emerald-700">Đã hoàn {formatCurrency(request.refundAmount)}</p>
              ) : null}
              {request.status === 'pending' ? (
                <button type="button" disabled={busyId === request.id} onClick={() => cancel(request)} className="mt-2 text-xs font-bold text-slate-600 underline disabled:text-slate-300">
                  Huỷ yêu cầu
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {returnWindow?.open ? (
        formOpen ? (
          <ReturnForm order={order} showToast={showToast} onCancel={() => setFormOpen(false)} onDone={() => { setFormOpen(false); onChanged() }} />
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-slate-600">
              Đổi hoặc trả được đến hết ngày {formatDate(returnWindow.deadline)} theo{' '}
              <a href={hrefFor('/chinh-sach/doi-tra')} className="font-semibold text-red-600 underline">chính sách đổi trả</a>.
            </p>
            <button type="button" onClick={() => setFormOpen(true)} className="rounded-2xl border border-red-600 px-4 py-2 font-bold text-red-600 hover:bg-red-50">
              Yêu cầu đổi trả
            </button>
          </div>
        )
      ) : order.Status === 'delivered' ? (
        <p className="mt-2 text-slate-600">
          {returnWindow?.deadline && new Date(returnWindow.deadline) < new Date()
            ? `Đã hết hạn đổi trả ${returnWindow.days} ngày. `
            : ''}
          Sản phẩm lỗi trong thời hạn bảo hành vẫn được hỗ trợ:{' '}
          <a href={hrefFor('/bao-hanh')} className="font-semibold text-red-600 underline">gửi yêu cầu bảo hành theo serial</a>.
        </p>
      ) : null}
    </section>
  )
}
