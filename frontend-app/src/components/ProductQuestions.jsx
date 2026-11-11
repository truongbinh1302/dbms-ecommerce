import { useEffect, useState } from 'react'
import { askProductQuestion, fetchProductQuestions } from '../api/client'
import { formatDateTime } from '../utils/orderLabels'

/* Hỏi đáp ở trang sản phẩm: câu đã được cửa hàng trả lời (công khai) và câu đang chờ của chính khách. */
export default function ProductQuestions({ productId, currentUser, onRequireLogin }) {
  const userId = currentUser?.id
  const [version, setVersion] = useState(0)
  const key = `${productId}:${userId || ''}:${version}`
  const [data, setData] = useState({ key: '', items: [], mine: [] })
  const [form, setForm] = useState({ open: false, text: '', busy: false, error: '', sent: false })

  useEffect(() => {
    let cancelled = false
    fetchProductQuestions(productId)
      .then((result) => !cancelled && setData({ key, items: result.items || [], mine: result.mine || [] }))
      .catch(() => !cancelled && setData({ key, items: [], mine: [] }))
    return () => {
      cancelled = true
    }
  }, [productId, key])

  const current = data.key === key ? data : { items: [], mine: [] }

  async function submit(event) {
    event.preventDefault()
    setForm((state) => ({ ...state, busy: true, error: '' }))
    try {
      await askProductQuestion(productId, form.text)
      setForm({ open: false, text: '', busy: false, error: '', sent: true })
      setVersion((value) => value + 1)
    } catch (err) {
      setForm((state) => ({ ...state, busy: false, error: err.message || 'Không gửi được câu hỏi' }))
    }
  }

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]" aria-labelledby="qa-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="qa-title" className="text-xl font-black text-slate-900">Hỏi đáp</h2>
        {!form.open ? (
          <button
            type="button"
            onClick={() => (userId ? setForm((state) => ({ ...state, open: true, sent: false })) : onRequireLogin())}
            className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:border-red-500 hover:text-red-600"
          >
            Đặt câu hỏi
          </button>
        ) : null}
      </div>

      {form.open ? (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <label htmlFor="qa-question" className="text-sm font-semibold text-slate-700">Câu hỏi của bạn về sản phẩm</label>
          <textarea
            id="qa-question"
            value={form.text}
            onChange={(event) => setForm((state) => ({ ...state, text: event.target.value }))}
            rows={3}
            maxLength={1000}
            placeholder="Ví dụ: card này lắp vừa case mini-ITX không? Cần nguồn bao nhiêu W?"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-500"
          />
          <p className="text-xs text-slate-500">Câu hỏi hiện công khai sau khi cửa hàng trả lời, kèm tên gọi của bạn. Đừng ghi số điện thoại hay địa chỉ.</p>
          {form.error ? <p className="text-sm font-semibold text-red-700" role="alert">{form.error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={form.busy || form.text.trim().length < 10} className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">Gửi câu hỏi</button>
            <button type="button" onClick={() => setForm({ open: false, text: '', busy: false, error: '', sent: false })} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Huỷ</button>
          </div>
        </form>
      ) : null}
      {form.sent ? <p className="mt-3 text-sm text-emerald-700" role="status">Đã gửi. Bạn sẽ nhận thông báo khi cửa hàng trả lời.</p> : null}

      {current.mine.length ? (
        <ul className="mt-4 space-y-3">
          {current.mine.map((item) => (
            <li key={item.id} className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm">
              <p className="font-semibold text-slate-900">{item.question}</p>
              <p className="mt-1 text-xs text-slate-500">Bạn hỏi lúc {formatDateTime(item.createdAt)} · đang chờ cửa hàng trả lời (chỉ bạn thấy)</p>
            </li>
          ))}
        </ul>
      ) : null}

      {current.items.length ? (
        <ul className="mt-4 space-y-4">
          {current.items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-900">{item.question}</p>
              <p className="mt-1 text-xs text-slate-500">{item.askedBy} · {formatDateTime(item.createdAt)}</p>
              <p className="mt-3 whitespace-pre-line border-l-2 border-red-500 pl-3 leading-6 text-slate-700">
                <span className="font-bold text-red-700">BinhTinhStore: </span>{item.answer}
              </p>
            </li>
          ))}
        </ul>
      ) : current.mine.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Chưa có câu hỏi nào. Hỏi cửa hàng về tương thích, bảo hành hay cách lắp đặt.</p>
      ) : null}
    </section>
  )
}
