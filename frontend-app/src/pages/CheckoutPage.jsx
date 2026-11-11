import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import PriceSummary, { VoucherField } from '../components/PriceSummary'
import {
  createOrder,
  createVNPayPaymentLink,
  fetchMe,
  fetchProvinces,
  saveDefaultAddress,
} from '../api/client'
import { hrefFor, navigate } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'

const EMPTY_ADDRESS = { recipientName: '', phone: '', province: '', ward: '', street: '' }

const FIELD_LABELS = {
  recipientName: 'Họ tên người nhận',
  phone: 'Số điện thoại',
  province: 'Tỉnh/Thành phố',
  ward: 'Phường/Xã',
  street: 'Số nhà, tên đường',
}

// Kiểm tra nhanh trên trình duyệt cho khách biết lỗi sớm; server vẫn kiểm tra lại toàn bộ.
function validateAddress(address) {
  const errors = {}
  if (!address.recipientName.trim()) errors.recipientName = 'Vui lòng nhập tên người nhận'
  const phone = address.phone.replace(/[\s.\-()]/g, '')
  if (!/^(?:\+?84|0)\d{9}$/.test(phone)) errors.phone = 'Số điện thoại cần có 10 số, bắt đầu bằng 0 hoặc +84'
  if (!address.province) errors.province = 'Vui lòng chọn tỉnh/thành phố'
  if (!address.ward.trim()) errors.ward = 'Vui lòng nhập phường/xã'
  if (!address.street.trim()) errors.street = 'Vui lòng nhập số nhà, tên đường'
  return errors
}

