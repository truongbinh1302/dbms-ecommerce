import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { deleteMyAccount, exportMyData, fetchMe } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatAddress } from '../utils/orderLabels'
import { LoginRequired } from './OrdersPage'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

/* Tài khoản của tôi: thông tin, tải dữ liệu cá nhân, xoá tài khoản. */
export default function AccountPage({ currentUser, onRequireLogin, onAccountDeleted }) {
  const userId = currentUser?.id
  const [state, setState] = useState({ userId: null, me: null, error: '' })
  const [exporting, setExporting] = useState({ busy: false, error: '' })
  const [deletion, setDeletion] = useState({ password: '', confirmed: false, busy: false, error: '' })

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

      <section className={CARD}>
        <h2 className="text-xl font-black text-slate-900">Dữ liệu của tôi</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Tải về một tệp JSON gồm hồ sơ, đơn hàng, giỏ hàng, báo giá, bảo hành, mã giảm giá đã dùng và đánh giá của bạn.
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
