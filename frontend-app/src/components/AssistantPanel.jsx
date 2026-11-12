import { useEffect, useRef, useState } from 'react'
import StoreGlyph from './StoreGlyph'
import { askAssistant } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import useDialog from '../hooks/useDialog'
import { formatCurrency } from '../utils/format'

const STORAGE_KEY = 'bt_assistant_chat'
const MAX_KEPT = 12
const SUGGESTIONS = [
  'Laptop lập trình dưới 20 triệu',
  'Build PC code web và Docker tầm 20 triệu',
  'Đổi trả và giao hàng thế nào?',
]

// Hội thoại chỉ giữ trong tab đang mở (sessionStorage); máy chủ không lưu.
function loadChat() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string') : []
  } catch {
    return []
  }
}

function saveChat(messages) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_KEPT)))
  } catch {
    // trình duyệt chặn lưu trữ: hội thoại mất khi tải lại trang
  }
}

/*
  Trợ lý mua hàng (OpenAI). Giá và tồn kho trên thẻ sản phẩm do máy chủ lấy từ cửa hàng, không do AI viết.
  Hộp thoại: focus vào ô nhập, Esc đóng, Tab trong hộp (useDialog).
*/
export default function AssistantPanel({ open, onClose, hotline }) {
  const [messages, setMessages] = useState(loadChat)
  const [draft, setDraft] = useState('')
  const [state, setState] = useState({ busy: false, error: '' })
  const dialogRef = useDialog(open, onClose)
  const listRef = useRef(null)

  useEffect(() => {
    saveChat(messages)
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, state.busy])

  async function send(text) {
    const content = String(text || '').trim()
    if (!content || state.busy) return
    const next = [...messages, { role: 'user', content: content.slice(0, 1000) }]
    setMessages(next)
    setDraft('')
    setState({ busy: true, error: '' })
    try {
      const result = await askAssistant(next.slice(-MAX_KEPT).map(({ role, content: body }) => ({ role, content: body })))
      setMessages((current) => [...current, { role: 'assistant', content: result.reply, products: result.products || [] }])
      setState({ busy: false, error: '' })
    } catch (err) {
      setState({ busy: false, error: err.message || 'Trợ lý đang bận, bạn thử lại sau nhé.' })
    }
  }

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-title"
      className="fixed inset-x-3 bottom-3 z-50 flex max-h-[min(640px,calc(100vh-24px))] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)] sm:inset-x-auto sm:right-5 sm:w-[400px]"
    >
      <div className="flex items-start justify-between gap-3 bg-slate-950 px-5 py-4 text-white">
        <div>
          <h2 id="assistant-title" className="text-lg font-black">Trợ lý mua hàng</h2>
          <p className="text-xs text-slate-300">Dùng AI (OpenAI), có thể nhầm. Giá và tồn kho trên thẻ sản phẩm lấy từ cửa hàng.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng trợ lý" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <StoreGlyph name="x" className="size-4" />
        </button>
      </div>

      <div ref={listRef} role="log" aria-live="polite" aria-label="Hội thoại với trợ lý" className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-slate-700">Chào bạn! Mình giúp tìm sản phẩm, gợi ý cấu hình PC theo nhu cầu và giải đáp giao hàng, đổi trả.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((item) => (
                <button key={item} type="button" onClick={() => send(item)} className="rounded-full border border-slate-200 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:border-red-200 hover:text-red-700">
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3 py-2 leading-6 ${message.role === 'user' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
              <span className="sr-only">{message.role === 'user' ? 'Bạn: ' : 'Trợ lý: '}</span>
              {message.content}
            </div>
            {message.products?.length ? (
              <ul className="mt-2 space-y-1.5">
                {message.products.map((product) => (
                  <li key={product.id}>
                    <a href={hrefFor(`/san-pham/${product.id}`)} onClick={onClose} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2 hover:border-red-200">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{product.name}</span>
                        <span className="text-xs text-slate-600">{product.stock > 0 ? `Còn ${product.stock}` : 'Tạm hết hàng'}{product.hotDeal ? ' · Hot Deal' : ''}</span>
                      </span>
                      <span className="shrink-0 font-bold text-red-700">{formatCurrency(product.price)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {state.busy ? <p className="text-slate-600" role="status">Trợ lý đang trả lời...</p> : null}
        {state.error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-red-700" role="alert">{state.error}</p> : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
        className="border-t border-slate-200 p-3"
      >
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">Câu hỏi cho trợ lý</label>
          <textarea
            id="assistant-input"
            data-autofocus
            rows={2}
            maxLength={1000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(draft)
              }
            }}
            placeholder="Hỏi về sản phẩm, cấu hình, giao hàng..."
            className="min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-400"
          />
          <button type="submit" disabled={state.busy || !draft.trim()} className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            Gửi
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Đừng nhập thông tin cá nhân. Câu hỏi được gửi tới OpenAI để trả lời,{' '}
            <a href={hrefFor('/chinh-sach-bao-mat')} onClick={onClose} className="font-semibold text-slate-700 underline">xem chính sách</a>.
          </span>
          <span className="flex gap-3">
            {hotline ? <a href={`tel:${hotline.replace(/[^0-9+]/g, '')}`} className="font-semibold text-slate-700 underline">Gọi {hotline}</a> : null}
            {messages.length ? (
              <button type="button" onClick={() => { setMessages([]); setState({ busy: false, error: '' }) }} className="font-semibold text-slate-700 underline">Xoá hội thoại</button>
            ) : null}
          </span>
        </div>
      </form>
    </div>
  )
}
