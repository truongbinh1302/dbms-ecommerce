import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { changePassword, deleteMyAccount, exportMyData, fetchMe, fetchPriceWatches, fetchStockWatches, unwatchPrice, unwatchStock } from '../api/client'
import { formatCurrency } from '../utils/format'
import { hrefFor } from '../hooks/useHashRoute'
import { formatAddress } from '../utils/orderLabels'
import { LoginRequired } from './OrdersPage'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

// Sản phẩm đang theo dõi giá: giá hiện tại so với lúc bắt đầu theo dõi, bỏ theo dõi.
function PriceWatchList({ userId }) {
  const [state, setState] = useState({ userId: null, items: [], error: '' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchPriceWatches()
      .then((items) => !cancelled && setState({ userId, items: Array.isArray(items) ? items : [], error: '' }))
      .catch((err) => !cancelled && setState({ userId, items: [], error: err.message || 'Không tải được' }))
    return () => {
      cancelled = true
    }
  }, [userId, version])

  const items = state.userId === userId ? state.items : []
  return (
    <section className={CARD}>
      <h2 className="text-xl font-black text-slate-900">Đang theo dõi giá</h2>
      <p className="mt-2 text-sm text-slate-600">Khi giá giảm (kể cả Hot Deal), bạn nhận thông báo ở biểu tượng chuông trên đầu trang.</p>
      {state.error ? <p className="mt-3 text-sm text-red-600">{state.error}</p> : null}
      {state.userId === userId && items.length === 0 && !state.error ? (
        <p className="mt-3 text-sm text-slate-500">Chưa theo dõi sản phẩm nào. Bấm “Theo dõi giá” ở trang sản phẩm.</p>
      ) : null}
      <ul className="mt-3 divide-y divide-slate-100">
        {items.map((item) => {
          const dropped = item.currentPrice < item.priceAtWatch
          return (
            <li key={item.productId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="min-w-0">
                <a href={hrefFor(`/san-pham/${item.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">{item.name}</a>
                <span className="block text-slate-500">
                  Giá hiện tại <strong className={dropped ? 'text-emerald-700' : 'text-slate-800'}>{formatCurrency(item.currentPrice)}</strong>
                  {' · '}lúc theo dõi {formatCurrency(item.priceAtWatch)}
                  {item.targetPrice ? ` · báo khi còn ${formatCurrency(item.targetPrice)}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => unwatchPrice(item.productId).finally(() => setVersion((value) => value + 1))}
                className="shrink-0 text-xs font-bold text-slate-500 hover:text-red-600 hover:underline"
              >
                Bỏ theo dõi
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Sản phẩm đang chờ có hàng: chỉ hiện khi có, bỏ chờ được.
function StockWatchList({ userId }) {
  const [state, setState] = useState({ userId: null, items: [] })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchStockWatches()
      .then((items) => !cancelled && setState({ userId, items: Array.isArray(items) ? items : [] }))
      .catch(() => !cancelled && setState({ userId, items: [] }))
    return () => {
      cancelled = true
    }
  }, [userId, version])

  const items = state.userId === userId ? state.items : []
  if (items.length === 0) return null
  return (
    <section className={CARD}>
      <h2 className="text-xl font-black text-slate-900">Đang chờ có hàng</h2>
      <p className="mt-2 text-sm text-slate-600">Khi hàng về, bạn nhận một thông báo ở biểu tượng chuông.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.productId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="min-w-0">
              <a href={hrefFor(`/san-pham/${item.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">{item.name}</a>
              <span className="block text-slate-500">{item.stock > 0 ? `Đã có ${item.stock} sản phẩm` : 'Chưa có hàng'} · giá {formatCurrency(item.price)}</span>
            </span>
            <button
              type="button"
              onClick={() => unwatchStock(item.productId).finally(() => setVersion((value) => value + 1))}
              className="shrink-0 text-xs font-bold text-slate-500 hover:text-red-600 hover:underline"
            >
              Bỏ chờ
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* Tài khoản của tôi: thông tin, tải dữ liệu cá nhân, xoá tài khoản. */
export default function AccountPage({ currentUser, onRequireLogin, onAccountDeleted }) {
  const userId = currentUser?.id
  const [state, setState] = useState({ userId: null, me: null, error: '' })
  const [exporting, setExporting] = useState({ busy: false, error: '' })
  const [deletion, setDeletion] = useState({ password: '', confirmed: false, busy: false, error: '' })
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', repeat: '', busy: false, error: '', done: false })

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (!cancelled) setState({ userId, me, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setState({ userId, me: null, error: err.message || 'Không tải được tài khoản' })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) return <LoginRequired onRequireLogin={onRequireLogin} />
  if (state.userId !== userId) return <PageMessage title="Đang tải tài khoản..." />
  if (!state.me) return <PageMessage title="Không tải được tài khoản" description={state.error} />
  const { me } = state

  async function handleExport() {
    setExporting({ busy: true, error: '' })
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `binhtinhstore-du-lieu-cua-toi-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setExporting({ busy: false, error: '' })
    } catch (err) {
      setExporting({ busy: false, error: err.message || 'Không tải được dữ liệu' })
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault()
    if (passwordForm.next !== passwordForm.repeat) {
      setPasswordForm((current) => ({ ...current, error: 'Hai lần nhập mật khẩu mới không khớp', done: false }))
      return
    }
    setPasswordForm((current) => ({ ...current, busy: true, error: '', done: false }))
    try {
      await changePassword(me.Email, passwordForm.current, passwordForm.next)
      setPasswordForm({ current: '', next: '', repeat: '', busy: false, error: '', done: true })
    } catch (err) {
      setPasswordForm((current) => ({ ...current, busy: false, error: err.message || 'Không đổi được mật khẩu' }))
    }
  }

  async function handleDelete(event) {
    event.preventDefault()
    setDeletion((current) => ({ ...current, busy: true, error: '' }))
    try {
      const result = await deleteMyAccount(deletion.password)
      onAccountDeleted(result)
    } catch (err) {
      setDeletion((current) => ({ ...current, busy: false, error: err.message || 'Không xoá được tài khoản' }))
    }
  }

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h1 className="text-2xl font-black text-slate-900">Tài khoản của tôi</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Họ tên</dt><dd className="font-semibold text-slate-900">{me.FullName}</dd></div>
          <div><dt className="text-slate-500">Email</dt><dd className="font-semibold text-slate-900">{me.Email}</dd></div>
          <div><dt className="text-slate-500">Số điện thoại</dt><dd className="font-semibold text-slate-900">{me.Phone || 'Chưa có'}</dd></div>
          <div>
            <dt className="text-slate-500">Địa chỉ giao hàng mặc định</dt>
            <dd className="font-semibold text-slate-900">{me.shippingAddress?.street ? formatAddress(me.shippingAddress) : 'Chưa có (lưu khi đặt hàng)'}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
          <a href={hrefFor('/don-hang')} className="rounded-full bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200">Đơn hàng của tôi</a>
          <a href={hrefFor('/bao-hanh')} className="rounded-full bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200">Bảo hành của tôi</a>
          <a href={hrefFor('/chinh-sach-bao-mat')} className="rounded-full bg-slate-100 px-4 py-2 text-slate-700 hover:bg-slate-200">Chính sách bảo mật</a>
        </div>
      </section>

      <PriceWatchList userId={userId} />
      <StockWatchList userId={userId} />

      <form onSubmit={handleChangePassword} className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Đổi mật khẩu</h2>
        <p className="mt-2 text-sm text-slate-600">Sau khi đổi, các thiết bị khác đang đăng nhập sẽ phải đăng nhập lại.</p>
        <div className="mt-4 grid max-w-md gap-3">
          {[
            ['current', 'Mật khẩu hiện tại', 'current-password'],
            ['next', 'Mật khẩu mới (ít nhất 8 ký tự)', 'new-password'],
            ['repeat', 'Nhập lại mật khẩu mới', 'new-password'],
          ].map(([field, label, autoComplete]) => (
            <label key={field} className="block text-sm">
              <span className="font-semibold text-slate-700">{label}</span>
              <input
                type="password"
                autoComplete={autoComplete}
                value={passwordForm[field]}
                onChange={(event) => setPasswordForm((current) => ({ ...current, [field]: event.target.value, done: false }))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={passwordForm.busy || !passwordForm.current || passwordForm.next.length < 8 || !passwordForm.repeat}
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {passwordForm.busy ? 'Đang đổi...' : 'Đổi mật khẩu'}
          </button>
          {passwordForm.error ? <p className="text-sm text-red-600" role="alert">{passwordForm.error}</p> : null}
          {passwordForm.done ? <p className="text-sm text-emerald-700" role="status">Đã đổi mật khẩu.</p> : null}
        </div>
      </form>

      <section className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Dữ liệu của tôi</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Tải về một tệp JSON gồm hồ sơ, đơn hàng, giỏ hàng, báo giá, bảo hành, mã giảm giá đã dùng, đánh giá,
          yêu cầu dịch vụ, sản phẩm theo dõi giá và thông báo của bạn.
          Tệp không chứa mật khẩu.
        </p>
        <button type="button" onClick={handleExport} disabled={exporting.busy} className="mt-4 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">
          {exporting.busy ? 'Đang chuẩn bị...' : 'Tải dữ liệu của tôi'}
        </button>
        {exporting.error ? <p className="mt-2 text-sm text-red-600">{exporting.error}</p> : null}
      </section>

      <form onSubmit={handleDelete} className={`${CARD} border border-red-100`}>
        <h2 className="text-xl font-black text-red-700">Xoá tài khoản</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
          <li>Họ tên, email, số điện thoại, địa chỉ và mật khẩu bị xoá; bạn không đăng nhập lại được tài khoản này.</li>
          <li>Giỏ hàng và đánh giá sản phẩm của bạn bị xoá.</li>
          <li>Đơn hàng đã đặt được giữ lại làm chứng từ bán hàng theo quy định kế toán, thuế.</li>
          <li>Nếu còn đơn đang xử lý hoặc đang giao, hãy chờ giao xong hoặc huỷ đơn trước.</li>
          <li>Thao tác này không hoàn tác được. Nên tải dữ liệu của bạn trước.</li>
        </ul>
        <div className="mt-4 grid max-w-md gap-3">
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Nhập mật khẩu để xác nhận</span>
            <input
              type="password"
              autoComplete="current-password"
              value={deletion.password}
              onChange={(event) => setDeletion((current) => ({ ...current, password: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={deletion.confirmed}
              onChange={(event) => setDeletion((current) => ({ ...current, confirmed: event.target.checked }))}
              className="mt-1"
            />
            Tôi hiểu tài khoản sẽ bị xoá vĩnh viễn.
          </label>
          <button
            type="submit"
            disabled={!deletion.password || !deletion.confirmed || deletion.busy}
            className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {deletion.busy ? 'Đang xoá...' : 'Xoá tài khoản vĩnh viễn'}
          </button>
          {deletion.error ? <p className="text-sm text-red-600" role="alert">{deletion.error}</p> : null}
        </div>
      </form>
    </div>
  )
}