export default function CheckoutPage({
  cartItems,
  subtotal,
  quote,
  quoteError,
  voucherCode,
  onApplyVoucher,
  currentUser,
  onRequireLogin,
  onOrderPlaced,
}) {
  const [provinces, setProvinces] = useState([])
  const [address, setAddress] = useState(EMPTY_ADDRESS)
  const [touched, setTouched] = useState(false)
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [saveAsDefault, setSaveAsDefault] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchProvinces()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setProvinces(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Điền sẵn địa chỉ mặc định (hoặc tên, SĐT trong hồ sơ) nếu khách chưa tự gõ gì.
  const userId = currentUser?.id
  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled || touched) return
        const saved = me?.shippingAddress
        setAddress({
          recipientName: saved?.recipientName || me?.FullName || '',
          phone: saved?.phone || me?.Phone || '',
          province: saved?.province || '',
          ward: saved?.ward || '',
          street: saved?.street || '',
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId, touched])

  if (cartItems.length === 0) {
    return (
      <PageMessage
        title="Giỏ hàng đang trống"
        description="Thêm sản phẩm vào giỏ trước khi đặt hàng."
        action={<a href={hrefFor('/')} className="font-bold text-red-600">Tiếp tục mua sắm</a>}
      />
    )
  }

  function updateField(field, value) {
    setTouched(true)
    setAddress((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    if (!currentUser) {
      onRequireLogin()
      return
    }

    const errors = validateAddress(address)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const items = cartItems
      .map((item) => ({ productId: Number(item.id), quantity: item.quantity }))
      .filter((item) => Number.isInteger(item.productId) && item.productId > 0)

    if (items.length !== cartItems.length) {
      setFormError('Giỏ hàng có sản phẩm mẫu không còn bán. Hãy xoá chúng khỏi giỏ rồi đặt lại.')
      return
    }

    setSubmitting(true)
    try {
      const order = await createOrder({
        items,
        paymentMethod,
        voucherCode: voucherCode || undefined,
        shippingAddress: address,
        note: note.trim() || undefined,
      })

      if (saveAsDefault) {
        saveDefaultAddress(address).catch(() => {})
      }

      // Xoá giỏ (onOrderPlaced) ngay trước khi rời trang, để trang này không kịp hiện "giỏ trống".
      if (paymentMethod === 'vnpay') {
        let paymentUrl = null
        try {
          const link = await createVNPayPaymentLink(order.orderId, `Thanh toan don hang ${order.orderCode || order.orderId}`)
          paymentUrl = link.paymentUrl
        } catch {
          paymentUrl = null
        }
        onOrderPlaced(order)
        if (paymentUrl) {
          window.location.href = paymentUrl
        } else {
          navigate(`/don-hang/${order.orderId}?ket-qua=loi-tao-link`)
        }
        return
      }

      navigate(`/don-hang/${order.orderId}?moi=1`)
      onOrderPlaced(order)
    } catch (err) {
      setFieldErrors(err.details?.fields || {})
      setFormError(err.message || 'Không đặt được đơn hàng')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]" noValidate>
      <div className="space-y-5">
        <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black text-slate-900">Thông tin giao hàng</h1>
          {!currentUser ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Bạn cần{' '}
              <button type="button" onClick={onRequireLogin} className="font-bold underline">
                đăng nhập hoặc đăng ký
              </button>{' '}
              để đặt hàng và theo dõi đơn.
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField field="recipientName" value={address.recipientName} error={fieldErrors.recipientName} onChange={updateField} autoComplete="name" />
            <TextField field="phone" value={address.phone} error={fieldErrors.phone} onChange={updateField} autoComplete="tel" inputMode="tel" />

            <label className="block text-sm">
              <span className="font-semibold text-slate-700">{FIELD_LABELS.province}</span>
              <select
                value={address.province}
                onChange={(event) => updateField('province', event.target.value)}
                aria-invalid={Boolean(fieldErrors.province)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <option value="">Chọn tỉnh/thành phố</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
              {fieldErrors.province ? <span className="mt-1 block text-red-600">{fieldErrors.province}</span> : null}
            </label>

            <TextField field="ward" value={address.ward} error={fieldErrors.ward} onChange={updateField} placeholder="Ví dụ: Phường Diên Hồng" />
            <div className="sm:col-span-2">
              <TextField field="street" value={address.street} error={fieldErrors.street} onChange={updateField} autoComplete="street-address" placeholder="Ví dụ: 268 Lý Thường Kiệt" />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Địa chỉ theo đơn vị hành chính mới từ 01/7/2025 (tỉnh/thành → phường/xã, không còn quận/huyện).
          </p>

          {currentUser ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} />
              Lưu làm địa chỉ mặc định
            </label>
          ) : null}

          <label className="mt-5 block text-sm">
            <span className="font-semibold text-slate-700">Ghi chú cho đơn hàng (không bắt buộc)</span>
            <textarea
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Ví dụ: gọi trước khi giao"
            />
          </label>
        </section>

        <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h2 className="text-xl font-black text-slate-900">Phương thức thanh toán</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PaymentOption value="cod" current={paymentMethod} onChange={setPaymentMethod} title="Thanh toán khi nhận hàng (COD)" description="Trả tiền mặt cho người giao hàng." />
            <PaymentOption value="vnpay" current={paymentMethod} onChange={setPaymentMethod} title="VNPay" description="Thẻ ATM, thẻ quốc tế hoặc QR ngân hàng. Đơn tự huỷ nếu không thanh toán trong 30 phút." />
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:sticky lg:top-28">
        <h2 className="text-xl font-black text-slate-900">Đơn hàng ({cartItems.length} sản phẩm)</h2>
        <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
          {cartItems.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 text-sm">
              <span className="text-slate-700">
                <a href={hrefFor(`/san-pham/${item.id}`)} className="hover:text-red-600">{item.name}</a>
                <span className="text-slate-400"> × {item.quantity}</span>
              </span>
              <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <div className="my-5 border-t border-slate-100 pt-5">
          <VoucherField voucherCode={voucherCode} voucherError={quote?.voucherError?.message || ''} onApply={onApplyVoucher} />
        </div>

        <PriceSummary subtotal={subtotal} quote={quote} quoteError={quoteError} />

        {formError ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{formError}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-2xl bg-red-600 px-5 py-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {submitting ? 'Đang đặt hàng...' : paymentMethod === 'vnpay' ? 'Đặt hàng và thanh toán VNPay' : 'Đặt hàng'}
        </button>
        <p className="mt-3 text-xs text-slate-500">Số tiền cuối cùng do hệ thống tính lại khi tạo đơn.</p>
      </aside>
    </form>
  )
}

function TextField({ field, value, error, onChange, ...inputProps }) {
  const id = `checkout-${field}`
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="font-semibold text-slate-700">{FIELD_LABELS[field]}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        aria-invalid={Boolean(error)}
        className={`mt-1 w-full rounded-xl border px-3 py-2 ${error ? 'border-red-400' : 'border-slate-200'}`}
        {...inputProps}
      />
      {error ? <span className="mt-1 block text-red-600">{error}</span> : null}
    </label>
  )
}

function PaymentOption({ value, current, onChange, title, description }) {
  const selected = value === current
  return (
    <label className={`block cursor-pointer rounded-2xl border p-4 ${selected ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2">
        <input type="radio" name="payment-method" value={value} checked={selected} onChange={() => onChange(value)} />
        <span className="font-bold text-slate-900">{title}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </label>
  )
}
