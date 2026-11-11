import { useEffect, useState } from 'react'
import { createVoucher, fetchAdminVouchers, setVoucherActive } from '../../api/client'
import { formatCurrency } from '../../utils/format'
import { formatDateTime } from '../../utils/orderLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const LABEL = 'text-xs font-semibold text-slate-300'

const STATES = {
  active: { label: 'Đang áp dụng', className: 'bg-emerald-500/15 text-emerald-200' },
  scheduled: { label: 'Sắp áp dụng', className: 'bg-sky-500/15 text-sky-200' },
  used_up: { label: 'Hết lượt', className: 'bg-amber-500/15 text-amber-200' },
  expired: { label: 'Hết hạn', className: 'bg-white/10 text-slate-300' },
  disabled: { label: 'Đã tắt', className: 'bg-red-500/15 text-red-200' },
}

const EMPTY = { code: '', discountType: 'amount', discountValue: '', maxDiscount: '', minOrderAmount: '', usageLimit: '', startDate: '', endDate: '' }

function describe(voucher) {
  const value = voucher.discountType === 'percent'
    ? `Giảm ${voucher.discountValue}%${voucher.maxDiscount ? `, tối đa ${formatCurrency(voucher.maxDiscount)}` : ''}`
    : `Giảm ${formatCurrency(voucher.discountValue)}`
  return `${value}${voucher.minOrderAmount ? ` · đơn từ ${formatCurrency(voucher.minOrderAmount)}` : ''}`
}

