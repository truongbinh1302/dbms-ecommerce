import { useEffect, useState } from 'react'
import { createReview, fetchReviewEligibility } from '../api/client'

// Lý do cửa hàng ẩn đánh giá (khớp với máy chủ).
const HIDDEN_REASONS = {
  spam: 'quảng cáo hoặc spam',
  offensive: 'ngôn từ xúc phạm',
  personal_info: 'chứa thông tin cá nhân',
  off_topic: 'không liên quan tới sản phẩm',
}

/*
  Viết đánh giá trên trang sản phẩm. Chỉ khách đã nhận hàng sản phẩm này mới viết được
  (server kiểm tra lại); mỗi khách một đánh giá cho mỗi sản phẩm.
*/
export default function ReviewForm({ productId, currentUser, onRequireLogin, onCreated }) {
  const userId = currentUser?.id
  const [eligibility, setEligibility] = useState({ key: null, value: null })
  const [form, setForm] = useState({ rating: 5, title: '', content: '' })
  const [state, setState] = useState({ busy: false, error: '', done: false })
  const key = `${userId}:${productId}`

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchReviewEligibility(productId)
      .then((value) => {
        if (!cancelled) setEligibility({ key, value })
      })
      .catch(() => {
        if (!cancelled) setEligibility({ key, value: null })
      })
    return () => {
      cancelled = true
    }
  }, [userId, productId, key])

  if (!userId) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Đã mua sản phẩm này?{' '}
        <button type="button" onClick={onRequireLogin} className="font-semibold text-red-600 underline">Đăng nhập để đánh giá</button>
      </p>
    )
  }

  const value = eligibility.key === key ? eligibility.value : null
  if (state.done) return <p className="mt-4 text-sm text-emerald-700" role="status">Cảm ơn bạn đã đánh giá.</p>
  if (!value) return null
  if (value.reason === 'already_reviewed' && value.hidden) {
    return <p className="mt-4 text-sm text-slate-600">Đánh giá của bạn đang bị cửa hàng ẩn ({HIDDEN_REASONS[value.hiddenReason] || 'vi phạm quy định'}). Nếu thấy chưa đúng, hãy liên hệ cửa hàng.</p>
  }
  if (value.reason === 'already_reviewed') return <p className="mt-4 text-sm text-slate-500">Bạn đã đánh giá sản phẩm này.</p>
  if (!value.canReview) return <p className="mt-4 text-sm text-slate-500">Chỉ khách đã nhận hàng sản phẩm này mới viết được đánh giá.</p>

  async function handleSubmit(event) {
    event.preventDefault()
    setState({ busy: true, error: '', done: false })
    try {
      await createReview(productId, { rating: Number(form.rating), title: form.title.trim(), content: form.content.trim() })
      setState({ busy: false, error: '', done: true })
      if (onCreated) onCreated()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không gửi được đánh giá', done: false })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4">
      <h3 className="font-bold text-slate-900">Viết đánh giá của bạn</h3>
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="sr-only">Số sao</legend>
        {[5, 4, 3, 2, 1].map((star) => (
          <label key={star} className="flex items-center gap-1">
            <input
              type="radio"
              name="review-rating"
              value={star}
              checked={Number(form.rating) === star}
              onChange={() => setForm((current) => ({ ...current, rating: star }))}
            />
            {star} sao
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        <span className="font-semibold text-slate-700">Tiêu đề</span>
        <input
          value={form.title}
          maxLength={200}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="font-semibold text-slate-700">Nội dung (ít nhất 10 ký tự)</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={form.content}
          onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={state.busy || !form.title.trim() || form.content.trim().length < 10}
        className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
      >
        {state.busy ? 'Đang gửi...' : 'Gửi đánh giá'}
      </button>
      {state.error ? <p className="text-sm text-red-600" role="alert">{state.error}</p> : null}
    </form>
  )
}
