import { useEffect, useState } from 'react'
import ReviewForm from './ReviewForm'
import { fetchReviews, markReviewHelpful } from '../api/client'
import { formatDateTime } from '../utils/orderLabels'

const PAGE_SIZE = 5
const MAX_LOADED = 100 // máy chủ trả tối đa 100 đánh giá mỗi lần

function Stars({ value }) {
  const full = Math.round(Number(value) || 0)
  return (
    <span className="text-amber-500" aria-hidden="true">
      {'★'.repeat(full)}
      <span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  )
}

/*
  Đánh giá ở trang sản phẩm: điểm trung bình và số đánh giá theo từng mức sao (bấm để lọc),
  danh sách đánh giá có phản hồi của cửa hàng, nút "Hữu ích" (mỗi người một lần, không tự bấm), form viết đánh giá.
  Mọi đánh giá đều từ khách đã nhận hàng (máy chủ kiểm tra khi gửi).
*/
export default function ProductReviews({ productId, currentUser, onRequireLogin, onStatistics }) {
  const [rating, setRating] = useState(null)
  const [count, setCount] = useState(PAGE_SIZE)
  const [version, setVersion] = useState(0)
  const [data, setData] = useState({ key: '', reviews: [], total: 0, statistics: null, error: '' })
  const [helpful, setHelpful] = useState({})
  const key = `${productId}|${rating || ''}|${count}|${version}`

  useEffect(() => {
    let cancelled = false
    fetchReviews(productId, { rating, limit: Math.min(count, MAX_LOADED) })
      .then((result) => {
        if (cancelled) return
        setData({ key, reviews: result.reviews || [], total: Number(result.total || 0), statistics: result.statistics || null, error: '' })
        if (result.statistics) onStatistics?.(result.statistics)
      })
      .catch((err) => {
        if (!cancelled) setData((current) => ({ ...current, key, error: err.message || 'Không tải được đánh giá' }))
      })
    return () => {
      cancelled = true
    }
  }, [productId, rating, count, version, key, onStatistics])

  const stats = data.statistics
  const totalAll = Number(stats?.total_reviews || 0)
  const loading = data.key !== key

  async function handleHelpful(review) {
    if (!currentUser) {
      onRequireLogin?.()
      return
    }
    setHelpful((current) => ({ ...current, [review._id]: { busy: true } }))
    try {
      const updated = await markReviewHelpful(review._id)
      setHelpful((current) => ({ ...current, [review._id]: { done: true, count: updated?.helpful_count } }))
    } catch (err) {
      const done = err.status === 409
      setHelpful((current) => ({ ...current, [review._id]: { done, error: done ? '' : err.message || 'Không ghi nhận được' } }))
    }
  }

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="scroll-mt-28 text-xl font-black text-slate-900">Đánh giá từ người đã mua</h2>

      {totalAll > 0 ? (
        <div className="mt-4 grid gap-5 rounded-3xl bg-slate-50 p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
          <div className="text-center sm:text-left">
            <p className="text-4xl font-black text-slate-900">{Number(stats.overall_rating).toFixed(1)}<span className="text-lg font-bold text-slate-500">/5</span></p>
            <p className="text-lg"><Stars value={stats.overall_rating} /></p>
            <p className="text-sm text-slate-600">{totalAll} đánh giá</p>
          </div>
          <ul className="space-y-1.5" aria-label="Lọc theo số sao">
            {[5, 4, 3, 2, 1].map((star) => {
              const amount = Number(stats.rating_breakdown?.[star] || 0)
              const percent = totalAll ? Math.round((amount / totalAll) * 100) : 0
              const active = rating === star
              return (
                <li key={star}>
                  <button
                    type="button"
                    disabled={amount === 0}
                    aria-pressed={active}
                    onClick={() => {
                      setRating(active ? null : star)
                      setCount(PAGE_SIZE)
                    }}
                    className={`grid w-full grid-cols-[48px_minmax(0,1fr)_64px] items-center gap-3 rounded-xl px-2 py-1 text-left text-sm transition ${active ? 'bg-white ring-2 ring-red-600' : 'hover:bg-white'} disabled:cursor-default disabled:hover:bg-transparent`}
                  >
                    <span className="font-semibold text-slate-700">{star} sao</span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                      <span className="block h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="text-right text-slate-600">{amount} <span className="sr-only">đánh giá</span>({percent}%)</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {rating ? (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-700" role="status">
          Đang xem đánh giá {rating} sao ({data.total}).
          <button type="button" onClick={() => setRating(null)} className="font-bold text-red-700 underline">Xem tất cả</button>
        </p>
      ) : null}

      {data.error ? <p className="mt-3 text-sm text-red-700" role="alert">{data.error}</p> : null}
      {!loading && !data.error && totalAll === 0 ? <p className="mt-3 text-slate-600">Sản phẩm chưa có đánh giá nào.</p> : null}

      {data.reviews.length ? (
        <ul className={`mt-4 space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {data.reviews.map((review) => {
            const mine = currentUser && Number(review.userId) === Number(currentUser.id)
            const vote = helpful[review._id] || {}
            const shownCount = vote.count ?? review.helpful_count ?? 0
            return (
              <li key={review._id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <strong className="text-slate-900">{review.title}</strong>
                  <span className="flex items-center gap-2">
                    <Stars value={review.rating} />
                    <span className="font-semibold text-amber-700">{review.rating}/5</span>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{review.content}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">Đã mua hàng</span>
                  {mine ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Đánh giá của bạn</span> : null}
                  <span>{formatDateTime(review.createdAt)}</span>
                </p>
                {review.storeReply?.content ? (
                  <div className="mt-3 rounded-xl border-l-4 border-red-600 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-bold text-slate-900">Phản hồi của BinhTinhStore · <span className="font-normal text-slate-600">{formatDateTime(review.storeReply.repliedAt)}</span></p>
                    <p className="mt-1 whitespace-pre-line leading-6 text-slate-700">{review.storeReply.content}</p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {mine ? (
                    shownCount ? <span className="text-slate-600">{shownCount} người thấy hữu ích</span> : null
                  ) : (
                    <button
                      type="button"
                      disabled={vote.busy || vote.done}
                      aria-pressed={Boolean(vote.done)}
                      onClick={() => handleHelpful(review)}
                      className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700 disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-800"
                    >
                      {vote.done ? 'Đã đánh dấu hữu ích' : 'Hữu ích'}{shownCount ? ` (${shownCount})` : ''}
                    </button>
                  )}
                  {vote.error ? <span className="text-red-700" role="alert">{vote.error}</span> : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {data.reviews.length < data.total && count < MAX_LOADED ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => setCount((value) => value + PAGE_SIZE)}
          className="mt-4 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-red-200 hover:text-red-700 disabled:opacity-60"
        >
          Xem thêm đánh giá ({data.total - data.reviews.length})
        </button>
      ) : null}

      <ReviewForm
        productId={productId}
        currentUser={currentUser}
        onRequireLogin={onRequireLogin}
        onCreated={() => {
          setRating(null)
          setVersion((value) => value + 1)
        }}
      />
    </section>
  )
}
