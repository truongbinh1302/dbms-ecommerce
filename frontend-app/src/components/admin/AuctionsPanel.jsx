import { useEffect, useState } from 'react'
import { cancelAuction, createAuction, fetchAdminAuctions } from '../../api/client'
import { formatCurrency } from '../../utils/format'
import { formatClockTime } from '../../hooks/useCountdown'
import { hrefFor } from '../../hooks/useHashRoute'
import ProductPicker from './ProductPicker'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const ERROR_BOX = 'rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200'

const STATUS = {
  active: { label: 'Đang mở', className: 'bg-emerald-500/15 text-emerald-200' },
  won: { label: 'Chờ đặt hàng', className: 'bg-amber-500/15 text-amber-200' },
  ordered: { label: 'Đã đặt hàng', className: 'bg-sky-500/15 text-sky-200' },
  unsold: { label: 'Không ai trả giá', className: 'bg-white/10 text-slate-300' },
  expired: { label: 'Quá hạn đặt hàng', className: 'bg-white/10 text-slate-300' },
  cancelled: { label: 'Đã huỷ', className: 'bg-white/10 text-slate-300' },
}

function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const emptyForm = () => {
  const start = new Date()
  start.setSeconds(0, 0)
  return {
    product: null,
    title: '',
    description: '',
    startingPrice: '',
    bidIncrement: '50000',
    buyNowPrice: '',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(new Date(start.getTime() + 24 * 3600000)),
    extendSeconds: '120',
  }
}

