import { useEffect, useState } from 'react'
import { fetchAdminReviews, moderateReview } from '../../api/client'
import { hrefFor } from '../../hooks/useHashRoute'
import { formatDateTime } from '../../utils/orderLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'

// Cùng danh sách lý do với máy chủ (review.service HIDE_REASONS); khách nhận thông báo kèm lý do.
const HIDE_REASONS = [
  ['spam', 'Quảng cáo, spam'],
  ['offensive', 'Ngôn từ xúc phạm'],
  ['personal_info', 'Có thông tin cá nhân'],
  ['off_topic', 'Không liên quan sản phẩm'],
]
const REASON_LABELS = Object.fromEntries(HIDE_REASONS)

const FILTERS = [
  ['needs_reply', 'Đánh giá thấp chưa phản hồi'],
  ['all', 'Tất cả'],
  ['visible', 'Đang hiện'],
  ['hidden', 'Đã ẩn'],
]

function ReviewRow({ item, token, onChanged }) {
  const [reply, setReply] = useState(item.storeReply?.content || '')
  const [reason, setReason] = useState('')
  const [state, setState] = useState({ busy: false, error: '' })

  async function apply(payload) {
    setState({ busy: true, error: '' })
    try {
      await moderateReview(item.id, payload, token)
      setState({ busy: false, error: '' })
      onChanged()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không cập nhật được' })
    }
  }

  const low = item.rating <= 2
  return (
    <li className="space-y-2 py-4 text-sm">
      <p className="text-xs text-slate-300">
        {item.productName ? (
          <a href={hrefFor(`/san-pham/${item.productId}`)} target="_blank" rel="noreferrer" className="font-semibold text-sky-300 hover:underline">{item.productName}</a>
        ) : `Sản phẩm #${item.productId}`}
        {' · '}{item.author?.fullName || `Khách #${item.userId}`}{item.author?.email ? ` (${item.author.email})` : ''} · {formatDateTime(item.createdAt)}
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-black ${low ? 'bg-red-400/20 text-red-100' : 'bg-amber-300/20 text-amber-100'}`}>{item.rating}/5 sao</span>
        <strong className="text-white">{item.title}</strong>
        {item.hidden ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-200">Đã ẩn: {REASON_LABELS[item.hiddenReason] || item.hiddenReason}</span> : null}
        {item.helpfulCount ? <span className="text-xs text-slate-300">{item.helpfulCount} người thấy hữu ích</span> : null}
      </p>
      <p className="whitespace-pre-line leading-6 text-slate-200">{item.content}</p>
      {item.storeReply ? (
        <p className="rounded-2xl bg-white/5 px-3 py-2 text-xs text-slate-200">
          <span className="font-bold text-white">Đã phản hồi</span> · {formatDateTime(item.storeReply.repliedAt)}
        </p>
      ) : null}
      <textarea
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        rows={2}
        maxLength={1000}
        aria-label={`Phản hồi đánh giá “${item.title}”`}
        placeholder="Phản hồi công khai, hiện ngay dưới đánh giá"
        className={FIELD}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={state.busy || reply.trim().length < 2} onClick={() => apply({ reply })} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-40">
          {item.storeReply ? 'Sửa phản hồi' : 'Đăng phản hồi'}
        </button>
        {item.storeReply ? (
          <button type="button" disabled={state.busy} onClick={() => apply({ reply: '' })} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
            Gỡ phản hồi
          </button>
        ) : null}
        {item.hidden ? (
          <button type="button" disabled={state.busy} onClick={() => apply({ hidden: false })} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
            Hiện lại
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <select value={reason} onChange={(event) => setReason(event.target.value)} aria-label={`Lý do ẩn đánh giá “${item.title}”`} className="rounded-full border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white">
              <option value="">Lý do ẩn…</option>
              {HIDE_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" disabled={state.busy || !reason} onClick={() => apply({ hidden: true, reason })} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
              Ẩn đánh giá
            </button>
          </span>
        )}
      </div>
      {state.error ? <p className="text-xs font-semibold text-red-300" role="alert">{state.error}</p> : null}
    </li>
  )
}

/*
  Đánh giá của khách: phản hồi công khai, ẩn đánh giá vi phạm (khách được báo lý do, điểm sao tính lại).
  Mặc định mở danh sách đánh giá 1-2 sao chưa phản hồi.
*/
export default function ReviewsPanel({ token, onChanged }) {
  const [filter, setFilter] = useState('needs_reply')
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [list, setList] = useState({ key: '', items: [], pages: 1, total: 0, needsReply: 0, error: '' })
  const key = `${filter}|${page}|${version}`

  useEffect(() => {
    let cancelled = false
    fetchAdminReviews({ filter, page, limit: 20 }, token)
      .then((data) => !cancelled && setList({ key, items: data.items || [], pages: data.pages || 1, total: data.total || 0, needsReply: data.needsReply || 0, error: '' }))
      .catch((err) => !cancelled && setList({ key, items: [], pages: 1, total: 0, needsReply: 0, error: err.message || 'Không tải được đánh giá' }))
    return () => {
      cancelled = true
    }
  }, [filter, page, key, token])

  const changed = () => {
    setVersion((value) => value + 1)
    onChanged?.()
  }

  return (
    <section className={PANEL} aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="reviews-title" className="text-2xl font-black">Đánh giá của khách</h3>
          <p className="text-sm text-slate-300">
            {list.needsReply ? `${list.needsReply} đánh giá 1-2 sao chưa phản hồi` : 'Không có đánh giá thấp nào chờ phản hồi'}
          </p>
        </div>
        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value)
            setPage(1)
          }}
          aria-label="Lọc đánh giá"
          className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <p className="mt-2 text-xs text-slate-300">Đánh giá bị ẩn không hiện ở trang sản phẩm và không tính vào điểm sao; người viết nhận thông báo kèm lý do.</p>
      {list.key !== key ? <p className="mt-4 text-sm text-slate-300">Đang tải...</p> : null}
      {list.error ? <p className="mt-4 text-sm font-semibold text-red-300" role="alert">{list.error}</p> : null}
      {list.key === key && !list.error && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-300">Không có đánh giá nào.</p> : null}
      {list.items.length ? (
        <ul className="mt-2 divide-y divide-white/10">
          {list.items.map((item) => (
            <ReviewRow key={`${item.id}:${item.hidden}:${item.storeReply?.repliedAt || ''}`} item={item} token={token} onChanged={changed} />
          ))}
        </ul>
      ) : null}
      {list.pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-full bg-white/10 px-3 py-1.5 font-bold disabled:opacity-40">Trước</button>
          <span className="text-slate-300">Trang {page}/{list.pages}</span>
          <button type="button" disabled={page >= list.pages} onClick={() => setPage((value) => value + 1)} className="rounded-full bg-white/10 px-3 py-1.5 font-bold disabled:opacity-40">Sau</button>
        </div>
      ) : null}
    </section>
  )
}
