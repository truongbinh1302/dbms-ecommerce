import { useEffect, useRef, useState } from 'react'
import CapabilityReport from './CapabilityReport'
import { fetchAssistantStatus, streamBuildAgent } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
const MAX_CHARS = 600

const EXAMPLES = [
  'Chơi game eSports và stream lên YouTube, tầm 40 triệu',
  'Chạy mô hình AI cỡ 8B và Stable Diffusion trên máy, khoảng 70 triệu',
  'Sinh viên CNTT code web, chạy Docker và máy ảo Android, dưới 30 triệu',
  'Máy văn phòng cho bố mẹ xem phim, học online, càng rẻ càng tốt',
  'Dựng video 4K bằng DaVinci Resolve, ngân sách 55 triệu',
]

const STEP_MARK = {
  ok: { mark: '✓', className: 'bg-emerald-100 text-emerald-800', label: 'xong' },
  info: { mark: '•', className: 'bg-slate-100 text-slate-700', label: 'đã xem' },
  rejected: { mark: '↺', className: 'bg-amber-100 text-amber-900', label: 'bị trả lại' },
}
const INSIGHT_TONE = { good: 'text-emerald-700', warn: 'text-amber-800', neutral: 'text-slate-500' }

const stepKind = (step) => (step.rejected ? 'rejected' : step.ok ? 'ok' : 'info')
const seconds = (ms) => `${Math.max(1, Math.round(ms / 1000))} giây`

