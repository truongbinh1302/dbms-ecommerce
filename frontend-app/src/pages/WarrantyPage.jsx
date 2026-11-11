import { useEffect, useState } from 'react'
import { fetchMyWarranties, lookupWarranty } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

function formatDate(value) {
  const [year, month, day] = String(value || '').split('-')
  return year && month && day ? `${day}/${month}/${year}` : ''
}

function WarrantyCard({ warranty }) {
  const active = warranty.status === 'active'
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
    </div>
  )
}

/* Tra cứu bảo hành theo số serial; khách đã đăng nhập xem thêm bảo hành của các đơn của mình. */
export default function WarrantyPage({ currentUser }) {
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

  async function handleSubmit(event) {
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
        <form onSubmit={handleSubmit} className="mt-4 flex max-w-xl gap-2">
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
              {myItems.map((item) => <WarrantyCard key={item.serialNumber} warranty={item} />)}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
