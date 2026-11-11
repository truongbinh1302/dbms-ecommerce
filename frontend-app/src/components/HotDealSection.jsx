import { useEffect, useMemo, useState } from 'react'
import { fetchActivePromotions } from '../api/client'
import useCountdown, { formatClockTime, formatCountdown } from '../hooks/useCountdown'
import { mapApiProductToStoreProduct } from '../utils/productMapping'
import { formatCurrency } from '../utils/format'
import StoreGlyph from './StoreGlyph'

const REFRESH_MS = 60000

function discountPercent(product) {
  if (!product.oldPrice || product.oldPrice <= product.price) return 0
  return Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
}

function DealItem({ product, upcoming, onOpen, onAddToCart }) {
  const promo = product.promotion
  const limit = promo?.quantityLimit
  const sold = promo?.soldCount || 0
  const soldOut = limit !== null && limit !== undefined && sold >= limit
  const salePrice = promo?.salePrice ?? product.price
  const listPrice = product.listPrice ?? product.price
  const percent = listPrice > salePrice ? Math.round(((listPrice - salePrice) / listPrice) * 100) : 0

  return (
    <li className="flex items-center gap-4 rounded-[28px] bg-white/6 p-4">
      <button type="button" onClick={() => onOpen(product)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
          <StoreGlyph name={product.visual?.kind === 'desktop' ? 'desktop' : product.visual?.kind} className="size-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold">{product.name}</h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-black text-red-200">{formatCurrency(salePrice)}</span>
            {percent > 0 ? <span className="text-white/50 line-through">{formatCurrency(listPrice)}</span> : null}
            {percent > 0 ? <span className="font-bold text-white">-{percent}%</span> : null}
          </p>
          {limit ? (
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-white/15" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${Math.min((sold / limit) * 100, 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-white/70">
                {soldOut ? 'Đã hết suất' : `Đã bán ${sold}/${limit} suất`}
                {promo?.perOrderLimit ? ` · tối đa ${promo.perOrderLimit}/đơn` : ''}
              </p>
            </div>
          ) : promo?.perOrderLimit ? (
            <p className="mt-1 text-xs text-white/70">Tối đa {promo.perOrderLimit} sản phẩm mỗi đơn</p>
          ) : null}
        </div>
      </button>
      {!upcoming && !soldOut && product.stock > 0 ? (
        <button
          type="button"
          onClick={() => onAddToCart(product)}
          aria-label={`Thêm ${product.name} vào giỏ`}
          className="shrink-0 rounded-2xl bg-red-600 p-3 text-white transition hover:bg-red-500"
        >
          <StoreGlyph name="cart" className="size-5" />
        </button>
      ) : null}
    </li>
  )
}

/*
  Khối Hot Deal ở trang chủ: chương trình khuyến mãi thật từ server (giờ kết thúc, số suất).
  Không có chương trình nào thì hiện sản phẩm đang có giá thấp hơn giá gốc (fallbackProducts).
*/
export default function HotDealSection({ fallbackProducts, onOpen, onAddToCart }) {
  const [data, setData] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()
    fetchActivePromotions()
      .then((result) => {
        if (cancelled) return
        const serverNow = new Date(result.serverNow).getTime()
        // Giờ máy chủ lúc trả lời ≈ giữa lúc gửi và lúc nhận.
        const offsetMs = Number.isFinite(serverNow) ? serverNow - (startedAt + Date.now()) / 2 : 0
        setData({ ...result, offsetMs })
      })
      .catch(() => {
        if (!cancelled) setData({ running: [], upcoming: [], offsetMs: 0 })
      })
    const timer = window.setTimeout(() => setVersion((value) => value + 1), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [version])

  const running = data?.running?.[0] || null
  const upcoming = !running ? data?.upcoming?.[0] || null : null
  const current = running || upcoming
  const target = running ? running.endsAt : upcoming ? upcoming.startsAt : null
  const left = useCountdown(target, data?.offsetMs || 0)

  // Hết giờ (chương trình kết thúc hoặc vừa bắt đầu): tải lại ngay.
  useEffect(() => {
    if (!target || left > 0) return undefined
    const timer = window.setTimeout(() => setVersion((value) => value + 1), 1500)
    return () => window.clearTimeout(timer)
  }, [target, left])

  const items = useMemo(
    () => (current ? current.items.map(mapApiProductToStoreProduct).slice(0, 4) : []),
    [current],
  )
  const fallback = useMemo(
    () => fallbackProducts.filter((product) => discountPercent(product) > 0)
      .sort((a, b) => discountPercent(b) - discountPercent(a))
      .slice(0, 3),
    [fallbackProducts],
  )
  const maxFallbackPercent = fallback.length ? discountPercent(fallback[0]) : 0

  if (!current && fallback.length === 0) return null

  return (
    <section id="hot-deal" className="mt-5 scroll-mt-40 overflow-hidden rounded-[36px] bg-slate-950 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]" aria-labelledby="hot-deal-title">
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-red-200">
            {running ? 'Hot Deal đang diễn ra' : upcoming ? 'Hot Deal sắp mở' : 'Đang giảm giá'}
          </div>
          <h2 id="hot-deal-title" className="mt-4 text-4xl font-black leading-tight">
            {current ? current.name : 'Sản phẩm đang có giá tốt'}
          </h2>
          {current ? (
            <div className="mt-4">
              <p className="text-sm uppercase tracking-[0.2em] text-white/60">{running ? 'Kết thúc sau' : 'Bắt đầu sau'}</p>
              <p className="mt-1 font-mono text-4xl font-black tabular-nums" aria-live="off">{formatCountdown(left)}</p>
              <p className="mt-2 text-sm text-white/70">
                {running ? `Giá áp dụng đến ${formatClockTime(running.endsAt)}` : `Mở lúc ${formatClockTime(upcoming.startsAt)}`}
                {' '}(giờ Việt Nam). Giá được tính lại ở bước thanh toán.
              </p>
            </div>
          ) : maxFallbackPercent > 0 ? (
            <p className="mt-3 text-lg text-white/80">Giảm tới {maxFallbackPercent}% so với giá gốc</p>
          ) : null}
        </div>

        <ul className="grid grid-cols-1 gap-3">
          {current
            ? items.map((product) => (
              <DealItem key={product.id} product={product} upcoming={!running} onOpen={onOpen} onAddToCart={onAddToCart} />
            ))
            : fallback.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onOpen(product)}
                  className="flex w-full items-center gap-4 rounded-[28px] bg-white/6 p-4 text-left backdrop-blur-sm transition hover:bg-white/10"
                >
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-white/10 text-white">
                    <StoreGlyph name={product.visual?.kind === 'desktop' ? 'desktop' : product.visual?.kind} className="size-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold">{product.name}</h3>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-red-200">
                      <span>{formatCurrency(product.price)}</span>
                      <span className="text-white/50 line-through">{formatCurrency(product.oldPrice)}</span>
                    </p>
                  </div>
                  <StoreGlyph name="chevron-right" className="size-5 text-white/70" />
                </button>
              </li>
            ))}
        </ul>
      </div>
    </section>
  )
}
