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

function formatExpiry(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

// Các dòng tạm tính / phí ship / giảm giá / tổng. Số liệu lấy từ API báo giá của server.
export default function PriceSummary({ subtotal, quote, quoteError, onClearPriceLock }) {
  const stockIssues = quote?.issues?.filter((issue) => issue.issue === 'insufficient_stock') || []
  const lockedLines = quote?.items?.filter((line) => line.priceLocked) || []
  const lockSaving = lockedLines.reduce((sum, line) => sum + (line.listPrice - line.unitPrice) * line.quantity, 0)

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

      {quote?.priceLock ? (
        <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Giữ giá theo báo giá <strong>{quote.priceLock.code}</strong> đến {formatExpiry(quote.priceLock.expiresAt)}
          {lockSaving > 0 ? <> · rẻ hơn giá hiện tại {formatCurrency(lockSaving)}</> : null}
          {onClearPriceLock ? (
            <button type="button" onClick={onClearPriceLock} className="ml-2 font-semibold text-slate-500 underline hover:text-red-600">
              Bỏ báo giá
            </button>
          ) : null}
        </div>
      ) : null}

      {quote?.priceLockError ? (
        <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {quote.priceLockError.code === 'quote_expired'
            ? `Báo giá ${quote.priceLockError.quoteCode || ''} đã hết hạn giữ giá, đơn được tính theo giá hiện tại.`
            : 'Không tìm thấy báo giá, đơn được tính theo giá hiện tại.'}
          {onClearPriceLock ? (
            <button type="button" onClick={onClearPriceLock} className="ml-2 font-semibold underline">
              Đã hiểu
            </button>
          ) : null}
        </div>
      ) : null}

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
