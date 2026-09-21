import { useEffect, useState } from 'react'
import './App.css'
import CustomerSite from './pages/CustomerSite'
import AdminDashboard from './pages/AdminDashboard'
import ProductManagement from './pages/ProductManagement'
import { getStoredToken, normalizeUser } from './api/client'

const VIEW_STORAGE_KEY = 'binhtinhstore-view-mode'
const normalizeRole = (role = '') => String(role || '').trim().toLowerCase()

function getInitialView() {
  if (typeof window === 'undefined') {
    return 'store'
  }

  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) ?? 'store'
  } catch {
    return 'store'
  }
}

export default function App() {
  const [view, setView] = useState(getInitialView)
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem('bt_access_token') || ''
    } catch {
      return ''
    }
  })

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const user = window.localStorage.getItem('bt_user')
      return user ? normalizeUser(JSON.parse(user)) : null
    } catch {
      return null
    }
  })

  const isAdmin = normalizeRole(currentUser?.role) === 'admin'

  const handleUserChange = (user) => {
    const normalizedUser = normalizeUser(user)
    setCurrentUser(normalizedUser)
    try {
      setToken(normalizedUser ? getStoredToken() : '')
    } catch {
      setToken('')
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view)
    } catch {
      // ignore storage errors in private contexts
    }
  }, [view])

  return view === 'products' ? (
    isAdmin ? (
      <ProductManagement 
        token={token} 
        onBackToAdmin={() => setView('admin')} 
      />
    ) : (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="rounded-lg bg-white p-8 shadow-lg text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Truy cập bị từ chối</h1>
          <p className="text-slate-600 mb-6">Bạn không có quyền truy cập trang quản lý sản phẩm. Chỉ admin mới có quyền này.</p>
          <button
            onClick={() => setView('store')}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2 font-bold text-white transition hover:bg-red-700"
          >
            Quay lại trang chủ
          </button>
        </div>
      </div>
    )
  ) : view === 'admin' ? (
    <AdminDashboard 
      onBackToStore={() => setView('store')}
      onGoToProductManagement={() => setView('products')}
      token={token}
    />
  ) : (
    <CustomerSite 
      onOpenAdmin={() => setView('admin')}
      onOpenProductManagement={isAdmin ? () => setView('products') : undefined}
      token={token}
      isAdmin={isAdmin}
      onUserChange={handleUserChange}
    />
  )
}
