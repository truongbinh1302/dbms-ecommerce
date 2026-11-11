import { useCallback, useEffect, useMemo, useState } from 'react'
import heroAsset from '../assets/hero.png'
import StoreGlyph from '../components/StoreGlyph'
import DailyReport from '../components/admin/DailyReport'
import InventoryPanel from '../components/admin/InventoryPanel'
import PromotionsPanel from '../components/admin/PromotionsPanel'
import ServiceRequestsPanel from '../components/admin/ServiceRequestsPanel'
import ReturnsPanel from '../components/admin/ReturnsPanel'
import VouchersPanel from '../components/admin/VouchersPanel'
import useDocumentTitle from '../hooks/useDocumentTitle'
import OrderDetailDrawer from '../components/admin/OrderDetailDrawer'
import { fetchAdminDashboard, fetchAdminOrders, fetchDailyReport, fetchOrder, registerWarranty, updateAdminOrderStatus } from '../api/client'
import { formatCurrency, formatCompactNumber } from '../utils/format'

const toneClasses = {
  emerald: 'from-emerald-500 to-teal-500 text-emerald-50',
  sky: 'from-sky-500 to-blue-500 text-sky-50',
  violet: 'from-violet-500 to-fuchsia-500 text-violet-50',
  rose: 'from-rose-500 to-orange-500 text-rose-50',
}

// Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD; offsetDays = -1 là hôm qua.
function vietnamDate(offsetDays = 0) {
  return new Date(Date.now() + 7 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

function formatClock(date) {
  return date ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '--:--'
}

// Thẻ số liệu nhanh: số thật từ /analytics/dashboard và báo cáo ngày hôm nay / hôm qua.
function buildSummaryCards(summary, today, yesterday) {
  if (!summary || !today) return []
  return [
    { id: 'today-sales', label: 'Doanh số hôm nay', value: formatCurrency(today.netSales), delta: `Hôm qua ${formatCompactNumber(yesterday?.netSales || 0)}`, tone: 'emerald' },
    { id: 'today-orders', label: 'Đơn hôm nay', value: today.orders.toLocaleString('vi-VN'), delta: `${today.cancelledOrders} huỷ`, tone: 'sky' },
    { id: 'delivered', label: 'Doanh thu đã giao', value: formatCompactNumber(Number(summary.deliveredRevenue || 0)), delta: `${formatCompactNumber(Number(summary.totalOrders || 0))} đơn`, tone: 'violet' },
    { id: 'low-stock', label: 'Sắp hết hàng', value: Number(summary.lowStockProducts || 0).toLocaleString('vi-VN'), delta: 'tồn ≤ 5', tone: 'rose' },
  ]
}

const orderStatusOptions = [
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'pending_payment', label: 'Chờ thanh toán' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'shipped', label: 'Đang giao' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const orderStatusLabels = Object.fromEntries(
  orderStatusOptions.map((status) => [status.value, status.label]),
)

function normalizeAdminOrder(order) {
  const id = Number(order.id ?? order.OrderID)
  const rawStatus = String(order.status ?? order.Status ?? 'pending').trim().toLowerCase()
  const itemCount = Number(order.itemCount ?? order.ItemCount ?? 0)
  return {
    id,
    customer:
      order.customerName ??
      order.CustomerName ??
      order.customerEmail ??
      order.Email ??
      'Khách hàng',
    item:
      order.itemsText ??
      order.ItemsText ??
      (itemCount > 0 ? `${itemCount} sản phẩm` : 'Chưa có sản phẩm'),
    total: Number(order.total ?? order.Total ?? 0),
    channel: String(order.paymentMethod ?? order.PaymentMethod ?? 'cod').toUpperCase(),
    statusRaw: rawStatus,
    status: orderStatusLabels[rawStatus] ?? rawStatus,
    createdAt: order.createdAt ?? order.CreatedAt,
    code: order.orderCode || `#${id}`,
    recipient: [order.recipientName, order.recipientPhone].filter(Boolean).join(' · '),
    paymentStatus: order.paymentStatus || '',
  }
}

export default function AdminDashboard({ onBackToStore, onGoToProductManagement, token }) {
  useDocumentTitle('Quản trị')
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [orderFilter, setOrderFilter] = useState({ status: '', q: '', page: 1 })
  const [orderSearch, setOrderSearch] = useState('')
  const [ordersTotal, setOrdersTotal] = useState({ items: 0, pages: 0 })
  const [openOrderId, setOpenOrderId] = useState(null)
  const [overview, setOverview] = useState({ dashboard: null, today: null, yesterday: null, error: '', updatedAt: null })
  const [refreshKey, setRefreshKey] = useState(0)

  const loadOverview = useCallback(async () => {
    if (!token) return
    try {
      const [dashboard, report] = await Promise.all([
        fetchAdminDashboard(token),
        fetchDailyReport({ from: vietnamDate(-1), to: vietnamDate(0) }, token),
      ])
      const days = Array.isArray(report?.days) ? report.days : []
      setOverview({ dashboard, yesterday: days[0] || null, today: days[1] || null, error: '', updatedAt: new Date() })
    } catch (err) {
      setOverview((current) => ({ ...current, error: err.message || 'Không tải được số liệu tổng quan.' }))
    }
  }, [token])

  useEffect(() => {
    loadOverview()
  }, [loadOverview, refreshKey])

  const summaryCards = useMemo(
    () => buildSummaryCards(overview.dashboard?.summary, overview.today, overview.yesterday),
    [overview],
  )
  const categories = useMemo(() => {
    const rows = Array.isArray(overview.dashboard?.revenueByCategory) ? overview.dashboard.revenueByCategory : []
    const max = Math.max(...rows.map((row) => Number(row.totalRevenue || 0)), 0)
    const total = rows.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0)
    return rows.map((row) => ({
      label: row.categoryName,
      revenue: Number(row.totalRevenue || 0),
      quantity: Number(row.totalQuantity || 0),
      width: max > 0 ? (Number(row.totalRevenue || 0) / max) * 100 : 0,
      share: total > 0 ? Math.round((Number(row.totalRevenue || 0) / total) * 100) : 0,
    }))
  }, [overview.dashboard])
  const topProducts = Array.isArray(overview.dashboard?.topProducts) ? overview.dashboard.topProducts.slice(0, 6) : []

  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([])
      setOrdersError('Bạn cần đăng nhập admin để xem đơn hàng thật từ database.')
      return
    }

    try {
      setOrdersLoading(true)
      setOrdersError('')
      const result = await fetchAdminOrders(
        {
          page: orderFilter.page,
          limit: 20,
          status: orderFilter.status,
          q: orderFilter.q,
        },
        token,
      )
      setOrders(Array.isArray(result.items) ? result.items : [])
      setOrdersTotal({ items: Number(result.pagination?.totalItems || 0), pages: Number(result.pagination?.totalPages || 0) })
    } catch (err) {
      setOrdersError(err.message || 'Không tải được danh sách đơn hàng.')
    } finally {
      setOrdersLoading(false)
    }
  }, [token, orderFilter])

  // Gõ tìm kiếm: chờ 350ms sau lần gõ cuối rồi mới lọc lại (về trang 1).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOrderFilter((current) => (current.q === orderSearch.trim() ? current : { ...current, q: orderSearch.trim(), page: 1 }))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [orderSearch])

  useEffect(() => {
    loadOrders()
    const timerId = window.setInterval(() => {
      loadOrders()
    }, 10000)
    return () => window.clearInterval(timerId)
  }, [loadOrders])

  const displayOrders = useMemo(() => orders.map(normalizeAdminOrder), [orders])

  async function handleStatusChange(orderId, nextStatus) {
    try {
      setUpdatingOrderId(orderId)
      setOrdersError('')
      // Ghi chú gửi kèm chỉ dùng khi huỷ (lý do huỷ, hiện cho khách); các trạng thái khác không cần.
      await updateAdminOrderStatus(
        orderId,
        nextStatus,
        nextStatus === 'cancelled' ? 'Cửa hàng huỷ đơn' : undefined,
        token,
      )
      setOrders((currentOrders) =>
        currentOrders.map((order) => {
          const currentId = Number(order.id ?? order.OrderID)
          if (currentId !== Number(orderId)) return order
          return {
            ...order,
            status: nextStatus,
            Status: nextStatus,
          }
        }),
      )
      await loadOrders()
    } catch (err) {
      setOrdersError(err.message || 'Không cập nhật được trạng thái đơn hàng.')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.28),_transparent_45%)]" />
      <div className="relative mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-30 rounded-[32px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-400 text-xl font-black text-white shadow-lg shadow-red-500/30">
                BT
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-red-300">BinhTinhStore Admin</div>
                <h1 className="text-2xl font-black tracking-tight">Bảng điều khiển vận hành bán hàng</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <nav aria-label="Mục quản trị" className="flex flex-wrap gap-1 rounded-[24px] border border-white/10 bg-white/5 p-1 text-sm font-semibold">
                <a href="#admin-overview" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Tổng quan</a>
                <a href="#admin-report" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Báo cáo</a>
                <a href="#admin-stock" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Kho hàng</a>
                <a href="#admin-promotions" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Hot Deal</a>
                <a href="#admin-vouchers" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Mã giảm giá</a>
                <a href="#admin-services" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Dịch vụ</a>
                <a href="#admin-returns" className="rounded-full px-3 py-1.5 text-slate-200 hover:bg-white/10">Đổi trả</a>
              </nav>
              <button
                type="button"
                onClick={() => setRefreshKey((key) => key + 1)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                title="Tải lại số liệu"
              >
                Cập nhật lúc {formatClock(overview.updatedAt)}
              </button>
              {onGoToProductManagement && (
                <button
                  type="button"
                  onClick={onGoToProductManagement}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  <StoreGlyph name="settings" className="size-4" />
                  Quản lý sản phẩm
                </button>
              )}
              <button
                type="button"
                onClick={onBackToStore}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
              >
                <StoreGlyph name="chevron-left" className="size-4" />
                Quay lại storefront
              </button>
            </div>
          </div>
        </header>

        {overview.error ? (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{overview.error}</div>
        ) : null}

        <section id="admin-overview" className="mt-8 grid scroll-mt-32 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="grid gap-8 lg:grid-cols-[1fr_280px] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-300">Tổng quan nhanh</p>
                <h2 className="mt-3 max-w-2xl text-4xl font-black leading-tight">
                  Theo dõi đơn hàng, sản phẩm và doanh thu cửa hàng.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                  Trang quản trị giúp admin theo dõi đơn hàng mới, cập nhật trạng thái giao hàng,
                  quản lý sản phẩm, tồn kho và tình hình kinh doanh của cửa hàng.
                </p>

                <div className="mt-6 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-white/10 px-4 py-2 font-medium text-slate-100">Quản lý đơn hàng</span>
                  <span className="rounded-full bg-white/10 px-4 py-2 font-medium text-slate-100">Theo dõi tồn kho</span>
                  <span className="rounded-full bg-white/10 px-4 py-2 font-medium text-slate-100">Phân tích danh mục</span>
                  <span className="rounded-full bg-white/10 px-4 py-2 font-medium text-slate-100">Giao diện responsive</span>
                </div>
              </div>

              <div className="relative flex items-center justify-center">
                <div className="absolute size-52 rounded-full bg-sky-500/20 blur-3xl" />
                <img src={heroAsset} alt="Admin decoration" className="relative w-60 drop-shadow-[0_22px_32px_rgba(96,165,250,0.35)]" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            {summaryCards.length === 0 ? (
              <div className="rounded-[32px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300 sm:col-span-2">Đang tải số liệu...</div>
            ) : null}
            {summaryCards.map((item) => (
              <div
                key={item.id}
                className={`rounded-[32px] bg-gradient-to-br p-5 shadow-[0_22px_60px_rgba(0,0,0,0.3)] ${toneClasses[item.tone]}`}
              >
                <p className="text-sm font-semibold opacity-90">{item.label}</p>
                <div className="mt-2 break-words text-3xl font-black">{item.value}</div>
                <div className="mt-3 inline-block rounded-2xl bg-white/15 px-3 py-1.5 text-sm font-bold">{item.delta}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)_minmax(0,0.85fr)]">
          <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-sky-300">
                <StoreGlyph name="chart" className="size-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black">Doanh thu theo danh mục</h3>
                <p className="text-sm text-slate-400">Đơn đã giao hoặc hoàn tất, cộng dồn từ trước đến nay</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {categories.length === 0 ? <p className="text-sm text-slate-400">Chưa có đơn đã giao.</p> : null}
              {categories.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span className="min-w-0 truncate">{item.label}</span>
                    <strong className="shrink-0 text-white">{formatCompactNumber(item.revenue)} · {item.share}%</strong>
                  </div>
                  <div className="h-2 rounded-full bg-white/10" title={`${item.label}: ${formatCurrency(item.revenue)}, ${item.quantity} sản phẩm`}>
                    <div className="h-2 rounded-full" style={{ width: `${item.width}%`, backgroundColor: '#3987e5' }} />
                  </div>
                </div>
              ))}
            </div>

            {categories[0] ? (
              <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-900/70 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Dẫn đầu</p>
                <h4 className="mt-2 text-xl font-black">{categories[0].label}</h4>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Chiếm {categories[0].share}% doanh thu đã giao ({formatCurrency(categories[0].revenue)}, {categories[0].quantity.toLocaleString('vi-VN')} sản phẩm).
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black">Đơn hàng</h3>
                <p className="text-sm text-slate-400">
                  Bấm vào một đơn để xem địa chỉ giao, sản phẩm và in phiếu giao hàng
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={loadOrders}
                  disabled={ordersLoading}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ordersLoading ? 'Đang tải...' : 'Làm mới'}
                </button>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
                  {ordersTotal.items.toLocaleString('vi-VN')} đơn
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Tìm mã đơn, tên, email, số điện thoại"
                aria-label="Tìm đơn hàng"
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none focus:border-white/40"
              />
              <select
                value={orderFilter.status}
                onChange={(event) => setOrderFilter((current) => ({ ...current, status: event.target.value, page: 1 }))}
                aria-label="Lọc theo trạng thái"
                className="rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Mọi trạng thái</option>
                <option value="pending,pending_payment,confirmed,processing">Cần xử lý</option>
                {orderStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>

            {ordersError ? (
              <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {ordersError}
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10">
              <div className="hidden grid-cols-[1.1fr_1.3fr_0.8fr_0.7fr_0.9fr] gap-4 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-400 lg:grid">
                <span>Khách hàng</span>
                <span>Sản phẩm</span>
                <span>Tổng tiền</span>
                <span>Kênh</span>
                <span>Trạng thái</span>
              </div>

              <div className="divide-y divide-white/10">
                {ordersLoading && displayOrders.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm font-semibold text-slate-300">
                    Đang tải đơn hàng từ database...
                  </div>
                ) : null}

                {!ordersLoading && displayOrders.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm font-semibold text-slate-300">
                    Chưa có đơn hàng nào trong database.
                  </div>
                ) : null}

                {displayOrders.map((order) => (
                  <div
                    key={order.id}
                    className="grid gap-3 px-4 py-4 lg:grid-cols-[1.1fr_1.3fr_0.8fr_0.7fr_0.9fr] lg:items-center"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => setOpenOrderId(order.id)}
                        className="text-left font-bold text-white underline-offset-2 hover:underline"
                        aria-label={`Xem chi tiết đơn ${order.code}`}
                      >
                        {order.customer}
                      </button>
                      <p className="text-sm text-slate-400">{order.code}</p>
                      {order.recipient ? <p className="text-xs text-slate-400">{order.recipient}</p> : null}
                    </div>
                    <div className="text-sm leading-6 text-slate-300">
                      {order.item}
                    </div>
                    <div className="text-sm font-bold text-white">
                      {formatCurrency(order.total)}
                    </div>
                    <div className="text-sm text-slate-300">
                      {order.channel}
                    </div>
                    <div>
                      <select
                        aria-label={`Trạng thái đơn #${order.id}`}
                        value={order.statusRaw}
                        disabled={updatingOrderId === order.id}
                        onChange={(event) => handleStatusChange(order.id, event.target.value)}
                        className="w-full rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {orderStatusOptions.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {ordersTotal.pages > 1 ? (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                <button
                  type="button"
                  disabled={orderFilter.page <= 1}
                  onClick={() => setOrderFilter((current) => ({ ...current, page: current.page - 1 }))}
                  className="rounded-full bg-white/10 px-4 py-2 font-bold text-white hover:bg-white/20 disabled:opacity-40"
                >
                  Trang trước
                </button>
                <span>Trang {orderFilter.page}/{ordersTotal.pages}</span>
                <button
                  type="button"
                  disabled={orderFilter.page >= ordersTotal.pages}
                  onClick={() => setOrderFilter((current) => ({ ...current, page: current.page + 1 }))}
                  className="rounded-full bg-white/10 px-4 py-2 font-bold text-white hover:bg-white/20 disabled:opacity-40"
                >
                  Trang sau
                </button>
              </div>
            ) : null}
            {openOrderId ? <OrderDetailDrawer orderId={openOrderId} token={token} onChanged={loadOrders} onClose={() => setOpenOrderId(null)} /> : null}
          </div>

          <div className="space-y-6">
            <WarrantyRegistration token={token} />

            <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h3 className="text-2xl font-black">Bán chạy nhất</h3>
              <p className="mt-1 text-sm text-slate-400">Theo số lượng trong đơn đã giao hoặc hoàn tất</p>

              <div className="mt-5 space-y-4">
                {topProducts.length === 0 ? <p className="text-sm text-slate-400">Chưa có đơn đã giao.</p> : null}
                {topProducts.map((product, index) => (
                  <div key={product.id} className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-400 text-lg font-black text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-bold text-white">{product.name}</h4>
                      <p className="text-sm text-slate-400">{product.brand || 'Không rõ hãng'}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{Number(product.totalQuantity || 0).toLocaleString('vi-VN')} sp</div>
                      <div className="text-xs text-slate-400">{formatCompactNumber(Number(product.totalRevenue || 0))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div id="admin-report" className="mt-6 scroll-mt-32">
          <DailyReport token={token} refreshKey={refreshKey} />
        </div>

        <div id="admin-stock" className="mt-6 scroll-mt-32">
          <InventoryPanel token={token} onChanged={() => setRefreshKey((key) => key + 1)} />
        </div>

        <div id="admin-promotions" className="mt-6 scroll-mt-32">
          <PromotionsPanel token={token} />
        </div>

        <div id="admin-vouchers" className="mt-6 scroll-mt-32">
          <VouchersPanel token={token} />
        </div>

        <div id="admin-services" className="mt-6 scroll-mt-32">
          <ServiceRequestsPanel token={token} />
        </div>

        <div id="admin-returns" className="mt-6 scroll-mt-32">
          <ReturnsPanel token={token} />
        </div>
      </div>
    </div>
  )
}

const WARRANTY_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered']
const FIELD = 'w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-white/40'

// Đăng ký số serial bảo hành cho sản phẩm trong đơn đã xác nhận (server kiểm tra lại toàn bộ).
// Tự tải các đơn đủ điều kiện đăng ký bảo hành (không phụ thuộc bộ lọc của danh sách đơn).
function WarrantyRegistration({ token }) {
  const [eligibleState, setEligibleState] = useState([])
  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    fetchAdminOrders({ status: WARRANTY_STATUSES.join(','), limit: 50 }, token)
      .then((result) => !cancelled && setEligibleState((result.items || []).map(normalizeAdminOrder)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token])
  const eligible = eligibleState
  const [orderId, setOrderId] = useState('')
  const [detail, setDetail] = useState({ orderId: null, items: [], error: '' })
  const [form, setForm] = useState({ productId: '', serialNumber: '', months: '36' })
  const [state, setState] = useState({ busy: false, message: '', error: '' })

  useEffect(() => {
    if (!orderId) return undefined
    let cancelled = false
    fetchOrder(orderId)
      .then((order) => {
        if (!cancelled) setDetail({ orderId, items: order.items || [], error: '' })
      })
      .catch((err) => {
        if (!cancelled) setDetail({ orderId, items: [], error: err.message || 'Không tải được đơn' })
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  const items = detail.orderId === orderId ? detail.items : []

  async function handleSubmit(event) {
    event.preventDefault()
    setState({ busy: true, message: '', error: '' })
    try {
      const warranty = await registerWarranty({
        orderId: Number(orderId),
        productId: Number(form.productId),
        serialNumber: form.serialNumber.trim(),
        months: Number(form.months),
      }, token)
      setState({ busy: false, message: `Đã đăng ký ${warranty.serialNumber}, bảo hành đến hết ${warranty.endDate.split('-').reverse().join('/')}`, error: '' })
      setForm((current) => ({ ...current, serialNumber: '' }))
    } catch (err) {
      setState({ busy: false, message: '', error: err.message || 'Không đăng ký được' })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div>
        <h3 className="text-2xl font-black">Đăng ký bảo hành</h3>
        <p className="mt-1 text-sm text-slate-400">Nhập serial cho sản phẩm trong đơn đã xác nhận. Khách tra cứu được ở trang Tra cứu bảo hành.</p>
      </div>
      <label className="block text-sm">
        <span className="text-slate-300">Đơn hàng</span>
        <select value={orderId} onChange={(event) => { setOrderId(event.target.value); setForm((current) => ({ ...current, productId: '' })) }} className={`mt-1 ${FIELD}`}>
          <option value="">Chọn đơn đã xác nhận</option>
          {eligible.map((order) => (
            <option key={order.id} value={order.id}>#{order.id} · {order.customer}</option>
          ))}
        </select>
      </label>
      {detail.error && detail.orderId === orderId ? <p className="text-sm text-rose-300">{detail.error}</p> : null}
      <label className="block text-sm">
        <span className="text-slate-300">Sản phẩm</span>
        <select value={form.productId} onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))} disabled={items.length === 0} className={`mt-1 ${FIELD}`}>
          <option value="">Chọn sản phẩm</option>
          {items.map((item) => (
            <option key={item.ProductID} value={item.ProductID}>{item.productName} × {item.Quantity}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <label className="block text-sm">
          <span className="text-slate-300">Số serial</span>
          <input value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} maxLength={60} className={`mt-1 uppercase ${FIELD}`} />
        </label>
        <label className="block text-sm">
          <span className="text-slate-300">Số tháng</span>
          <input type="number" min="1" max="120" value={form.months} onChange={(event) => setForm((current) => ({ ...current, months: event.target.value }))} className={`mt-1 ${FIELD}`} />
        </label>
      </div>
      <button
        type="submit"
        disabled={state.busy || !orderId || !form.productId || form.serialNumber.trim().length < 4}
        className="w-full rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.busy ? 'Đang lưu...' : 'Đăng ký serial'}
      </button>
      {state.message ? <p className="text-sm text-emerald-300" role="status">{state.message}</p> : null}
      {state.error ? <p className="text-sm text-rose-300" role="alert">{state.error}</p> : null}
    </form>
  )
}
