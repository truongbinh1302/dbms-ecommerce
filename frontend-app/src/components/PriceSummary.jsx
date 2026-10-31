import { useState } from 'react'
import { formatCurrency } from '../utils/format'

// Ô nhập mã giảm giá dùng chung cho giỏ hàng và trang thanh toán.
export function VoucherField({ voucherCode, voucherError, onApply, disabled = false }) {
  const [input, setInput] = useState('')

  // Không dùng <form> vì ô này nằm bên trong form thanh toán (form lồng nhau không hợp lệ).
  function apply() {
    const code = input.trim().toUpperCase()
    if (code && onApply) onApply(code)
  }

  function handleRemove() {
    setInput('')
    if (onApply) onApply('')
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              apply()
            }
          }}
          placeholder="Nhập mã giảm giá"
          aria-label="Mã giảm giá"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-slate-400"
        />
        <button
          type="button"
          onClick={apply}
          disabled={!input.trim() || disabled}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Áp dụng
        </button>
      </div>

      {voucherCode ? (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className={voucherError ? 'text-red-600' : 'text-emerald-700'}>
            {voucherError || `Đã áp dụng mã ${voucherCode}`}
          </span>
          <button type="button" onClick={handleRemove} className="font-semibold text-slate-400 hover:text-red-600">
            Bỏ mã
          </button>
        </div>
      ) : null}
    </div>
  )
}

// Các dòng tạm tính / phí ship / giảm giá / tổng. Số liệu lấy từ API báo giá của server.
export default function PriceSummary({ subtotal, quote, quoteError }) {
  const stockIssues = quote?.issues?.filter((issue) => issue.issue === 'insufficient_stock') || []

  return (
    <div>
      <div className="space-y-3 text-sm text-slate-600">
        <div className="flex items-center justify-between">
          <span>Tạm tính</span>
          <strong className="text-slate-900">{formatCurrency(quote ? quote.subtotal : subtotal)}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Phí giao hàng</span>
          <strong className="text-slate-900">
            {!quote ? 'Tính khi đặt hàng' : quote.shippingFee === 0 ? 'Miễn phí' : formatCurrency(quote.shippingFee)}
          </strong>
        </div>
        {quote && quote.promoDiscount > 0 ? (
          <div className="flex items-center justify-between">
            <span>Ưu đãi theo giá trị đơn</span>
            <strong className="text-emerald-600">-{formatCurrency(quote.promoDiscount)}</strong>
          </div>
        ) : null}
        {quote && quote.voucherDiscount > 0 ? (
          <div className="flex items-center justify-between">
            <span>Mã {quote.voucher?.code}</span>
            <strong className="text-emerald-600">-{formatCurrency(quote.voucherDiscount)}</strong>
          </div>
        ) : null}
      </div>

      {stockIssues.length > 0 ? (
        <p className="mt-3 text-sm text-red-600">
          {stockIssues.map((issue) => `${issue.productName}: chỉ còn ${issue.availableStock}`).join('; ')}
        </p>
      ) : null}

      {quoteError ? (
        <p className="mt-3 text-sm text-amber-700">Chưa tính được phí ship và giảm giá: {quoteError}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-4">
        <span className="text-base font-semibold text-slate-700">{quote ? 'Tổng thanh toán' : 'Tạm tính'}</span>
        <span className="text-2xl font-black text-red-600">{formatCurrency(quote ? quote.total : subtotal)}</span>
      </div>
    </div>
  )
}
