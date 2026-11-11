import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Các hộp thoại đang mở, cái mở sau cùng ở cuối: chỉ hộp trên cùng nhận Esc và Tab.
const openDialogs = []

/*
  Hành vi bàn phím chung cho hộp thoại (xem nhanh, đăng nhập, giỏ hàng):
  - mở: đưa focus vào hộp (phần tử có data-autofocus, không thì phần tử bấm được đầu tiên);
  - Esc đóng hộp trên cùng; Tab và Shift+Tab xoay vòng trong hộp;
  - đóng: trả focus về chỗ khách đứng trước khi mở.
  Gắn ref trả về vào khung hộp thoại.
*/
export default function useDialog(open, onClose) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const entry = {}
    openDialogs.push(entry)
    const previous = document.activeElement
    const node = ref.current
    const initial = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE)
    initial?.focus({ preventScroll: true })

    function onKeyDown(event) {
      if (openDialogs[openDialogs.length - 1] !== entry || !node) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((item) => item.getClientRects().length > 0)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!node.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openDialogs.splice(openDialogs.indexOf(entry), 1)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open])

  return ref
}