function CreateVoucherForm({ token, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [state, setState] = useState({ busy: false, error: '' })
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  const percent = form.discountType === 'percent'

  async function submit(event) {
    event.preventDefault()
    setState({ busy: true, error: '' })
    try {
      // Ô datetime-local là giờ trên máy admin; gửi kèm múi giờ để server lưu đúng thời điểm.
      const created = await createVoucher({
        ...form,
        maxDiscount: percent ? form.maxDiscount : '',
        startDate: form.startDate ? new Date(form.startDate).toISOString() : '',
        endDate: form.endDate ? new Date(form.endDate).toISOString() : '',
      }, token)
      setForm(EMPTY)
      setState({ busy: false, error: '' })
      onCreated(created)
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không tạo được mã' })
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-3xl bg-slate-900/60 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className={LABEL}>
        Mã
        <input value={form.code} onChange={set('code')} required maxLength={30} placeholder="VD: SINHVIEN11" className={`${FIELD} mt-1 uppercase`} />
      </label>
      <label className={LABEL}>
        Kiểu giảm
        <select value={form.discountType} onChange={set('discountType')} className={`${FIELD} mt-1`}>
          <option value="amount">Số tiền</option>
          <option value="percent">Phần trăm</option>
        </select>
      </label>
      <label className={LABEL}>
        {percent ? 'Phần trăm giảm (1–90)' : 'Số tiền giảm (đ)'}
        <input type="number" min={percent ? 1 : 1000} max={percent ? 90 : undefined} step={percent ? 1 : 'any'} value={form.discountValue} onChange={set('discountValue')} required className={`${FIELD} mt-1`} />
      </label>
      {percent ? (
        <label className={LABEL}>
          Giảm tối đa (đ, để trống = không giới hạn)
          <input type="number" min="1" step="any" value={form.maxDiscount} onChange={set('maxDiscount')} className={`${FIELD} mt-1`} />
        </label>
      ) : <div className="hidden xl:block" />}
      <label className={LABEL}>
        Đơn tối thiểu (đ)
        <input type="number" min="0" step="any" value={form.minOrderAmount} onChange={set('minOrderAmount')} className={`${FIELD} mt-1`} />
      </label>
      <label className={LABEL}>
        Số lượt dùng (để trống = không giới hạn)
        <input type="number" min="1" step="1" value={form.usageLimit} onChange={set('usageLimit')} className={`${FIELD} mt-1`} />
      </label>
      <label className={LABEL}>
        Bắt đầu
        <input type="datetime-local" value={form.startDate} onChange={set('startDate')} className={`${FIELD} mt-1`} />
      </label>
      <label className={LABEL}>
        Kết thúc
        <input type="datetime-local" value={form.endDate} onChange={set('endDate')} className={`${FIELD} mt-1`} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-4">
        <button type="submit" disabled={state.busy} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-50">
          Tạo mã
        </button>
        <span className="text-xs text-slate-400">Giảm giá tính ở server lúc đặt hàng; khách chỉ thấy mã khi bạn gửi cho họ.</span>
        {state.error ? <p className="w-full text-sm font-semibold text-red-300" role="alert">{state.error}</p> : null}
      </div>
    </form>
  )
}

/* Mã giảm giá: tạo, xem trạng thái và số lần dùng, tắt/bật. */
export default function VouchersPanel({ token }) {
  const [filter, setFilter] = useState('')
  const [version, setVersion] = useState(0)
  const [list, setList] = useState({ key: '', items: [], error: '' })
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const key = `${filter}|${version}`

  useEffect(() => {
    let cancelled = false
    fetchAdminVouchers({ state: filter }, token)
      .then((items) => !cancelled && setList({ key, items: Array.isArray(items) ? items : [], error: '' }))
      .catch((err) => !cancelled && setList({ key, items: [], error: err.message || 'Không tải được mã giảm giá' }))
    return () => {
      cancelled = true
    }
  }, [filter, key, token])

  async function toggle(voucher) {
    setBusyId(voucher.id)
    try {
      await setVoucherActive(voucher.id, !voucher.isActive, token)
      setVersion((value) => value + 1)
    } catch (err) {
      setList((current) => ({ ...current, error: err.message || 'Không cập nhật được' }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className={PANEL} aria-labelledby="vouchers-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="vouchers-title" className="text-2xl font-black">Mã giảm giá</h3>
          <p className="text-sm text-slate-400">Số đơn và doanh thu tính trên đơn chưa huỷ có dùng mã</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Lọc mã giảm giá" className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Tất cả</option>
            {Object.entries(STATES).map(([value, state]) => <option key={value} value={value}>{state.label}</option>)}
          </select>
          <button type="button" onClick={() => setShowForm((value) => !value)} aria-expanded={showForm} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-200">
            {showForm ? 'Đóng' : 'Tạo mã mới'}
          </button>
        </div>
      </div>

      {showForm ? <CreateVoucherForm token={token} onCreated={() => { setShowForm(false); setFilter(''); setVersion((value) => value + 1) }} /> : null}

      {list.key !== key ? <p className="mt-4 text-sm text-slate-400">Đang tải...</p> : null}
      {list.error ? <p className="mt-4 text-sm font-semibold text-red-300" role="alert">{list.error}</p> : null}
      {list.key === key && !list.error && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-400">Chưa có mã nào.</p> : null}
      {list.items.length ? (
        <ul className="mt-3 divide-y divide-white/10">
          {list.items.map((voucher) => {
            const state = STATES[voucher.state] || STATES.expired
            return (
              <li key={voucher.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-white">{voucher.code}</p>
                  <p className="text-slate-300">{describe(voucher)}</p>
                  <p className="text-xs text-slate-400">
                    Đã dùng {voucher.usedCount}{voucher.usageLimit ? `/${voucher.usageLimit}` : ''} lượt · {voucher.orders} đơn · {formatCurrency(voucher.revenue)}
                    {voucher.startsAt || voucher.endsAt ? ` · ${voucher.startsAt ? formatDateTime(voucher.startsAt) : '…'} → ${voucher.endsAt ? formatDateTime(voucher.endsAt) : 'không hạn'}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${state.className}`}>{state.label}</span>
                  <button type="button" disabled={busyId === voucher.id} onClick={() => toggle(voucher)} aria-label={`${voucher.isActive ? 'Tắt' : 'Bật'} mã ${voucher.code}`} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
                    {voucher.isActive ? 'Tắt' : 'Bật lại'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
