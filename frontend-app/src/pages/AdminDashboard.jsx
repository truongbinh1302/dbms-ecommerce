import { useCallback, useEffect, useMemo, useState } from 'react'
import heroAsset from '../assets/hero.png'
import StoreGlyph from '../components/StoreGlyph'
import { fetchAdminOrders, updateAdminOrderStatus } from '../api/client'
import { adminCategoryPerformance, adminInventoryAlerts, adminSummary, allProducts } from '../data/storeData'
import { formatCurrency, formatCompactNumber } from '../utils/format'

const toneClasses = {
  emerald: 'from-emerald-500 to-teal-500 text-emerald-50',
  sky: 'from-sky-500 to-blue-500 text-sky-50',
  violet: 'from-violet-500 to-fuchsia-500 text-violet-50',
  rose: 'from-rose-500 to-orange-500 text-rose-50',
}

const topProducts = allProducts.slice(0, 6)

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
  }
}

export default function AdminDashboard({ onBackToStore, onGoToProductManagement, token }) {
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [updatingOrderId, setUpdatingOrderId] = useState(null)

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
          page: 1,
          limit: 20,
        },
        token,
      )
      setOrders(Array.isArray(result.items) ? result.items : [])
    } catch (err) {
      setOrdersError(err.message || 'Không tải được danh sách đơn hàng.')
    } finally {
      setOrdersLoading(false)
    }
  }, [token])

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
      await updateAdminOrderStatus(
        orderId,
        nextStatus,
        `Admin cập nhật trạng thái sang ${nextStatus}`,
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
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                Cập nhật lần cuối: 08:45 • Hệ thống ổn định
              </div>
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

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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
            {adminSummary.map((item) => (
              <div
                key={item.id}
                className={`rounded-[32px] bg-gradient-to-br p-5 shadow-[0_22px_60px_rgba(0,0,0,0.3)] ${toneClasses[item.tone]}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold opacity-90">{item.label}</p>
                    <div className="mt-2 text-3xl font-black">{item.value}</div>
                  </div>
                  <div className="rounded-2xl bg-white/15 px-3 py-2 text-sm font-bold">{item.delta}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 2xl:grid-cols-[0.95fr_1.05fr_0.85fr]">
          <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 text-sky-300">
                <StoreGlyph name="chart" className="size-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black">Hiệu suất danh mục</h3>
                <p className="text-sm text-slate-400">Điểm hiệu suất nội bộ theo doanh số và chuyển đổi</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {adminCategoryPerformance.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
                    <span>{item.label}</span>
                    <strong className="text-white">{item.value}%</strong>
                  </div>
                  <div className="h-3 rounded-full bg-white/10">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Insight nhanh</p>
                  <h4 className="mt-2 text-xl font-black">Laptop gaming vẫn đang dẫn tốt</h4>
                </div>
                <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-300">+12.4%</div>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Nhóm laptop gaming và PC đang kéo doanh thu chính. Nhóm màn hình tăng tốt sau khi gắn kèm combo bàn
                phím + chuột trên trang chủ.
              </p>
            </div>
          </div>

          <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black">Đơn hàng gần đây</h3>
                <p className="text-sm text-slate-400">
                  Dữ liệu lấy trực tiếp từ bảng Orders trong SQL Server
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
                  {formatCompactNumber(displayOrders.length)} đơn hiển thị
                </div>
              </div>
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
                      <p className="font-bold text-white">{order.customer}</p>
                      <p className="text-sm text-slate-400">#{order.id}</p>
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
          </div>

          <div className="space-y-6">
            <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
                  <StoreGlyph name="alert" className="size-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black">Cảnh báo tồn kho</h3>
                  <p className="text-sm text-slate-400">Các SKU cần theo dõi hoặc nhập thêm</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {adminInventoryAlerts.map((item) => (
                  <div key={item.id} className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="text-base font-black text-white">{item.name}</h4>
                      <span className="rounded-full bg-rose-500/10 px-3 py-1.5 text-sm font-bold text-rose-300">
                        Còn {item.remaining}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{item.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
              <h3 className="text-2xl font-black">Top sản phẩm nổi bật</h3>
              <p className="mt-1 text-sm text-slate-400">Tham chiếu nhanh cho block đề xuất và upsell</p>

              <div className="mt-5 space-y-4">
                {topProducts.map((product, index) => (
                  <div key={product.id} className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-400 text-lg font-black text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-base font-bold text-white">{product.name}</h4>
                      <p className="text-sm text-slate-400">{product.brand}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-300">{formatCurrency(product.price)}</div>
                      <div className="text-xs text-slate-500">{product.reviews} đánh giá</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
