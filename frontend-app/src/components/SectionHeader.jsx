import StoreGlyph from './StoreGlyph'
import { classNames } from '../utils/format'

export default function SectionHeader({
  icon,
  title,
  subtitle,
  tabs = [],
  activeTab,
  onTabChange,
  highlight = false,
}) {
  return (
    <div
      className={classNames(
        'flex flex-col gap-4 rounded-[28px] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)] md:px-6',
        highlight && 'ring-2 ring-red-500/30',
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <StoreGlyph name={icon} className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">{title}</div>
            <div className="text-sm text-slate-500">{subtitle}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={classNames(
                'rounded-full border px-4 py-2 font-medium transition',
                activeTab === tab
                  ? 'border-red-500 bg-red-500 text-white shadow-lg shadow-red-500/20'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-red-200 hover:text-red-600',
              )}
            >
              {tab}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onTabChange('Tất cả')}
            className="inline-flex items-center gap-2 rounded-full border border-transparent px-4 py-2 font-semibold text-red-600 transition hover:bg-red-50"
          >
            Xem tất cả
            <StoreGlyph name="chevron-right" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
