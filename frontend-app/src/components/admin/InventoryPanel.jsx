import { useEffect, useRef, useState } from 'react'
import {
  createStockReceipt,
  fetchLowStock,
  fetchProducts,
  fetchStockMovements,
  fetchStockReceipt,
  fetchStockReceipts,
} from '../../api/client'
import { formatCurrency } from '../../utils/format'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const ERROR_BOX = 'rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200'

const REASON_LABELS = {
  opening: 'Tồn đầu kỳ',
  receipt: 'Nhập kho',
  sale: 'Bán',
  cancel: 'Huỷ đơn, trả kho',
  adjust: 'Điều chỉnh',
}

let lineSeq = 0
const newLine = (product = null, quantity = '', unitCost = '') => {
  lineSeq += 1
  return { key: lineSeq, product, quantity: String(quantity), unitCost: unitCost === null ? '' : String(unitCost) }
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Ô chọn sản phẩm: gõ tên để tìm trong catalog (không gồm sản phẩm đã ẩn).
function ProductPicker({ value, onSelect, label }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function search(text) {
    setQuery(text)
    window.clearTimeout(timer.current)
    if (text.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = window.setTimeout(async () => {
      try {
        const data = await fetchProducts({ q: text.trim(), limit: 6 })
        setResults(Array.isArray(data?.items) ? data.items : [])
        setOpen(true)
      } catch {
        setResults([])
      }
    }, 250)
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-white">{value.name}</span>
          <span className="text-xs text-slate-400">Mã {value.id} · tồn {value.stock}</span>
        </span>
        <button type="button" onClick={() => onSelect(null)} className="shrink-0 text-xs font-bold text-slate-300 hover:text-white">
          Đổi
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => search(event.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Gõ tên sản phẩm..."
        aria-label={label}
        className={FIELD}
      />
      {open && results.length ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-white/10 bg-slate-900 py-1 shadow-xl" role="listbox">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect({ id: product.id, name: product.name, stock: product.stock })
                  setQuery('')
                  setResults([])
                  setOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10"
              >
                <span className="block truncate text-white">{product.name}</span>
                <span className="text-xs text-slate-400">Mã {product.id} · tồn {product.stock} · giá bán {formatCurrency(product.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ReceiptDetail({ receiptId, token }) {
  const [state, setState] = useState({ data: null, error: '' })
  useEffect(() => {
    let cancelled = false
    fetchStockReceipt(receiptId, token)
      .then((data) => !cancelled && setState({ data, error: '' }))
      .catch((err) => !cancelled && setState({ data: null, error: err.message || 'Không tải được phiếu' }))
    return () => {
      cancelled = true
    }
  }, [receiptId, token])

  if (state.error) return <p className="mt-2 text-sm text-red-200">{state.error}</p>
  if (!state.data) return <p className="mt-2 text-sm text-slate-400">Đang tải...</p>
  return (
    <div className="mt-3 space-y-1 text-sm">
      {state.data.note ? <p className="text-slate-400">Ghi chú: {state.data.note}</p> : null}
      {state.data.items.map((item) => (
        <div key={item.productId} className="flex justify-between gap-3 text-slate-200">
          <span className="min-w-0 truncate">{item.productName}</span>
          <span className="shrink-0 tabular-nums">{item.quantity} × {formatCurrency(item.unitCost)}</span>
        </div>
      ))}
      {state.data.createdBy ? <p className="pt-1 text-xs text-slate-500">Người nhập: {state.data.createdBy}</p> : null}
    </div>
  )
}

/* Nhập kho, cảnh báo sắp hết hàng, phiếu nhập gần đây và sổ kho. */
export default function InventoryPanel({ token, onChanged }) {
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState(() => [newLine()])
  const [submit, setSubmit] = useState({ busy: false, error: '', done: '' })
  const [lists, setLists] = useState({ version: -1, lowStock: [], lowStockError: '', receipts: [], receiptsError: '' })
  const [openReceipt, setOpenReceipt] = useState(null)
  const [ledgerFilter, setLedgerFilter] = useState({ reason: '', product: null })
  const [ledger, setLedger] = useState({ key: '', items: [], error: '' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      fetchLowStock({ threshold: 5, limit: 12 }, token),
      fetchStockReceipts({ limit: 8 }, token),
    ]).then(([low, recent]) => {
      if (cancelled) return
      setLists({
        version,
        lowStock: low.status === 'fulfilled' ? low.value.items || [] : [],
        lowStockError: low.status === 'fulfilled' ? '' : low.reason?.message || 'Lỗi tải dữ liệu',
        receipts: recent.status === 'fulfilled' ? recent.value.receipts || [] : [],
        receiptsError: recent.status === 'fulfilled' ? '' : recent.reason?.message || 'Lỗi tải dữ liệu',
      })
    })
    return () => {
      cancelled = true
    }
  }, [token, version])

  const ledgerKey = `${ledgerFilter.reason}|${ledgerFilter.product?.id || ''}|${version}`
  useEffect(() => {
    let cancelled = false
    const params = { reason: ledgerFilter.reason, productId: ledgerFilter.product?.id, limit: 30 }
    fetchStockMovements(params, token)
      .then((items) => !cancelled && setLedger({ key: ledgerKey, items: Array.isArray(items) ? items : [], error: '' }))
      .catch((err) => !cancelled && setLedger({ key: ledgerKey, items: [], error: err.message || 'Không tải được sổ kho' }))
    return () => {
      cancelled = true
    }
  }, [ledgerFilter, ledgerKey, token])
  const ledgerLoading = ledger.key !== ledgerKey

  function updateLine(key, patch) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function addFromLowStock(item) {
    const product = { id: item.productId, name: item.name, stock: item.stock }
    const suggested = Math.max(5, item.sold30 - item.stock)
    setLines((current) => {
      if (current.some((line) => line.product?.id === product.id)) return current
      const blanks = current.filter((line) => line.product || line.quantity || line.unitCost)
      return [...blanks, newLine(product, suggested, item.lastUnitCost)]
    })
    setSubmit({ busy: false, error: '', done: '' })
  }

  const filledLines = lines.filter((line) => line.product)
  const totalCost = filledLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0)
  const totalQuantity = filledLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supplier.trim()) {
      setSubmit({ busy: false, error: 'Vui lòng nhập tên nhà cung cấp', done: '' })
      return
    }
    if (!filledLines.length) {
      setSubmit({ busy: false, error: 'Chọn ít nhất một sản phẩm', done: '' })
      return
    }
    setSubmit({ busy: true, error: '', done: '' })
    try {
      const receipt = await createStockReceipt({
        supplier,
        note,
        items: filledLines.map((line) => ({
          productId: line.product.id,
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      }, token)
      setSubmit({ busy: false, error: '', done: `Đã nhập kho phiếu ${receipt.code}: ${receipt.totalQuantity} sản phẩm, ${formatCurrency(receipt.totalCost)}` })
      setSupplier('')
      setNote('')
      setLines([newLine()])
      setOpenReceipt(receipt.id)
      setVersion((current) => current + 1)
      onChanged?.()
    } catch (err) {
      setSubmit({ busy: false, error: err.message || 'Không tạo được phiếu nhập', done: '' })
    }
  }

  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-label="Kho hàng">
      <div className="space-y-6">
        <form onSubmit={handleSubmit} className={PANEL} aria-labelledby="receipt-title">
          <h3 id="receipt-title" className="text-2xl font-black">Phiếu nhập kho</h3>
          <p className="text-sm text-slate-400">Tồn kho cộng ngay khi lưu phiếu; mỗi dòng được ghi vào sổ kho.</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Nhà cung cấp
              <input value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={200} className={`${FIELD} mt-1`} placeholder="Ví dụ: Công ty Phân phối ABC" />
            </label>
            <label className="text-sm text-slate-300">
              Ghi chú
              <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className={`${FIELD} mt-1`} placeholder="Số hoá đơn, lô hàng..." />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            <div className="hidden grid-cols-[1fr_96px_150px_32px] gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:grid">
              <span>Sản phẩm</span>
              <span>Số lượng</span>
              <span>Giá nhập / sp</span>
              <span />
            </div>
            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_96px_150px_32px] sm:items-start">
                <ProductPicker value={line.product} label={`Sản phẩm dòng ${index + 1}`} onSelect={(product) => updateLine(line.key, { product })} />
                <input type="number" min="1" max="100000" step="1" inputMode="numeric" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} aria-label={`Số lượng dòng ${index + 1}`} placeholder="SL" className={FIELD} />
                <input type="number" min="0" step="any" inputMode="decimal" value={line.unitCost} onChange={(event) => updateLine(line.key, { unitCost: event.target.value })} aria-label={`Giá nhập dòng ${index + 1}`} placeholder="Giá nhập" className={FIELD} />
                <button
                  type="button"
                  onClick={() => setLines((current) => (current.length > 1 ? current.filter((item) => item.key !== line.key) : [newLine()]))}
                  aria-label={`Xoá dòng ${index + 1}`}
                  className="h-10 rounded-2xl text-lg font-bold text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setLines((current) => [...current, newLine()])} disabled={lines.length >= 100} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-50">
              + Thêm dòng
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-sm text-slate-300">
              {totalQuantity.toLocaleString('vi-VN')} sản phẩm · <strong className="text-white">{formatCurrency(totalCost)}</strong>
            </p>
            <button type="submit" disabled={submit.busy} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
              {submit.busy ? 'Đang lưu...' : 'Lưu phiếu nhập'}
            </button>
          </div>
          <div aria-live="polite">
            {submit.error ? <p className={`${ERROR_BOX} mt-3`}>{submit.error}</p> : null}
            {submit.done ? <p className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">{submit.done}</p> : null}
          </div>
        </form>

        <div className={PANEL}>
          <h3 className="text-xl font-black">Phiếu nhập gần đây</h3>
          {lists.receiptsError ? <p className={`${ERROR_BOX} mt-3`}>{lists.receiptsError}</p> : null}
          {!lists.receiptsError && lists.version >= 0 && lists.receipts.length === 0 ? <p className="mt-3 text-sm text-slate-400">Chưa có phiếu nhập nào.</p> : null}
          <ul className="mt-3 divide-y divide-white/10">
            {lists.receipts.map((receipt) => (
              <li key={receipt.id} className="py-3">
                <button type="button" onClick={() => setOpenReceipt((current) => (current === receipt.id ? null : receipt.id))} aria-expanded={openReceipt === receipt.id} className="flex w-full items-start justify-between gap-3 text-left">
                  <span className="min-w-0">
                    <span className="font-bold text-white">{receipt.code}</span>
                    <span className="block truncate text-sm text-slate-400">{receipt.supplier} · {formatDateTime(receipt.createdAt)}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="block font-bold text-white">{formatCurrency(receipt.totalCost)}</span>
                    <span className="text-slate-400">{receipt.totalQuantity} sp · {receipt.lineCount} dòng</span>
                  </span>
                </button>
                {openReceipt === receipt.id ? <ReceiptDetail receiptId={receipt.id} token={token} /> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-6">
        <div className={PANEL}>
          <h3 className="text-xl font-black">Sắp hết hàng</h3>
          <p className="text-sm text-slate-400">Tồn từ 5 trở xuống, xếp theo tồn thấp và bán chạy 30 ngày qua.</p>
          {lists.lowStockError ? <p className={`${ERROR_BOX} mt-3`}>{lists.lowStockError}</p> : null}
          {!lists.lowStockError && lists.version >= 0 && lists.lowStock.length === 0 ? <p className="mt-3 text-sm text-slate-400">Không có sản phẩm nào sắp hết.</p> : null}
          <ul className="mt-3 space-y-2">
            {lists.lowStock.map((item) => (
              <li key={item.productId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{item.name}</span>
                  <span className="text-xs text-slate-400">
                    Còn <strong className="text-white">{item.stock}</strong> · bán 30 ngày: {item.sold30}
                    {item.lastUnitCost !== null ? ` · giá nhập gần nhất ${formatCurrency(item.lastUnitCost)}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setLedgerFilter({ reason: '', product: { id: item.productId, name: item.name } })} className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10">
                    Sổ kho
                  </button>
                  <button type="button" onClick={() => addFromLowStock(item)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-slate-200">
                    Nhập thêm
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-black">Sổ kho</h3>
            <select value={ledgerFilter.reason} onChange={(event) => setLedgerFilter((current) => ({ ...current, reason: event.target.value }))} aria-label="Lọc theo loại" className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="">Mọi loại</option>
              {Object.entries(REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {ledgerFilter.product ? (
            <p className="mt-2 text-sm text-slate-300">
              Sản phẩm: <strong className="text-white">{ledgerFilter.product.name}</strong>{' '}
              <button type="button" onClick={() => setLedgerFilter((current) => ({ ...current, product: null }))} className="font-bold text-sky-300 hover:underline">Bỏ lọc</button>
            </p>
          ) : null}
          {ledger.error ? <p className={`${ERROR_BOX} mt-3`}>{ledger.error}</p> : null}
          <div className={`mt-3 max-h-96 overflow-auto rounded-2xl border border-white/10 ${ledgerLoading ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-2">Thời gian</th>
                  <th scope="col" className="px-3 py-2">Sản phẩm</th>
                  <th scope="col" className="px-3 py-2">Loại</th>
                  <th scope="col" className="px-3 py-2 text-right">Thay đổi</th>
                  <th scope="col" className="px-3 py-2 text-right">Tồn sau</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {ledger.items.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{formatDateTime(row.createdAt)}</td>
                    <td className="max-w-[180px] px-3 py-2">
                      <button type="button" onClick={() => setLedgerFilter((current) => ({ ...current, product: { id: row.productId, name: row.productName } }))} className="block max-w-full truncate text-left hover:underline">
                        {row.productName}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {REASON_LABELS[row.reason] || row.reason}
                      <span className="block text-xs text-slate-500">{row.receiptCode || row.orderCode || (row.reason === 'opening' ? '' : row.note) || ''}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{row.change > 0 ? `+${row.change}` : row.change}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.stockAfter}</td>
                  </tr>
                ))}
                {!ledgerLoading && ledger.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Chưa có dòng nào.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
