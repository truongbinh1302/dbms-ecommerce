import { useEffect, useState } from 'react'
import { createPromotion, fetchAdminPromotion, fetchAdminPromotions, stopPromotion } from '../../api/client'
import { formatCurrency } from '../../utils/format'
import ProductPicker from './ProductPicker'
import { formatClockTime } from '../../hooks/useCountdown'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const ERROR_BOX = 'rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200'

const STATUS = {
  running: { label: 'Đang chạy', className: 'bg-emerald-500/15 text-emerald-200' },
  upcoming: { label: 'Sắp chạy', className: 'bg-sky-500/15 text-sky-200' },
  ended: { label: 'Đã kết thúc', className: 'bg-white/10 text-slate-300' },
  stopped: { label: 'Đã dừng', className: 'bg-white/10 text-slate-300' },
}

let lineSeq = 0
const newLine = () => {
  lineSeq += 1
  return { key: lineSeq, product: null, salePrice: '', quantityLimit: '', perOrderLimit: '' }
}

// Giá trị cho ô datetime-local theo giờ trên máy (admin ở Việt Nam là giờ +07).
function toLocalInput(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Mặc định bắt đầu ngay (phút hiện tại) và kéo dài 2 giờ.
function defaultTimes() {
  const start = new Date()
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + 2 * 3600000)
  return { startsAt: toLocalInput(start), endsAt: toLocalInput(end) }
}

function formatRange(startsAt, endsAt) {
  return `${formatClockTime(startsAt)} → ${formatClockTime(endsAt)}`
}

