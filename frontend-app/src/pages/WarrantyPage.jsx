import { useEffect, useState } from 'react'
import { createServiceRequest, fetchMyServiceRequests, fetchMyWarranties, lookupWarranty } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatDateTime } from '../utils/orderLabels'
import { SERVICE_STATUS } from '../utils/serviceLabels'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

function formatDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : ''
}

const OPEN = ['new', 'confirmed', 'in_progress']

// Gửi yêu cầu bảo hành cho một serial của mình: mô tả lỗi, số điện thoại, cách giao máy.
function WarrantyClaimForm({ serial, onDone }) {
  const [form, setForm] = useState({ description: '', contactPhone: '', handoff: 'store' })
  const [state, setState] = useState({ busy: false, error: '' })

  async function handleSubmit(event) {
    event.preventDefault()
    setState({ busy: true, error: '' })
    try {
      const created = await createServiceRequest({ type: 'warranty', serialNumber: serial, ...form })
      setState({ busy: false, error: '' })
      onDone(created)
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không gửi được yêu cầu' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3" noValidate>
      <label className="block text-xs font-semibold text-slate-700">
        Mô tả lỗi
        <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} maxLength={1000} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ví dụ: máy không lên hình sau khi cắm nguồn, quạt quay bình thường" />
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        Số điện thoại liên hệ
        <input value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} inputMode="tel" maxLength={15} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <fieldset className="text-xs text-slate-700">
        <legend className="font-semibold">Giao máy</legend>
        <label className="mr-4 inline-flex items-center gap-1"><input type="radio" name={`handoff-${serial}`} checked={form.handoff === 'store'} onChange={() => setForm((current) => ({ ...current, handoff: 'store' }))} /> Mang tới cửa hàng</label>
        <label className="inline-flex items-center gap-1"><input type="radio" name={`handoff-${serial}`} checked={form.handoff === 'pickup'} onChange={() => setForm((current) => ({ ...current, handoff: 'pickup' }))} /> Nhờ nhận máy tại nhà</label>
      </fieldset>
      {state.error ? <p className="text-xs font-semibold text-red-600" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={state.busy} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
        {state.busy ? 'Đang gửi...' : 'Gửi yêu cầu bảo hành'}
      </button>
    </form>
  )
}

