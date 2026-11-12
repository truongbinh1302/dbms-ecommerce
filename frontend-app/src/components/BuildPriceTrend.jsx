import { useEffect, useMemo, useState } from 'react'
import { fetchBuildPriceTrend, fetchBuildWatches, watchBuild } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import { canonicalItems } from '../utils/buildPc'

const WIDTH = 360
const HEIGHT = 90
const PAD = 6

const TONE_CLASS = {
  good: 'bg-emerald-50 text-emerald-800',
  warn: 'bg-amber-50 text-amber-900',
  neutral: 'bg-slate-50 text-slate-700',
}

// '2026-11-12' → '12/11'
function formatDay(value) {
  const [, month, day] = String(value).split('-')
  return day && month ? `${day}/${month}` : value
}

/*
  "Nên mua lúc nào?" cho cả cấu hình: tổng giá các linh kiện cần mua cuối mỗi ngày trong 90 ngày,
  so với mức thấp nhất và trung bình; khách đăng nhập bật "Báo khi cả bộ rẻ hơn".
*/
export default function BuildPriceTrend({ items, title, currentUser, onRequireLogin }) {
  const lines = useMemo(() => canonicalItems(items), [items])
  const key = JSON.stringify(lines)
  const [trend, setTrend] = useState({ key: '', data: null })
  const [watch, setWatch] = useState({ key: '', busy: false, watching: null, error: '' })

  useEffect(() => {
    if (lines.length === 0) return undefined
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchBuildPriceTrend(JSON.parse(key))
        .then((data) => !cancelled && setTrend({ key, data }))
        .catch(() => !cancelled && setTrend({ key, data: null }))
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [key, lines.length])

  // Đã đăng nhập: xem cấu hình này đã được theo dõi chưa.
  useEffect(() => {
    if (!currentUser || lines.length === 0) return undefined
    let cancelled = false
    fetchBuildWatches()
      .then((list) => {
        if (cancelled) return
        const found = (Array.isArray(list) ? list : []).find((item) => JSON.stringify(item.items) === key) || null
        setWatch({ key, busy: false, watching: found, error: '' })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [currentUser, key, lines.length])

  const data = trend.key === key ? trend.data : null
  const chart = useMemo(() => {
    const known = (data?.points || []).map((point, index) => ({ ...point, index })).filter((point) => point.total !== null)
    if (known.length < 2) return null
    const totals = known.map((point) => point.total)
    const low = Math.min(...totals)
    const high = Math.max(...totals)
    const span = high - low || Math.max(high * 0.02, 1)
    const count = data.points.length - 1
    const x = (index) => PAD + (index / Math.max(count, 1)) * (WIDTH - PAD * 2)
    const y = (total) => PAD + (1 - (total - low) / span) * (HEIGHT - PAD * 2)
    return {
      path: known.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.index).toFixed(1)},${y(point.total).toFixed(1)}`).join(''),
      lowY: y(low),
      first: known[0],
    }
  }, [data])

  if (lines.length === 0) return null

  const currentWatch = watch.key === key ? watch : { busy: false, watching: null, error: '' }

  async function handleWatch() {
    if (!currentUser) {
      onRequireLogin?.()
      return
    }
    setWatch({ key, busy: true, watching: currentWatch.watching, error: '' })
    try {
      const saved = await watchBuild(lines, title)
      setWatch({ key, busy: false, watching: saved, error: '' })
    } catch (err) {
      setWatch({ key, busy: false, watching: currentWatch.watching, error: err.message || 'Không bật được theo dõi' })
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-bold text-slate-900">Nên mua lúc nào?</h3>
      {!data ? <p className="text-sm text-slate-500">Đang tính giá cả bộ theo ngày...</p> : null}
      {data?.insight ? (
        <p className={`rounded-xl px-3 py-2 text-sm ${TONE_CLASS[data.insight.tone] || TONE_CLASS.neutral}`}>{data.insight.text}</p>
      ) : null}
      {chart ? (
        <figure>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-20 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Tổng giá cả bộ ${data.days} ngày: thấp nhất ${formatCurrency(data.lowest.total)} ngày ${formatDay(data.lowest.date)}, cao nhất ${formatCurrency(data.highest.total)}, hôm nay ${formatCurrency(data.current)}`}
          >
            <line x1={PAD} x2={WIDTH - PAD} y1={chart.lowY} y2={chart.lowY} stroke="#e2e8f0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={chart.path} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <figcaption className="flex justify-between text-xs text-slate-500">
            <span>{formatDay(chart.first.date)}</span>
            <span>Hôm nay</span>
          </figcaption>
        </figure>
      ) : null}
      {data?.lowest ? (
        <dl className="grid grid-cols-2 gap-1 text-xs text-slate-600">
          <dt>Thấp nhất {data.days} ngày</dt>
          <dd className="text-right font-semibold text-slate-900">{formatCurrency(data.lowest.total)} ({formatDay(data.lowest.date)})</dd>
          <dt>Trung bình</dt>
          <dd className="text-right font-semibold text-slate-900">{formatCurrency(data.average)}</dd>
        </dl>
      ) : null}
      <p className="text-xs text-slate-500">Tính theo giá niêm yết của các linh kiện cần mua, không gồm Hot Deal.</p>

      {currentWatch.watching ? (
        <p className="text-sm text-emerald-700" role="status">
          Đang theo dõi từ mức {formatCurrency(currentWatch.watching.totalAtWatch)} (tính cả Hot Deal): cả bộ rẻ hơn sẽ có thông báo trong tài khoản.{' '}
          <a href={hrefFor('/build-pc/theo-doi')} className="font-semibold underline">Xem danh sách</a>
        </p>
      ) : (
        <button
          type="button"
          onClick={handleWatch}
          disabled={currentWatch.busy}
          className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-900 disabled:opacity-60"
        >
          {currentWatch.busy ? 'Đang bật...' : 'Báo khi cả bộ rẻ hơn'}
        </button>
      )}
      {currentWatch.error ? <p className="text-sm text-red-600" role="alert">{currentWatch.error}</p> : null}
    </div>
  )
}
