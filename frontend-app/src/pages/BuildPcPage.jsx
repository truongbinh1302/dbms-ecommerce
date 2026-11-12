import { useEffect, useMemo, useState } from 'react'
import PageMessage from '../components/PageMessage'
import CapabilityReport from '../components/CapabilityReport'
import BuildPriceTrend from '../components/BuildPriceTrend'
import {
  adviseBuild,
  autoBuild,
  checkBuild,
  createBuildQuote,
  fetchBuildCapabilities,
  fetchBuildWatches,
  fetchBuilderComponents,
  fetchBuilderPresets,
  suggestUpgrades,
  unwatchBuild,
} from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import { mapApiProductToStoreProduct } from '../utils/productMapping'
import {
  MAX_QUANTITY,
  buildToItems,
  describePart,
  fitsSelection,
  loadSavedBuild,
  partsToBuild,
  saveBuild,
} from '../utils/buildPc'

const TABS = [
  { id: 'tu-chon', label: 'Tự chọn linh kiện' },
  { id: 'nhu-cau', label: 'Theo phần mềm cần dùng' },
  { id: 'nang-cap', label: 'Nâng cấp máy đang có' },
  { id: 'theo-doi', label: 'Cấu hình đang theo dõi giá' },
]

// Nhãn giá ngắn trong danh sách chọn linh kiện ("Nên mua lúc nào?").
const INSIGHT_SHORT = {
  lowest: 'thấp nhất 90 ngày',
  below_avg: 'dưới giá trung bình',
  above_avg: 'đang cao hơn trung bình',
}
const INSIGHT_TONE = {
  good: 'text-emerald-700',
  warn: 'text-amber-800',
  neutral: 'text-slate-500',
}

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

