import { useEffect, useMemo, useState } from 'react'
import { fetchPriceHistory } from '../api/client'
import { formatCurrency } from '../utils/format'

const WIDTH = 640
const HEIGHT = 170
const PAD = { top: 16, right: 12, bottom: 26, left: 12 }

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/*
  Lịch sử giá dạng đường bậc thang: giá giữ nguyên tới lần đổi kế tiếp.
  Một chuỗi số liệu nên không cần chú thích; rê chuột/chạm để xem giá từng mốc,
  và có bảng các lần đổi giá cho người không xem được biểu đồ.
*/
export default function PriceHistory({ productId }) {
  // loadedAt: thời điểm nhận dữ liệu, làm mốc "hôm nay" cho trục thời gian.
  const [state, setState] = useState({ id: null, data: null, loadedAt: 0 })
  const [hoverIndex, setHoverIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchPriceHistory(productId)
      .then((data) => {
        if (!cancelled) setState({ id: productId, data, loadedAt: Date.now() })
      })
      .catch(() => {
        if (!cancelled) setState({ id: productId, data: null, loadedAt: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  const data = state.id === productId ? state.data : null
  const now = state.loadedAt

  const chart = useMemo(() => {
    if (!data || data.points.length === 0) return null
    const windowStart = now - data.days * 24 * 60 * 60 * 1000
    // Mốc trước khoảng xem được kéo về đầu khoảng để đường giá bắt đầu từ mép trái.
    const steps = data.points.map((point) => ({
      ...point,
      time: Math.max(new Date(point.changedAt).getTime(), windowStart),
    }))
    // Trục thời gian bắt đầu từ mốc giá đầu tiên (sản phẩm mới bán thì không để trống phần trước đó).
    const minTime = steps[0].time
    const prices = steps.map((step) => step.price)
    const low = Math.min(...prices)
    const high = Math.max(...prices)
    const span = high - low || Math.max(high * 0.1, 1)
    const x = (time) => PAD.left + ((time - minTime) / Math.max(now - minTime, 1)) * (WIDTH - PAD.left - PAD.right)
    const y = (price) => PAD.top + (1 - (price - (low - span * 0.15)) / (span * 1.3)) * (HEIGHT - PAD.top - PAD.bottom)

    let path = ''
    steps.forEach((step, index) => {
      const sx = x(step.time)
      const sy = y(step.price)
      path += index === 0 ? `M${sx},${sy}` : `H${sx}V${sy}`
    })
    path += `H${x(now)}`

    return {
      steps: steps.map((step) => ({ ...step, cx: x(step.time), cy: y(step.price) })),
      path,
      lowY: y(low),
      highY: y(high),
      startLabel: formatDate(minTime),
    }
  }, [data, now])

  if (!data) return null

  const changes = data.points.length - 1
  const hovered = hoverIndex !== null && chart ? chart.steps[hoverIndex] : null

  function handlePointer(event) {
    if (!chart) return
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH
    // Mốc đang có hiệu lực tại vị trí con trỏ: mốc cuối cùng nằm bên trái con trỏ.
    let index = 0
    chart.steps.forEach((step, i) => {
      if (step.cx <= px) index = i
    })
    setHoverIndex(index)
  }

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-black text-slate-900">Lịch sử giá</h2>
        <p className="text-sm text-slate-500">
          {changes === 0
            ? 'Giá không đổi trong khoảng này.'
            : `${changes} lần đổi giá · thấp nhất ${formatCurrency(data.lowestPrice)} · cao nhất ${formatCurrency(data.highestPrice)}`}
        </p>
      </div>

      {data.currentPrice <= data.lowestPrice && changes > 0 ? (
        <p className="mt-2 text-sm font-semibold text-emerald-700">Giá hiện tại là mức thấp nhất trong {data.days} ngày qua.</p>
      ) : null}

      {chart && changes > 0 ? (
        <div className="relative mt-4">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-44 w-full touch-none"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Biểu đồ giá: thấp nhất ${formatCurrency(data.lowestPrice)}, cao nhất ${formatCurrency(data.highestPrice)}, hiện tại ${formatCurrency(data.currentPrice)}`}
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.highY} y2={chart.highY} stroke="#e2e8f0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.lowY} y2={chart.lowY} stroke="#e2e8f0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={chart.path} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {hovered ? (
              <line x1={hovered.cx} x2={hovered.cx} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ) : null}
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" />
          </svg>
          {hovered ? (
            <>
              <span
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600"
                style={{ left: `${(hovered.cx / WIDTH) * 100}%`, top: `${(hovered.cy / HEIGHT) * 100}%` }}
              />
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
                style={{ left: `${Math.min(Math.max((hovered.cx / WIDTH) * 100, 12), 88)}%` }}
              >
                <div className="font-bold">{formatCurrency(hovered.price)}</div>
                <div className="text-slate-300">từ {formatDate(hovered.changedAt)}</div>
              </div>
            </>
          ) : null}
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>{chart.startLabel}</span>
            <span>Hôm nay</span>
          </div>
        </div>
      ) : null}

      {changes > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-600">Xem bảng các lần đổi giá</summary>
          <table className="mt-2 w-full text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 font-semibold">Từ ngày</th>
                <th className="py-1 text-right font-semibold">Giá bán</th>
              </tr>
            </thead>
            <tbody>
              {[...data.points].reverse().map((point) => (
                <tr key={`${point.changedAt}-${point.price}`} className="border-t border-slate-100">
                  <td className="py-1 text-slate-700">{formatDate(point.changedAt)}</td>
                  <td className="py-1 text-right font-semibold text-slate-900">{formatCurrency(point.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  )
}