/*
  "Nhờ AI ráp máy": khách mô tả nhu cầu bằng lời, trợ lý AI chọn linh kiện đang bán và chốt cấu hình.
  Từng bước trợ lý làm (tìm linh kiện, kiểm tra, bị hệ thống trả lại, chốt) hiện ngay khi xảy ra.
  Cấu hình hiện ra đã được máy chủ kiểm tra lại: có trong kho, đủ hàng, tương thích, không vượt ngân sách.
*/
export default function BuildAgent({ onApplyParts, onBuyBuild }) {
  const [enabled, setEnabled] = useState(null)
  const [request, setRequest] = useState('')
  const [budget, setBudget] = useState('')
  const [run, setRun] = useState({ busy: false, round: 0, steps: [], result: null, error: '', startedAt: 0 })
  const [variant, setVariant] = useState('main')
  const controllerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchAssistantStatus()
      .then((data) => {
        if (!cancelled) setEnabled(Boolean(data.enabled))
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
      controllerRef.current?.abort()
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = request.trim()
    if (text.length < 5 || run.busy) return
    const controller = new AbortController()
    controllerRef.current = controller
    setVariant('main')
    setRun({ busy: true, round: 0, steps: [], result: null, error: '', startedAt: Date.now() })
    const body = { request: text }
    if (budget !== '') body.budget = Math.round(Number(budget) * 1000000)
    try {
      const result = await streamBuildAgent(body, (item) => {
        if (item.type === 'thinking') setRun((current) => ({ ...current, round: item.round }))
        if (item.type === 'step') setRun((current) => ({ ...current, steps: [...current.steps, item.step] }))
      }, controller.signal)
      setRun((current) => ({ ...current, busy: false, result }))
    } catch (err) {
      const message = err.name === 'AbortError' ? 'Đã dừng.' : err.message || 'Trợ lý đang bận, bạn thử lại sau nhé.'
      setRun((current) => ({ ...current, busy: false, error: message }))
    } finally {
      controllerRef.current = null
    }
  }

  if (enabled === null) return <section className={CARD}><p className="text-slate-500">Đang tải...</p></section>
  if (!enabled) {
    return (
      <section className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Nhờ AI ráp máy</h2>
        <p className="mt-2 text-sm text-slate-600">
          Trợ lý AI chưa được bật. Quản trị viên nhập khoá OpenAI ở trang Quản trị, mục Trợ lý AI. Trong lúc chờ, bạn dùng tab
          “Theo phần mềm cần dùng” để hệ thống gợi ý cấu hình.
        </p>
      </section>
    )
  }

  const { result } = run
  const builds = result?.builds || []
  const shown = builds.find((build) => build.variant === variant) || builds[0]
  const budgetValue = budget === '' ? null : Number(budget)
  const budgetInvalid = budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 3 || budgetValue > 500)

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Nhờ AI ráp máy</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
          Mô tả việc bạn cần làm và ngân sách. Trợ lý AI chọn linh kiện đang bán ở cửa hàng. Trước khi hiện ra, mỗi cấu hình được hệ thống
          kiểm tra lại: có hàng, lắp vừa với nhau, nguồn đủ công suất và không vượt ngân sách. Sai ở đâu, trợ lý phải tự sửa.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="build-agent-request" className="text-sm font-bold text-slate-800">Bạn cần máy để làm gì?</label>
              <span className="text-xs text-slate-500">{request.length}/{MAX_CHARS}</span>
            </div>
            <textarea
              id="build-agent-request"
              value={request}
              onChange={(event) => setRequest(event.target.value.slice(0, MAX_CHARS))}
              rows={3}
              placeholder="Ví dụ: chơi game eSports và stream, chạy thử mô hình AI cỡ 8B, ngân sách tầm 40 triệu"
              className="mt-1 w-full resize-y rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-500"
            />
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Yêu cầu mẫu">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRequest(example)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="build-agent-budget" className="block text-sm font-bold text-slate-800">
                Ngân sách <span className="font-normal text-slate-500">(triệu đồng, không bắt buộc)</span>
              </label>
              <input
                id="build-agent-budget"
                type="number"
                inputMode="decimal"
                min="3"
                max="500"
                step="0.5"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                aria-describedby="build-agent-budget-hint"
                className="mt-1 w-40 rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-red-500"
              />
            </div>
            <div className="flex gap-2">
              {run.busy ? (
                <button type="button" onClick={() => controllerRef.current?.abort()} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:border-slate-500">
                  Dừng
                </button>
              ) : null}
              <button
                type="submit"
                disabled={run.busy || request.trim().length < 5 || budgetInvalid}
                className="rounded-2xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300"
              >
                {run.busy ? 'Đang ráp...' : 'Nhờ AI ráp'}
              </button>
            </div>
          </div>
          <p id="build-agent-budget-hint" className="text-xs text-slate-500">Để trống ngân sách thì trợ lý đọc ngân sách trong câu bạn gõ.</p>
          {budgetInvalid ? <p className="text-sm text-red-600" role="alert">Ngân sách cần từ 3 đến 500 triệu đồng.</p> : null}
        </form>
      </section>

      {run.busy || run.steps.length > 0 || run.error || result ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            {run.error ? <p className="rounded-[28px] bg-red-50 px-5 py-4 text-sm font-semibold text-red-700" role="alert">{run.error}</p> : null}
            {run.busy && !result ? (
              <section className={CARD}>
                <p className="text-sm font-semibold text-slate-700">Trợ lý đang chọn linh kiện. Thường mất 15 đến 60 giây; các bước hiện ở khung bên cạnh.</p>
              </section>
            ) : null}
            {result && result.status !== 'built' ? (
              <section className={CARD}>
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{result.note}</p>
              </section>
            ) : null}
            {shown ? (
              <section className={CARD}>
                {builds.length > 1 ? (
                  <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Phương án">
                    {builds.map((build) => (
                      <button
                        key={build.variant}
                        type="button"
                        role="tab"
                        aria-selected={shown.variant === build.variant}
                        onClick={() => setVariant(build.variant)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${shown.variant === build.variant ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        {build.variant === 'main' ? 'Cấu hình đề xuất' : 'Phương án khác'} · {formatCurrency(build.total)}
                      </button>
                    ))}
                  </div>
                ) : null}
                <AgentBuild build={shown} onApplyParts={onApplyParts} onBuyBuild={onBuyBuild} />
              </section>
            ) : null}
          </div>
          <AgentTrace run={run} />
        </div>
      ) : null}
    </div>
  )
}

