import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { fetchBuildQuote } from '../api/client'
import { hrefFor, navigate } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import { partsToBuild, saveBuild } from '../utils/buildPc'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function timeLeft(value, now) {
  const ms = new Date(value).getTime() - now
  if (!(ms > 0)) return ''
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  return hours > 0 ? `còn ${hours} giờ ${minutes} phút` : `còn ${minutes} phút`
}

/*
  Trang báo giá chia sẻ được (#/bao-gia/:code): giá đã báo, giá hiện tại,
  kết quả kiểm tra tương thích và nút mua theo giá đã giữ.
*/
export default function QuotePage({ code, onBuyBuild }) {
  const [state, setState] = useState({ code: null, quote: null, error: '', loadedAt: 0 })

  useEffect(() => {
    let cancelled = false
    fetchBuildQuote(code)
      .then((quote) => {
        if (!cancelled) setState({ code, quote, error: '', loadedAt: Date.now() })
      })
      .catch((err) => {
        if (!cancelled) setState({ code, quote: null, error: err.message || 'Không tải được báo giá', loadedAt: 0 })
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (state.code !== code) return <PageMessage title="Đang tải báo giá..." />
  const { quote } = state
  if (!quote) {
    return (
      <PageMessage
        title="Không tìm thấy báo giá"
        description={state.error}
        action={<a href={hrefFor('/build-pc')} className="font-bold text-red-600">Tự build cấu hình mới</a>}
      />
    )
  }

  const quotedTotal = quote.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const payable = quote.items.reduce((sum, item) => {
    const current = item.currentPrice ?? item.unitPrice
    const unit = quote.expired ? current : Math.min(current, item.unitPrice)
    return sum + unit * item.quantity
  }, 0)
  const outOfStock = quote.items.filter((item) => item.stock < item.quantity)
  const check = quote.check

  function handleBuy() {
    // Bỏ linh kiện đã ngừng bán; tồn kho được kiểm tra lại ở bước thanh toán.
    const parts = quote.items
      .filter((item) => item.currentPrice !== null)
      .map((item) => ({ ...item, price: item.currentPrice }))
    onBuyBuild(parts, quote.expired ? '' : quote.code)
  }

  function handleEdit() {
    saveBuild(partsToBuild([
      ...quote.items,
      ...quote.owned.map((item) => ({ ...item, owned: true })),
    ]))
    navigate('/build-pc')
  }

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Báo giá cấu hình</p>
            <h1 className="text-2xl font-black text-slate-900">{quote.title || `Báo giá ${quote.code}`}</h1>
            <p className="mt-1 text-sm text-slate-500">Mã {quote.code} · tạo lúc {formatDateTime(quote.createdAt)}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${quote.expired ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
            {quote.expired ? 'Đã hết hạn giữ giá' : `Giữ giá đến ${formatDateTime(quote.expiresAt)} (${timeLeft(quote.expiresAt, state.loadedAt)})`}
          </span>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 font-semibold">Linh kiện</th>
                <th className="py-2 text-right font-semibold">SL</th>
                <th className="py-2 text-right font-semibold">Giá báo</th>
                <th className="py-2 text-right font-semibold">Giá hiện tại</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => {
                const diff = item.currentPrice === null ? 0 : item.currentPrice - item.unitPrice
                return (
                  <tr key={item.productId} className="border-t border-slate-100">
                    <td className="py-2">
                      <a href={hrefFor(`/san-pham/${item.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">{item.name}</a>
                      {item.stock < item.quantity ? <span className="block text-xs text-red-600">Hiện chỉ còn {item.stock}</span> : null}
                    </td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right font-semibold">{formatCurrency(item.unitPrice)}</td>
                    <td className={`py-2 text-right ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {item.currentPrice === null ? 'Ngừng bán' : formatCurrency(item.currentPrice)}
                      {diff !== 0 && item.currentPrice !== null ? <span className="block text-xs">{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {quote.owned.length > 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Linh kiện khách đã có (không tính tiền): {quote.owned.map((item) => item.name).join(', ')}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 border-t border-dashed border-slate-200 pt-5 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            {check.errors.length === 0 ? (
              <p className="rounded-2xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">✓ Các linh kiện tương thích với nhau.</p>
            ) : check.errors.map((error) => (
              <p key={`${error.code}-${error.message}`} className="rounded-2xl bg-red-50 px-3 py-2 text-red-700">✕ {error.message}</p>
            ))}
            {check.warnings.map((warning) => (
              <p key={warning.code} className="rounded-2xl bg-amber-50 px-3 py-2 text-amber-800">! {warning.message}</p>
            ))}
            <p className="text-slate-500">Công suất ước tính {check.estimatedPowerW} W, nguồn nên dùng từ {check.recommendedPsuW} W.</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600"><span>Tổng theo giá báo</span><span>{formatCurrency(quotedTotal)}</span></div>
            <div className="flex justify-between text-base font-black">
              <span>{quote.expired ? 'Tổng theo giá hiện tại' : 'Tạm tính nếu mua bây giờ'}</span>
              <span className="text-red-600">{formatCurrency(payable)}</span>
            </div>
            <p className="text-xs text-slate-500">Chưa gồm phí giao hàng và ưu đãi; số tiền cuối cùng tính ở bước thanh toán.</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={handleBuy}
                disabled={outOfStock.length === quote.items.length}
                className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                {quote.expired ? 'Mua theo giá hiện tại' : 'Mua theo báo giá này'}
              </button>
              <button type="button" onClick={handleEdit} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:border-slate-900">
                Mở trong Build PC để chỉnh
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
