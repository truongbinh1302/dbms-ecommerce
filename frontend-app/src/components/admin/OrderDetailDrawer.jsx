import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchOrder } from '../../api/client'
import { formatCurrency } from '../../utils/format'
import { formatAddress, formatDateTime } from '../../utils/orderLabels'

const STATUS_LABELS = {
  pending: 'Chờ xử lý',
  pending_payment: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  processing: 'Đang xử lý',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
}
const PAYMENT_LABELS = {
  unpaid: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán lỗi',
  refund_required: 'Cần hoàn tiền',
  refunded: 'Đã hoàn tiền',
}

/* Chi tiết một đơn cho admin: địa chỉ giao, sản phẩm, tiền, ghi chú khách, serial; in phiếu giao hàng. */
export default function OrderDetailDrawer({ orderId, onClose }) {
  const [state, setState] = useState({ id: null, order: null, error: '' })
  const closeButton = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchOrder(orderId)
      .then((order) => !cancelled && setState({ id: orderId, order, error: '' }))
      .catch((err) => !cancelled && setState({ id: orderId, order: null, error: err.message || 'Không tải được đơn' }))
    return () => {
      cancelled = true
    }
  }, [orderId])

  // In phiếu: drawer nằm ngoài #root (portal), khi in thì ẩn #root để chỉ in phiếu giao hàng.
  useEffect(() => {
    document.body.classList.add('print-order-slip')
    return () => document.body.classList.remove('print-order-slip')
  }, [])

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const order = state.id === orderId ? state.order : null
  const address = order?.shippingAddress || null
  const totalLabel = order?.PaymentStatus === 'paid'
    ? 'Đã thanh toán'
    : order?.PaymentMethod === 'cod' ? 'Thu khi giao (COD)' : 'Tổng thanh toán'

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 print:static print:block print:bg-white" role="dialog" aria-modal="true" aria-label={`Chi tiết đơn #${orderId}`}>
      <button type="button" className="flex-1 cursor-default print:hidden" aria-label="Đóng" tabIndex={-1} onClick={onClose} />
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 text-slate-800 shadow-2xl print:max-w-none print:shadow-none">
        <div className="flex items-start justify-between gap-3 print:hidden">
          <h3 className="text-xl font-black text-slate-900">Đơn {order?.orderCode || `#${orderId}`}</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} disabled={!order} className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              In phiếu giao hàng
            </button>
            <button ref={closeButton} type="button" onClick={onClose} className="rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-bold text-white">
              Đóng
            </button>
          </div>
        </div>

        {state.error && state.id === orderId ? <p className="mt-4 text-sm font-semibold text-red-700">{state.error}</p> : null}
        {!order && !state.error ? <p className="mt-4 text-sm text-slate-500">Đang tải...</p> : null}

        {order ? (
          <div className="mt-4 space-y-5 text-sm">
            <div className="hidden print:block">
              <p className="text-lg font-black">BinhTinhStore — Phiếu giao hàng</p>
              <p>Đơn {order.orderCode || `#${order.id}`} · đặt lúc {formatDateTime(order.CreatedAt)}</p>
            </div>

            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
              <dt className="text-slate-500">Trạng thái</dt>
              <dd className="font-semibold">{STATUS_LABELS[order.Status] || order.Status}</dd>
              <dt className="text-slate-500">Thanh toán</dt>
              <dd>{String(order.PaymentMethod || '').toUpperCase()} · {PAYMENT_LABELS[order.PaymentStatus] || order.PaymentStatus}</dd>
              <dt className="text-slate-500">Đặt lúc</dt>
              <dd>{formatDateTime(order.CreatedAt)}</dd>
            </dl>

            <section>
              <h4 className="font-black text-slate-900">Giao tới</h4>
              {address ? (
                <p className="mt-1 leading-6">
                  <strong>{address.recipientName}</strong> · <a href={`tel:${address.phone}`} className="font-semibold text-red-700 print:text-slate-900">{address.phone}</a>
                  <br />
                  {formatAddress(address)}
                </p>
              ) : <p className="mt-1 text-slate-500">Không có địa chỉ</p>}
              {order.Note ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Ghi chú của khách: {order.Note}</p> : null}
            </section>

            <section>
              <h4 className="font-black text-slate-900">Sản phẩm</h4>
              <table className="mt-2 w-full text-left">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-1">Sản phẩm</th><th className="py-1 text-right">SL</th><th className="py-1 text-right">Đơn giá</th><th className="py-1 text-right">Thành tiền</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(order.items || []).map((item) => (
                    <tr key={item.ProductID}>
                      <td className="py-1.5 pr-2">
                        {item.productName}
                        {item.promotionName ? <span className="block text-xs font-semibold text-red-700">Hot Deal: {item.promotionName}</span> : null}
                        {(order.warranties || []).filter((warranty) => warranty.productId === item.ProductID).map((warranty) => (
                          <span key={warranty.serialNumber} className="block text-xs text-slate-500">Serial {warranty.serialNumber}</span>
                        ))}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{item.Quantity}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(item.UnitPrice)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(item.UnitPrice) * item.Quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-3 space-y-1 border-t border-dashed border-slate-200 pt-3">
                <div className="flex justify-between"><dt className="text-slate-500">Tạm tính</dt><dd className="tabular-nums">{formatCurrency(order.Subtotal)}</dd></div>
                {Number(order.Discount) > 0 ? <div className="flex justify-between"><dt className="text-slate-500">Giảm giá</dt><dd className="tabular-nums">-{formatCurrency(order.Discount)}</dd></div> : null}
                <div className="flex justify-between"><dt className="text-slate-500">Phí giao hàng</dt><dd className="tabular-nums">{Number(order.ShippingFee) === 0 ? 'Miễn phí' : formatCurrency(order.ShippingFee)}</dd></div>
                <div className="flex justify-between text-base font-black"><dt>{totalLabel}</dt><dd className="tabular-nums">{formatCurrency(order.Total)}</dd></div>
              </dl>
            </section>

            {order.CancelReason ? <p className="text-slate-600">Lý do huỷ: {order.CancelReason}</p> : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
