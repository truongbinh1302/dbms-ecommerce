import { ProductVisual } from './ProductCard'
import StoreGlyph from './StoreGlyph'
import { formatCurrency } from '../utils/format'

export default function ProductQuickView({ product, open, onClose, onAddToCart, isFavorite, onToggleFavorite }) {
  if (!product) {
    return null
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/50 transition ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />

      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition duration-300 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <div className="custom-scroll max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[36px] bg-white shadow-[0_40px_120px_rgba(15,23,42,0.3)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">Chi tiết nhanh</p>
              <h3 className="mt-1 text-2xl font-black text-slate-900">{product.name}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-600"
            >
              <StoreGlyph name="x" className="size-5" />
            </button>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <ProductVisual product={product} className="aspect-[5/4] min-h-[360px]" />
            </div>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-red-50 px-3 py-1.5 font-bold text-red-600">{product.badge}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{product.brand}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">{product.shipping}</span>
              </div>

              <div className="rounded-[28px] bg-slate-50 p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    {product.oldPrice > product.price ? (
                  <div className="text-sm text-slate-400 line-through">{formatCurrency(product.oldPrice)}</div>
                ) : null}
                    <div className="text-3xl font-black text-red-600">{formatCurrency(product.price)}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
                    Còn {product.stock} sản phẩm
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-amber-500">
                  <StoreGlyph name="star" className="size-4" />
                  <span className="font-bold">{product.rating}</span>
                  <span className="text-slate-400">({product.reviews} đánh giá)</span>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 p-5">
                <h4 className="text-lg font-black text-slate-900">Cấu hình nổi bật</h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {product.specs.map((spec) => (
                    <div key={spec} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                      {spec}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-3 text-emerald-600">
                    <StoreGlyph name="truck" className="size-5" />
                    <h4 className="font-black">Quyền lợi đi kèm</h4>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-900">
                    <li>- {product.installment}</li>
                    <li>- Kiểm tra hàng trước khi thanh toán</li>
                    <li>- Hỗ trợ cài đặt cơ bản miễn phí</li>
                  </ul>
                </div>

                <div className="rounded-[28px] border border-violet-200 bg-violet-50 p-5">
                  <div className="flex items-center gap-3 text-violet-600">
                    <StoreGlyph name="shield" className="size-5" />
                    <h4 className="font-black">Bảo hành & hỗ trợ</h4>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-violet-900">
                    <li>- Bảo hành chính hãng toàn quốc</li>
                    <li>- Hỗ trợ kỹ thuật từ xa qua Zalo</li>
                    <li>- Đổi mới 1-1 nếu lỗi phần cứng sớm</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onAddToCart(product)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-4 text-sm font-bold text-white transition hover:bg-red-700"
                >
                  <StoreGlyph name="cart" className="size-4" />
                  Thêm vào giỏ
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(product.id)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-4 text-sm font-semibold transition ${
                    isFavorite
                      ? 'border-rose-200 bg-rose-50 text-rose-600'
                      : 'border-slate-200 text-slate-700 hover:border-rose-200 hover:text-rose-600'
                  }`}
                >
                  <StoreGlyph name="heart" className="size-4" />
                  {isFavorite ? 'Đã yêu thích' : 'Thêm yêu thích'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
