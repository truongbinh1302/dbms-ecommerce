import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDailyReport } from '../../api/client'
import { formatCurrency } from '../../utils/format'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const BAR_COLOR = '#3987e5'
const PRESETS = [7, 30, 90]

// Ngày hôm nay theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD.
function vietnamToday() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
}

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function shortDate(isoDate) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

function fullDate(isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

const COLUMNS = [
  { key: 'date', label: 'Ngày', csv: (row) => fullDate(row.date) },
  { key: 'orders', label: 'Số đơn' },
  { key: 'cancelledOrders', label: 'Đơn huỷ' },
  { key: 'netSales', label: 'Doanh số (trừ đơn huỷ)', money: true },
  { key: 'paidAmount', label: 'Đã thu tiền', money: true },
  { key: 'unitsSold', label: 'Sản phẩm bán' },
  { key: 'newCustomers', label: 'Khách mới' },
  { key: 'unitsReceived', label: 'SL nhập kho' },
  { key: 'receiptCost', label: 'Tiền nhập', money: true },
  { key: 'returnRequests', label: 'Yêu cầu đổi trả' },
  { key: 'refunds', label: 'Tiền hoàn', money: true },
]

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(report) {
  const header = COLUMNS.map((column) => column.label)
  const rows = report.days.map((row) => COLUMNS.map((column) => (column.csv ? column.csv(row) : row[column.key])))
  rows.push(COLUMNS.map((column) => (column.key === 'date' ? 'Tổng' : report.totals[column.key])))
  // BOM để Excel đọc đúng tiếng Việt.
  const text = `${String.fromCharCode(0xfeff)}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `bao-cao-ngay_${report.from}_${report.to}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

// Cột doanh số theo ngày: một chuỗi số liệu, rê chuột hoặc Tab vào cột để xem chi tiết.
function SalesColumns({ days }) {
  const [active, setActive] = useState(null)
  const max = Math.max(...days.map((day) => day.netSales), 0)
  const current = active === null ? null : days[active]
  const labelEvery = Math.ceil(days.length / 8)

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <h4 className="font-bold text-white">Doanh số theo ngày</h4>
        <p className="min-h-5 text-right text-slate-300" aria-live="polite">
          {current
            ? `${fullDate(current.date)}: ${formatCurrency(current.netSales)} · ${current.orders} đơn`
            : `Cao nhất ${formatCurrency(max)}`}
        </p>
      </div>
      <div className="relative mt-3 h-40 border-b border-white/20" onMouseLeave={() => setActive(null)}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-white/10" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-white/10" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((day, index) => {
            const height = max > 0 ? Math.max((day.netSales / max) * 100, day.netSales > 0 ? 1.5 : 0) : 0
            return (
              <button
                key={day.date}
                type="button"
                aria-label={`${fullDate(day.date)}: doanh số ${formatCurrency(day.netSales)}, ${day.orders} đơn`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              >
                <span
                  className={`block w-full max-w-6 rounded-t-[4px] transition-opacity ${active === null || active === index ? 'opacity-100' : 'opacity-50'} group-focus-visible:ring-2 group-focus-visible:ring-white`}
                  style={{ height: `${height}%`, backgroundColor: BAR_COLOR }}
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-[2px] text-[11px] text-slate-400" aria-hidden="true">
        {days.map((day, index) => (
          <span key={day.date} className="min-w-0 flex-1 text-center">
            {index % labelEvery === 0 ? shortDate(day.date) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/* Báo cáo theo ngày (giờ Việt Nam) cho admin: chọn khoảng ngày, xem biểu đồ, bảng và tải CSV. */
export default function DailyReport({ token, refreshKey = 0 }) {
  const [range, setRange] = useState(() => {
    const to = vietnamToday()
    return { from: shiftDate(to, -29), to }
  })
  const [state, setState] = useState({ loading: true, error: '', report: null })

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const report = await fetchDailyReport(range, token)
      setState({ loading: false, error: '', report })
    } catch (err) {
      setState((current) => ({ ...current, loading: false, error: err.message || 'Không tải được báo cáo' }))
    }
  }, [range, token])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const report = state.report
  const days = useMemo(() => report?.days || [], [report])
  const totals = report?.totals

  function applyPreset(size) {
    const to = vietnamToday()
    setRange({ from: shiftDate(to, -(size - 1)), to })
  }

  const activePreset = PRESETS.find((size) => range.to === vietnamToday() && range.from === shiftDate(range.to, -(size - 1)))

  return (
    <section className={PANEL} aria-labelledby="daily-report-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 id="daily-report-title" className="text-2xl font-black">Báo cáo theo ngày</h3>
          <p className="text-sm text-slate-400">Chia ngày theo giờ Việt Nam. Doanh số không tính đơn đã huỷ.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => applyPreset(size)}
              aria-pressed={activePreset === size}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${activePreset === size ? 'bg-white text-slate-950' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {size} ngày
            </button>
          ))}
          <label className="text-xs text-slate-400">
            Từ
            <input type="date" value={range.from} max={range.to} onChange={(event) => event.target.value && setRange((r) => ({ ...r, from: event.target.value }))} className={`${FIELD} mt-1 block`} />
          </label>
          <label className="text-xs text-slate-400">
            Đến
            <input type="date" value={range.to} min={range.from} onChange={(event) => event.target.value && setRange((r) => ({ ...r, to: event.target.value }))} className={`${FIELD} mt-1 block`} />
          </label>
          <button
            type="button"
            disabled={!report}
            onClick={() => downloadCsv(report)}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            Tải CSV
          </button>
        </div>
      </div>

      {state.error ? (
        <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{state.error}</div>
      ) : null}

      {totals ? (
        <>
          <div className={`mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${state.loading ? 'opacity-60' : ''}`}>
            <Tile
              label="Doanh số"
              value={formatCurrency(totals.netSales)}
              hint={`Đã thu ${formatCurrency(totals.paidAmount)}${totals.refunds ? ` · đã hoàn ${formatCurrency(totals.refunds)}` : ''}`}
            />
            <Tile label="Đơn hàng" value={totals.orders.toLocaleString('vi-VN')} hint={`${totals.cancelledOrders.toLocaleString('vi-VN')} đơn huỷ`} />
            <Tile label="Sản phẩm bán" value={totals.unitsSold.toLocaleString('vi-VN')} hint={`${totals.newCustomers.toLocaleString('vi-VN')} khách mới`} />
            <Tile label="Nhập kho" value={`${totals.unitsReceived.toLocaleString('vi-VN')} sp`} hint={`${totals.receipts} phiếu · ${formatCurrency(totals.receiptCost)}`} />
          </div>

          <SalesColumns days={days} />

          <div className="mt-6 max-h-80 overflow-auto rounded-[24px] border border-white/10" tabIndex={0} role="region" aria-label="Bảng số liệu theo ngày">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Số liệu từng ngày từ {fullDate(report.from)} đến {fullDate(report.to)}</caption>
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className={`px-3 py-2 font-bold ${column.key === 'date' ? '' : 'text-right'}`}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[...days].reverse().map((day) => (
                  <tr key={day.date} className={day.orders === 0 && day.unitsReceived === 0 ? 'text-slate-400' : 'text-slate-200'}>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className={`px-3 py-2 ${column.key === 'date' ? 'font-semibold' : 'text-right tabular-nums'}`}>
                        {column.key === 'date' ? fullDate(day.date) : column.money ? formatCurrency(day[column.key]) : day[column.key].toLocaleString('vi-VN')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : state.loading ? (
        <p className="mt-6 text-sm text-slate-300">Đang tải báo cáo...</p>
      ) : null}
    </section>
  )
}
