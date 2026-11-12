import { useCallback, useEffect, useRef, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { AuctionClock, PhaseBadge, RamChips } from '../components/AuctionBits'
import { auctionEventsUrl, buyAuctionNow, fetchAuction, placeAuctionBid } from '../api/client'
import { hrefFor, navigate } from '../hooks/useHashRoute'
import useCountdown, { formatClockTime, formatCountdown } from '../hooks/useCountdown'
import { formatCurrency } from '../utils/format'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
const KIND_LABELS = { bid: 'trả giá', auto: 'tự trả theo giá tối đa', buy_now: 'mua ngay' }
// Trường công khai trong ảnh chụp SSE (không có thông tin riêng của người xem).
const PUBLIC_FIELDS = ['status', 'phase', 'currentPrice', 'bidCount', 'bidders', 'minimumBid', 'buyNowPrice', 'endsAt', 'extended', 'endedAt', 'version', 'serverNow']

const timeOf = (value) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))

function compatibilityNote(ram) {
  if (!ram) return null
  if (ram.laptop) return { text: 'RAM laptop (SO-DIMM). Xem laptop của bạn còn khe trống và hỗ trợ tối đa bao nhiêu GB trước khi trả giá.', href: '/kiem-tra-may', link: 'Kiểm tra laptop' }
  if (ram.memoryType === 'DDR5') return { text: 'Cho mainboard máy bàn hỗ trợ DDR5 (AMD AM5, Intel đời 12-14 bản DDR5). Không cắm được vào mainboard DDR4.', href: '/build-pc', link: 'Kiểm tra trong Build PC' }
  if (ram.memoryType === 'DDR4') return { text: 'Cho mainboard máy bàn hỗ trợ DDR4 (AMD AM4, Intel đời 8-14 bản DDR4). Không cắm được vào mainboard DDR5.', href: '/build-pc', link: 'Kiểm tra trong Build PC' }
  return null
}

