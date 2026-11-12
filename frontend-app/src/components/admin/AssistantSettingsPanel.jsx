import { useEffect, useState } from 'react'
import { fetchAssistantSettings, saveAssistantSettings, testAssistantSettings } from '../../api/client'
import { formatDateTime } from '../../utils/orderLabels'

const PANEL = 'rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl'
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'
const MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-5-mini']

function StatusBadge({ settings }) {
  if (settings.keyUnreadable && !settings.hasKey) return <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-100">Cần nhập lại khoá</span>
  if (!settings.hasKey) return <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">Chưa có khoá, trợ lý đang ẩn</span>
  if (!settings.switchedOn) return <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">Đang tắt</span>
  return <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-bold text-emerald-100">Đang bật cho khách</span>
}

/*
  Cài đặt trợ lý mua hàng: admin dán khoá OpenAI (lưu mã hoá ở máy chủ, chỉ hiện 4 ký tự cuối),
  thử kết nối trước hoặc sau khi lưu, chọn mô hình, bật/tắt, giới hạn số câu để kiểm soát chi phí.
*/
export default function AssistantSettingsPanel({ token }) {
  const [settings, setSettings] = useState(null)
  const [form, setForm] = useState({ apiKey: '', model: '', perHour: '', dailyLimit: '' })
  const [state, setState] = useState({ busy: '', error: '', notice: '', test: null })

  const fill = (data) => {
    setSettings(data)
    setForm({ apiKey: '', model: data.model || '', perHour: String(data.perHour ?? ''), dailyLimit: String(data.dailyLimit ?? '') })
  }

  useEffect(() => {
    let cancelled = false
    fetchAssistantSettings(token)
      .then((data) => !cancelled && fill(data))
      .catch((err) => !cancelled && setState((current) => ({ ...current, error: err.message || 'Không tải được cài đặt' })))
    return () => {
      cancelled = true
    }
  }, [token])

  async function run(kind, action, notice) {
    setState({ busy: kind, error: '', notice: '', test: null })
    try {
      const result = await action()
      if (kind === 'test') {
        setState({ busy: '', error: '', notice: '', test: result })
      } else {
        fill(result)
        setState({ busy: '', error: '', notice, test: null })
      }
    } catch (err) {
      setState({ busy: '', error: err.message || 'Không lưu được', notice: '', test: null })
    }
  }

  const saveKey = () => run('key', () => saveAssistantSettings({ apiKey: form.apiKey.trim() }, token), 'Đã lưu khoá API.')
  const removeKey = () => run('remove', () => saveAssistantSettings({ apiKey: '' }, token), 'Đã xoá khoá lưu trên trang quản trị.')
  const toggle = () => run('toggle', () => saveAssistantSettings({ enabled: !settings.switchedOn }, token), settings.switchedOn ? 'Đã tắt trợ lý.' : 'Đã bật trợ lý.')
  const saveOptions = () => run('options', () => saveAssistantSettings({ model: form.model.trim(), perHour: Number(form.perHour), dailyLimit: Number(form.dailyLimit) }, token), 'Đã lưu cài đặt.')
  const test = () => run('test', () => testAssistantSettings(form.apiKey.trim() || null, token))

  return (
    <section className={PANEL} aria-labelledby="assistant-settings-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="assistant-settings-title" className="text-2xl font-black">Trợ lý AI</h3>
          <p className="text-sm text-slate-300">Trợ lý mua hàng dùng OpenAI. Có khoá và đang bật thì khách thấy nút "Hỏi trợ lý mua hàng".</p>
        </div>
        {settings ? <StatusBadge settings={settings} /> : null}
      </div>

      {!settings && !state.error ? <p className="mt-4 text-sm text-slate-300">Đang tải...</p> : null}

      {settings ? (
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              saveKey()
            }}
          >
            <label htmlFor="openai-key" className="block text-sm font-bold">Khoá API OpenAI</label>
            <p className="text-xs text-slate-300">
              {settings.hasKey
                ? `Đang dùng khoá ${settings.keyHint} (${settings.keySource === 'env' ? 'đặt trong file .env của máy chủ' : 'lưu trên trang này'}). Dán khoá mới để thay.`
                : 'Tạo khoá ở platform.openai.com > API keys rồi dán vào đây.'}
              {settings.keyUnreadable ? ' Khoá đã lưu trước đây không giải mã được (secret của máy chủ đã đổi), hãy nhập lại.' : ''}
            </p>
            <input
              id="openai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={form.apiKey}
              onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder={settings.hasKey ? `Đã lưu ${settings.keyHint}` : 'sk-...'}
              className={FIELD}
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={Boolean(state.busy) || !form.apiKey.trim()} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-40">
                {state.busy === 'key' ? 'Đang lưu...' : 'Lưu khoá'}
              </button>
              <button type="button" onClick={test} disabled={Boolean(state.busy) || (!form.apiKey.trim() && !settings.hasKey)} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-40">
                {state.busy === 'test' ? 'Đang thử...' : form.apiKey.trim() ? 'Thử khoá vừa nhập' : 'Thử kết nối'}
              </button>
              {settings.keySource === 'admin' ? (
                <button type="button" onClick={removeKey} disabled={Boolean(state.busy)} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-40">
                  Xoá khoá
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-300">Khoá được mã hoá trước khi lưu vào cơ sở dữ liệu; trang này và API không bao giờ hiện lại toàn bộ khoá.</p>
          </form>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              saveOptions()
            }}
          >
            <div>
              <label htmlFor="assistant-model" className="block text-sm font-bold">Mô hình</label>
              <input id="assistant-model" list="assistant-models" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} className={`${FIELD} mt-1`} />
              <datalist id="assistant-models">{MODELS.map((model) => <option key={model} value={model} />)}</datalist>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="assistant-per-hour" className="block text-sm font-bold">Câu hỏi mỗi giờ (mỗi IP)</label>
                <input id="assistant-per-hour" type="number" min="1" max="1000" value={form.perHour} onChange={(event) => setForm((current) => ({ ...current, perHour: event.target.value }))} className={`${FIELD} mt-1`} />
              </div>
              <div>
                <label htmlFor="assistant-daily" className="block text-sm font-bold">Câu hỏi mỗi ngày (cả cửa hàng)</label>
                <input id="assistant-daily" type="number" min="1" max="100000" value={form.dailyLimit} onChange={(event) => setForm((current) => ({ ...current, dailyLimit: event.target.value }))} className={`${FIELD} mt-1`} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={Boolean(state.busy)} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-40">
                {state.busy === 'options' ? 'Đang lưu...' : 'Lưu cài đặt'}
              </button>
              <button type="button" onClick={toggle} disabled={Boolean(state.busy)} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-40">
                {settings.switchedOn ? 'Tắt trợ lý' : 'Bật trợ lý'}
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Hôm nay đã trả lời {Number(settings.usageToday || 0).toLocaleString('vi-VN')}/{Number(settings.dailyLimit || 0).toLocaleString('vi-VN')} câu (đếm từ lúc máy chủ khởi động).
              {settings.updatedAt ? ` Sửa lần cuối ${formatDateTime(settings.updatedAt)}${settings.updatedByName ? ` bởi ${settings.updatedByName}` : ''}.` : ''}
            </p>
          </form>
        </div>
      ) : null}

      <div aria-live="polite">
        {state.notice ? <p className="mt-4 text-sm font-semibold text-emerald-300" role="status">{state.notice}</p> : null}
        {state.test ? (
          <p className={`mt-4 rounded-2xl px-4 py-2 text-sm font-semibold ${state.test.ok ? 'bg-emerald-400/10 text-emerald-200' : 'bg-amber-400/10 text-amber-100'}`} role="status">
            {state.test.message}
          </p>
        ) : null}
        {state.error ? <p className="mt-4 text-sm font-semibold text-red-300" role="alert">{state.error}</p> : null}
      </div>
    </section>
  )
}
