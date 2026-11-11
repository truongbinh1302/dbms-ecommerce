import { useEffect, useRef, useState } from 'react'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../api/client'
import { navigate } from '../hooks/useHashRoute'
import { formatDateTime } from '../utils/orderLabels'
import StoreGlyph from './StoreGlyph'

const POLL_MS = 60000

/* Chuông thông báo ở header (khách đã đăng nhập): giá giảm, đơn đổi trạng thái, yêu cầu dịch vụ. */
export default function NotificationBell({ userId }) {
  const [data, setData] = useState({ userId: null, unread: 0, items: [] })
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const wrapper = useRef(null)

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchNotifications()
      .then((result) => !cancelled && setData({ userId, unread: result.unread, items: result.items }))
      .catch(() => {})
    const timer = window.setTimeout(() => setVersion((value) => value + 1), POLL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [userId, version])

  // Bấm ra ngoài hoặc Esc thì đóng.
  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (wrapper.current && !wrapper.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = data.userId === userId ? data : { unread: 0, items: [] }

  async function openItem(item) {
    setOpen(false)
    if (!item.read) {
      setData((state) => ({
        ...state,
        unread: Math.max(state.unread - 1, 0),
        items: state.items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
      }))
      markNotificationRead(item.id).catch(() => {})
    }
    if (item.link) navigate(item.link)
  }

  async function readAll() {
    setData((state) => ({ ...state, unread: 0, items: state.items.map((entry) => ({ ...entry, read: true })) }))
    markAllNotificationsRead().catch(() => {})
  }

  return (
    <div ref={wrapper} className="relative ml-1 shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value)
          if (!open) setVersion((value) => value + 1)
        }}
        aria-expanded={open}
        aria-label={current.unread ? `Thông báo, ${current.unread} chưa đọc` : 'Thông báo'}
        title="Thông báo"
        className="relative flex size-8 items-center justify-center rounded-xl bg-white/10 text-red-100 transition hover:bg-red-500 hover:text-white"
      >
        <StoreGlyph name="bell" className="size-4" />
        {current.unread ? (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black text-red-600">
            {current.unread > 99 ? '99+' : current.unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-4 top-24 z-50 rounded-3xl bg-white p-3 text-slate-800 shadow-[0_30px_80px_rgba(15,23,42,0.25)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96" role="dialog" aria-label="Thông báo">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="font-black">Thông báo</p>
            {current.unread ? (
              <button type="button" onClick={readAll} className="text-xs font-bold text-red-600 hover:underline">Đánh dấu đã đọc</button>
            ) : null}
          </div>
          {current.items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">Chưa có thông báo. Bấm “Theo dõi giá” ở trang sản phẩm để được báo khi giá giảm.</p>
          ) : (
            <ul className="mt-1 max-h-96 overflow-y-auto">
              {current.items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => openItem(item)} className={`w-full rounded-2xl px-3 py-2 text-left hover:bg-slate-50 ${item.read ? '' : 'bg-red-50/60'}`}>
                    <span className="flex items-start gap-2">
                      {!item.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-red-600" aria-label="Chưa đọc" /> : null}
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{item.title}</span>
                        {item.body ? <span className="block text-xs text-slate-600">{item.body}</span> : null}
                        <span className="block text-[11px] text-slate-400">{formatDateTime(item.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
