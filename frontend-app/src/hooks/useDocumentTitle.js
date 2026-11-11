import { useEffect } from 'react'

const SITE = 'BinhTinhStore'

/* Đặt tiêu đề tab trình duyệt cho từng trang (lịch sử duyệt, đánh dấu trang, chia sẻ link).
   title = null: để trang con tự đặt (không ghi đè). */
export default function useDocumentTitle(title) {
  useEffect(() => {
    if (typeof document === 'undefined' || title === null) return
    document.title = title ? `${title} | ${SITE}` : `${SITE} | Build PC, laptop và linh kiện`
  }, [title])
}