/* Quản lý đấu giá: mở phiên cho một sản phẩm trong kho (giữ 1 cái), xem kết quả, huỷ phiên đang mở. */
export default function AuctionsPanel({ token }) {
  const [form, setForm] = useState(emptyForm)
  const [submit, setSubmit] = useState({ busy: false, error: '', done: '' })
  const [filter, setFilter] = useState('')
  const [list, setList] = useState({ items: [], error: '', loaded: false })
  const [version, setVersion] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchAdminAuctions({ status: filter, limit: 50 }, token)
      .then((data) => !cancelled && setList({ items: data.items, error: '', loaded: true }))
      .catch((err) => !cancelled && setList({ items: [], error: err.message || 'Không tải được phiên đấu giá', loaded: true }))
    return () => {
      cancelled = true
    }
  }, [token, filter, version])

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function handleCreate(event) {
    event.preventDefault()
    if (!form.product) {
      setSubmit({ busy: false, error: 'Chọn sản phẩm cho phiên', done: '' })
      return
    }
    setSubmit({ busy: true, error: '', done: '' })
    try {
      const created = await createAuction({
        productId: form.product.id,
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        startingPrice: Number(form.startingPrice),
        bidIncrement: Number(form.bidIncrement),
        buyNowPrice: form.buyNowPrice ? Number(form.buyNowPrice) : null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        extendSeconds: Number(form.extendSeconds),
      }, token)
      setSubmit({ busy: false, error: '', done: `Đã mở phiên #${created.id}: ${created.title}` })
      setForm(emptyForm())
      setVersion((value) => value + 1)
    } catch (err) {
      setSubmit({ busy: false, error: err.message || 'Không mở được phiên', done: '' })
    }
  }

  async function handleCancel(id) {
    try {
      await cancelAuction(id, token)
      setConfirmCancel(null)
      setVersion((value) => value + 1)
    } catch (err) {
      setConfirmCancel(null)
      setList((current) => ({ ...current, error: err.message || 'Không huỷ được phiên' }))
    }
  }

  return (
    <section className={PANEL} aria-labelledby="admin-auctions-title">
      <h3 id="admin-auctions-title" className="text-xl font-black text-white">Đấu giá</h3>
      <p className="mt-1 text-sm text-slate-400">
        Mở phiên giữ 1 sản phẩm khỏi kho. Phiên không ai trả giá, bị huỷ hoặc người thắng không đặt hàng trong 24 giờ thì sản phẩm về kho.
      </p>

      <form onSubmit={handleCreate} className="mt-5 grid gap-3 rounded-[28px] bg-slate-900/60 p-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <span className="text-xs font-semibold text-slate-300">Sản phẩm</span>
          <ProductPicker value={form.product} label="Sản phẩm đấu giá" onSelect={(product) => setForm((current) => ({ ...current, product, title: current.title || (product ? product.name : '') }))} />
          {form.product ? <span className="mt-1 block text-xs text-slate-400">Giá niêm yết {formatCurrency(form.product.price)}</span> : null}
        </div>
        <label className="text-xs font-semibold text-slate-300 md:col-span-2">Tên phiên
          <input value={form.title} maxLength={150} onChange={(event) => update('title', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-300 md:col-span-2">Mô tả (không bắt buộc)
          <textarea value={form.description} maxLength={1000} rows={2} onChange={(event) => update('description', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-300">Giá khởi điểm (đ)
          <input type="number" min="10000" step="1000" value={form.startingPrice} onChange={(event) => update('startingPrice', event.target.value)} className={`${FIELD} mt-1`} required />
        </label>
        <label className="text-xs font-semibold text-slate-300">Bước giá (đ)
          <input type="number" min="1000" step="1000" value={form.bidIncrement} onChange={(event) => update('bidIncrement', event.target.value)} className={`${FIELD} mt-1`} required />
        </label>
        <label className="text-xs font-semibold text-slate-300">Giá mua ngay (đ, không bắt buộc)
          <input type="number" min="0" step="1000" value={form.buyNowPrice} onChange={(event) => update('buyNowPrice', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-300">Gia hạn khi trả giá phút chót (giây)
          <input type="number" min="0" max="600" step="30" value={form.extendSeconds} onChange={(event) => update('extendSeconds', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-300">Bắt đầu
          <input type="datetime-local" value={form.startsAt} onChange={(event) => update('startsAt', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-300">Kết thúc
          <input type="datetime-local" value={form.endsAt} onChange={(event) => update('endsAt', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" disabled={submit.busy} className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:bg-slate-600">
            {submit.busy ? 'Đang mở...' : 'Mở phiên'}
          </button>
          {submit.done ? <span className="text-sm font-semibold text-emerald-300" role="status">{submit.done}</span> : null}
        </div>
        {submit.error ? <p className={`${ERROR_BOX} md:col-span-2`} role="alert">{submit.error}</p> : null}
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          Trạng thái
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white">
            <option value="">Tất cả</option>
            {Object.entries(STATUS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {list.error ? <p className={`mt-3 ${ERROR_BOX}`} role="alert">{list.error}</p> : null}
      {list.loaded && list.items.length === 0 && !list.error ? <p className="mt-3 text-sm text-slate-400">Chưa có phiên nào.</p> : null}
      <ul className="mt-3 space-y-2">
        {list.items.map((auction) => {
          const style = STATUS[auction.status] || STATUS.active
          const person = auction.winner || auction.leader
          return (
            <li key={auction.id} className="rounded-2xl bg-slate-900/70 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a href={hrefFor(`/dau-gia/${auction.id}`)} target="_blank" rel="noreferrer" className="font-bold text-white hover:underline">#{auction.id} {auction.title}</a>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {formatClockTime(auction.startsAt)} → {formatClockTime(auction.endsAt)}{auction.extended ? ' (đã gia hạn)' : ''} · {auction.bidCount} lượt · {auction.bidders} người
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${style.className}`}>{style.label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-slate-300">
                <span className="tabular-nums">
                  {auction.winner ? `Giá thắng ${formatCurrency(auction.winner.price)}` : auction.currentPrice ? `Giá hiện tại ${formatCurrency(auction.currentPrice)}` : `Khởi điểm ${formatCurrency(auction.startingPrice)}`}
                  {person ? ` · ${auction.winner ? 'người thắng' : 'dẫn đầu'}: ${person.name}` : ''}
                  {auction.winner?.orderCode ? ` · đơn ${auction.winner.orderCode}` : ''}
                </span>
                {auction.status === 'active' ? (
                  confirmCancel === auction.id ? (
                    <span className="flex gap-2">
                      <button type="button" onClick={() => handleCancel(auction.id)} className="rounded-xl bg-red-600 px-3 py-1 text-xs font-bold text-white">Xác nhận huỷ</button>
                      <button type="button" onClick={() => setConfirmCancel(null)} className="rounded-xl px-3 py-1 text-xs font-bold text-slate-300">Thôi</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmCancel(auction.id)} className="rounded-xl border border-white/20 px-3 py-1 text-xs font-bold text-slate-200 hover:border-white/50">Huỷ phiên</button>
                  )
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
