import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { AuctionClock, PhaseBadge, RamChips } from '../components/AuctionBits'
import { fetchAuctions } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
const REFRESH_MS = 30000

const TABS = [
  { id: 'running', label: 'Đang diễn ra' },
  { id: 'upcoming', label: 'Sắp mở' },
  { id: 'ended', label: 'Đã kết thúc' },
  { id: 'mine', label: 'Phiên của tôi', needsUser: true },
]

const RULES = [
  ['Nhập giá tối đa', 'Bạn nhập mức cao nhất mình chịu trả. Hệ thống chỉ trả vừa đủ để bạn dẫn đầu, mỗi lần một bước giá; mức tối đa được giữ kín.'],
  ['Không "bắn tỉa" phút chót', 'Có người trả giá trong 2 phút cuối thì phiên kéo dài thêm 2 phút, ai cũng có cơ hội trả lại.'],
  ['Thắng thì đặt hàng trong 24 giờ', 'Đơn tính đúng giá thắng, giao như đơn thường. Quá hạn thì quyền mua bị huỷ và sản phẩm về kho.'],
]

/*
  Đấu giá RAM: RAM đang khan hiếm và tăng giá, cửa hàng bán một số bộ RAM theo phiên đấu giá.
  Hệ thống đấu giá dùng được cho mọi sản phẩm; trang mặc định lọc RAM, bỏ chọn để xem mọi phiên.
*/
export default function AuctionsPage({ currentUser }) {
  const [tab, setTab] = useState('running')
  const [onlyRam, setOnlyRam] = useState(true)
  const [state, setState] = useState({ key: '', items: [], total: 0, error: '', offsetMs: 0 })
  const [tick, setTick] = useState(0)
  const key = `${tab}|${onlyRam}|${currentUser?.id || ''}|${tick}`

  useEffect(() => {
    let cancelled = false
    const sentAt = Date.now()
    const params = tab === 'mine' ? { phase: 'all', mine: 1 } : { phase: tab }
    if (onlyRam) params.category = 'ram'
    fetchAuctions({ ...params, limit: 24 })
      .then((data) => {
        if (cancelled) return
        const first = data.items[0]
        const offsetMs = first ? new Date(first.serverNow).getTime() - (sentAt + Date.now()) / 2 : 0
        setState({ key, items: data.items, total: data.total, error: '', offsetMs })
      })
      .catch((err) => {
        if (!cancelled) setState({ key, items: [], total: 0, error: err.message || 'Không tải được phiên đấu giá', offsetMs: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [key, tab, onlyRam])

  // Tải lại định kỳ để thấy giá mới và phiên vừa mở hoặc vừa kết thúc.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])

  const loading = state.key.split('|').slice(0, 3).join('|') !== key.split('|').slice(0, 3).join('|')

  return (
    <div className="space-y-5">
      <section className={`${CARD} overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-red-900 text-white`}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">RAM đang khan hiếm</p>
        <h1 className="mt-2 text-3xl font-black">Đấu giá RAM</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
          Giá RAM tăng mạnh vì nhu cầu AI. Thay vì để người đầu cơ gom hàng, cửa hàng mở một số bộ RAM theo phiên đấu giá công khai:
          mỗi phiên là một sản phẩm thật trong kho, ai trả cao nhất khi hết giờ được mua đúng giá đó.
        </p>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {RULES.map(([title, body], index) => (
            <li key={title} className="rounded-3xl bg-white/10 p-4">
              <span className="text-xs font-black text-red-200">{index + 1}</span>
              <span className="mt-1 block font-bold">{title}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-200">{body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc phiên">
            {TABS.filter((item) => !item.needsUser || currentUser).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyRam} onChange={(event) => setOnlyRam(event.target.checked)} />
            Chỉ phiên RAM
          </label>
        </div>

        {state.error ? <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{state.error}</p> : null}
        {loading ? <p className="mt-5 text-sm text-slate-500">Đang tải...</p> : null}
        {!loading && !state.error && state.items.length === 0 ? (
          <div className="mt-5">
            <PageMessage
              title={tab === 'mine' ? 'Bạn chưa tham gia phiên nào' : 'Chưa có phiên nào ở mục này'}
              description={tab === 'running' ? 'Xem tab "Sắp mở" để biết phiên tiếp theo.' : ''}
            />
          </div>
        ) : null}
        {!loading && state.items.length > 0 ? (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {state.items.map((auction) => <AuctionCard key={auction.id} auction={auction} offsetMs={state.offsetMs} />)}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function AuctionCard({ auction, offsetMs }) {
  const ended = !['running', 'upcoming', 'closing'].includes(auction.phase)
  const price = ended && auction.winner ? auction.winner.price : auction.currentPrice
  return (
    <li className="flex">
      <a href={hrefFor(`/dau-gia/${auction.id}`)} className="flex w-full flex-col rounded-[28px] border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <PhaseBadge phase={auction.phase} />
          {auction.leader?.isYou && !ended ? <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">Bạn đang dẫn đầu</span> : null}
          {auction.winner?.isYou ? <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">Bạn đã thắng</span> : null}
        </div>
        <div className="mt-3 flex gap-3">
          {auction.product.image ? (
            <img src={auction.product.image} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-slate-50 object-contain" loading="lazy" />
          ) : null}
          <div className="min-w-0">
            <h2 className="font-bold leading-6 text-slate-900">{auction.title}</h2>
            <div className="mt-1.5"><RamChips ram={auction.product.ram} /></div>
          </div>
        </div>
        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">{ended ? (auction.winner ? 'Giá thắng' : 'Giá khởi điểm') : price ? 'Giá hiện tại' : 'Giá khởi điểm'}</div>
              <div className="text-xl font-black text-red-600">{formatCurrency(price || auction.startingPrice)}</div>
              {auction.product.listPrice ? <div className="text-xs text-slate-500">Giá niêm yết hôm nay {formatCurrency(auction.product.listPrice)}</div> : null}
            </div>
            <div className="text-right">
              <AuctionClock auction={auction} offsetMs={offsetMs} />
              <div className="text-xs text-slate-500">{auction.bidCount} lượt trả giá</div>
            </div>
          </div>
        </div>
      </a>
    </li>
  )
}
