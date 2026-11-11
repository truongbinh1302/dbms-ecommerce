import { useEffect, useState } from 'react'
import OrderReturns from '../components/OrderReturns'
import PageMessage from '../components/PageMessage'
import { cancelMyOrder, createVNPayPaymentLink, fetchOrder } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import {
  CUSTOMER_CANCELLABLE,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatAddress,
  formatDateTime,
  labelOf,
  statusTone,
} from '../utils/orderLabels'
import { LoginRequired, PaymentResultBanner } from './OrdersPage'

export default function OrderDetailPage({ orderId, currentUser, onRequireLogin, isNew = false, paymentResult = '', showToast }) {
  const userId = currentUser?.id
  const [reloadCount, setReloadCount] = useState(0)
  const requestKey = `${userId}:${orderId}:${reloadCount}`
  const [state, setState] = useState({ key: null, order: null, error: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchOrder(orderId)
      .then((order) => {
        if (!cancelled) setState({ key: requestKey, order, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setState({ key: requestKey, order: null, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [userId, orderId, requestKey])

  if (!userId) {
    return <LoginRequired onRequireLogin={onRequireLogin} />
  }

  // Giữ đơn cũ trên màn hình trong lúc tải lại sau khi huỷ / thanh toán.
  const order = state.order && Number(state.order.id) === Number(orderId) ? state.order : null

  if (!order) {
    if (state.key !== requestKey) return <PageMessage title="Đang tải đơn hàng..." />
    return (
      <PageMessage
        title="Không tìm thấy đơn hàng"
        description={state.error}
        action={<a href={hrefFor('/don-hang')} className="font-bold text-red-600">Xem tất cả đơn hàng</a>}
      />
    )
  }

  const canCancel = CUSTOMER_CANCELLABLE.includes(order.Status)
  const canPay = order.PaymentMethod === 'vnpay' && order.Status === 'pending_payment'
  const waitingForVNPay = order.PaymentMethod === 'vnpay' && order.PaymentStatus === 'pending' && order.Status === 'pending_payment'

  async function handleCancel() {
    if (!window.confirm('Huỷ đơn hàng này? Sản phẩm sẽ được trả lại kho.')) return
    setBusy(true)
    try {
      const result = await cancelMyOrder(order.id, 'Khách huỷ trên website')
      showToast(result.paymentStatus === 'refund_required'
        ? 'Đã huỷ đơn. Cửa hàng sẽ liên hệ để hoàn tiền.'
        : 'Đã huỷ đơn hàng.')
      setReloadCount((count) => count + 1)
    } catch (err) {
      showToast(err.message || 'Không huỷ được đơn hàng')
    } finally {
      setBusy(false)
    }
  }

  async function handlePay() {
    setBusy(true)
    try {
      const link = await createVNPayPaymentLink(order.id, `Thanh toan don hang ${order.orderCode || order.id}`)
      window.location.href = link.paymentUrl
    } catch (err) {
      showToast(err.message || 'Không tạo được link thanh toán')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <nav className="text-sm text-slate-600">
        <a href={hrefFor('/don-hang')} className="hover:text-red-600">Đơn hàng của tôi</a> / {order.orderCode || `#${order.id}`}
      </nav>

      {isNew ? (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          Đặt hàng thành công. Cửa hàng sẽ gọi xác nhận trước khi giao.
        </p>
      ) : null}
      <PaymentResultBanner code={paymentResult} />
      {waitingForVNPay ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang chờ VNPay xác nhận thanh toán.{' '}
          <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="font-bold underline">Tải lại</button>
        </p>
      ) : null}

      <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Đơn {order.orderCode || `#${order.id}`}</h1>
            <p className="mt-1 text-sm text-slate-500">Đặt lúc {formatDateTime(order.CreatedAt)}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${statusTone(order.Status)}`}>
            {labelOf(ORDER_STATUS_LABELS, order.Status)}
          </span>
        </div>

        {order.Status === 'cancelled' && order.CancelReason ? (
          <p className="mt-3 text-sm text-slate-500">Lý do huỷ: {order.CancelReason}</p>
        ) : null}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <h2 className="font-bold text-slate-900">Giao đến</h2>
            {order.shippingAddress?.recipientName ? (
              <>
                <p className="mt-2 text-slate-700">{order.shippingAddress.recipientName} · {order.shippingAddress.phone}</p>
                <p className="mt-1 text-slate-700">{formatAddress(order.shippingAddress)}</p>
              </>
            ) : (
              <p className="mt-2 text-slate-500">Đơn cũ không có địa chỉ chi tiết.</p>
            )}
            {order.Note ? <p className="mt-2 text-slate-500">Ghi chú: {order.Note}</p> : null}
            {order.shippingCarrier ? (
              <p className="mt-2 text-slate-700">
                Vận chuyển: <strong>{order.shippingCarrier}</strong>
                {order.trackingCode ? <> · mã vận đơn <strong className="select-all font-mono">{order.trackingCode}</strong></> : null}
              </p>
            ) : null}
            {order.deliveredAt ? <p className="mt-1 text-slate-500">Đã giao lúc {formatDateTime(order.deliveredAt)}</p> : null}
            {order.quoteCode ? (
              <p className="mt-2 text-slate-500">
                Giá theo báo giá <a href={hrefFor(`/bao-gia/${order.quoteCode}`)} className="font-semibold text-slate-700 hover:text-red-600">{order.quoteCode}</a>
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm">
            <h2 className="font-bold text-slate-900">Thanh toán</h2>
            <p className="mt-2 text-slate-700">{labelOf(PAYMENT_METHOD_LABELS, order.PaymentMethod)}</p>
            <p className="mt-1 text-slate-700">{labelOf(PAYMENT_STATUS_LABELS, order.PaymentStatus)}</p>
            {order.PaymentStatus === 'refunded' && order.refundAmount ? (
              <p className="mt-1 text-slate-600">
                Đã hoàn {formatCurrency(order.refundAmount)} lúc {formatDateTime(order.refundedAt)}
                {order.refundReference ? <> · mã giao dịch <span className="select-all font-mono">{order.refundReference}</span></> : null}
              </p>
            ) : null}
            {order.PaymentStatus === 'refund_required' ? (
              <p className="mt-1 text-slate-600">Cửa hàng sẽ hoàn tiền theo phương thức bạn đã thanh toán và báo cho bạn khi xong.</p>
            ) : null}
          </div>
        </div>

        <ul className="mt-6 divide-y divide-slate-100">
          {(order.items || []).map((item) => (
            <li key={item.ProductID} className="flex justify-between gap-3 py-3 text-sm">
              <span>
                <a href={hrefFor(`/san-pham/${item.ProductID}`)} className="font-semibold text-slate-900 hover:text-red-600">{item.productName}</a>
                {item.promotionName ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Giá Hot Deal: {item.promotionName}</span> : null}
                <span className="text-slate-500"> × {item.Quantity}</span>
                {(order.warranties || []).filter((warranty) => warranty.productId === item.ProductID).map((warranty) => (
                  <span key={warranty.serialNumber} className="block text-xs text-slate-500">
                    Serial {warranty.serialNumber} · bảo hành đến hết {warranty.endDate.split('-').reverse().join('/')}
                  </span>
                ))}
              </span>
              <span className="shrink-0 font-semibold">{formatCurrency(Number(item.UnitPrice) * item.Quantity)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-dashed border-slate-200 pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-slate-600">Tạm tính</dt><dd>{formatCurrency(order.Subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">Phí giao hàng</dt><dd>{Number(order.ShippingFee) === 0 ? 'Miễn phí' : formatCurrency(order.ShippingFee)}</dd></div>
          {Number(order.Discount) > 0 ? (
            <div className="flex justify-between"><dt className="text-slate-600">Giảm giá</dt><dd className="text-emerald-600">-{formatCurrency(order.Discount)}</dd></div>
          ) : null}
          <div className="flex justify-between text-base font-black"><dt>Tổng thanh toán</dt><dd className="text-red-600">{formatCurrency(order.Total)}</dd></div>
        </dl>

        {canPay || canCancel ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {canPay ? (
              <button type="button" disabled={busy} onClick={handlePay} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">
                Thanh toán VNPay
              </button>
            ) : null}
            {canCancel ? (
              <button type="button" disabled={busy} onClick={handleCancel} className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 disabled:text-slate-300">
                Huỷ đơn
              </button>
            ) : null}
          </div>
        ) : null}

        <OrderReturns order={order} showToast={showToast} onChanged={() => setReloadCount((count) => count + 1)} />

        {['shipped', 'delivered'].includes(order.Status) ? (
          <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Cần lắp ráp, lắp đặt hoặc cài đặt?{' '}
            <a href={hrefFor(`/dich-vu/tai-nha?don=${order.OrderID ?? order.id}`)} className="font-bold text-red-600 underline">Đặt lịch kỹ thuật viên tới nhà</a>
          </p>
        ) : null}
      </section>
    </div>
  )
}