/*
  Build PC: tự chọn linh kiện có kiểm tra tương thích, gợi ý cấu hình theo phần mềm,
  tư vấn nâng cấp, và lưu báo giá giữ giá 48 giờ.
  Mọi giá và kết quả kiểm tra đều do server tính.
*/
export default function BuildPcPage({ initialTab = 'tu-chon', onBuyBuild, onAddToCart, currentUser = null, onRequireLogin }) {
  const [tab, setTab] = useState(TABS.some((item) => item.id === initialTab) ? initialTab : 'tu-chon')
  const [catalog, setCatalog] = useState({ loaded: false, slots: [], components: [], error: '' })
  const [build, setBuild] = useState(loadSavedBuild)

  useEffect(() => {
    let cancelled = false
    fetchBuilderComponents()
      .then((data) => {
        if (!cancelled) setCatalog({ loaded: true, slots: data.slots || [], components: data.components || [], error: '' })
      })
      .catch((err) => {
        if (!cancelled) setCatalog({ loaded: true, slots: [], components: [], error: err.message || 'Không tải được linh kiện' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveBuild(build)
  }, [build])

  function applyParts(parts) {
    setBuild(partsToBuild(parts))
    setTab('tu-chon')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!catalog.loaded) return <PageMessage title="Đang tải linh kiện..." />
  if (catalog.error) return <PageMessage title="Không tải được linh kiện" description={catalog.error} />

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h1 className="text-2xl font-black text-slate-900">Build PC</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Chọn linh kiện, hệ thống kiểm tra socket, loại RAM, kích thước case, chiều cao tản và công suất nguồn ngay khi bạn chọn.
          Lưu báo giá để giữ giá trong 48 giờ và gửi link cho người khác xem.
        </p>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Cách build">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'tu-chon' ? (
        <Builder
          catalog={catalog}
          build={build}
          setBuild={setBuild}
          onBuyBuild={onBuyBuild}
          currentUser={currentUser}
          onRequireLogin={onRequireLogin}
        />
      ) : null}
      {tab === 'nhu-cau' ? <PresetPicker onApplyParts={applyParts} /> : null}
      {tab === 'nang-cap' ? <UpgradeAdvisor onAddToCart={onAddToCart} /> : null}
      {tab === 'theo-doi' ? (
        <WatchedBuilds catalog={catalog} currentUser={currentUser} onRequireLogin={onRequireLogin} onApplyParts={applyParts} />
      ) : null}
    </div>
  )
}

function Builder({ catalog, build, setBuild, onBuyBuild, currentUser, onRequireLogin }) {
  const [onlyCompatible, setOnlyCompatible] = useState(true)
  const [result, setResult] = useState({ key: '', data: null, error: '' })
  const [capability, setCapability] = useState({ key: '', data: null })
  const [quote, setQuote] = useState({ busy: false, data: null, error: '' })
  const [title, setTitle] = useState('')

  const byId = useMemo(() => new Map(catalog.components.map((part) => [part.productId, part])), [catalog.components])
  const selected = useMemo(() => {
    const parts = {}
    for (const [type, slot] of Object.entries(build)) {
      const part = slot && byId.get(Number(slot.productId))
      if (part) parts[type] = part
    }
    return parts
  }, [build, byId])

  const items = useMemo(() => buildToItems(build).filter((item) => byId.has(item.productId)), [build, byId])
  const itemsKey = JSON.stringify(items)

  // Gọi server kiểm tra sau mỗi lần đổi (chờ 250 ms để không gọi liên tục).
  useEffect(() => {
    if (items.length === 0) return undefined
    let cancelled = false
    const timer = window.setTimeout(() => {
      checkBuild(JSON.parse(itemsKey))
        .then((data) => {
          if (!cancelled) setResult({ key: itemsKey, data, error: '' })
        })
        .catch((err) => {
          if (!cancelled) setResult({ key: itemsKey, data: null, error: err.message || 'Không kiểm tra được cấu hình' })
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [itemsKey, items.length])

  // "Máy này chạy được gì?" cho cấu hình đang ráp (gồm cả linh kiện khách đã có).
  useEffect(() => {
    if (items.length === 0) return undefined
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchBuildCapabilities(JSON.parse(itemsKey))
        .then((data) => !cancelled && setCapability({ key: itemsKey, data }))
        .catch(() => !cancelled && setCapability({ key: itemsKey, data: null }))
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [itemsKey, items.length])

  const current = items.length > 0 && result.key === itemsKey ? result : null
  const capabilityData = items.length > 0 && capability.key === itemsKey ? capability.data : null
  const check = current?.data?.check
  const errorTypes = new Set((check?.errors || []).flatMap((error) => error.types))
  const toBuy = items.filter((item) => !item.owned)

  function updateSlot(type, patch) {
    setQuote({ busy: false, data: null, error: '' })
    setBuild((currentBuild) => {
      const next = { ...currentBuild }
      const merged = { quantity: 1, owned: false, ...(currentBuild[type] || {}), ...patch }
      if (!merged.productId) delete next[type]
      else next[type] = merged
      return next
    })
  }

  async function handleSaveQuote() {
    setQuote({ busy: true, data: null, error: '' })
    try {
      const data = await createBuildQuote(items, title.trim())
      setQuote({ busy: false, data, error: '' })
    } catch (err) {
      setQuote({ busy: false, data: null, error: err.message || 'Không lưu được báo giá' })
    }
  }

  function handleBuy() {
    const parts = toBuy.map((item) => ({ ...byId.get(item.productId), quantity: item.quantity }))
    onBuyBuild(parts, quote.data?.code || '')
  }

  const shareUrl = quote.data ? `${window.location.origin}${window.location.pathname}${hrefFor(`/bao-gia/${quote.data.code}`)}` : ''

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-slate-900">Linh kiện</h2>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" checked={onlyCompatible} onChange={(event) => setOnlyCompatible(event.target.checked)} />
              Chỉ hiện linh kiện hợp với lựa chọn
            </label>
            {items.length > 0 ? (
              <button type="button" onClick={() => setBuild({})} className="font-semibold text-slate-500 hover:text-red-600">
                Xoá hết
              </button>
            ) : null}
          </div>
        </div>

        <ul className="mt-4 divide-y divide-slate-100">
          {catalog.slots.map(({ type, label }) => {
            const slot = build[type]
            const part = selected[type]
            const others = Object.fromEntries(Object.entries(selected).filter(([key]) => key !== type))
            const options = catalog.components.filter((item) => item.type === type
              && (!onlyCompatible || item.productId === part?.productId || fitsSelection(item, others)))
            const maxQuantity = MAX_QUANTITY[type] || 1
            const hasError = errorTypes.has(type)

            return (
              <li key={type} className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <label htmlFor={`slot-${type}`} className={`w-28 shrink-0 pt-2 text-sm font-bold ${hasError ? 'text-red-600' : 'text-slate-900'}`}>
                    {label}
                  </label>
                  <div className="min-w-0 flex-1">
                    <select
                      id={`slot-${type}`}
                      value={slot?.productId || ''}
                      onChange={(event) => updateSlot(type, { productId: Number(event.target.value) || null })}
                      aria-invalid={hasError}
                      className={`w-full rounded-xl border bg-white px-3 py-2 text-sm ${hasError ? 'border-red-400' : 'border-slate-200'}`}
                    >
                      <option value="">— Chưa chọn —</option>
                      {options.map((item) => (
                        <option key={item.productId} value={item.productId} disabled={item.stock <= 0 && item.productId !== part?.productId}>
                          {item.name} — {formatCurrency(item.price)}
                          {INSIGHT_SHORT[item.priceInsight?.label] ? ` · ${INSIGHT_SHORT[item.priceInsight.label]}` : ''}
                          {item.stock <= 0 ? ' (hết hàng)' : ''}
                        </option>
                      ))}
                    </select>
                    {part?.priceInsight && part.priceInsight.label !== 'new' ? (
                      <p className={`mt-2 text-xs ${INSIGHT_TONE[part.priceInsight.tone] || INSIGHT_TONE.neutral}`}>{part.priceInsight.text}</p>
                    ) : null}
                    {part ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span>{describePart(part)}</span>
                        <a href={hrefFor(`/san-pham/${part.productId}`)} className="font-semibold text-slate-600 hover:text-red-600">Xem sản phẩm</a>
                        {maxQuantity > 1 ? (
                          <label className="flex items-center gap-1">
                            Số lượng
                            <select
                              value={slot.quantity || 1}
                              onChange={(event) => updateSlot(type, { quantity: Number(event.target.value) })}
                              className="rounded-lg border border-slate-200 px-1 py-0.5"
                            >
                              {Array.from({ length: maxQuantity }, (_, index) => index + 1).map((value) => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={Boolean(slot.owned)} onChange={(event) => updateSlot(type, { owned: event.target.checked })} />
                          Tôi đã có (không mua)
                        </label>
                      </div>
                    ) : null}
                  </div>
                  <div className="w-32 shrink-0 text-right text-sm font-bold text-slate-900 sm:pt-2">
                    {part ? (slot.owned ? <span className="font-normal text-slate-500">Đã có</span> : formatCurrency(part.price * (slot.quantity || 1))) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <aside className={`${CARD} h-fit space-y-4 lg:sticky lg:top-28`}>
        <h2 className="text-xl font-black text-slate-900">Kiểm tra cấu hình</h2>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Chọn linh kiện bên trái, hoặc dùng tab “Theo phần mềm cần dùng” để hệ thống ráp sẵn.</p>
        ) : null}
        {current?.error ? <p className="text-sm text-red-600">{current.error}</p> : null}
        {items.length > 0 && !current ? <p className="text-sm text-slate-500">Đang kiểm tra...</p> : null}

        {check ? (
          <div className="space-y-3 text-sm">
            {check.errors.length === 0 ? (
              <p className="rounded-2xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">
                {check.complete ? '✓ Các linh kiện tương thích với nhau.' : '✓ Chưa thấy linh kiện nào xung đột.'}
              </p>
            ) : (
              <ul className="space-y-2" aria-label="Lỗi tương thích">
                {check.errors.map((error) => (
                  <li key={`${error.code}-${error.message}`} className="rounded-2xl bg-red-50 px-3 py-2 text-red-700">✕ {error.message}</li>
                ))}
              </ul>
            )}
            {check.warnings.length > 0 ? (
              <ul className="space-y-2" aria-label="Cảnh báo">
                {check.warnings.map((warning) => (
                  <li key={warning.code} className="rounded-2xl bg-amber-50 px-3 py-2 text-amber-800">! {warning.message}</li>
                ))}
              </ul>
            ) : null}
            <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-slate-600">
              <dt>Công suất ước tính</dt>
              <dd className="text-right font-semibold text-slate-900">{check.estimatedPowerW} W</dd>
              <dt>Nguồn nên dùng</dt>
              <dd className="text-right font-semibold text-slate-900">từ {check.recommendedPsuW} W</dd>
            </dl>
          </div>
        ) : null}

        {current?.data?.issues?.some((issue) => issue.issue === 'insufficient_stock') ? (
          <p className="text-sm text-red-600">
            {current.data.issues.filter((issue) => issue.issue === 'insufficient_stock').map((issue) => `${issue.productName}: chỉ còn ${issue.availableStock}`).join('; ')}
          </p>
        ) : null}

        {capabilityData ? (
          <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-900">Máy này chạy được gì?</h3>
            {capabilityData.capabilities ? (
              <CapabilityReport capabilities={capabilityData.capabilities} compact headingLevel={4} />
            ) : (
              <p className="text-sm text-slate-500">{capabilityData.message}</p>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-4">
          <span className="font-semibold text-slate-700">Tạm tính ({toBuy.length} linh kiện cần mua)</span>
          <span className="text-2xl font-black text-red-600">{formatCurrency(current?.data?.subtotal || 0)}</span>
        </div>

        <button
          type="button"
          disabled={toBuy.length === 0 || !check}
          onClick={handleBuy}
          className="w-full rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {quote.data ? `Đặt hàng theo báo giá ${quote.data.code}` : 'Thêm vào giỏ và đặt hàng'}
        </button>

        {check && check.errors.length > 0 && toBuy.length > 0 ? (
          <p className="text-xs text-amber-700">Cấu hình đang có lỗi tương thích. Bạn vẫn có thể mua, nhưng nên sửa trước.</p>
        ) : null}

        <BuildPriceTrend items={items} title={title.trim()} currentUser={currentUser} onRequireLogin={onRequireLogin} />

        <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-900">Lưu báo giá giữ giá 48 giờ</h3>
          {quote.data ? (
            <div className="space-y-2 text-sm">
              <p className="text-emerald-700">
                Đã lưu báo giá <strong>{quote.data.code}</strong>, giữ giá đến {new Date(quote.data.expiresAt).toLocaleString('vi-VN')}.
              </p>
              <div className="flex gap-2">
                <input readOnly value={shareUrl} aria-label="Link báo giá" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs" />
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => {})}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                >
                  Sao chép
                </button>
              </div>
              <a href={hrefFor(`/bao-gia/${quote.data.code}`)} className="inline-block font-semibold text-red-600">Xem trang báo giá</a>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Tên cấu hình (không bắt buộc)"
                aria-label="Tên cấu hình"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={toBuy.length === 0 || quote.busy}
                onClick={handleSaveQuote}
                className="w-full rounded-2xl border border-slate-900 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
              >
                {quote.busy ? 'Đang lưu...' : 'Lưu báo giá'}
              </button>
              {quote.error ? <p className="text-sm text-red-600">{quote.error}</p> : null}
              <p className="text-xs text-slate-500">Trong 48 giờ, nếu giá tăng bạn vẫn mua theo giá báo; nếu giá giảm bạn được giá thấp hơn. Báo giá không giữ hàng trong kho.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

/* Kết quả tư vấn theo mô tả: vì sao chọn nhu cầu này, so với ngân sách khách nêu. */
function AdviceSummary({ advice, subtotal }) {
  return (
    <div className="mt-3 space-y-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">
      {advice.matched.length ? <p>Nhận ra từ mô tả: {advice.matched.join(', ')}.</p> : null}
      {advice.budget ? (
        advice.withinBudget === null ? null : advice.withinBudget ? (
          <p className="font-semibold text-emerald-700">Vừa ngân sách {formatCurrency(advice.budget)}, còn dư {formatCurrency(advice.difference)}.</p>
        ) : (
          <p className="font-semibold text-amber-800">
            Cấu hình tối thiểu hiện là {formatCurrency(subtotal)}, vượt ngân sách {formatCurrency(advice.budget)} khoảng {formatCurrency(advice.difference)}.
          </p>
        )
      ) : <p>Bạn chưa nêu ngân sách; đây là cấu hình rẻ nhất đạt ngưỡng cho nhu cầu.</p>}
      {advice.notes.map((note) => <p key={note}>{note}</p>)}
    </div>
  )
}

function PresetPicker({ onApplyParts }) {
  const [presets, setPresets] = useState(null)
  const [error, setError] = useState('')
  const [suggestion, setSuggestion] = useState({ id: '', busy: false, data: null, error: '' })
  const [need, setNeed] = useState('')
  const [advice, setAdvice] = useState({ busy: false, result: null, error: '' })

  useEffect(() => {
    let cancelled = false
    fetchBuilderPresets()
      .then((data) => {
        if (!cancelled) setPresets(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Không tải được danh sách nhu cầu')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAdvise(event) {
    event.preventDefault()
    setAdvice({ busy: true, result: null, error: '' })
    try {
      const result = await adviseBuild(need)
      setAdvice({ busy: false, result, error: '' })
      if (result.preset) {
        setSuggestion({ id: result.preset.id, busy: false, data: result, error: result.parts ? '' : result.message })
      } else {
        setSuggestion({ id: '', busy: false, data: null, error: '' })
      }
    } catch (err) {
      setAdvice({ busy: false, result: null, error: err.message || 'Không tư vấn được' })
    }
  }

  async function handlePick(presetId) {
    setAdvice({ busy: false, result: null, error: '' })
    setSuggestion({ id: presetId, busy: true, data: null, error: '' })
    try {
      const data = await autoBuild(presetId)
      setSuggestion({ id: presetId, busy: false, data, error: data.parts ? '' : data.message })
    } catch (err) {
      setSuggestion({ id: presetId, busy: false, data: null, error: err.message || 'Không ráp được cấu hình' })
    }
  }

  if (error) return <PageMessage title="Không tải được danh sách nhu cầu" description={error} />
  if (!presets) return <PageMessage title="Đang tải..." />

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Bạn cần máy để làm gì?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Hệ thống chọn linh kiện rẻ nhất còn hàng đạt ngưỡng cửa hàng khuyến nghị cho từng nhu cầu và tương thích với nhau.
          Ngưỡng là khuyến nghị của cửa hàng, không phải yêu cầu chính thức của nhà phát triển phần mềm.
        </p>
        <form onSubmit={handleAdvise} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="build-need" className="sr-only">Mô tả nhu cầu và ngân sách</label>
          <input
            id="build-need"
            value={need}
            onChange={(event) => setNeed(event.target.value)}
            maxLength={500}
            placeholder="Ví dụ: sinh viên CNTT, code web và chạy Docker, tầm 20 triệu"
            className="min-w-0 flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-500"
          />
          <button type="submit" disabled={advice.busy || need.trim().length < 3} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">
            {advice.busy ? 'Đang ráp...' : 'Gợi ý theo mô tả'}
          </button>
        </form>
        {advice.error ? <p className="mt-2 text-sm text-red-600" role="alert">{advice.error}</p> : null}
        {advice.result && !advice.result.preset ? (
          <p className="mt-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{advice.result.message}</p>
        ) : null}
        {advice.result?.advice?.notes?.length && !advice.result.preset ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-600">{advice.result.advice.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        ) : null}
        <p className="mt-4 text-sm font-semibold text-slate-700">Hoặc chọn một nhu cầu:</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePick(preset.id)}
              aria-pressed={suggestion.id === preset.id}
              className={`rounded-2xl border p-4 text-left transition ${suggestion.id === preset.id ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-400'}`}
            >
              <div className="font-bold text-slate-900">{preset.name}</div>
              <div className="mt-1 text-sm text-slate-600">{preset.software}</div>
              <div className="mt-2 text-xs text-slate-600">
                RAM từ {preset.needs.ramGB} GB · ổ từ {preset.needs.storageGB >= 1000 ? `${preset.needs.storageGB / 1000} TB` : `${preset.needs.storageGB} GB`}
                {preset.needs.gpu ? ` · card từ ${preset.needs.gpu.minVramGB} GB VRAM` : ' · không cần card rời'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {suggestion.id ? (
        <section className={CARD}>
          {suggestion.busy ? <p className="text-slate-500">Đang ráp cấu hình...</p> : null}
          {suggestion.error ? <p className="text-red-600">{suggestion.error}</p> : null}
          {suggestion.data?.parts ? (
            <>
              <h2 className="text-xl font-black text-slate-900">Cấu hình gợi ý: {suggestion.data.preset.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{suggestion.data.preset.reason}</p>
              {suggestion.data.advice ? <AdviceSummary advice={suggestion.data.advice} subtotal={suggestion.data.subtotal} /> : null}
              <ul className="mt-4 divide-y divide-slate-100 text-sm">
                {suggestion.data.parts.map((part) => (
                  <li key={part.productId} className="flex justify-between gap-3 py-2">
                    <span>
                      <a href={hrefFor(`/san-pham/${part.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">{part.name}</a>
                      <span className="block text-xs text-slate-500">{describePart(part)}</span>
                    </span>
                    <span className="shrink-0 font-semibold">{formatCurrency(part.price)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-4">
                <div className="text-sm text-slate-600">
                  Ước tính {suggestion.data.check.estimatedPowerW} W ·{' '}
                  <span className="text-2xl font-black text-red-600">{formatCurrency(suggestion.data.subtotal)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onApplyParts(suggestion.data.parts)}
                  className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
                >
                  Dùng cấu hình này để chỉnh tiếp
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

const EMPTY_CURRENT = { socket: '', memoryType: '', psuWatts: '', maxGpuLengthMm: '', gpuPowerW: '', hasM2Slot: true }

function UpgradeAdvisor({ onAddToCart }) {
  const [form, setForm] = useState(EMPTY_CURRENT)
  const [state, setState] = useState({ busy: false, data: null, error: '' })

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setState({ busy: true, data: null, error: '' })
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''))
      const data = await suggestUpgrades(payload)
      setState({ busy: false, data, error: '' })
    } catch (err) {
      setState({ busy: false, data: null, error: err.message || 'Không lấy được gợi ý' })
    }
  }

  const groups = [
    ['cpu', 'CPU cùng socket'],
    ['ram', 'RAM cùng loại'],
    ['gpu', 'Card đồ hoạ vừa case và nguồn'],
    ['storage', 'Ổ cứng'],
  ]

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Máy bạn đang có</h2>
        <p className="mt-1 text-sm text-slate-500">Điền những gì bạn biết; ô để trống sẽ không dùng để lọc. Thông tin có trên hộp linh kiện hoặc trong CPU-Z.</p>
        <p className="mt-1 text-sm text-slate-500">
          Dùng laptop, hoặc muốn biết máy chạy được AI, Docker hay Blender không?{' '}
          <a href={hrefFor('/kiem-tra-may')} className="font-semibold text-red-600 underline">Kiểm tra bằng file DxDiag</a>
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Socket CPU / mainboard</span>
            <select value={form.socket} onChange={(event) => update('socket', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
              <option value="">Không rõ</option>
              <option value="AM4">AMD AM4 (Ryzen 1000–5000)</option>
              <option value="AM5">AMD AM5 (Ryzen 7000 trở lên)</option>
              <option value="LGA1700">Intel LGA1700 (Core 12–14)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Loại RAM</span>
            <select value={form.memoryType} onChange={(event) => update('memoryType', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
              <option value="">Không rõ</option>
              <option value="DDR4">DDR4</option>
              <option value="DDR5">DDR5</option>
            </select>
          </label>
          <NumberField label="Công suất nguồn (W)" value={form.psuWatts} onChange={(value) => update('psuWatts', value)} placeholder="Ví dụ: 550" />
          <NumberField label="Case chứa card dài tối đa (mm)" value={form.maxGpuLengthMm} onChange={(value) => update('maxGpuLengthMm', value)} placeholder="Ví dụ: 300" />
          <NumberField label="Công suất card hiện tại (W)" value={form.gpuPowerW} onChange={(value) => update('gpuPowerW', value)} placeholder="Để trống nếu dùng iGPU" />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.hasM2Slot} onChange={(event) => update('hasM2Slot', event.target.checked)} />
            Mainboard còn khe M.2 trống
          </label>
        </div>
        <button type="submit" disabled={state.busy} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">
          {state.busy ? 'Đang tìm...' : 'Xem linh kiện nâng cấp được'}
        </button>
        {state.error ? <p className="mt-3 text-sm text-red-600">{state.error}</p> : null}
      </form>

      {state.data ? (
        <section className={`${CARD} grid gap-5 md:grid-cols-2`}>
          {groups.map(([type, label]) => {
            const list = state.data.options[type] || []
            return (
              <div key={type}>
                <h3 className="font-bold text-slate-900">{label}</h3>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {type === 'cpu' && !form.socket ? 'Chọn socket để xem CPU lắp được.' : null}
                    {type === 'ram' && !form.memoryType ? 'Chọn loại RAM để xem RAM lắp được.' : null}
                    {(type === 'cpu' && form.socket) || (type === 'ram' && form.memoryType) || type === 'gpu' || type === 'storage' ? 'Không có linh kiện phù hợp còn hàng.' : null}
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {list.map((part) => (
                      <li key={part.productId} className="flex items-start justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <a href={hrefFor(`/san-pham/${part.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">{part.name}</a>
                          <span className="block text-xs text-slate-500">{describePart(part)}</span>
                          {part.note ? <span className="block text-xs text-amber-700">{part.note}</span> : null}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold">{formatCurrency(part.price)}</span>
                          <button
                            type="button"
                            onClick={() => onAddToCart(mapApiProductToStoreProduct({
                              id: part.productId,
                              name: part.name,
                              brand: part.brand,
                              price: part.price,
                              oldPrice: part.oldPrice,
                              stock: part.stock,
                              images: part.image ? [part.image] : [],
                            }))}
                            className="mt-1 text-xs font-bold text-red-600 hover:underline"
                          >
                            Thêm vào giỏ
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2">
            Mua linh kiện xong mà không muốn tự lắp?{' '}
            <a href={hrefFor('/dich-vu/tai-nha?dv=upgrade')} className="font-bold text-red-600 underline">Đặt kỹ thuật viên nâng cấp tại nhà</a>
          </p>
        </section>
      ) : null}
    </div>
  )
}

function NumberField({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
      />
    </label>
  )
}

/* Cấu hình đang theo dõi giá: tổng lúc bắt đầu, tổng hiện tại (tính cả Hot Deal), mở lại trong Build PC. */
function WatchedBuilds({ catalog, currentUser, onRequireLogin, onApplyParts }) {
  const [state, setState] = useState({ loaded: false, items: [], error: '' })
  const [version, setVersion] = useState(0)
  const byId = useMemo(() => new Map(catalog.components.map((part) => [part.productId, part])), [catalog.components])

  useEffect(() => {
    if (!currentUser) return undefined
    let cancelled = false
    fetchBuildWatches()
      .then((items) => !cancelled && setState({ loaded: true, items: Array.isArray(items) ? items : [], error: '' }))
      .catch((err) => !cancelled && setState({ loaded: true, items: [], error: err.message || 'Không tải được danh sách' }))
    return () => {
      cancelled = true
    }
  }, [currentUser, version])

  if (!currentUser) {
    return (
      <section className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Cấu hình đang theo dõi giá</h2>
        <p className="mt-2 text-sm text-slate-600">Đăng nhập để xem các cấu hình bạn đã bật “Báo khi cả bộ rẻ hơn”.</p>
        <button type="button" onClick={() => onRequireLogin?.()} className="mt-4 rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">Đăng nhập</button>
      </section>
    )
  }

  async function handleRemove(id) {
    try {
      await unwatchBuild(id)
      setVersion((value) => value + 1)
    } catch (err) {
      setState((current) => ({ ...current, error: err.message || 'Không bỏ theo dõi được' }))
    }
  }

  return (
    <section className={CARD} aria-labelledby="watched-builds-title">
      <h2 id="watched-builds-title" className="text-xl font-black text-slate-900">Cấu hình đang theo dõi giá</h2>
      <p className="mt-1 text-sm text-slate-600">Khi tổng giá các linh kiện (tính cả Hot Deal) thấp hơn lúc bắt đầu theo dõi, bạn nhận thông báo trong tài khoản. Tối đa 10 cấu hình.</p>
      {!state.loaded ? <p className="mt-4 text-sm text-slate-500">Đang tải...</p> : null}
      {state.error ? <p className="mt-4 text-sm font-semibold text-red-600" role="alert">{state.error}</p> : null}
      {state.loaded && !state.error && state.items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">Chưa có cấu hình nào. Ráp cấu hình ở tab “Tự chọn linh kiện” rồi bấm “Báo khi cả bộ rẻ hơn”.</p>
      ) : null}
      {state.items.length > 0 ? (
        <ul className="mt-4 divide-y divide-slate-100">
          {state.items.map((watch) => {
            const diff = watch.currentTotal === null ? null : watch.currentTotal - watch.totalAtWatch
            const parts = watch.items.map((item) => byId.get(item.productId)).filter(Boolean)
            return (
              <li key={watch.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-bold text-slate-900">{watch.title || `Cấu hình ${watch.items.length} linh kiện`}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{parts.map((part) => part.name).join(' · ')}</p>
                  <p className="mt-1 text-slate-700">
                    Lúc bắt đầu {formatCurrency(watch.totalAtWatch)}
                    {watch.currentTotal === null ? ' · có linh kiện đã ngừng bán' : ` · hiện tại ${formatCurrency(watch.currentTotal)}`}
                  </p>
                  {diff !== null && diff !== 0 ? (
                    <p className={`text-xs font-semibold ${diff < 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                      {diff < 0 ? `Rẻ hơn ${formatCurrency(-diff)}` : `Đắt hơn ${formatCurrency(diff)}`}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button
                    type="button"
                    disabled={parts.length === 0}
                    onClick={() => onApplyParts(watch.items.map((item) => ({ ...byId.get(item.productId), quantity: item.quantity })).filter((part) => part.type))}
                    className="font-bold text-red-600 hover:underline disabled:text-slate-400"
                  >
                    Mở trong Build PC
                  </button>
                  <button type="button" onClick={() => handleRemove(watch.id)} className="font-semibold text-slate-500 hover:text-red-600">Bỏ theo dõi</button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
