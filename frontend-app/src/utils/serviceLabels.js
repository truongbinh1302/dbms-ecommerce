// Nhãn trạng thái và loại yêu cầu dịch vụ sau bán, dùng chung cho trang khách và trang quản trị.
export const SERVICE_STATUS = {
  new: { label: 'Mới gửi', className: 'bg-amber-50 text-amber-700' },
  confirmed: { label: 'Đã xác nhận', className: 'bg-sky-50 text-sky-700' },
  in_progress: { label: 'Đang xử lý', className: 'bg-violet-50 text-violet-700' },
  completed: { label: 'Hoàn tất', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Đã huỷ', className: 'bg-slate-100 text-slate-600' },
}
export const SERVICE_TYPE_LABELS = { home_service: 'Tại nhà', trade_in: 'Thu cũ đổi mới', warranty: 'Bảo hành' }