function RepairHistory({ requests }) {
  if (!requests.length) return null
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Lịch sử bảo hành</p>
      <ul className="mt-1 space-y-1 text-xs text-slate-600">
        {requests.map((request) => (
          <li key={request.id}>
            <a href={hrefFor('/dich-vu/cua-toi')} className="font-semibold text-slate-800 hover:text-red-600">{request.code}</a>
            {' · '}{formatDateTime(request.createdAt)}{' · '}
            <span className={`rounded-full px-2 py-0.5 font-bold ${SERVICE_STATUS[request.status]?.className || ''}`}>{SERVICE_STATUS[request.status]?.label || request.status}</span>
            {request.events.at(-1)?.note ? ` · ${request.events.at(-1).note}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

function WarrantyCard({ warranty, requests = null, onClaimed }) {
  const active = warranty.status === 'active'
  const [claiming, setClaiming] = useState(false)
  const [created, setCreated] = useState(null)
  const openRequest = requests?.find((request) => OPEN.includes(request.status))
  return (
    <div className="rounded-2xl border border-slate-200 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <a href={hrefFor(`/san-pham/${warranty.productId}`)} className="font-bold text-slate-900 hover:text-red-600">{warranty.productName}</a>
          <p className="text-slate-500">Serial {warranty.serialNumber}</p>
        </div>
        <span className={`rounded-full px-3 py-1 font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {active ? `Còn bảo hành ${warranty.daysLeft} ngày` : 'Hết bảo hành'}
        </span>
      </div>
      <p className="mt-2 text-slate-600">Từ {formatDate(warranty.startDate)} đến hết {formatDate(warranty.endDate)}</p>
      {warranty.orderId ? (
        <a href={hrefFor(`/don-hang/${warranty.orderId}`)} className="mt-1 inline-block text-slate-500 hover:text-red-600">Đơn {warranty.orderCode || `#${warranty.orderId}`}</a>
      ) : null}
      {requests ? (
        <>
          {created ? (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" role="status">
              Đã gửi yêu cầu {created.code}. Cửa hàng sẽ gọi lại để hẹn nhận máy.
            </p>
          ) : null}
          {active && !openRequest && !created ? (
            claiming ? (
              <WarrantyClaimForm
                serial={warranty.serialNumber}
                onDone={(request) => {
                  setCreated(request)
                  setClaiming(false)
                  onClaimed()
                }}
              />
            ) : (
              <button type="button" onClick={() => setClaiming(true)} className="mt-3 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                Yêu cầu bảo hành
              </button>
            )
          ) : null}
          {!active ? (
            <p className="mt-3 text-xs text-slate-500">
              Hết hạn bảo hành: bạn vẫn có thể{' '}
              <a href={hrefFor('/dich-vu/tai-nha')} className="font-semibold text-red-600 underline">đặt lịch kiểm tra lỗi</a> (có tính phí).
            </p>
          ) : null}
          <RepairHistory requests={requests} />
        </>
      ) : null}
    </div>
  )
}

/* Tra cứu bảo hành theo số serial; khách đã đăng nhập xem thêm bảo hành của các đơn của mình. */
export default function WarrantyPage({ currentUser }) {
  const [repairs, setRepairs] = useState({ userId: null, items: [] })
  const [repairsVersion, setRepairsVersion] = useState(0)
  const [serial, setSerial] = useState('')
  const [lookup, setLookup] = useState({ busy: false, data: null, error: '' })
  const [mine, setMine] = useState({ userId: null, items: [] })
  const userId = currentUser?.id

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMyWarranties()
      .then((items) => {
        if (!cancelled) setMine({ userId, items: Array.isArray(items) ? items : [] })
      })
      .catch(() => {
        if (!cancelled) setMine({ userId, items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMyServiceRequests()
      .then((items) => {
        if (!cancelled) setRepairs({ userId, items: Array.isArray(items) ? items.filter((item) => item.type === 'warranty') : [] })
      })
      .catch(() => {
        if (!cancelled) setRepairs({ userId, items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [userId, repairsVersion])

  async function handleLookup(event) {
    event.preventDefault()
    const value = serial.trim()
    if (!value) return
    setLookup({ busy: true, data: null, error: '' })
    try {
      setLookup({ busy: false, data: await lookupWarranty(value), error: '' })
    } catch (err) {
      setLookup({ busy: false, data: null, error: err.message || 'Không tra cứu được' })
    }
  }

  const myItems = userId && mine.userId === userId ? mine.items : []

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h1 className="text-2xl font-black text-slate-900">Tra cứu bảo hành</h1>
        <p className="mt-2 text-sm text-slate-600">
          Nhập số serial in trên tem sản phẩm hoặc trên hoá đơn. Điều kiện bảo hành xem ở{' '}
          <a href={hrefFor('/chinh-sach/bao-hanh')} className="font-semibold text-red-600 underline">Chính sách bảo hành</a>.
        </p>
        <form onSubmit={handleLookup} className="mt-4 flex max-w-xl gap-2">
          <input
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            placeholder="Ví dụ: S3Z1NB0W123456"
            aria-label="Số serial"
            maxLength={60}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 uppercase"
          />
          <button type="submit" disabled={lookup.busy || !serial.trim()} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300">
            {lookup.busy ? 'Đang tra...' : 'Tra cứu'}
          </button>
        </form>
        <div className="mt-4 max-w-xl" aria-live="polite">
          {lookup.error ? <p className="text-sm text-red-600">{lookup.error}</p> : null}
          {lookup.data ? <WarrantyCard warranty={lookup.data} /> : null}
        </div>
      </section>

      {userId ? (
        <section className={CARD}>
          <h2 className="text-xl font-black text-slate-900">Bảo hành của tôi</h2>
          {myItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Chưa có sản phẩm nào được đăng ký bảo hành. Cửa hàng đăng ký serial khi xác nhận và giao đơn.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {myItems.map((item) => (
                <WarrantyCard
                  key={item.serialNumber}
                  warranty={item}
                  requests={repairs.userId === userId ? repairs.items.filter((request) => request.serialNumber === item.serialNumber) : []}
                  onClaimed={() => setRepairsVersion((value) => value + 1)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
