export const ORDER_STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  pending_payment: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  processing: 'Đang chuẩn bị hàng',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
}

export const PAYMENT_STATUS_LABELS = {
  unpaid: 'Chưa thanh toán',
  pending: 'Đang chờ VNPay',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán không thành công',
  expired: 'Quá hạn thanh toán',
  refund_required: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
}

export const PAYMENT_METHOD_LABELS = {
  cod: 'Thanh toán khi nhận hàng',
  vnpay: 'VNPay',
}

export const CUSTOMER_CANCELLABLE = ['pending', 'pending_payment', 'confirmed']

const STATUS_TONES = {
  cancelled: 'bg-slate-100 text-slate-600',
  delivered: 'bg-emerald-50 text-emerald-700',
  shipped: 'bg-sky-50 text-sky-700',
  pending_payment: 'bg-amber-50 text-amber-700',
}

export function statusTone(status) {
  return STATUS_TONES[status] || 'bg-red-50 text-red-700'
}

export function labelOf(map, value) {
  return map[value] || value || '—'
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatAddress(address) {
  if (!address || typeof address !== 'object') return ''
  return [address.street, address.ward, address.province].filter(Boolean).join(', ')
}

// Mã ket-qua trên URL khi VNPay chuyển khách về (xem payment.controller vnpayReturn).
export function describePaymentResult(code) {
  if (!code) return null
  if (code === '00') return { tone: 'success', text: 'VNPay báo thanh toán thành công.' }
  if (code === '24') return { tone: 'warning', text: 'Bạn đã huỷ giao dịch trên VNPay.' }
  if (code === 'chu-ky-sai') return { tone: 'error', text: 'Không xác thực được kết quả từ VNPay. Vui lòng kiểm tra lại đơn hàng.' }
  if (code === 'sai-so-tien') return { tone: 'error', text: 'Số tiền VNPay báo về không khớp với đơn hàng.' }
  if (code === 'khong-tim-thay') return { tone: 'error', text: 'Không tìm thấy đơn hàng của giao dịch này.' }
  if (code === 'loi-tao-link') return { tone: 'warning', text: 'Đơn đã tạo nhưng chưa mở được trang VNPay. Bạn có thể bấm “Thanh toán VNPay” để thử lại.' }
  if (code === 'loi') return { tone: 'error', text: 'Có lỗi khi xử lý kết quả thanh toán. Vui lòng kiểm tra lại đơn hàng.' }
  return { tone: 'warning', text: `Thanh toán chưa thành công (mã ${code}).` }
}

// --- Đổi trả ---
export const RETURN_KIND_LABELS = {
  exchange: 'Đổi sản phẩm mới',
  refund: 'Trả hàng, hoàn tiền',
}

export const RETURN_REASON_LABELS = {
  defective: 'Lỗi kỹ thuật do nhà sản xuất',
  wrong_item: 'Giao sai sản phẩm, sai cấu hình, thiếu phụ kiện',
  not_as_described: 'Khác với mô tả trên website',
}

export const RETURN_STATUS_LABELS = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt, chờ nhận hàng',
  received: 'Cửa hàng đã nhận hàng',
  completed: 'Hoàn tất',
  rejected: 'Bị từ chối',
  cancelled: 'Đã huỷ',
}

const RETURN_TONES = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-sky-50 text-sky-800',
  received: 'bg-violet-50 text-violet-800',
  completed: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

export function returnTone(status) {
  return RETURN_TONES[status] || 'bg-slate-100 text-slate-600'
}
