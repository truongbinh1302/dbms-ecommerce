import { Component } from 'react'

// Lỗi tải file JS của trang tải theo nhu cầu: thường do bản mới vừa deploy, file cũ đã bị thay tên.
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i
const RELOAD_KEY = 'bt_chunk_reload_at'
const RELOAD_GAP_MS = 60000

const isChunkLoadError = (error) => CHUNK_ERROR.test(String(error?.message || error || ''))

function readLastReload() {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0
  } catch {
    return 0
  }
}

/*
  Chặn lỗi hiển thị để cả trang không trắng xoá.
  - Lỗi tải file của bản cũ sau khi deploy: tự tải lại trang một lần (cách nhau ít nhất 1 phút để không lặp),
    vẫn lỗi thì hiện nút tải lại.
  - Lỗi khác: báo lỗi, cho tải lại hoặc về trang chủ.
  resetKey đổi (ví dụ khách chuyển trang) thì thử hiển thị lại.
*/
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(error)
    if (isChunkLoadError(error) && Date.now() - readLastReload() > RELOAD_GAP_MS) {
      try {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      } catch {
        // Không ghi được sessionStorage thì không tự tải lại, tránh lặp.
        return
      }
      window.location.reload()
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = isChunkLoadError(this.state.error)
    const fullPage = this.props.fullPage
    return (
      <div className={fullPage ? 'flex min-h-screen items-center justify-center bg-slate-100 p-4' : 'py-10'}>
        <div role="alert" className="mx-auto max-w-lg rounded-[32px] bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h2 className="text-xl font-black text-slate-900">{chunk ? 'Trang vừa được cập nhật' : 'Có lỗi khi hiển thị trang này'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {chunk
              ? 'Cửa hàng vừa lên phiên bản mới. Tải lại trang để tiếp tục.'
              : 'Bạn thử tải lại trang. Nếu vẫn lỗi, hãy quay về trang chủ hoặc liên hệ cửa hàng.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => window.location.reload()} className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">
              Tải lại trang
            </button>
            {this.props.homeHref ? (
              <a href={this.props.homeHref} className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-red-200 hover:text-red-600">
                Về trang chủ
              </a>
            ) : null}
          </div>
        </div>
      </div>
    )
  }
}
