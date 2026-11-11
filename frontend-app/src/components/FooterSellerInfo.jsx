import useStoreInfo from '../hooks/useStoreInfo'
import { hrefFor } from '../hooks/useHashRoute'

// Thông tin người bán ở chân trang (Luật Thương mại điện tử 2025, Điều 11: công khai thông tin chủ website).
export default function FooterSellerInfo() {
  const info = useStoreInfo()
  if (!info) return null
  const { seller } = info
  const lines = [
    ['Người bán', seller.legalName],
    ['Mã số thuế', seller.taxCode],
    ['Địa chỉ', seller.address],
    ['Liên hệ', [seller.phone, seller.email].filter(Boolean).join(' · ') || null],
  ]
  return (
    <div className="mt-4 space-y-1 text-sm text-slate-500">
      {lines.map(([label, value]) => (
        <p key={label}>
          {label}: <span className={value ? 'text-slate-700' : 'text-amber-700'}>{value || 'chưa cập nhật'}</span>
        </p>
      ))}
      <p>
        <a href={hrefFor('/chinh-sach/thong-tin')} className="font-semibold text-slate-700 hover:text-red-600">Thông tin người bán</a>
        {' · '}
        <a href={hrefFor('/chinh-sach/dieu-khoan')} className="font-semibold text-slate-700 hover:text-red-600">Điều khoản mua hàng</a>
      </p>
    </div>
  )
}
