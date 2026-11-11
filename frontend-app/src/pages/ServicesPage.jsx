import { useEffect, useMemo, useState } from 'react'
import {
  cancelServiceRequest,
  createServiceRequest,
  estimateTradeIn,
  fetchMe,
  fetchMyServiceRequests,
  fetchServiceOptions,
} from '../api/client'
import { hrefFor, navigate } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import { formatDateTime } from '../utils/orderLabels'
import { SERVICE_STATUS, SERVICE_TYPE_LABELS as TYPE_LABELS } from '../utils/serviceLabels'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
const INPUT = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2'
const LABEL = 'block text-sm font-semibold text-slate-700'

const TABS = [
  { id: 'tai-nha', label: 'Kỹ thuật & lắp đặt tại nhà' },
  { id: 'thu-cu', label: 'Thu cũ đổi mới' },
  { id: 'cua-toi', label: 'Yêu cầu của tôi' },
]

function formatDay(isoDate) {
  const [year, month, day] = isoDate.split('-')
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return { short: `${names[weekday]} ${day}/${month}`, full: `${day}/${month}/${year}` }
}

function LoginPrompt({ onRequireLogin, children }) {
  return (
    <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
      {children}{' '}
      <button type="button" onClick={onRequireLogin} className="font-bold text-red-600 underline">Đăng nhập</button>
    </div>
  )
}

function Success({ request }) {
  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
      Đã gửi yêu cầu <strong>{request.code}</strong>. Cửa hàng sẽ gọi xác nhận trong giờ làm việc.{' '}
      <a href={hrefFor('/dich-vu/cua-toi')} className="font-bold underline">Theo dõi yêu cầu</a>
    </div>
  )
}

