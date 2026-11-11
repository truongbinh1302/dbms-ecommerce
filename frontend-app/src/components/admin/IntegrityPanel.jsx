import { useState } from 'react'
import { fetchIntegrityReport } from '../../api/client'
import { formatDateTime } from '../../utils/orderLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'

// Tên cột dễ đọc cho các dòng mẫu.
const COLUMN_LABELS = {
  id: 'ID', name: 'Sản phẩm', code: 'Mã', stock: 'Tồn', ledger: 'Theo sổ kho', subtotal: 'Tạm tính', discount: 'Giảm',
  shippingFee: 'Phí giao', total: 'Tổng', lineTotal: 'Theo dòng', usedCount: 'Đã dùng', usages: 'Theo đơn',
  status: 'Trạng thái', lastHistory: 'Lịch sử cuối',
}

function SampleTable({ rows }) {
  const columns = Object.keys(rows[0] || {})
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr>{columns.map((column) => <th key={column} scope="col" className="px-2 py-1 font-bold text-slate-300">{COLUMN_LABELS[column] || column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`}>
              {columns.map((column) => <td key={column} className="px-2 py-1 text-slate-100">{row[column] === null ? '—' : String(row[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/*
  Kiểm tra toàn vẹn dữ liệu: chạy các bất biến (tồn kho = sổ kho, tổng tiền đơn, lượt dùng voucher, lịch sử trạng thái).
  Chỉ đọc; dòng sai nghĩa là dữ liệu bị sửa thẳng trong DB hoặc có lỗi cần tìm.
*/
export default function IntegrityPanel({ token }) {
  const [state, setState] = useState({ busy: false, report: null, error: '' })

  async function run() {
    setState((current) => ({ ...current, busy: true, error: '' }))
    try {
      setState({ busy: false, report: await fetchIntegrityReport(token), error: '' })
    } catch (err) {
      setState((current) => ({ ...current, busy: false, error: err.message || 'Không chạy được kiểm tra' }))
    }
  }

  const report = state.report
  return (
    <section className={PANEL} aria-labelledby="integrity-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="integrity-title" className="text-2xl font-black">Kiểm tra toàn vẹn dữ liệu</h3>
          <p className="text-sm text-slate-300">Đối chiếu tồn kho với sổ kho, tổng tiền đơn, lượt dùng mã giảm giá và lịch sử trạng thái. Chỉ đọc, không sửa gì.</p>
        </div>
        <button type="button" onClick={run} disabled={state.busy} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-60">
          {state.busy ? 'Đang kiểm tra...' : report ? 'Chạy lại' : 'Chạy kiểm tra'}
        </button>
      </div>
      {state.error ? <p className="mt-4 text-sm font-semibold text-red-300" role="alert">{state.error}</p> : null}
      {report ? (
        <div className="mt-4 space-y-3" role="status">
          <p className={`text-sm font-bold ${report.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
            {report.ok ? 'Mọi kiểm tra đều đạt.' : `${report.checks.filter((item) => !item.ok).length} kiểm tra có dòng sai.`}
            <span className="font-normal text-slate-300"> · {formatDateTime(report.checkedAt)} · {report.durationMs} ms</span>
          </p>
          <ul className="space-y-2">
            {report.checks.map((item) => (
              <li key={item.key} className={`rounded-2xl border p-3 text-sm ${item.ok ? 'border-white/10' : 'border-amber-300/40 bg-amber-400/10'}`}>
                <p className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span>
                  <strong>{item.label}</strong>
                  <span className="text-slate-300">— {item.ok ? 'đạt' : `${item.problems} dòng sai`}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-300">{item.rule}</p>
                {!item.ok && item.sample.length ? <SampleTable rows={item.sample} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
