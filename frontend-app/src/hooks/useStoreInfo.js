import { useEffect, useState } from 'react'
import { fetchStoreInfo } from '../api/client'

// Thông tin cửa hàng ít khi đổi: tải một lần, dùng chung cho chân trang, thanh toán và trang chính sách.
let cache = null
let pending = null

function loadStoreInfo() {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = fetchStoreInfo()
      .then((data) => {
        cache = data
        return data
      })
      .catch((err) => {
        pending = null
        throw err
      })
  }
  return pending
}

export default function useStoreInfo() {
  const [info, setInfo] = useState(cache)

  useEffect(() => {
    if (cache) return undefined
    let cancelled = false
    loadStoreInfo()
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return info
}

/** Số ngày giao dự kiến theo tỉnh nhận hàng. */
export function deliveryDays(info, province) {
  if (!info || !province) return ''
  return province === info.shipping.province ? info.shipping.deliveryDaysLocal : info.shipping.deliveryDaysOther
}
