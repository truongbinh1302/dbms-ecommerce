import { useEffect, useState } from 'react'
import StoreGlyph from '../components/StoreGlyph'
import { fetchProduct, fetchReviews } from '../api/client'
import { formatCurrency } from '../utils/format'
import { mapApiProductToStoreProduct } from '../utils/productMapping'
import PageMessage from '../components/PageMessage'
import PriceHistory from '../components/PriceHistory'
import ReviewForm from '../components/ReviewForm'
import ProductQuestions from '../components/ProductQuestions'
import SimilarProducts from '../components/SimilarProducts'
import PriceWatchButton from '../components/PriceWatchButton'
import StockWatchButton from '../components/StockWatchButton'
import { toggleCompare, useCompareItems } from '../hooks/useCompare'
import { hrefFor } from '../hooks/useHashRoute'
import { formatDateTime } from '../utils/orderLabels'
import useCountdown, { formatClockTime, formatCountdown } from '../hooks/useCountdown'
import useDocumentTitle from '../hooks/useDocumentTitle'

// Hot Deal đang chạy: đếm ngược tới giờ kết thúc, số suất còn lại, giới hạn mỗi đơn.
function PromotionNotice({ promotion }) {
  const left = useCountdown(promotion.endsAt)
  return (
    <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="font-bold">
        {promotion.name}: {left > 0 ? `kết thúc sau ${formatCountdown(left)}` : 'vừa kết thúc'}
      </p>
      <p className="mt-1">
        Đến {formatClockTime(promotion.endsAt)}
        {promotion.remaining !== null && promotion.remaining !== undefined ? ` · còn ${promotion.remaining} suất` : ''}
        {promotion.perOrderLimit ? ` · tối đa ${promotion.perOrderLimit} sản phẩm mỗi đơn` : ''}
      </p>
    </div>
  )
}

/*
  Trang chi tiết sản phẩm: mọi thông tin (tên, thông số, giá, tồn kho) lấy từ API.
  Điểm đánh giá tính từ các review thật trong MongoDB, không dùng số Rating dựng sẵn trong seed.
*/
// Thêm/bỏ sản phẩm khỏi danh sách so sánh (tối đa 3).
function CompareToggle({ product, items }) {
  const [full, setFull] = useState(false)
  const comparing = items.some((item) => item.id === Number(product.id))
  return (
    <div className="mt-3 text-sm" aria-live="polite">
      <button
        type="button"
        aria-pressed={comparing}
        onClick={() => setFull(toggleCompare(product) === 'full')}
        className={`font-bold ${comparing ? 'text-emerald-700' : 'text-slate-700 hover:text-red-600'}`}
      >
        {comparing ? '✓ Đang trong danh sách so sánh' : '+ Thêm vào so sánh'}
      </button>
      {full && !comparing ? <span className="ml-2 text-xs text-slate-600">Đã đủ 3 sản phẩm, bỏ bớt ở thanh so sánh.</span> : null}
    </div>
  )
}