function AgentBuild({ build, onApplyParts, onBuyBuild }) {
  const budgetLine = build.budget
    ? build.withinBudget
      ? `còn dư ${formatCurrency(build.difference)} so với ngân sách ${formatCurrency(build.budget)}`
      : `vượt ngân sách ${formatCurrency(build.budget)} ${formatCurrency(build.difference)}`
    : 'bạn không ghi ngân sách'
  const parts = build.items.map((item) => ({
    productId: item.productId,
    type: item.type,
    name: item.name,
    brand: item.brand,
    price: item.listPrice,
    stock: item.stock,
    image: item.image,
    quantity: item.quantity,
  }))

  return (
    <div>
      <h3 className="text-xl font-black text-slate-900">{build.title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">{build.summary}</p>
      {build.tradeoff ? (
        <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700"><span className="font-bold">So với cấu hình đề xuất: </span>{build.tradeoff}</p>
      ) : null}
      {build.overBudgetReason ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><span className="font-bold">Vì sao vượt ngân sách: </span>{build.overBudgetReason}</p>
      ) : null}
      <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
        <span aria-hidden="true">✓</span> Hệ thống đã kiểm tra: còn hàng, lắp vừa, nguồn {build.items.find((item) => item.type === 'psu')?.specs?.watts || '?'} W cho mức ước tính {build.check.estimatedPowerW} W
      </p>

      <ul className="mt-4 divide-y divide-slate-100">
        {build.items.map((item) => (
          <li key={item.productId} className="grid gap-1 py-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.slotLabel}</span>
            <span className="min-w-0">
              <a href={hrefFor(`/san-pham/${item.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">
                {item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}
              </a>
              <span className="mt-0.5 block text-sm text-slate-600">{item.reason}</span>
              {item.priceInsight ? <span className={`mt-0.5 block text-xs ${INSIGHT_TONE[item.priceInsight.tone] || 'text-slate-500'}`}>{item.priceInsight.text}</span> : null}
            </span>
            <span className="text-right text-sm sm:min-w-28">
              <span className="block font-bold text-slate-900">{formatCurrency(item.lineTotal)}</span>
              {item.hotDeal ? (
                <span className="block text-xs text-slate-500">
                  <span className="mr-1 rounded bg-red-50 px-1 font-bold text-red-700">Hot Deal</span>
                  <s>{formatCurrency(item.listPrice * item.quantity)}</s>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {build.check.warnings.length ? (
        <ul className="mt-2 space-y-1 text-sm text-amber-900">
          {build.check.warnings.map((warning) => <li key={warning.code}>Lưu ý: {warning.message}</li>)}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-dashed border-slate-200 pt-4">
        <div>
          <div className="text-2xl font-black text-red-600">{formatCurrency(build.total)}</div>
          <div className={`text-sm ${build.budget && !build.withinBudget ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
            Giá hôm nay, đã tính Hot Deal · {budgetLine}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onApplyParts(parts)} className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-800 hover:border-slate-500">
            Mở trong Build PC để chỉnh
          </button>
          <button type="button" onClick={() => onBuyBuild(parts)} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700">
            Mua cả bộ
          </button>
        </div>
      </div>

      {build.capabilities ? (
        <div className="mt-5 rounded-[28px] bg-slate-50 p-5">
          <h4 className="text-base font-black text-slate-900">Cấu hình này chạy được gì?</h4>
          <div className="mt-2">
            <CapabilityReport capabilities={build.capabilities} compact headingLevel={5} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AgentTrace({ run }) {
  const { result } = run
  const stats = result?.stats
  return (
    <section className={`${CARD} self-start`} aria-labelledby="build-agent-trace">
      <h3 id="build-agent-trace" className="text-lg font-black text-slate-900">Trợ lý đã làm gì</h3>
      <p className="mt-1 text-xs text-slate-500">
        Mô hình AI chỉ đề xuất; công cụ của cửa hàng tra kho, kiểm tra và quyết định nhận hay trả lại.
      </p>
      <ol className="mt-4 space-y-3" aria-live="polite">
        {run.steps.map((step) => {
          const kind = STEP_MARK[stepKind(step)]
          return (
            <li key={step.index} className="flex gap-3">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${kind.className}`}>
                <span aria-hidden="true">{kind.mark}</span>
                <span className="sr-only">{kind.label}</span>
              </span>
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-slate-900">{step.title}</span>
                <span className="block text-slate-600">{step.detail}</span>
              </span>
            </li>
          )
        })}
        {run.busy ? (
          <li className="flex gap-3 text-sm text-slate-600">
            <span className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-slate-200" aria-hidden="true" />
            <span>AI đang suy nghĩ{run.round ? ` (lượt ${run.round})` : ''}...</span>
          </li>
        ) : null}
      </ol>
      {stats ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
          <Stat label="Thời gian" value={seconds(stats.ms)} />
          <Stat label="Lượt suy nghĩ" value={stats.rounds} />
          <Stat label="Lần dùng công cụ" value={stats.toolCalls} />
          <Stat label="Bị trả lại, tự sửa" value={stats.rejectedSubmissions} />
          <Stat label="Token" value={(stats.inputTokens + stats.outputTokens).toLocaleString('vi-VN')} />
          <Stat label="Mô hình" value={result.model} />
        </dl>
      ) : null}
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-900">{value}</dd>
    </div>
  )
}