/* Đặt lịch kỹ thuật / lắp đặt tại nhà: chọn dịch vụ, ngày, khung giờ còn chỗ, địa chỉ trong tỉnh của cửa hàng. */
function HomeServiceForm({ options, currentUser, onRequireLogin, orderId, onCreated }) {
  const [kind, setKind] = useState(orderId ? 'pc_assembly' : '')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [address, setAddress] = useState({ recipientName: '', phone: '', ward: '', street: '' })
  const [touched, setTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [state, setState] = useState({ busy: false, error: '', fields: {}, created: null })
  const userId = currentUser?.id

  // Điền sẵn tên, số điện thoại, địa chỉ mặc định nếu cùng tỉnh với cửa hàng.
  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled || touched) return
        const saved = me?.shippingAddress
        const sameProvince = saved?.province === options.province
        setAddress({
          recipientName: saved?.recipientName || me?.FullName || '',
          phone: saved?.phone || me?.Phone || '',
          ward: sameProvince ? saved?.ward || '' : '',
          street: sameProvince ? saved?.street || '' : '',
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, touched, options.province])

  const day = options.days.find((item) => item.date === date)

  function updateAddress(field, value) {
    setTouched(true)
    setAddress((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!currentUser) return onRequireLogin()
    if (!kind || !date || !slot) {
      setState({ busy: false, error: 'Chọn dịch vụ, ngày và khung giờ', fields: {}, created: null })
      return undefined
    }
    setState({ busy: true, error: '', fields: {}, created: null })
    try {
      const created = await createServiceRequest({
        type: 'home_service',
        serviceKind: kind,
        scheduledDate: date,
        timeSlot: slot,
        orderId: orderId || undefined,
        address: { ...address, province: options.province },
        description,
      })
      setState({ busy: false, error: '', fields: {}, created })
      setSlot('')
      onCreated()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không đặt được lịch', fields: err.details?.fields || {}, created: null })
      if (err.details?.code === 'slot_full') onCreated()
    }
    return undefined
  }

  return (
    <form onSubmit={handleSubmit} className={CARD} noValidate>
      <h2 className="text-xl font-black text-slate-900">Đặt lịch kỹ thuật viên tới nhà</h2>
      <p className="mt-1 text-sm text-slate-600">
        Nhận lịch trong {options.province}, từ ngày mai. Phí dịch vụ (nếu có) được báo khi gọi xác nhận, trước khi làm.
        {orderId ? ` Lịch gắn với đơn #${orderId}.` : ''}
      </p>

      <fieldset className="mt-5 min-w-0">
        <legend className={LABEL}>Dịch vụ</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {options.kinds.map((item) => (
            <label key={item.id} className={`flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm ${kind === item.id ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
              <input type="radio" name="service-kind" value={item.id} checked={kind === item.id} onChange={() => setKind(item.id)} />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* min-w-0: fieldset mặc định rộng theo nội dung, làm dải ngày tràn khỏi màn hình điện thoại */}
      <fieldset className="mt-5 min-w-0">
        <legend className={LABEL}>Ngày</legend>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {options.days.map((item) => {
            const free = item.slots.reduce((sum, entry) => sum + entry.remaining, 0)
            const label = formatDay(item.date)
            return (
              <button
                key={item.date}
                type="button"
                disabled={free === 0}
                aria-pressed={date === item.date}
                aria-label={`${label.full}, còn ${free} chỗ`}
                onClick={() => {
                  setDate(item.date)
                  setSlot('')
                }}
                className={`shrink-0 rounded-2xl border px-3 py-2 text-sm ${date === item.date ? 'border-red-500 bg-red-50 font-bold text-red-700' : 'border-slate-200 text-slate-700'} disabled:opacity-40`}
              >
                {label.short}
              </button>
            )
          })}
        </div>
      </fieldset>

      {day ? (
        <fieldset className="mt-4 min-w-0">
          <legend className={LABEL}>Khung giờ ngày {formatDay(day.date).full}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {day.slots.map((entry) => (
              <button
                key={entry.slot}
                type="button"
                disabled={entry.remaining === 0}
                aria-pressed={slot === entry.slot}
                onClick={() => setSlot(entry.slot)}
                className={`rounded-2xl border px-3 py-2 text-sm ${slot === entry.slot ? 'border-red-500 bg-red-50 font-bold text-red-700' : 'border-slate-200 text-slate-700'} disabled:opacity-40`}
              >
                {entry.slot.replace('-', '–')}
                <span className="block text-xs font-normal text-slate-500">{entry.remaining === 0 ? 'Kín lịch' : `Còn ${entry.remaining} chỗ`}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Người liên hệ
          <input value={address.recipientName} onChange={(event) => updateAddress('recipientName', event.target.value)} maxLength={100} className={INPUT} />
          {state.fields.recipientName ? <span className="text-red-600">{state.fields.recipientName}</span> : null}
        </label>
        <label className={LABEL}>
          Số điện thoại
          <input value={address.phone} onChange={(event) => updateAddress('phone', event.target.value)} inputMode="tel" maxLength={15} className={INPUT} />
          {state.fields.phone ? <span className="text-red-600">{state.fields.phone}</span> : null}
        </label>
        <label className={LABEL}>
          Phường/xã ({options.province})
          <input value={address.ward} onChange={(event) => updateAddress('ward', event.target.value)} maxLength={100} className={INPUT} />
          {state.fields.ward ? <span className="text-red-600">{state.fields.ward}</span> : null}
        </label>
        <label className={LABEL}>
          Số nhà, đường
          <input value={address.street} onChange={(event) => updateAddress('street', event.target.value)} maxLength={200} className={INPUT} />
          {state.fields.street ? <span className="text-red-600">{state.fields.street}</span> : null}
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          Mô tả thêm (không bắt buộc)
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} className={INPUT} placeholder="Ví dụ: máy chạy nóng, cần cài lại Windows, lắp thêm ổ SSD..." />
        </label>
      </div>

      {state.error ? <p className="mt-4 text-sm font-semibold text-red-600" role="alert">{state.error}</p> : null}
      {state.created ? <Success request={state.created} /> : null}
      {!currentUser ? <LoginPrompt onRequireLogin={onRequireLogin}>Cần đăng nhập để đặt lịch và theo dõi yêu cầu.</LoginPrompt> : null}

      <button type="submit" disabled={state.busy} className="mt-5 rounded-2xl bg-red-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
        {state.busy ? 'Đang gửi...' : 'Đặt lịch'}
      </button>
    </form>
  )
}

/* Thu cũ đổi mới: ước tính ngay, gửi yêu cầu để cửa hàng kiểm tra và chốt giá. */
function TradeInForm({ options, currentUser, onRequireLogin, onCreated }) {
  const [form, setForm] = useState({ category: 'laptop', brandModel: '', purchasePrice: '', ageMonths: '', condition: 'good', contactPhone: '', description: '' })
  const [estimate, setEstimate] = useState({ busy: false, data: null, error: '' })
  const [state, setState] = useState({ busy: false, error: '', created: null })

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setEstimate((current) => ({ ...current, data: null }))
  }

  const payload = useMemo(() => ({
    category: form.category,
    purchasePrice: Number(form.purchasePrice),
    ageMonths: Number(form.ageMonths),
    condition: form.condition,
  }), [form])

  async function handleEstimate() {
    setEstimate({ busy: true, data: null, error: '' })
    try {
      setEstimate({ busy: false, data: await estimateTradeIn(payload), error: '' })
    } catch (err) {
      setEstimate({ busy: false, data: null, error: err.message || 'Không ước tính được' })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!currentUser) return onRequireLogin()
    setState({ busy: true, error: '', created: null })
    try {
      const created = await createServiceRequest({ type: 'trade_in', ...form, ...payload })
      setState({ busy: false, error: '', created })
      onCreated()
    } catch (err) {
      setState({ busy: false, error: err.message || 'Không gửi được yêu cầu', created: null })
    }
    return undefined
  }

  return (
    <form onSubmit={handleSubmit} className={CARD} noValidate>
      <h2 className="text-xl font-black text-slate-900">Thu cũ đổi mới</h2>
      <p className="mt-1 text-sm text-slate-600">
        Nhập thông tin máy cũ để xem giá ước tính. Giá chốt sau khi kỹ thuật viên kiểm tra máy; bạn có thể dùng số tiền này để trừ vào đơn mua mới.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Loại máy
          <select value={form.category} onChange={(event) => update('category', event.target.value)} className={INPUT}>
            {options.tradeIn.categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Hãng và mẫu máy
          <input value={form.brandModel} onChange={(event) => update('brandModel', event.target.value)} maxLength={150} className={INPUT} placeholder="Ví dụ: Dell XPS 13 9310" />
        </label>
        <label className={LABEL}>
          Giá mua mới (đồng)
          <input type="number" min="100000" step="any" inputMode="numeric" value={form.purchasePrice} onChange={(event) => update('purchasePrice', event.target.value)} className={INPUT} />
        </label>
        <label className={LABEL}>
          Đã dùng (tháng)
          <input type="number" min="0" max="120" step="1" inputMode="numeric" value={form.ageMonths} onChange={(event) => update('ageMonths', event.target.value)} className={INPUT} />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className={LABEL}>Tình trạng</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.tradeIn.conditions.map((item) => (
              <label key={item.id} className={`flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm ${form.condition === item.id ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
                <input type="radio" name="trade-in-condition" value={item.id} checked={form.condition === item.id} onChange={() => update('condition', item.id)} />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <button type="button" onClick={handleEstimate} disabled={estimate.busy || !form.purchasePrice || form.ageMonths === ''} className="mt-4 rounded-2xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50">
        {estimate.busy ? 'Đang tính...' : 'Xem giá ước tính'}
      </button>
      <div aria-live="polite">
        {estimate.error ? <p className="mt-3 text-sm font-semibold text-red-600">{estimate.error}</p> : null}
        {estimate.data ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">Giá ước tính</p>
            <p className="text-2xl font-black text-red-600">{formatCurrency(estimate.data.low)} – {formatCurrency(estimate.data.high)}</p>
            <p className="mt-1 text-xs text-slate-500">{estimate.data.explanation} Giá tham khảo, chốt sau khi kiểm tra máy.</p>
          </div>
        ) : null}
      </div>

      {estimate.data ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            Số điện thoại liên hệ
            <input value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} inputMode="tel" maxLength={15} className={INPUT} />
          </label>
          <label className={LABEL}>
            Ghi chú (không bắt buộc)
            <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={1000} className={INPUT} placeholder="Muốn đổi lên máy nào, còn sạc/hộp..." />
          </label>
        </div>
      ) : null}

      {state.error ? <p className="mt-4 text-sm font-semibold text-red-600" role="alert">{state.error}</p> : null}
      {state.created ? <Success request={state.created} /> : null}
      {estimate.data && !currentUser ? <LoginPrompt onRequireLogin={onRequireLogin}>Cần đăng nhập để gửi yêu cầu thu máy.</LoginPrompt> : null}
      {estimate.data ? (
        <button type="submit" disabled={state.busy} className="mt-5 rounded-2xl bg-red-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
          {state.busy ? 'Đang gửi...' : 'Gửi yêu cầu thu máy'}
        </button>
      ) : null}
    </form>
  )
}

export function ServiceRequestCard({ request, onCancel }) {
  const status = SERVICE_STATUS[request.status] || SERVICE_STATUS.new
  const canCancel = ['new', 'confirmed'].includes(request.status)
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="rounded-2xl border border-slate-200 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{request.code} · {TYPE_LABELS[request.type]}</p>
          <p className="text-slate-600">
            {request.serviceLabel}
            {request.productName ? ` · ${request.productName}` : ''}
            {request.serialNumber ? ` (serial ${request.serialNumber})` : ''}
            {request.device?.brandModel ? ` · ${request.device.brandModel}` : ''}
          </p>
          {request.scheduledDate ? <p className="text-slate-600">Lịch hẹn: {formatDay(request.scheduledDate).full}, {request.timeSlot?.replace('-', '–')}</p> : null}
          {request.estimateLow !== null ? <p className="text-slate-600">Ước tính: {formatCurrency(request.estimateLow)} – {formatCurrency(request.estimateHigh)}</p> : null}
          {request.finalPrice !== null ? <p className="font-semibold text-slate-900">{request.type === 'trade_in' ? 'Giá chốt' : 'Chi phí'}: {formatCurrency(request.finalPrice)}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
      </div>
      <ol className="mt-3 space-y-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-500">
        {request.events.map((event, index) => (
          <li key={`${event.createdAt}-${index}`}>
            <span className="font-semibold text-slate-700">{SERVICE_STATUS[event.status]?.label || event.status}</span>
            {' · '}{formatDateTime(event.createdAt)}{event.note ? ` · ${event.note}` : ''}
          </li>
        ))}
      </ol>
      {canCancel && onCancel ? (
        confirming ? (
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onCancel(request)} className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white">Xác nhận huỷ</button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600">Không</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="mt-3 text-xs font-bold text-red-600 hover:underline">Huỷ yêu cầu</button>
        )
      ) : null}
    </li>
  )
}

function MyRequests({ requests, error, onCancel }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!requests) return <p className="text-sm text-slate-500">Đang tải...</p>
  if (requests.length === 0) return <p className="text-sm text-slate-500">Bạn chưa có yêu cầu dịch vụ nào.</p>
  return (
    <ul className="space-y-3">
      {requests.map((request) => <ServiceRequestCard key={request.id} request={request} onCancel={onCancel} />)}
    </ul>
  )
}

/* Trang dịch vụ sau bán: #/dich-vu/tai-nha, #/dich-vu/thu-cu, #/dich-vu/cua-toi */
export default function ServicesPage({ tab = 'tai-nha', currentUser, onRequireLogin, orderId = null }) {
  const [options, setOptions] = useState({ data: null, error: '', version: 0 })
  const [mine, setMine] = useState({ userId: null, items: null, error: '', version: 0 })
  const [reload, setReload] = useState({ options: 0, mine: 0 })
  const userId = currentUser?.id
  const activeTab = TABS.some((item) => item.id === tab) ? tab : 'tai-nha'

  useEffect(() => {
    let cancelled = false
    fetchServiceOptions()
      .then((data) => !cancelled && setOptions({ data, error: '', version: reload.options }))
      .catch((err) => !cancelled && setOptions({ data: null, error: err.message || 'Không tải được dịch vụ', version: reload.options }))
    return () => {
      cancelled = true
    }
  }, [reload.options])

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMyServiceRequests()
      .then((items) => !cancelled && setMine({ userId, items: Array.isArray(items) ? items : [], error: '', version: reload.mine }))
      .catch((err) => !cancelled && setMine({ userId, items: [], error: err.message || 'Không tải được yêu cầu', version: reload.mine }))
    return () => {
      cancelled = true
    }
  }, [userId, reload.mine])

  const refresh = () => setReload((current) => ({ options: current.options + 1, mine: current.mine + 1 }))

  async function handleCancel(request) {
    try {
      await cancelServiceRequest(request.id, 'Khách huỷ trên website')
    } finally {
      refresh()
    }
  }

  const myRequests = userId && mine.userId === userId ? mine.items : null

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h1 className="text-2xl font-black text-slate-900">Dịch vụ sau bán</h1>
        <p className="mt-2 text-sm text-slate-600">
          Kỹ thuật viên tới nhà, thu máy cũ đổi máy mới, và theo dõi yêu cầu bảo hành. Gửi yêu cầu bảo hành ở trang{' '}
          <a href={hrefFor('/bao-hanh')} className="font-semibold text-red-600 underline">Tra cứu bảo hành</a>.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Dịch vụ">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/dich-vu/${item.id}`)}
              aria-current={activeTab === item.id ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {item.label}
              {item.id === 'cua-toi' && myRequests?.some((request) => ['new', 'confirmed', 'in_progress'].includes(request.status))
                ? ` (${myRequests.filter((request) => ['new', 'confirmed', 'in_progress'].includes(request.status)).length})`
                : ''}
            </button>
          ))}
        </nav>
      </section>

      {options.error ? <p className="text-sm text-red-600">{options.error}</p> : null}

      {activeTab === 'tai-nha' && options.data ? (
        <HomeServiceForm key={orderId || 'none'} options={options.data} currentUser={currentUser} onRequireLogin={onRequireLogin} orderId={orderId} onCreated={refresh} />
      ) : null}
      {activeTab === 'thu-cu' && options.data ? (
        <TradeInForm options={options.data} currentUser={currentUser} onRequireLogin={onRequireLogin} onCreated={refresh} />
      ) : null}
      {activeTab === 'cua-toi' ? (
        <section className={CARD}>
          <h2 className="text-xl font-black text-slate-900">Yêu cầu của tôi</h2>
          <div className="mt-4">
            {userId ? (
              <MyRequests requests={myRequests} error={mine.error} onCancel={handleCancel} />
            ) : (
              <LoginPrompt onRequireLogin={onRequireLogin}>Đăng nhập để xem các yêu cầu dịch vụ của bạn.</LoginPrompt>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
