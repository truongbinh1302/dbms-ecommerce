import StoreGlyph from './StoreGlyph'
import { classNames, formatCurrency } from '../utils/format'

function getVisualIcon(kind) {
  switch (kind) {
    case 'laptop':
      return 'laptop'
    case 'desktop':
      return 'desktop'
    case 'monitor':
      return 'monitor'
    case 'keyboard':
      return 'keyboard'
    case 'mouse':
      return 'mouse'
    case 'headset':
      return 'headset'
    case 'chair':
      return 'chair'
    default:
      return 'sparkles'
  }
}

export function ProductVisual({ product, className = '' }) {
  const accent = product.visual?.accent ?? 'from-slate-800 via-slate-700 to-slate-500'
  const isLightSurface = /(slate-100|slate-200|slate-300|emerald-300|teal-300|cyan-300|white)/.test(accent)
  const foreground = isLightSurface ? 'text-slate-900' : 'text-white'
  const chipSurface = isLightSurface ? 'bg-white/80 text-slate-900' : 'bg-white/15 text-white'

  // Check if product has an image
  const productImage = product.images ? (Array.isArray(product.images) ? product.images[0] : product.images) : null

  return (
    <div
      className={classNames(
        'relative overflow-hidden rounded-[28px] bg-gradient-to-br p-5',
        productImage ? 'bg-gradient-to-br from-slate-200 to-slate-300' : accent,
        foreground,
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.35),_transparent_42%)]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <span className={classNames('rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]', chipSurface)}>
            {product.brand}
          </span>
          <span className={classNames('rounded-full px-3 py-1 text-[11px] font-semibold', chipSurface)}>
            {product.visual?.badge ?? 'Hot'}
          </span>
        </div>

        <div className="my-5 flex items-center justify-center">
          {productImage ? (
            <img
              src={productImage}
              alt={product.name}
              className="max-w-28 max-h-28 object-contain rounded-[2rem] shadow-2xl"
            />
          ) : (
            <div
              className={classNames(
                'flex size-28 items-center justify-center rounded-[2rem] border shadow-2xl backdrop-blur-md',
                isLightSurface ? 'border-slate-200/80 bg-white/60' : 'border-white/20 bg-white/10',
              )}
            >
              <StoreGlyph name={getVisualIcon(product.visual?.kind)} className="size-16" />
            </div>
          )}
        </div>

        <div className="relative space-y-1">
          <p className="text-sm font-medium opacity-90">{product.shipping}</p>
          <h4 className="text-lg font-black leading-tight">{product.name}</h4>
        </div>
      </div>
    </div>
  )
}

export default function ProductCard({
  product,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  onQuickView,
  onView,
}) {
  return (
    <article
      className="group flex h-full cursor-pointer flex-col rounded-[30px] bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.14)]"
      onClick={() => onView(product)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
          <span>{product.badge}</span>
          {product.featured ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-red-500">
              Best seller
            </span>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Yêu thích"
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite(product.id)
          }}
          className={classNames(
            'flex size-10 items-center justify-center rounded-full border transition',
            isFavorite
              ? 'border-rose-200 bg-rose-50 text-rose-500'
              : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-500',
          )}
        >
          <StoreGlyph name="heart" className="size-4" />
        </button>
      </div>

      <div className="mt-4">
        <ProductVisual product={product} className="aspect-[5/4]" />
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <div className="space-y-3">
          <div>
            <h3 className="line-clamp-2 text-lg font-extrabold leading-snug text-slate-900">{product.name}</h3>
            <div className="mt-2 flex items-center gap-2 text-sm text-amber-500">
              <StoreGlyph name="star" className="size-4" />
              <span className="font-bold">{product.rating}</span>
              <span className="text-slate-400">({product.reviews} đánh giá)</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {product.specs.slice(0, 4).map((spec) => (
              <span
                key={spec}
                className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium leading-5 text-slate-600"
              >
                {spec}
              </span>
            ))}
          </div>

          <div className="rounded-[24px] bg-slate-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm text-slate-400 line-through">{formatCurrency(product.oldPrice)}</div>
                <div className="text-2xl font-black text-red-600">{formatCurrency(product.price)}</div>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm">
                Còn {product.stock} sản phẩm
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-white px-3 py-2 text-slate-600 shadow-sm">{product.installment}</span>
              <span className="rounded-full bg-white px-3 py-2 text-slate-600 shadow-sm">{product.shipping}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onAddToCart(product)
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700"
          >
            <StoreGlyph name="cart" className="size-4" />
            Thêm vào giỏ
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onQuickView(product)
            }}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-600"
          >
            Chi tiết
          </button>
        </div>
      </div>
    </article>
  )
}
