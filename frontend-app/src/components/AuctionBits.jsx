import useCountdown, { formatClockTime, formatCountdown } from '../hooks/useCountdown'

/* Mảnh giao diện dùng chung cho trang danh sách và trang phiên đấu giá. */

const PHASE_LABELS = {
  running: { label: 'Đang diễn ra', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  closing: { label: 'Đang chốt kết quả', className: 'bg-amber-50 text-amber-900 ring-amber-200' },
  upcoming: { label: 'Sắp mở', className: 'bg-sky-50 text-sky-800 ring-sky-200' },
  won: { label: 'Đã có người thắng', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  ordered: { label: 'Đã đặt hàng', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  unsold: { label: 'Không ai trả giá', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  expired: { label: 'Hết hạn đặt hàng', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  cancelled: { label: 'Đã huỷ', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
}

export function PhaseBadge({ phase }) {
  const style = PHASE_LABELS[phase] || PHASE_LABELS.won
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${style.className}`}>{style.label}</span>
}

/** Thông số RAM gọn: DDR5 · 32 GB · 2 thanh · laptop. */
export function RamChips({ ram }) {
  if (!ram) return null
  const chips = [ram.memoryType, ram.capacityGB ? `${ram.capacityGB} GB` : null, ram.modules ? `${ram.modules} thanh` : null, ram.laptop ? 'Laptop (SO-DIMM)' : 'Máy bàn (DIMM)'].filter(Boolean)
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Thông số RAM">
      {chips.map((chip) => <li key={chip} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{chip}</li>)}
    </ul>
  )
}

/** Đồng hồ của phiên: còn bao lâu kết thúc, hoặc bao lâu nữa mở. offsetMs = giờ máy chủ - giờ máy khách. */
export function AuctionClock({ auction, offsetMs, large = false }) {
  const target = auction.phase === 'upcoming' ? auction.startsAt : auction.phase === 'running' ? auction.endsAt : null
  const left = useCountdown(target, offsetMs)
  const size = large ? 'text-3xl' : 'text-sm'
  if (auction.phase === 'upcoming') {
    return (
      <span className={`${size} font-black tabular-nums text-sky-800`}>
        <span className="sr-only">Mở sau </span>{formatCountdown(left)}
        <span className="block text-xs font-semibold text-slate-500">Mở lúc {formatClockTime(auction.startsAt)}</span>
      </span>
    )
  }
  if (auction.phase === 'running') {
    const urgent = left < 5 * 60 * 1000
    return (
      <span className={`${size} font-black tabular-nums ${urgent ? 'text-red-700' : 'text-slate-900'}`}>
        <span className="sr-only">Còn </span>{formatCountdown(left)}
        <span className="block text-xs font-semibold text-slate-500">Kết thúc {formatClockTime(auction.endsAt)}{auction.extended ? ' (đã gia hạn)' : ''}</span>
      </span>
    )
  }
  return <span className={`${size} font-bold text-slate-600`}>Kết thúc {formatClockTime(auction.endedAt || auction.endsAt)}</span>
}
