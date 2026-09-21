import StoreGlyph from './StoreGlyph'
import { formatCurrency } from '../utils/format'

export default function CartDrawer({
  open,
  items,
  subtotal,
  shippingFee,
  discount,
  paymentMethod,
  onPaymentMethodChange,
  onClose,
  onIncrease,
  onDecrease,
  onRemove,
  onCheckout,
  checkoutLoading = false,
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 transition ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">Giỏ hàng demo</p>
            <h3 className="mt-1 text-2xl font-black text-slate-900">{items.length} sản phẩm đang chọn</h3>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-800">Phương thức thanh toán</p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onPaymentMethodChange('cod')}
                className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
                  paymentMethod === 'cod'
                    ? 'border-slate-950 bg-slate-950 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                COD
              </button>

              <button
                type="button"
                onClick={() => onPaymentMethodChange('vnpay')}
                className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
                  paymentMethod === 'vnpay'
                    ? 'border-red-500 bg-red-500 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                VNPay
              </button>
            </div>
          </div>          
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-600"
          >
            <StoreGlyph name="x" className="size-5" />
          </button>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto px-6 py-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-red-50 text-red-600">
                <StoreGlyph name="cart" className="size-8" />
              </div>
              <h4 className="mt-5 text-xl font-black text-slate-900">Giỏ hàng đang trống</h4>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Hãy thêm vài sản phẩm để trải nghiệm luồng mua sắm của BinhTinhStore.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex size-20 items-center justify-center rounded-[24px] bg-slate-100 text-slate-700">
                      <StoreGlyph name={item.visual?.kind === 'desktop' ? 'desktop' : item.visual?.kind} className="size-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="line-clamp-2 text-base font-bold text-slate-900">{item.name}</h4>
                          <p className="mt-1 text-sm text-slate-500">{item.brand}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          className="text-sm font-semibold text-slate-400 transition hover:text-red-600"
                        >
                          Xoá
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-lg font-black text-red-600">{formatCurrency(item.price)}</div>
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => onDecrease(item.id)}
                            className="flex size-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm"
                          >
                            <StoreGlyph name="minus" className="size-4" />
                          </button>
                          <span className="min-w-8 text-center text-sm font-bold text-slate-900">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => onIncrease(item.id)}
                            className="flex size-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm"
                          >
                            <StoreGlyph name="plus" className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-5">
          <div className="rounded-[28px] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Tạm tính</span>
                <strong className="text-slate-900">{formatCurrency(subtotal)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Phí giao hàng</span>
                <strong className="text-slate-900">{shippingFee === 0 ? 'Miễn phí' : formatCurrency(shippingFee)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Ưu đãi demo</span>
                <strong className="text-emerald-600">-{formatCurrency(discount)}</strong>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-4">
              <span className="text-base font-semibold text-slate-700">Tổng thanh toán</span>
              <span className="text-2xl font-black text-red-600">
                {formatCurrency(Math.max(subtotal + shippingFee - discount, 0))}
              </span>
            </div>

             <button
              type="button"
              onClick={onCheckout}
              disabled={checkoutLoading || items.length === 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <StoreGlyph name="bolt" className="size-4" />
              {checkoutLoading
                ? 'Đang xử lý...'
                : paymentMethod === 'vnpay'
                  ? 'Thanh toán qua VNPay'
                  : 'Tạo đơn COD qua API'}              
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
