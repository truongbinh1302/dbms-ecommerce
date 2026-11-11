import { useEffect, useState } from 'react'

/*
  Đếm ngược tới một thời điểm (ISO). offsetMs = giờ máy chủ - giờ máy khách, để đồng hồ
  không phụ thuộc máy khách chỉnh sai giờ. Trả về số mili giây còn lại (>= 0).
*/
export default function useCountdown(target, offsetMs = 0) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [target])
  if (!target) return 0
  return Math.max(new Date(target).getTime() - (now + offsetMs), 0)
}

export function formatCountdown(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  return days > 0 ? `${days} ngày ${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

// "20:00 12/11" theo giờ Việt Nam.
export function formatClockTime(value) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  )
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`
}