/*
  Một phiên đấu giá: giá, đồng hồ và lịch sử cập nhật trực tiếp qua Server-Sent Events.
  Ảnh chụp công khai tới ngay qua luồng; người đã đăng nhập tải lại thông tin riêng (giá tối đa của mình,
  mình có đang dẫn đầu) sau mỗi thay đổi.
*/
export default function AuctionDetailPage({ auctionId, currentUser, onRequireLogin }) {
  const [auction, setAuction] = useState(null)
  const [error, setError] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)
  const [live, setLive] = useState(false)
  const [freshIds, setFreshIds] = useState([])
  const versionRef = useRef(-1)
  const refetchTimer = useRef(null)
  const userId = currentUser?.id || null

  const load = useCallback(async () => {
    const sentAt = Date.now()
    try {
      const data = await fetchAuction(auctionId)
      versionRef.current = Math.max(versionRef.current, data.version)
      setOffsetMs(new Date(data.serverNow).getTime() - (sentAt + Date.now()) / 2)
      setAuction(data)
      setError('')
    } catch (err) {
      setError(err.message || 'Không tải được phiên đấu giá')
    }
  }, [auctionId])

  useEffect(() => {
    let cancelled = false
    const sentAt = Date.now()
    fetchAuction(auctionId)
      .then((data) => {
        if (cancelled) return
        versionRef.current = data.version
        setOffsetMs(new Date(data.serverNow).getTime() - (sentAt + Date.now()) / 2)
        setAuction(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Không tải được phiên đấu giá')
      })
    return () => {
      cancelled = true
    }
  }, [auctionId, userId])

  // Luồng giá trực tiếp.
  useEffect(() => {
    const source = new EventSource(auctionEventsUrl(auctionId))
    source.onopen = () => setLive(true)
    source.onerror = () => setLive(false)
    source.addEventListener('update', (event) => {
      const snapshot = JSON.parse(event.data)
      if (snapshot.version < versionRef.current) return
      versionRef.current = snapshot.version
      setLive(true)
      setAuction((current) => {
        if (!current) return current
        const known = new Set(current.history.map((bid) => bid.id))
        const added = snapshot.history.filter((bid) => !known.has(bid.id))
        if (added.length) setFreshIds(added.map((bid) => bid.id))
        const next = { ...current }
        for (const field of PUBLIC_FIELDS) next[field] = snapshot[field]
        if (!userId) {
          next.leader = snapshot.leader
          next.winner = snapshot.winner
        }
        next.history = [...added, ...current.history].slice(0, 30)
        return next
      })
      // Thông tin riêng (mình có dẫn đầu, giá tối đa của mình, tên "Bạn" trong lịch sử) cần tải lại có đăng nhập.
      if (userId) {
        window.clearTimeout(refetchTimer.current)
        refetchTimer.current = window.setTimeout(load, 300)
      }
    })
    return () => {
      source.close()
      window.clearTimeout(refetchTimer.current)
    }
  }, [auctionId, userId, load])

  // Lượt trả giá mới được tô nền trong 3 giây rồi trở lại bình thường.
  useEffect(() => {
    if (freshIds.length === 0) return undefined
    const timer = window.setTimeout(() => setFreshIds([]), 3000)
    return () => window.clearTimeout(timer)
  }, [freshIds])

  // Hết giờ trên đồng hồ: hỏi lại máy chủ để chốt và hiện kết quả.
  const target = auction?.phase === 'running' ? auction.endsAt : auction?.phase === 'upcoming' ? auction.startsAt : null
  const left = useCountdown(target, offsetMs)
  useEffect(() => {
    if (!target || left > 0) return undefined
    const timer = window.setTimeout(load, 1200)
    return () => window.clearTimeout(timer)
  }, [target, left, load])

  if (error && !auction) return <PageMessage title="Không tải được phiên đấu giá" description={error} action={<a href={hrefFor('/dau-gia')} className="font-bold text-red-600">Xem các phiên khác</a>} />
  if (!auction) return <PageMessage title="Đang tải phiên đấu giá..." />

  const note = compatibilityNote(auction.product.ram)

  return (
    <div className="space-y-4">
      <a href={hrefFor('/dau-gia')} className="inline-block text-sm font-semibold text-slate-600 hover:text-red-600">← Tất cả phiên đấu giá</a>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <section className={CARD}>
            <div className="flex flex-col gap-5 sm:flex-row">
              {auction.product.image ? (
                <img src={auction.product.image} alt={auction.product.name} className="h-48 w-full shrink-0 rounded-3xl bg-slate-50 object-contain sm:w-48" />
              ) : null}
              <div className="min-w-0">
                <PhaseBadge phase={auction.phase} />
                <h1 className="mt-2 text-2xl font-black text-slate-900">{auction.title}</h1>
                <a href={hrefFor(`/san-pham/${auction.product.id}`)} className="mt-1 inline-block text-sm font-semibold text-slate-600 hover:text-red-600">{auction.product.name}</a>
                <div className="mt-3"><RamChips ram={auction.product.ram} /></div>
                {auction.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{auction.description}</p> : null}
              </div>
            </div>
            {note ? (
              <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                {note.text} <a href={hrefFor(note.href)} className="font-bold underline">{note.link}</a>
              </p>
            ) : null}
            {auction.product.listPrice ? (
              <p className="mt-3 text-sm text-slate-600">
                Giá niêm yết hôm nay ở cửa hàng: <strong>{formatCurrency(auction.product.listPrice)}</strong> (hàng bán thường có thể hết bất cứ lúc nào).
              </p>
            ) : null}
            {auction.product.specs?.length ? (
              <ul className="mt-4 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                {auction.product.specs.map((spec) => <li key={spec}>• {spec}</li>)}
              </ul>
            ) : null}
          </section>

          <section className={CARD} aria-labelledby="auction-history">
            <div className="flex items-center justify-between gap-3">
              <h2 id="auction-history" className="text-lg font-black text-slate-900">Lịch sử trả giá</h2>
              <span className="text-sm text-slate-500">{auction.bidCount} lượt · {auction.bidders} người</span>
            </div>
            {auction.history.length === 0 ? <p className="mt-3 text-sm text-slate-500">Chưa có ai trả giá. Hãy là người đầu tiên.</p> : null}
            <ol className="mt-3 divide-y divide-slate-100" aria-live="polite">
              {auction.history.map((bid) => (
                <li key={bid.id} className={`flex items-center justify-between gap-3 py-2.5 text-sm transition-colors duration-1000 ${freshIds.includes(bid.id) ? 'bg-amber-50' : ''}`}>
                  <span className="min-w-0">
                    <span className={`font-semibold ${bid.isYou ? 'text-emerald-700' : 'text-slate-900'}`}>{bid.name}</span>
                    <span className="text-slate-500"> · {KIND_LABELS[bid.kind] || bid.kind}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold tabular-nums text-slate-900">{formatCurrency(bid.amount)}</span>
                    <span className="block text-xs tabular-nums text-slate-500">{timeOf(bid.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className={`${CARD} order-first h-fit lg:sticky lg:top-28 lg:order-none`} aria-label="Trả giá">
          <div className="flex items-center justify-between gap-2">
            <PhaseBadge phase={auction.phase} />
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${live ? 'text-emerald-700' : 'text-slate-500'}`}>
              <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
              {live ? 'Cập nhật trực tiếp' : 'Đang kết nối lại...'}
            </span>
          </div>
          <div className="mt-4"><AuctionClock auction={auction} offsetMs={offsetMs} large /></div>

          <div className="mt-5 rounded-3xl bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">{auction.currentPrice ? 'Giá hiện tại' : 'Giá khởi điểm'}</div>
            <div className="text-4xl font-black tabular-nums text-red-600">{formatCurrency(auction.currentPrice || auction.startingPrice)}</div>
            <div className="mt-1 text-sm text-slate-600">
              {auction.leader ? (auction.leader.isYou ? <strong className="text-emerald-700">Bạn đang dẫn đầu</strong> : <>Người dẫn đầu: <strong>{auction.leader.name}</strong></>) : 'Chưa có người trả giá'}
              {' · '}bước giá {formatCurrency(auction.bidIncrement)}
            </div>
            {auction.myMax ? <div className="mt-1 text-sm text-slate-600">Giá tối đa của bạn (chỉ bạn thấy): <strong>{formatCurrency(auction.myMax)}</strong></div> : null}
          </div>

          {auction.phase === 'running' ? (
            <BidPanel auction={auction} currentUser={currentUser} onRequireLogin={onRequireLogin} onChanged={setAuction} />
          ) : null}
          {auction.phase === 'upcoming' ? <p className="mt-4 text-sm text-slate-600">Phiên chưa mở. Quay lại lúc {formatClockTime(auction.startsAt)} để trả giá.</p> : null}
          {auction.phase === 'closing' ? <p className="mt-4 text-sm font-semibold text-amber-900" role="status">Hết giờ, đang chốt kết quả...</p> : null}
          <Outcome auction={auction} offsetMs={offsetMs} />

          <details className="mt-5 text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-800">Quy định phiên</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Mỗi phiên bán 1 sản phẩm mới trong kho, bảo hành như hàng mua thường.</li>
              <li>Bạn nhập giá tối đa; hệ thống tự trả thay mỗi lần một bước giá khi có người trả cao hơn, không vượt mức bạn nhập.</li>
              <li>Hai người cùng giá tối đa thì người đặt trước dẫn đầu.</li>
              <li>Có lượt trả giá trong {Math.round(auction.extendSeconds / 60) || 0} phút cuối thì phiên kéo dài thêm {Math.round(auction.extendSeconds / 60) || 0} phút.</li>
              <li>Người thắng đặt hàng trong 24 giờ theo đúng giá thắng; không dùng mã giảm giá. Quá hạn thì quyền mua bị huỷ.</li>
              <li>Người khác chỉ thấy tên bạn đã che (ví dụ T***h).</li>
            </ul>
          </details>
        </aside>
      </div>
    </div>
  )
}

function BidPanel({ auction, currentUser, onRequireLogin, onChanged }) {
  const [amount, setAmount] = useState('')
  const [state, setState] = useState({ busy: false, message: '', tone: 'info' })
  const [confirmBuy, setConfirmBuy] = useState(false)
  const leading = auction.leader?.isYou
  const minimum = leading ? Math.max((auction.myMax || 0) + auction.bidIncrement, auction.minimumBid) : auction.minimumBid
  const quick = [minimum, minimum + auction.bidIncrement * 5, minimum + auction.bidIncrement * 10]

  if (!currentUser) {
    return (
      <button type="button" onClick={onRequireLogin} className="mt-5 w-full rounded-2xl bg-red-600 px-5 py-4 text-sm font-bold text-white hover:bg-red-700">
        Đăng nhập để trả giá
      </button>
    )
  }

  async function submit(event) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value < minimum) {
      setState({ busy: false, message: `Nhập từ ${formatCurrency(minimum)} trở lên.`, tone: 'error' })
      return
    }
    setState({ busy: true, message: '', tone: 'info' })
    try {
      const result = await placeAuctionBid(auction.id, value)
      onChanged(result.auction)
      setAmount('')
      const messages = {
        leading: { message: `Bạn đang dẫn đầu ở ${formatCurrency(result.price)}. Hệ thống sẽ tự trả thay tới ${formatCurrency(value)} nếu có người trả cao hơn.`, tone: 'good' },
        outbid: { message: `Có người đã đặt giá tối đa cao hơn. Giá hiện tại ${formatCurrency(result.price)}, bạn thử mức cao hơn nhé.`, tone: 'warn' },
        raised: { message: `Đã nâng giá tối đa của bạn lên ${formatCurrency(value)}. Giá hiện tại giữ nguyên.`, tone: 'good' },
      }
      setState({ busy: false, ...(messages[result.outcome] || messages.leading), ...(result.extended ? { extra: 'Phiên vừa được gia hạn vì có lượt trả giá phút chót.' } : {}) })
    } catch (err) {
      setState({ busy: false, message: err.message || 'Không trả giá được', tone: 'error' })
    }
  }

  async function buyNow() {
    setState({ busy: true, message: '', tone: 'info' })
    try {
      onChanged(await buyAuctionNow(auction.id))
      setConfirmBuy(false)
      setState({ busy: false, message: '', tone: 'info' })
    } catch (err) {
      setConfirmBuy(false)
      setState({ busy: false, message: err.message || 'Không mua ngay được', tone: 'error' })
    }
  }

  const toneClass = { good: 'bg-emerald-50 text-emerald-800', warn: 'bg-amber-50 text-amber-900', error: 'bg-red-50 text-red-700', info: 'bg-slate-50 text-slate-700' }[state.tone]

  return (
    <div className="mt-5">
      <form onSubmit={submit} noValidate>
        <label htmlFor="auction-amount" className="text-sm font-bold text-slate-800">{leading ? 'Nâng giá tối đa của bạn' : 'Giá tối đa bạn chịu trả'}</label>
        <div className="mt-1 flex gap-2">
          <input
            id="auction-amount"
            type="number"
            inputMode="numeric"
            min={minimum}
            step={auction.bidIncrement}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={String(minimum)}
            aria-describedby="auction-amount-hint"
            className="min-w-0 flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm tabular-nums outline-none focus:border-red-500"
          />
          <button type="submit" disabled={state.busy} className="shrink-0 rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300">
            {state.busy ? 'Đang gửi...' : leading ? 'Nâng giá' : 'Trả giá'}
          </button>
        </div>
        <p id="auction-amount-hint" className="mt-1.5 text-xs leading-5 text-slate-500">
          Tối thiểu {formatCurrency(minimum)}. Hệ thống chỉ trả vừa đủ để bạn dẫn đầu; mức tối đa của bạn được giữ kín.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {quick.map((value) => (
            <button key={value} type="button" onClick={() => setAmount(String(value))} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold tabular-nums text-slate-700 hover:bg-slate-200">
              {formatCurrency(value)}
            </button>
          ))}
        </div>
      </form>
      {state.message ? (
        <p className={`mt-3 rounded-2xl px-4 py-3 text-sm ${toneClass}`} role={state.tone === 'error' ? 'alert' : 'status'}>
          {state.message}{state.extra ? ` ${state.extra}` : ''}
        </p>
      ) : null}

      {auction.buyNowPrice ? (
        <div className="mt-4 border-t border-dashed border-slate-200 pt-4">
          {confirmBuy ? (
            <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              <p>Mua ngay với giá <strong>{formatCurrency(auction.buyNowPrice)}</strong>? Phiên kết thúc ngay và bạn có 24 giờ để đặt hàng.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={buyNow} disabled={state.busy} className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:bg-slate-400">Xác nhận mua ngay</button>
                <button type="button" onClick={() => setConfirmBuy(false)} className="rounded-xl px-4 py-2 font-bold text-slate-700">Thôi</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmBuy(true)} className="w-full rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-800 hover:border-slate-500">
              Mua ngay {formatCurrency(auction.buyNowPrice)}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Outcome({ auction, offsetMs }) {
  const due = auction.winner?.isYou && auction.status === 'won' ? auction.winner.paymentDueAt : null
  const left = useCountdown(due, offsetMs)
  if (auction.status === 'won' && auction.winner?.isYou) {
    return (
      <div className="mt-5 rounded-3xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        <p className="text-base font-black">Bạn đã thắng với giá {formatCurrency(auction.winner.price)}</p>
        <p className="mt-1">Đặt hàng trước {formatClockTime(due)} (còn {formatCountdown(left)}) để giữ quyền mua.</p>
        <button type="button" onClick={() => navigate(`/dau-gia/${auction.id}/thanh-toan`)} className="mt-3 w-full rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700">
          Đặt hàng
        </button>
      </div>
    )
  }
  if (auction.status === 'ordered' && auction.winner?.isYou) {
    return (
      <p className="mt-5 rounded-3xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        Bạn đã đặt hàng phiên này. <a href={hrefFor(`/don-hang/${auction.winner.orderId}`)} className="font-bold underline">Xem đơn {auction.winner.orderCode}</a>
      </p>
    )
  }
  const messages = {
    won: auction.winner ? `Phiên đã kết thúc. Giá thắng ${formatCurrency(auction.winner.price)} (${auction.winner.name}).` : '',
    ordered: auction.winner ? `Phiên đã kết thúc. Giá thắng ${formatCurrency(auction.winner.price)} (${auction.winner.name}).` : '',
    expired: auction.winner?.isYou ? 'Bạn đã thắng nhưng không đặt hàng đúng hạn, quyền mua đã bị huỷ.' : 'Người thắng không đặt hàng đúng hạn, sản phẩm đã về kho bán thường.',
    unsold: 'Phiên kết thúc mà không có ai trả giá; sản phẩm đã về kho bán thường.',
    cancelled: 'Cửa hàng đã huỷ phiên này; người đã trả giá không phải trả tiền.',
  }
  const text = messages[auction.status]
  return text ? <p className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm text-slate-700" role="status">{text}</p> : null
}
