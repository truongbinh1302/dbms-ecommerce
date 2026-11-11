import { useState } from 'react'
import StoreGlyph from './StoreGlyph'
import { login, register } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  // Không tích sẵn: khách phải tự đồng ý (Luật Bảo vệ dữ liệu cá nhân).
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = isLogin
        ? await login(email, password)
        : await register({ email, password, fullName, phone: phone.trim(), acceptPrivacy })

      if (data?.user) {
        onSuccess?.(data.user, data)
        onClose()
      } else {
        setError('Không nhận được thông tin người dùng từ API')
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-900">
            {isLogin ? '🔓 Đăng nhập' : '✨ Đăng ký'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
          >
            <StoreGlyph name="close" className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Họ tên</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
              required
            />
          </div>

          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Số điện thoại (không bắt buộc)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901234567"
                  autoComplete="tel"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
                />
              </div>
              <p className="text-xs text-slate-500">Mật khẩu cần ít nhất 8 ký tự.</p>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                  className="mt-1"
                  required
                />
                <span>
                  Tôi đã đọc và đồng ý với{' '}
                  <a href={hrefFor('/chinh-sach-bao-mat')} target="_blank" rel="noreferrer" className="font-semibold text-red-600 underline">
                    Chính sách bảo mật
                  </a>
                  , cho phép cửa hàng dùng thông tin của tôi để xử lý đơn hàng.
                </span>
              </label>
            </>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!isLogin && !acceptPrivacy)}
            className="w-full rounded-xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang xử lý...
              </>
            ) : (
              isLogin ? '🔓 Đăng nhập' : '✨ Đăng ký'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-6">
          <p className="text-center text-sm text-slate-600 mb-3">
            {isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin)
              setError('')
            }}
            className="w-full rounded-xl border-2 border-red-600 py-2 font-semibold text-red-600 transition hover:bg-red-50"
          >
            {isLogin ? 'Đăng ký ngay' : 'Quay lại đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  )
}
