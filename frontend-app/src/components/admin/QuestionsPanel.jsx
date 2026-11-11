import { useEffect, useState } from 'react'
import { fetchAdminQuestions, moderateQuestion } from '../../api/client'
import { hrefFor } from '../../hooks/useHashRoute'
import { formatDateTime } from '../../utils/orderLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'

function QuestionRow({ item, token, onChanged }) {
  const [answer, setAnswer] = useState(item.answer || '')
  const [state, setState] = useState({ busy: false, error: '' })

  async function apply(payload) {
    setState({ busy: true, error: '' })
    try {
      await moderateQuestion(item.id, payload, token)
      setState({ busy: false, error: '' })
      onChanged()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không cập nhật được' })
    }
  }

  return (
    <li className="space-y-2 py-4 text-sm">
      <p className="text-xs text-slate-400">
        <a href={hrefFor(`/san-pham/${item.productId}`)} target="_blank" rel="noreferrer" className="font-semibold text-sky-300 hover:underline">{item.productName}</a>
        {' · '}{item.askedBy} · {formatDateTime(item.createdAt)}
      </p>
      <p className="font-semibold text-white">{item.question}</p>
      {item.status !== 'hidden' ? (
        <>
          <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={2} maxLength={2000} aria-label={`Trả lời câu hỏi ${item.id}`} placeholder="Câu trả lời hiện công khai dưới câu hỏi" className={FIELD} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={state.busy || answer.trim().length < 2} onClick={() => apply({ answer })} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-40">
              {item.status === 'answered' ? 'Sửa câu trả lời' : 'Trả lời và đăng'}
            </button>
            <button type="button" disabled={state.busy} onClick={() => apply({ hidden: true })} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40">
              Ẩn câu hỏi
            </button>
          </div>
        </>
      ) : <p className="text-xs text-slate-400">Đã ẩn</p>}
      {state.error ? <p className="text-xs font-semibold text-red-300" role="alert">{state.error}</p> : null}
    </li>
  )
}

/* Hỏi đáp sản phẩm: câu hỏi chờ trả lời lên trước, cũ nhất trước. */
export default function QuestionsPanel({ token }) {
  const [status, setStatus] = useState('pending')
  const [version, setVersion] = useState(0)
  const [list, setList] = useState({ key: '', items: [], pendingCount: 0, error: '' })
  const key = `${status}|${version}`

  useEffect(() => {
    let cancelled = false
    fetchAdminQuestions({ status, limit: 50 }, token)
      .then((data) => !cancelled && setList({ key, items: data.items || [], pendingCount: data.pendingCount || 0, error: '' }))
      .catch((err) => !cancelled && setList({ key, items: [], pendingCount: 0, error: err.message || 'Không tải được câu hỏi' }))
    return () => {
      cancelled = true
    }
  }, [status, key, token])

  return (
    <section className={PANEL} aria-labelledby="questions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="questions-title" className="text-2xl font-black">Hỏi đáp sản phẩm</h3>
          <p className="text-sm text-slate-400">{list.pendingCount ? `${list.pendingCount} câu đang chờ trả lời` : 'Không có câu nào đang chờ'}</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc câu hỏi" className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="pending">Chờ trả lời</option>
          <option value="answered">Đã trả lời</option>
          <option value="hidden">Đã ẩn</option>
        </select>
      </div>
      {list.key !== key ? <p className="mt-4 text-sm text-slate-400">Đang tải...</p> : null}
      {list.error ? <p className="mt-4 text-sm font-semibold text-red-300" role="alert">{list.error}</p> : null}
      {list.key === key && !list.error && list.items.length === 0 ? <p className="mt-4 text-sm text-slate-400">Không có câu hỏi nào.</p> : null}
      {list.items.length ? (
        <ul className="mt-2 divide-y divide-white/10">
          {list.items.map((item) => <QuestionRow key={`${item.id}:${item.status}`} item={item} token={token} onChanged={() => setVersion((value) => value + 1)} />)}
        </ul>
      ) : null}
    </section>
  )
}
