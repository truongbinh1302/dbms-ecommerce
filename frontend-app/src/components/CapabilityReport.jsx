// Mỗi mức có chữ và ký hiệu riêng, màu chỉ để nhìn nhanh.
const VERDICT_STYLES = {
  good: { mark: '✓', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  ok: { mark: '○', className: 'bg-sky-50 text-sky-800 ring-sky-200' },
  slow: { mark: '!', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  no: { mark: '✕', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
}

export function VerdictChip({ verdict, label }) {
  const style = VERDICT_STYLES[verdict] || VERDICT_STYLES.no
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${style.className}`}>
      <span aria-hidden="true">{style.mark}</span>
      {label}
    </span>
  )
}

function describeProfile(profile) {
  const parts = [`RAM ${profile.ramGB} GB`]
  if (profile.unifiedMemory) parts.push('bộ nhớ dùng chung cho card')
  else if (profile.vramGB > 0) parts.push(`${profile.gpuName || 'card rời'} ${profile.vramGB} GB VRAM`)
  else parts.push('không có card đồ hoạ rời')
  if (profile.cpuThreads) parts.push(`CPU ${profile.cpuThreads} luồng`)
  return parts.join(' · ')
}

/*
  "Máy này chạy được gì?": kết quả ước tính theo nhóm việc (AI trên máy, lập trình, đồ hoạ).
  compact: chỉ hiện câu tóm tắt và vài dòng AI, phần còn lại trong mục "Xem chi tiết" (dùng ở Build PC).
*/
export default function CapabilityReport({ capabilities, compact = false, headingLevel = 3 }) {
  if (!capabilities) return null
  const Heading = `h${headingLevel}`

  const groups = (
    <div className="space-y-4">
      {capabilities.groups.map((group) => (
        <div key={group.id}>
          <Heading className="text-sm font-black uppercase tracking-wide text-slate-500">{group.label}</Heading>
          <ul className="mt-2 divide-y divide-slate-100">
            {group.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  {item.examples ? <p className="text-xs text-slate-500">Ví dụ: {item.examples}</p> : null}
                  <p className="mt-0.5 text-xs leading-5 text-slate-600">{item.detail}</p>
                  {item.note ? <p className="text-xs leading-5 text-amber-800">{item.note}</p> : null}
                </div>
                <VerdictChip verdict={item.verdict} label={item.verdictLabel} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs leading-5 text-slate-500">
        Ước tính theo dung lượng RAM, VRAM và số luồng CPU (mô hình AI nén 4-bit), không phải kết quả đo thật.
        Tốc độ còn tuỳ phần mềm, nhiệt độ và cách cài đặt.
      </p>
    </div>
  )

  if (!compact) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="font-bold text-slate-900">{capabilities.summary}</p>
          <p className="mt-1 text-xs text-slate-600">{describeProfile(capabilities.profile)}</p>
        </div>
        {groups}
      </div>
    )
  }

  const ai = capabilities.groups.find((group) => group.id === 'ai')
  const highlights = (ai ? ai.items.filter((item) => item.id.startsWith('llm-')) : []).slice(0, 4)
  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold text-slate-900">{capabilities.summary}</p>
      <ul className="space-y-1">
        {highlights.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3">
            <span className="text-slate-700">{item.label.replace('Mô hình ngôn ngữ ', 'AI ')}</span>
            <VerdictChip verdict={item.verdict} label={item.verdictLabel} />
          </li>
        ))}
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-slate-600">Xem đủ: Docker, Android, máy ảo, Blender, dựng video</summary>
        <div className="mt-3">{groups}</div>
      </details>
    </div>
  )
}