function PromotionDetail({ promotionId, token, version }) {
  const [state, setState] = useState({ data: null, error: '' })
  useEffect(() => {
    let cancelled = false
    fetchAdminPromotion(promotionId, token)
      .then((data) => !cancelled && setState({ data, error: '' }))
      .catch((err) => !cancelled && setState({ data: null, error: err.message || 'Không tải được chương trình' }))
    return () => {
      cancelled = true
    }
  }, [promotionId, token, version])
  if (state.error) return <p className="mt-2 text-sm text-red-200">{state.error}</p>
  if (!state.data) return <p className="mt-2 text-sm text-slate-400">Đang tải...</p>
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {state.data.items.map((item) => (
        <li key={item.productId} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-slate-900/70 px-3 py-2">
          <span className="min-w-0 truncate text-slate-200">{item.productName}</span>
          <span className="shrink-0 tabular-nums text-slate-300">
            {formatCurrency(item.salePrice)} <span className="text-slate-500 line-through">{formatCurrency(item.listPrice)}</span>
            {' · '}đã bán {item.soldCount}{item.quantityLimit ? `/${item.quantityLimit}` : ''}
            {item.perOrderLimit ? ` · tối đa ${item.perOrderLimit}/đơn` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* Quản lý Hot Deal: tạo chương trình có giờ bắt đầu/kết thúc, số suất; xem và dừng. */
export default function PromotionsPanel({ token }) {
  const [form, setForm] = useState(() => ({ name: '', ...defaultTimes() }))
  const [lines, setLines] = useState(() => [newLine()])
  const [submit, setSubmit] = useState({ busy: false, error: '', done: '' })
  const [list, setList] = useState({ items: [], error: '', loaded: false })
  const [version, setVersion] = useState(0)
  const [openId, setOpenId] = useState(null)
  const [confirmStop, setConfirmStop] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchAdminPromotions(token)
      .then((items) => !cancelled && setList({ items: Array.isArray(items) ? items : [], error: '', loaded: true }))
      .catch((err) => !cancelled && setList({ items: [], error: err.message || 'Không tải được danh sách', loaded: true }))
    return () => {
      cancelled = true
    }
  }, [token, version])

  function updateLine(key, patch) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const filled = lines.filter((line) => line.product)
    if (!form.name.trim()) return setSubmit({ busy: false, error: 'Vui lòng đặt tên chương trình', done: '' })
    if (!filled.length) return setSubmit({ busy: false, error: 'Chọn ít nhất một sản phẩm', done: '' })
    const startsAt = new Date(form.startsAt)
    const endsAt = new Date(form.endsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return setSubmit({ busy: false, error: 'Giờ bắt đầu/kết thúc chưa hợp lệ', done: '' })
    }
    setSubmit({ busy: true, error: '', done: '' })
    try {
      const promotion = await createPromotion({
        name: form.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        items: filled.map((line) => ({
          productId: line.product.id,
          salePrice: Number(line.salePrice),
          quantityLimit: line.quantityLimit === '' ? null : Number(line.quantityLimit),
          perOrderLimit: line.perOrderLimit === '' ? null : Number(line.perOrderLimit),
        })),
      }, token)
      setSubmit({ busy: false, error: '', done: `Đã tạo "${promotion.name}" (${STATUS[promotion.status]?.label || promotion.status}).` })
      setForm({ name: '', ...defaultTimes() })
      setLines([newLine()])
      setOpenId(promotion.id)
      setVersion((value) => value + 1)
    } catch (err) {
      setSubmit({ busy: false, error: err.message || 'Không tạo được chương trình', done: '' })
    }
    return undefined
  }

  async function handleStop(promotionId) {
    try {
      await stopPromotion(promotionId, token)
      setConfirmStop(null)
      setVersion((value) => value + 1)
    } catch (err) {
      setSubmit({ busy: false, error: err.message || 'Không dừng được chương trình', done: '' })
    }
  }

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-label="Hot Deal">
      <form onSubmit={handleSubmit} className={PANEL} aria-labelledby="promo-title" noValidate>
        <h3 id="promo-title" className="text-2xl font-black">Tạo Hot Deal</h3>
        <p className="text-sm text-slate-400">Giá khuyến mãi tự áp dụng trong khung giờ; server tính giá khi báo giá và khi tạo đơn.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-300 sm:col-span-3">
            Tên chương trình
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} className={`${FIELD} mt-1`} placeholder="Ví dụ: Hot Deal cuối tuần" />
          </label>
          <label className="text-sm text-slate-300 sm:col-span-3 md:col-span-1">
            Bắt đầu
            <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} className={`${FIELD} mt-1`} />
          </label>
          <label className="text-sm text-slate-300 sm:col-span-3 md:col-span-1">
            Kết thúc
            <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} className={`${FIELD} mt-1`} />
          </label>
          <p className="self-end text-xs text-slate-500 sm:col-span-3 md:col-span-1">Giờ theo máy bạn đang dùng. Tối đa 31 ngày.</p>
        </div>

        <div className="mt-5 space-y-3">
          {lines.map((line, index) => {
            const listPrice = line.product?.price
            const sale = Number(line.salePrice)
            const percent = listPrice && sale > 0 && sale < listPrice ? Math.round(((listPrice - sale) / listPrice) * 100) : 0
            return (
              <div key={line.key} className="rounded-2xl border border-white/10 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <ProductPicker value={line.product} label={`Sản phẩm khuyến mãi ${index + 1}`} onSelect={(product) => updateLine(line.key, { product })} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.key !== line.key) : [newLine()]))}
                    aria-label={`Bỏ sản phẩm ${index + 1}`}
                    className="h-10 w-8 shrink-0 rounded-2xl text-lg font-bold text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-slate-400">
                    Giá Hot Deal{listPrice ? ` (niêm yết ${formatCurrency(listPrice)})` : ''}
                    <input type="number" min="1" step="any" inputMode="numeric" value={line.salePrice} onChange={(event) => updateLine(line.key, { salePrice: event.target.value })} className={`${FIELD} mt-1`} aria-label={`Giá Hot Deal ${index + 1}`} />
                  </label>
                  <label className="text-xs text-slate-400">
                    Số suất (trống = không giới hạn)
                    <input type="number" min="1" step="1" inputMode="numeric" value={line.quantityLimit} onChange={(event) => updateLine(line.key, { quantityLimit: event.target.value })} className={`${FIELD} mt-1`} aria-label={`Số suất ${index + 1}`} />
                  </label>
                  <label className="text-xs text-slate-400">
                    Tối đa mỗi đơn
                    <input type="number" min="1" step="1" inputMode="numeric" value={line.perOrderLimit} onChange={(event) => updateLine(line.key, { perOrderLimit: event.target.value })} className={`${FIELD} mt-1`} aria-label={`Tối đa mỗi đơn ${index + 1}`} />
                  </label>
                </div>
                {percent > 0 ? <p className="mt-2 text-xs text-slate-300">Giảm {percent}% so với giá niêm yết</p> : null}
              </div>
            )
          })}
          <button type="button" onClick={() => setLines((current) => [...current, newLine()])} disabled={lines.length >= 50} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-50">
            + Thêm sản phẩm
          </button>
        </div>

        <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
          <button type="submit" disabled={submit.busy} className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-400 disabled:opacity-60">
            {submit.busy ? 'Đang lưu...' : 'Tạo chương trình'}
          </button>
        </div>
        <div aria-live="polite">
          {submit.error ? <p className={`${ERROR_BOX} mt-3`}>{submit.error}</p> : null}
          {submit.done ? <p className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">{submit.done}</p> : null}
        </div>
      </form>

      <div className={PANEL}>
        <h3 className="text-xl font-black">Chương trình</h3>
        {list.error ? <p className={`${ERROR_BOX} mt-3`}>{list.error}</p> : null}
        {list.loaded && !list.error && list.items.length === 0 ? <p className="mt-3 text-sm text-slate-400">Chưa có chương trình nào.</p> : null}
        <ul className="mt-3 divide-y divide-white/10">
          {list.items.map((promotion) => {
            const status = STATUS[promotion.status] || STATUS.ended
            const canStop = promotion.status === 'running' || promotion.status === 'upcoming'
            return (
              <li key={promotion.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" onClick={() => setOpenId((current) => (current === promotion.id ? null : promotion.id))} aria-expanded={openId === promotion.id} className="min-w-0 text-left">
                    <span className="block font-bold text-white">{promotion.name}</span>
                    <span className="block text-xs text-slate-400">{formatRange(promotion.startsAt, promotion.endsAt)} · {promotion.itemCount} sản phẩm · đã bán {promotion.soldCount}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
                    {canStop ? (
                      confirmStop === promotion.id ? (
                        <>
                          <button type="button" onClick={() => handleStop(promotion.id)} className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">Xác nhận dừng</button>
                          <button type="button" onClick={() => setConfirmStop(null)} className="rounded-full px-2 py-1 text-xs text-slate-300">Huỷ</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmStop(promotion.id)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white hover:bg-white/20">Dừng</button>
                      )
                    ) : null}
                  </span>
                </div>
                {openId === promotion.id ? <PromotionDetail promotionId={promotion.id} token={token} version={version} /> : null}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
