import { useSyncExternalStore } from 'react'

/*
  Danh sách sản phẩm đang so sánh (tối đa 3), lưu trên trình duyệt của khách để giữ khi tải lại trang.
  Không lưu được (chế độ riêng tư, bị chặn) thì vẫn dùng được trong phiên hiện tại.
*/
export const MAX_COMPARE = 3
const KEY = 'bt_compare'
const listeners = new Set()

function read() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && Number.isInteger(item.id) && item.id > 0).slice(0, MAX_COMPARE).map((item) => ({ id: item.id, name: String(item.name || '') }))
      : []
  } catch {
    return []
  }
}

let items = typeof window === 'undefined' ? [] : read()

function write(next) {
  items = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // không lưu được thì chỉ giữ trong phiên
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCompareItems() {
  return useSyncExternalStore(subscribe, () => items, () => items)
}

/** Thêm/bỏ một sản phẩm. Trả về 'added', 'removed' hoặc 'full' (đã đủ 3). */
export function toggleCompare(product) {
  const id = Number(product?.id)
  if (!Number.isInteger(id) || id <= 0) return 'full'
  if (items.some((item) => item.id === id)) {
    write(items.filter((item) => item.id !== id))
    return 'removed'
  }
  if (items.length >= MAX_COMPARE) return 'full'
  write([...items, { id, name: String(product.name || '') }])
  return 'added'
}

export function removeCompare(id) {
  write(items.filter((item) => item.id !== Number(id)))
}

export function clearCompare() {
  write([])
}
