import { hrefFor } from '../hooks/useHashRoute'
import { MAX_COMPARE, clearCompare, removeCompare, useCompareItems } from '../hooks/useCompare'

/* Thanh so sánh nổi: hiện khi khách đã chọn sản phẩm để so sánh. Ẩn ở chính trang so sánh. */
export default function CompareBar({ hidden = false }) {
  const items = useCompareItems()
  if (hidden || items.length === 0) return null
  const ids = items.map((item) => item.id).join(',')
  return (
    <div className="fixed inset-x-4 bottom-36 z-40 rounded-3xl bg-slate-950 p-3 text-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-w-[min(640px,calc(100vw-280px))]" role="region" aria-label="So sánh sản phẩm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">So sánh {items.length}/{MAX_COMPARE}</span>
        {items.map((item) => (
          <span key={item.id} className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 text-xs">
            <span className="truncate">{item.name || `#${item.id}`}</span>
            <button type="button" onClick={() => removeCompare(item.id)} aria-label={`Bỏ ${item.name || item.id} khỏi so sánh`} className="flex size-6 items-center justify-center rounded-full hover:bg-white/20">×</button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={clearCompare} className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10">Xoá hết</button>
          {items.length >= 2 ? (
            <a href={hrefFor(`/so-sanh?ids=${ids}`)} className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-red-700">So sánh ngay</a>
          ) : <span className="text-xs text-slate-300">Chọn thêm 1 sản phẩm</span>}
        </span>
      </div>
    </div>
  )
}