export default function ProductDetailPage({ productId, onAddToCart, onBuyNow, onProductLoaded, currentUser, onRequireLogin }) {
  const [state, setState] = useState({ id: null, product: null, error: '' })
  const [reviewState, setReviewState] = useState({ id: null, data: null })
  const [quantity, setQuantity] = useState(1)
  const [reviewsVersion, setReviewsVersion] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetchProduct(productId)
      .then((data) => {
        if (cancelled) return
        const product = mapApiProductToStoreProduct(data)
        setState({ id: productId, product, error: '' })
        if (onProductLoaded) onProductLoaded(product)
      })
      .catch((err) => {
        if (!cancelled) setState({ id: productId, product: null, error: err.message || 'Không tải được sản phẩm' })
      })

    return () => {
      cancelled = true
    }
  }, [productId, onProductLoaded])

  useEffect(() => {
    let cancelled = false
    fetchReviews(productId)
      .then((data) => {
        if (!cancelled) setReviewState({ id: productId, data })
      })
      .catch(() => {
        if (!cancelled) setReviewState({ id: productId, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [productId, reviewsVersion])

  const loading = state.id !== productId
  const product = loading ? null : state.product
  useDocumentTitle(product ? product.name : 'Sản phẩm')
  const reviews = reviewState.id === productId && reviewState.data ? reviewState.data.reviews || [] : []
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : null
  const totalReviews = reviewState.id === productId && reviewState.data ? Number(reviewState.data.total || reviews.length) : 0
  const compareItems = useCompareItems()
  const maxQuantity = product ? Math.max(1, Math.min(product.stock, 99)) : 1
  const safeQuantity = Math.min(quantity, maxQuantity)

  if (loading) {
    return <PageMessage title="Đang tải sản phẩm..." />
  }

  if (!product) {
    return (
      <PageMessage
        title="Không tìm thấy sản phẩm"
        description={state.error || 'Sản phẩm có thể đã ngừng kinh doanh.'}
        action={<a href={hrefFor('/')} className="font-bold text-red-600">Về trang chủ</a>}
      />
    )
  }

  const outOfStock = product.stock <= 0

  return (
    <div className="space-y-5">
      <nav className="text-sm text-slate-600">
        <a href={hrefFor('/')} className="hover:text-red-600">Trang chủ</a>
        {product.categoryName ? <span> / {product.categoryName}</span> : null}
      </nav>

      <section className="grid gap-6 rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-[28px] bg-slate-100 text-slate-500">
          {product.images.length > 0 ? (
            <img src={product.images[0]} alt={product.name} className="max-h-[420px] w-full object-contain" />
          ) : (
            <StoreGlyph name={product.visual?.kind || 'box'} className="size-32" />
          )}
        </div>

        <div>
          {product.brand ? <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">{product.brand}</p> : null}
          <h1 className="mt-2 text-3xl font-black leading-tight text-slate-900">{product.name}</h1>

          <div className="mt-3 text-sm text-slate-500">
            {averageRating !== null
              ? `${averageRating.toFixed(1)}/5 từ ${totalReviews} đánh giá`
              : 'Chưa có đánh giá'}
          </div>

          <div className="mt-5 rounded-[24px] bg-slate-50 p-5">
            {product.oldPrice > product.price ? (
              <div className="text-sm text-slate-500 line-through">{formatCurrency(product.oldPrice)}</div>
            ) : null}
            <div className="text-3xl font-black text-red-600">{formatCurrency(product.price)}</div>
            {product.promotion?.active ? <PromotionNotice promotion={product.promotion} /> : null}
            <PriceWatchButton productId={product.id} currentPrice={product.price} currentUser={currentUser} onRequireLogin={onRequireLogin} />
            <div className={`mt-2 text-sm font-semibold ${outOfStock ? 'text-red-600' : 'text-emerald-700'}`}>
              {outOfStock ? 'Tạm hết hàng' : `Còn ${product.stock} sản phẩm`}
            </div>
            {outOfStock ? <StockWatchButton productId={product.id} currentUser={currentUser} onRequireLogin={onRequireLogin} /> : null}
          </div>

          {product.specs.length > 0 ? (
            <ul className="mt-5 grid grid-cols-2 gap-2 text-sm">
              {product.specs.map((spec) => (
                <li key={spec} className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700">{spec}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <label htmlFor="detail-quantity" className="text-sm font-semibold text-slate-700">Số lượng</label>
            <input
              id="detail-quantity"
              type="number"
              min="1"
              max={maxQuantity}
              value={safeQuantity}
              disabled={outOfStock}
              onChange={(event) => setQuantity(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
              className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={outOfStock}
              onClick={() => onAddToCart(product, safeQuantity)}
              className="rounded-2xl border border-slate-900 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            >
              Thêm vào giỏ
            </button>
            <button
              type="button"
              disabled={outOfStock}
              onClick={() => onBuyNow(product, safeQuantity)}
              className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Mua ngay
            </button>
          </div>
          <CompareToggle product={product} items={compareItems} />
        </div>
      </section>

      <PriceHistory productId={productId} />

      <SimilarProducts product={product} />

      {product.description ? (
        <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Mô tả</h2>
          <p className="mt-3 whitespace-pre-line leading-7 text-slate-700">{product.description}</p>
        </section>
      ) : null}

      <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <h2 className="text-xl font-black text-slate-900">Đánh giá từ người đã mua</h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-slate-500">Sản phẩm chưa có đánh giá nào.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reviews.map((review) => (
              <li key={review._id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <strong className="text-slate-900">{review.title}</strong>
                  <span className="font-semibold text-amber-700">{review.rating}/5</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{review.content}</p>
                <p className="mt-2 text-xs text-slate-500">{formatDateTime(review.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
        <ReviewForm
          productId={productId}
          currentUser={currentUser}
          onRequireLogin={onRequireLogin}
          onCreated={() => setReviewsVersion((version) => version + 1)}
        />
      </section>

      <ProductQuestions productId={productId} currentUser={currentUser} onRequireLogin={onRequireLogin} />
    </div>
  )
}

