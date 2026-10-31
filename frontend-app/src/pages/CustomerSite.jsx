import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import heroAsset from '../assets/hero.png'
import CartDrawer from '../components/CartDrawer'
import ProductCard, { ProductVisual } from '../components/ProductCard'
import ProductQuickView from '../components/ProductQuickView'
import SectionHeader from '../components/SectionHeader'
import StoreGlyph from '../components/StoreGlyph'
import AuthModal from '../components/AuthModal'
import { fetchCart, fetchProducts, fetchProductsByIds, logout, normalizeUser, quoteCart, saveCart } from '../api/client'
import useHashRoute, { navigate } from '../hooks/useHashRoute'
import CheckoutPage from './CheckoutPage'
import OrderDetailPage from './OrderDetailPage'
import OrdersPage from './OrdersPage'
import ProductDetailPage from './ProductDetailPage'
import SearchPage from './SearchPage'
import {
  categories,
  featuredTiles,
  flashDeal,
  footerColumns,
  heroSlides,
  productSections,
  promoCards,
  quickLinks,
  trustHighlights,
} from '../data/storeData'
import { classNames, formatCurrency } from '../utils/format'
import { mapApiProductToStoreProduct, normalizeText } from '../utils/productMapping'

const CART_STORAGE_KEY = 'binhtinhstore-cart'
const VIEWED_STORAGE_KEY = 'binhtinhstore-viewed'
const FAVORITES_STORAGE_KEY = 'binhtinhstore-favorites'
const SEEDED_VIEWED = []

const SECTION_ICONS = {
  pc: 'desktop',
  'gaming-laptops': 'laptop',
  laptops: 'laptop',
  mice: 'mouse',
  keyboards: 'keyboard',
  monitors: 'monitor',
  accessories: 'headset',
}

const HERO_TARGETS = {
  'hero-build-pc': 'section-pc',
  'hero-laptop-gaming': 'section-gaming-laptops',
  'hero-office-setup': 'section-laptops',
}

const PROMO_TARGETS = {
  'pc-monitor': 'section-monitors',
  'keyboard-deal': 'section-keyboards',
  'chair-deal': 'section-accessories',
  'mouse-deal': 'section-mice',
}






function loadFromStorage(key, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function productMatchesTab(product, tab) {
  if (!tab || tab === 'Tất cả') {
    return true
  }

  const haystack = normalizeText([product.brand, product.name, ...product.specs].join(' '))
  const normalizedTab = normalizeText(tab)

  if (tab === 'Ryzen') {
    return haystack.includes('ryzen')
  }

  if (tab === 'Intel') {
    return haystack.includes('intel') || haystack.includes('core i')
  }

  if (tab === 'AI / Creator') {
    return haystack.includes('ai') || haystack.includes('creator') || haystack.includes('studio')
  }

  return haystack.includes(normalizedTab)
}
function productBelongsToSection(product, sectionId) {
  const text = normalizeText([
    product.name,
    product.brand,
    product.categorySlug,
    ...(product.specs || []),
  ].join(' '))

  if (sectionId === 'gaming-laptops') {
    return text.includes('gaming') || text.includes('rtx')
  }

  if (sectionId === 'laptops') {
    return text.includes('laptop')
  }

  if (sectionId === 'monitors') {
    return text.includes('monitor') || text.includes('man hinh') || product.visual?.kind === 'monitor'
  }

  if (sectionId === 'keyboards') {
    return text.includes('keyboard') || text.includes('ban phim') || product.visual?.kind === 'keyboard'
  }

  if (sectionId === 'mice') {
    return text.includes('mouse') || text.includes('chuot') || product.visual?.kind === 'mouse'
  }

  if (sectionId === 'accessories') {
    return text.includes('headset') || text.includes('chair') || text.includes('tai nghe') || text.includes('ghe')
  }

  if (sectionId === 'pc') {
    return product.visual?.kind === 'desktop' || text.includes('pc') || text.includes('cpu') || text.includes('gpu')
  }

  return true
}

function scrollToElement(elementId) {
  if (typeof document === 'undefined') {
    return
  }

  const target = document.getElementById(elementId)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function getMaxDiscountPercent(products) {
  return products.reduce((max, product) => {
    if (!product.oldPrice || product.oldPrice <= product.price) {
      return max
    }
    return Math.max(max, Math.round((1 - product.price / product.oldPrice) * 100))
  }, 0)
}

const isApiProductId = (id) => Number.isInteger(Number(id)) && Number(id) > 0

// Gộp giỏ trên máy với giỏ đã lưu ở server khi đăng nhập: lấy số lượng lớn hơn của mỗi sản phẩm.
function mergeCarts(localCart, serverItems) {
  const merged = new Map(localCart.map((item) => [String(item.id), { ...item }]))
  for (const serverItem of serverItems) {
    const key = String(serverItem.productId)
    const existing = merged.get(key)
    if (existing) {
      existing.quantity = Math.max(existing.quantity, serverItem.quantity)
    } else {
      merged.set(key, { id: Number(serverItem.productId), quantity: serverItem.quantity })
    }
  }
  return [...merged.values()]
}

export default function CustomerSite({ onOpenAdmin, onOpenProductManagement, isAdmin, onUserChange }) {
  const route = useHashRoute()
  const [runtimeProducts, setRuntimeProducts] = useState([])
  const [apiStatus, setApiStatus] = useState('Đang kết nối API SQL Server')
  const [isAuthModalOpen, setAuthModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const user = window.localStorage.getItem('bt_user')
      return user ? normalizeUser(JSON.parse(user)) : null
    } catch {
      return null
    }
  })
  
  // Sản phẩm ngoài trang chủ (từ tìm kiếm, trang chi tiết, giỏ server) cũng cần biết tên, giá để hiện trong giỏ.
  const [extraProducts, setExtraProducts] = useState({})
  const rememberProducts = useCallback((products) => {
    if (!products || products.length === 0) return
    setExtraProducts((current) => ({
      ...current,
      ...Object.fromEntries(products.filter((product) => isApiProductId(product.id)).map((product) => [product.id, product])),
    }))
  }, [])
  const productMap = useMemo(
    () => ({ ...extraProducts, ...Object.fromEntries(runtimeProducts.map((product) => [product.id, product])) }),
    [extraProducts, runtimeProducts],
  )
  const rememberProduct = useCallback((product) => rememberProducts([product]), [rememberProducts])

  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState(() => loadFromStorage(CART_STORAGE_KEY, []))
  const [viewedIds, setViewedIds] = useState(() => loadFromStorage(VIEWED_STORAGE_KEY, SEEDED_VIEWED))
  const [favoriteIds, setFavoriteIds] = useState(() => loadFromStorage(FAVORITES_STORAGE_KEY, []))
  const [activeSlide, setActiveSlide] = useState(0)
  const [sectionFilters, setSectionFilters] = useState(() =>
    Object.fromEntries(productSections.map((section) => [section.id, 'Tất cả'])),
  )
  const [isCartOpen, setCartOpen] = useState(false)
  const [quickViewProduct, setQuickViewProduct] = useState(null)
  const [activeCategoryId, setActiveCategoryId] = useState('all')
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [quoteState, setQuoteState] = useState(null)

  useEffect(() => {
    let mounted = true

    fetchProducts({ limit: 24, sort: 'featured' })
      .then((result) => {
        if (!mounted || !Array.isArray(result.items) || result.items.length === 0) {
          return
        }
        const apiProducts = result.items.map(mapApiProductToStoreProduct)

        setRuntimeProducts(apiProducts)

        setApiStatus(
          'API connected: ' +
            ((result.pagination && result.pagination.totalItems) || apiProducts.length) +
            ' SQL Server products'
        )        
      })
      .catch(() => {
        if (mounted) {
          setApiStatus('Chưa kết nối API - vẫn chạy bằng dữ liệu demo')
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % heroSlides.length)
    }, 4800)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // ignore storage failure
    }
  }, [cart])

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(viewedIds))
    } catch {
      // ignore storage failure
    }
  }, [viewedIds])

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds))
    } catch {
      // ignore storage failure
    }
  }, [favoriteIds])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const cartItems = useMemo(
    () =>
      cart
        .map((item) => {
          const product = productMap[item.id]
          if (!product) {
            return null
          }
          return { ...product, quantity: item.quantity }
        })
        .filter(Boolean),
    [cart, productMap],
  )

  // Giỏ có sản phẩm chưa biết thông tin (ví dụ sau khi tải lại trang): hỏi API theo ID.
  // Trước đây giỏ bị xoá sạch mỗi lần tải lại vì danh sách sản phẩm chưa kịp tải.
  const missingProductKey = useMemo(
    () => cart
      .map((item) => Number(item.id))
      .filter((id) => isApiProductId(id) && !productMap[id])
      .join(','),
    [cart, productMap],
  )

  useEffect(() => {
    if (!missingProductKey) return undefined
    let cancelled = false
    const ids = missingProductKey.split(',').map(Number)

    fetchProductsByIds(ids)
      .then((result) => {
        if (cancelled) return
        const found = (result.items || []).map(mapApiProductToStoreProduct)
        rememberProducts(found)
        const foundIds = new Set(found.map((product) => product.id))
        const removed = ids.filter((id) => !foundIds.has(id))
        if (removed.length > 0) {
          setCart((currentCart) => currentCart.filter((item) => !removed.includes(Number(item.id))))
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [missingProductKey, rememberProducts])

  // Đồng bộ giỏ với server khi đã đăng nhập: tải giỏ server, gộp với giỏ trên máy, rồi lưu lại khi thay đổi.
  const userId = currentUser?.id
  const cartSyncRef = useRef({ userId: null, ready: false })

  useEffect(() => {
    cartSyncRef.current = { userId: userId || null, ready: false }
    if (!userId) return undefined
    let cancelled = false

    fetchCart()
      .then((data) => {
        if (cancelled) return
        const serverItems = data.items || []
        rememberProducts(serverItems.map((item) => mapApiProductToStoreProduct(item.product)))
        setCart((currentCart) => mergeCarts(currentCart, serverItems))
        cartSyncRef.current = { userId, ready: true }
      })
      .catch(() => {
        if (!cancelled) cartSyncRef.current = { userId, ready: true }
      })

    return () => {
      cancelled = true
    }
  }, [userId, rememberProducts])

  const serverCartPayload = useMemo(
    () => JSON.stringify(
      cart
        .filter((item) => isApiProductId(item.id))
        .map((item) => ({ productId: Number(item.id), quantity: Math.min(item.quantity, 99) })),
    ),
    [cart],
  )

  useEffect(() => {
    if (!userId) return undefined
    const timer = window.setTimeout(() => {
      if (!cartSyncRef.current.ready || cartSyncRef.current.userId !== userId) return
      saveCart(JSON.parse(serverCartPayload)).catch(() => {})
    }, 600)
    return () => window.clearTimeout(timer)
  }, [serverCartPayload, userId])  
  const cartCount = useMemo(
    () => cartItems.reduce((count, item) => count + item.quantity, 0),
    [cartItems],
  )

  const subtotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.price * item.quantity, 0),
    [cartItems],
  )

  // Phí ship, giảm giá và voucher do server tính (POST /cart/quote) theo đúng quy tắc lúc tạo đơn.
  // Giỏ còn sản phẩm demo (không có trong SQL Server) thì không báo giá được.
  const quoteKey = useMemo(() => {
    const items = cartItems.map((item) => ({ productId: Number(item.id), quantity: item.quantity }))
    const canQuote = items.length > 0 && items.every((item) => Number.isInteger(item.productId) && item.productId > 0)
    return canQuote ? JSON.stringify({ items, voucherCode }) : ''
  }, [cartItems, voucherCode])

  useEffect(() => {
    if (!quoteKey) {
      return undefined
    }

    let cancelled = false
    const { items, voucherCode: code } = JSON.parse(quoteKey)

    quoteCart(items, code)
      .then((data) => {
        if (!cancelled) setQuoteState({ key: quoteKey, data, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setQuoteState({ key: quoteKey, data: null, error: err.message || 'Không tính được giá' })
      })

    return () => {
      cancelled = true
    }
  }, [quoteKey])

  const currentQuote = quoteState && quoteState.key === quoteKey ? quoteState : null
  const maxDiscountPercent = useMemo(() => getMaxDiscountPercent(runtimeProducts), [runtimeProducts])

  const viewedProducts = useMemo(
    () => viewedIds.map((id) => productMap[id]).filter(Boolean),
    [productMap, viewedIds],
  )

  // Gợi ý khi gõ: hỏi server (tìm không dấu trên toàn catalog), chờ 250ms sau lần gõ cuối.
  const trimmedSearch = searchQuery.trim()
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionState, setSuggestionState] = useState({ query: '', items: [] })

  useEffect(() => {
    if (trimmedSearch.length < 2) return undefined
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchProducts({ q: trimmedSearch, limit: '6', sort: 'relevance' })
        .then((result) => {
          if (!cancelled) {
            setSuggestionState({ query: trimmedSearch, items: (result.items || []).map(mapApiProductToStoreProduct) })
          }
        })
        .catch(() => {})
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmedSearch])

  const searchSuggestions = suggestionsOpen && suggestionState.query === trimmedSearch && trimmedSearch.length >= 2
    ? suggestionState.items
    : []
  const activeSlideData = heroSlides[activeSlide]
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0]

  function showToast(message) {
    setToast(message)
  }

  function markAsViewed(productId) {
    setViewedIds((currentIds) => [productId, ...currentIds.filter((id) => id !== productId)].slice(0, 8))
  }

  function addToCart(product, quantity = 1, { openDrawer = true } = {}) {
    const amount = Math.max(1, Number(quantity) || 1)
    markAsViewed(product.id)
    rememberProducts([product])
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === product.id)
      if (existingItem) {
        return currentCart.map((item) =>
          item.id === product.id ? { ...item, quantity: Math.min(99, item.quantity + amount) } : item,
        )
      }
      return [...currentCart, { id: product.id, quantity: Math.min(99, amount) }]
    })
    if (openDrawer) setCartOpen(true)
    showToast(`Đã thêm “${product.name}” vào giỏ hàng.`)
  }

  function handleQuickView(product) {
    markAsViewed(product.id)
    setQuickViewProduct(product)
  }

  function handleProductCardClick(product) {
    openProduct(product)
  }

  function toggleFavorite(productId) {
    const product = productMap[productId]
    setFavoriteIds((currentIds) => {
      const exists = currentIds.includes(productId)
      const nextIds = exists ? currentIds.filter((id) => id !== productId) : [productId, ...currentIds]
      showToast(
        exists
          ? `Đã bỏ “${product?.name ?? 'sản phẩm'}” khỏi danh sách yêu thích.`
          : `Đã thêm “${product?.name ?? 'sản phẩm'}” vào yêu thích.`,
      )
      return nextIds.slice(0, 16)
    })
  }

  function changeQuantity(productId, delta) {
    setCart((currentCart) => {
      const nextCart = currentCart
        .map((item) => (item.id === productId ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
      return nextCart
    })
  }

  function removeFromCart(productId) {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId))
  }

  function handleCategorySelect(category) {
    setActiveCategoryId(category.id)
    setMobileCategoriesOpen(false)
    scrollToElement(category.targetSection)
  }

  function handleSectionTabChange(sectionId, tab) {
    setSectionFilters((currentFilters) => ({
      ...currentFilters,
      [sectionId]: tab,
    }))
  }

  function handleSearchSubmit(event) {
    event.preventDefault()
    if (trimmedSearch.length >= 1) {
      setSuggestionsOpen(false)
      navigate(`/tim-kiem?q=${encodeURIComponent(trimmedSearch)}`)
    }
  }

  function openProduct(product) {
    if (isApiProductId(product.id)) {
      markAsViewed(product.id)
      rememberProducts([product])
      navigate(`/san-pham/${product.id}`)
    } else {
      handleQuickView(product)
    }
  }

  function buyNow(product, quantity = 1) {
    addToCart(product, quantity, { openDrawer: false })
    navigate('/thanh-toan')
  }

  function goToCheckout() {
    setCartOpen(false)
    navigate('/thanh-toan')
  }

  const handleOrderPlaced = useCallback(() => {
    setCart([])
    setVoucherCode('')
  }, [])

  async function handleLogout() {
    try {
      const token = window.localStorage.getItem('bt_access_token')
      if (token) {
        await logout(token).catch(() => {/* backend error không block logout */})
      }
    } finally {
      window.localStorage.removeItem('bt_access_token')
      window.localStorage.removeItem('bt_user')
      setCurrentUser(null)
      if (onUserChange) onUserChange(null)
      setCart([])
      showToast('Đã đăng xuất thành công.')
    }
  }

  function handleHeroAction(slideId) {
    const target = HERO_TARGETS[slideId]
    if (target) {
      scrollToElement(target)
    }
  }

  // Trang con theo hash: #/san-pham/:id, #/tim-kiem?q=, #/thanh-toan, #/don-hang, #/don-hang/:id.
  const routeSection = route.segments[0] || ''
  const routeId = Number.parseInt(route.segments[1] || '', 10)
  const routePage = Math.max(1, Number.parseInt(route.query.get('trang') || '1', 10) || 1)
  const requireLogin = () => setAuthModalOpen(true)
  let routeContent = null

  if (routeSection === 'san-pham' && routeId > 0) {
    routeContent = (
      <ProductDetailPage
        key={routeId}
        productId={routeId}
        onAddToCart={addToCart}
        onBuyNow={buyNow}
        onProductLoaded={rememberProduct}
      />
    )
  } else if (routeSection === 'tim-kiem') {
    routeContent = (
      <SearchPage
        query={(route.query.get('q') || '').trim()}
        sort={route.query.get('sap-xep') || 'relevance'}
        page={routePage}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggleFavorite}
        onAddToCart={addToCart}
        onQuickView={handleQuickView}
        onView={handleProductCardClick}
        onProductsLoaded={rememberProducts}
      />
    )
  } else if (routeSection === 'thanh-toan') {
    routeContent = (
      <CheckoutPage
        cartItems={cartItems}
        subtotal={subtotal}
        quote={currentQuote?.data || null}
        quoteError={currentQuote?.error || ''}
        voucherCode={voucherCode}
        onApplyVoucher={setVoucherCode}
        currentUser={currentUser}
        onRequireLogin={requireLogin}
        onOrderPlaced={handleOrderPlaced}
      />
    )
  } else if (routeSection === 'don-hang' && routeId > 0) {
    routeContent = (
      <OrderDetailPage
        key={routeId}
        orderId={routeId}
        currentUser={currentUser}
        onRequireLogin={requireLogin}
        isNew={route.query.get('moi') === '1'}
        paymentResult={route.query.get('ket-qua') || ''}
        showToast={showToast}
      />
    )
  } else if (routeSection === 'don-hang') {
    routeContent = (
      <OrdersPage
        currentUser={currentUser}
        onRequireLogin={requireLogin}
        page={routePage}
        paymentResult={route.query.get('ket-qua') || ''}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <DesktopSideAd align="left" />
      <DesktopSideAd align="right" />

      <div className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-2 px-4 py-1.5 text-xs sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-3 text-slate-200">
            <span className="rounded-full bg-red-500/15 px-3 py-1 font-semibold text-red-200">BinhTinhStore • Demo Storefront</span>
            <span>Build PC, laptop, gear và phụ kiện trong một giao diện duy nhất.</span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-200">{apiStatus}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5">
              <StoreGlyph name="shield" className="size-4" /> Chính hãng 100%
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5">
              <StoreGlyph name="truck" className="size-4" /> Giao nhanh toàn quốc
            </span>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 bg-red-600 shadow-[0_18px_50px_rgba(220,38,38,0.24)]">
        <div className="mx-auto max-w-[1480px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="storefront-header-grid">
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-white/10 p-3 text-white transition hover:bg-white/15 xl:hidden"
                onClick={() => setMobileCategoriesOpen((currentValue) => !currentValue)}
              >
                <StoreGlyph name="menu" className="size-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-white text-lg font-black text-red-600 shadow-md">
                  BT
                </div>
                <div>
                  <div className="text-xl font-black tracking-tight text-white">BinhTinhStore</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-100">
                    Build • Laptop • Gear
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="hidden h-12 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 xl:inline-flex"
                onClick={() => setMobileCategoriesOpen((currentValue) => !currentValue)}
              >
                <StoreGlyph name="menu" className="size-5" />
                Danh mục
              </button>
            </div>

            <div className="storefront-search-slot relative">
              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setSuggestionsOpen(true)
                  }}
                  onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
                  onFocus={() => setSuggestionsOpen(true)}
                  aria-label="Tìm kiếm sản phẩm"
                  type="search"
                  placeholder="Bạn cần tìm laptop, PC, gear hay combo setup nào?"
                  className="h-12 w-full rounded-lg border border-white/25 bg-white px-4 pr-12 text-base text-slate-900 outline-none ring-0 transition placeholder:text-slate-400 focus:border-white focus:shadow-[0_0_0_4px_rgba(255,255,255,0.18)]"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white transition hover:bg-slate-800"
                >
                  <StoreGlyph name="search" className="size-5" />
                </button>
              </form>

              {searchSuggestions.length > 0 ? (
                <div className="absolute inset-x-0 top-[calc(100%+12px)] z-40 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
                  {searchSuggestions.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSuggestionsOpen(false)
                        openProduct(product)
                      }}
                      className="flex w-full items-center gap-4 border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50"
                    >
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <StoreGlyph name={product.visual?.kind === 'desktop' ? 'desktop' : product.visual?.kind} className="size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900">{product.name}</div>
                        <div className="mt-1 text-sm text-red-600">{formatCurrency(product.price)}</div>
                      </div>
                      <StoreGlyph name="chevron-right" className="size-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="storefront-actions">
              <HeaderAction icon="phone" label="Hotline" value="0338446502" />
              <HeaderAction icon="map" label="Showroom" value="0 điểm bán" />
              <HeaderAction icon="receipt" label="Đơn hàng" value="Tra cứu" />
              
              {currentUser ? (
                <div className="flex min-h-14 items-center gap-2 rounded-2xl bg-white/10 px-3 text-white">
                  <StoreGlyph name="user" className="size-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-red-100">Xin chào</div>
                    <div className="text-sm font-bold truncate max-w-[100px]">{currentUser.fullName || currentUser.email}</div>
                  </div>
                  <a
                    href="#/don-hang"
                    title="Đơn hàng của tôi"
                    className="ml-1 flex h-8 shrink-0 items-center justify-center rounded-xl bg-white/10 px-2 text-xs font-bold text-red-100 transition hover:bg-red-500 hover:text-white"
                  >
                    Đơn hàng
                  </a>
                  <button
                    type="button"
                    onClick={handleLogout}
                    title="Đăng xuất"
                    className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-red-100 transition hover:bg-red-500 hover:text-white"
                  >
                    <StoreGlyph name="logout" className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="header-action-button"
                >
                  <StoreGlyph name="lock" className="size-4 mr-2" />
                  Đăng nhập
                </button>
              )}

              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="header-action-button relative text-left"
              >
                <div className="flex items-center gap-3">
                  <StoreGlyph name="cart" className="size-5" />
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-red-100">Giỏ hàng</div>
                    <div className="text-sm font-bold">{cartCount} sản phẩm</div>
                  </div>
                </div>
                {cartCount > 0 ? (
                  <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-white text-xs font-black text-red-600">
                    {cartCount}
                  </span>
                ) : null}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onOpenProductManagement}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-blue-300 bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  <StoreGlyph name="settings" className="size-4" />
                  Quản lý sản phẩm
                </button>
              )}
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hidden header-action-button xl:flex"
              >
                <StoreGlyph name="chart" className="size-4" />
                Quản trị demo
              </button>
            </div>
          </div>

          {mobileCategoriesOpen ? (
            <div className="mt-4 rounded-[30px] border border-white/10 bg-white/10 p-3 backdrop-blur-xl xl:hidden">
              <div className="grid gap-2 sm:grid-cols-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleCategorySelect(category)}
                    className={classNames(
                      'flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
                      activeCategoryId === category.id
                        ? 'bg-white text-red-600'
                        : 'bg-white/5 text-white hover:bg-white/15',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <StoreGlyph name={category.icon} className="size-4" />
                      {category.label}
                    </span>
                    <StoreGlyph name="chevron-right" className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="custom-scroll mx-auto flex max-w-[1480px] items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
          {quickLinks.map((link) => (
            <button
              key={link}
              type="button"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:text-red-600"
            >
              {link}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenProductManagement}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 xl:hidden"
            >
              <StoreGlyph name="settings" className="size-4" />
              Quản lý sản phẩm
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAdmin}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 xl:hidden"
          >
            <StoreGlyph name="chart" className="size-4" />
            Quản trị demo
          </button>
        </div>
      </div>

      {routeContent ? (
        <main className="mx-auto min-h-[60vh] max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">{routeContent}</main>
      ) : (
      <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        <section id="hero" className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="hidden h-fit rounded-[32px] bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] xl:block">
            <div className="mb-3 flex items-center justify-between px-2">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-red-500">Danh mục</div>
                <div className="text-lg font-black text-slate-900">Chọn nhanh theo nhu cầu</div>
              </div>
            </div>
            <div className="space-y-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategorySelect(category)}
                  className={classNames(
                    'flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
                    activeCategoryId === category.id
                      ? 'bg-red-50 text-red-600'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-red-600',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <StoreGlyph name={category.icon} className="size-4" />
                    {category.label}
                  </span>
                  <StoreGlyph name="chevron-right" className="size-4" />
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-5">
            <div
              className={classNames(
                'relative overflow-hidden rounded-[36px] bg-gradient-to-br p-6 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] md:p-8',
                activeSlideData.accent,
              )}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.32),_transparent_32%)]" />
              <div className="absolute right-10 top-12 size-40 rounded-full bg-white/10 blur-3xl" />
              <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div>
                  <span className="inline-flex rounded-full bg-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]">
                    {activeSlideData.eyebrow}
                  </span>
                  <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight md:text-5xl">
                    {activeSlideData.title}
                  </h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-white/90 md:text-lg">
                    {activeSlideData.description}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {activeSlideData.badges.map((badge) => (
                      <span key={badge} className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/95">
                        {badge}
                      </span>
                    ))}
                  </div>

                  <div className="mt-7 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleHeroAction(activeSlideData.id)}
                      className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-900"
                    >
                      {activeSlideData.cta}
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToElement('support-zone')}
                      className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      {activeSlideData.secondaryCta}
                    </button>
                  </div>

                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    {activeSlideData.stats.map((item) => (
                      <div key={item.label} className="rounded-[24px] bg-white/12 p-4 backdrop-blur-sm">
                        <div className="text-2xl font-black">{item.value}</div>
                        <div className="mt-1 text-sm text-white/85">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative flex items-center justify-center">
                  <div className="absolute size-64 rounded-full bg-white/20 blur-3xl" />
                  <img
                    src={heroAsset}
                    alt="BinhTinhStore decorative hero"
                    className="relative w-[260px] max-w-full drop-shadow-[0_26px_40px_rgba(0,0,0,0.24)] md:w-[320px]"
                  />
                  <div className="absolute -left-2 top-8 rounded-2xl bg-white/15 px-4 py-3 text-left shadow-xl backdrop-blur-xl">
                    <div className="text-xs uppercase tracking-[0.24em] text-white/75">Deal nổi bật</div>
                    <div className="mt-1 text-xl font-black">Tặng lắp đặt miễn phí</div>
                  </div>
                  <div className="absolute bottom-8 right-2 rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-xl">
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Combo tiết kiệm</div>
                    <div className="mt-1 text-xl font-black text-red-600">Giảm tới 2.000.000đ</div>
                  </div>
                </div>
              </div>

              <div className="relative mt-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {heroSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActiveSlide(index)}
                      className={classNames(
                        'h-3 rounded-full transition',
                        activeSlide === index ? 'w-10 bg-white' : 'w-3 bg-white/40',
                      )}
                      aria-label={slide.title}
                    />
                  ))}
                </div>
                <div className="hidden md:flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-medium backdrop-blur-sm">
                  <StoreGlyph name="sparkles" className="size-4" />
                  Giao diện này có thể phát triển tiếp thành SPA thương mại điện tử hoàn chỉnh.
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featuredTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => scrollToElement(tile.targetSection)}
                  className={classNames(
                    'group relative overflow-hidden rounded-[30px] bg-gradient-to-br p-5 text-left text-white shadow-[0_18px_50px_rgba(15,23,42,0.15)] transition hover:-translate-y-1',
                    tile.accent,
                  )}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.35),_transparent_40%)]" />
                  <div className="relative flex items-center justify-between gap-4">
                    <div>
                      <div className="text-2xl font-black">{tile.title}</div>
                      <div className="mt-1 text-sm text-white/90">{tile.caption}</div>
                    </div>
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                      <StoreGlyph name={tile.icon} className="size-7" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {promoCards.slice(0, 2).map((promo) => (
              <button
                key={promo.id}
                type="button"
                onClick={() => scrollToElement(PROMO_TARGETS[promo.id])}
                className={classNames(
                  'group relative flex min-h-[210px] w-full overflow-hidden rounded-[32px] bg-gradient-to-br p-5 text-left text-white shadow-[0_22px_60px_rgba(15,23,42,0.15)] transition hover:-translate-y-1',
                  promo.accent,
                )}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.34),_transparent_38%)]" />
                <div className="relative flex w-full items-end justify-between gap-4">
                  <div>
                    <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
                      Promo
                    </div>
                    <h3 className="mt-4 text-3xl font-black leading-tight">{promo.title}</h3>
                    <p className="mt-3 max-w-xs text-sm leading-6 text-white/90">{promo.subtitle}</p>
                  </div>
                  <div className="mb-2 flex size-16 items-center justify-center rounded-3xl bg-white/12 backdrop-blur-sm">
                    <StoreGlyph name={promo.icon} className="size-8" />
                  </div>
                </div>
              </button>
            ))}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {promoCards.slice(2).map((promo) => (
                <button
                  key={promo.id}
                  type="button"
                  onClick={() => scrollToElement(PROMO_TARGETS[promo.id])}
                  className={classNames(
                    'relative overflow-hidden rounded-[28px] bg-gradient-to-br p-5 text-left text-white shadow-[0_18px_50px_rgba(15,23,42,0.14)] transition hover:-translate-y-1',
                    promo.accent,
                  )}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.3),_transparent_40%)]" />
                  <div className="relative flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xl font-black">{promo.title}</div>
                      <div className="mt-2 text-sm text-white/90">{promo.subtitle}</div>
                    </div>
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
                      <StoreGlyph name={promo.icon} className="size-6" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {trustHighlights.map((item) => (
            <div key={item.id} className="rounded-[30px] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <StoreGlyph name={item.icon} className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{item.title}</h3>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[36px] bg-gradient-to-br from-sky-600 via-cyan-500 to-emerald-400 p-6 text-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.26em] text-white/80">Tự build PC theo bạn</div>
                <h2 className="mt-3 max-w-xl text-4xl font-black leading-tight">
                  Chọn nhu cầu trước, BinhTinhStore gợi ý cấu hình sau.
                </h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-white/90">
                  Bạn có thể mở rộng tiếp module này thành configurator build PC với CPU, GPU, mainboard và bộ lọc tương thích.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => scrollToElement('section-pc')}
                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-900"
                  >
                    Xem PC nổi bật
                  </button>
                  <button
                    type="button"
                    onClick={onOpenAdmin}
                    className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Mở trang quản trị demo
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
                <MiniFeature label="Gaming" value="165 FPS+" />
                <MiniFeature label="Creator" value="Render nhanh" />
                <MiniFeature label="AI" value="CUDA Ready" />
              </div>
            </div>
          </div>

          <div className="rounded-[36px] bg-gradient-to-br from-red-600 via-rose-600 to-orange-400 p-6 text-white shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.26em] text-white/80">Ghế bàn hạ giá</div>
                <h2 className="mt-3 text-4xl font-black leading-tight">Setup gọn, ngồi lâu vẫn thoải mái.</h2>
                <p className="mt-3 max-w-md text-base leading-7 text-white/90">
                  Thêm module nội thất setup để tăng giá trị đơn hàng và đẩy combo chuột, bàn phím, màn hình.
                </p>
              </div>
              <div className="hidden rounded-[28px] bg-white/15 p-5 backdrop-blur-sm md:block">
                <StoreGlyph name="chair" className="size-16" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">Sản phẩm đã xem</div>
              <h2 className="mt-2 text-3xl font-black text-slate-900">Bạn đã tương tác với những món này</h2>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
              {viewedProducts.length} sản phẩm gần đây • {favoriteIds.length} yêu thích
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {viewedProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleQuickView(product)}
                className="group overflow-hidden rounded-[30px] border border-slate-200 bg-slate-50 text-left transition hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_20px_50px_rgba(15,23,42,0.08)]"
              >
                <div className="grid gap-4 p-4 sm:grid-cols-[180px_1fr] sm:items-center">
                  <ProductVisual product={product} className="aspect-[4/3]" />
                  <div>
                    <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                      {product.brand}
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-lg font-black text-slate-900">{product.name}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {product.specs.slice(0, 2).map((spec) => (
                        <span key={spec} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                          {spec}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 text-xl font-black text-red-600">{formatCurrency(product.price)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5 overflow-hidden rounded-[36px] bg-slate-950 text-white shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px] lg:items-center">
            <div>
              <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.24em] text-red-200">
                {flashDeal.title}
              </div>
              <h2 className="mt-4 text-4xl font-black leading-tight">{flashDeal.subtitle}</h2>
              {maxDiscountPercent > 0 ? (
                <div className="mt-3 text-lg text-white/80">Giảm tới {maxDiscountPercent}% so với giá gốc</div>
              ) : null}
            </div>

            <div className="grid gap-3">
                  {runtimeProducts
                    .slice(0, 3)
                    .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleQuickView(product)}
                    className="flex items-center gap-4 rounded-[28px] bg-white/6 p-4 text-left backdrop-blur-sm transition hover:bg-white/10"
                  >
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-white/10 text-white">
                      <StoreGlyph name={product.visual?.kind === 'desktop' ? 'desktop' : product.visual?.kind} className="size-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold">{product.name}</h3>
                      <p className="mt-1 text-sm text-red-200">{formatCurrency(product.price)}</p>
                    </div>
                    <StoreGlyph name="chevron-right" className="size-5 text-white/70" />
                  </button>
                ))}
            </div>
          </div>
        </section>


        {productSections.map((section) => {
          const sectionProducts = runtimeProducts
            .filter((product) => productBelongsToSection(product, section.id))
            .filter((product) => productMatchesTab(product, sectionFilters[section.id]))
            .slice(0, 10)

          const isHighlighted = activeCategory.targetSection === `section-${section.id}`

          return (
            <section key={section.id} id={`section-${section.id}`} className="mt-5">
              <SectionHeader
                icon={SECTION_ICONS[section.id] ?? 'sparkles'}
                title={section.title}
                subtitle={section.subtitle}
                tabs={section.tabs}
                activeTab={sectionFilters[section.id]}
                onTabChange={(tab) => handleSectionTabChange(section.id, tab)}
                highlight={isHighlighted}
              />

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                {sectionProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favoriteIds.includes(product.id)}
                    onToggleFavorite={toggleFavorite}
                    onAddToCart={addToCart}
                    onQuickView={handleQuickView}
                    onView={handleProductCardClick}
                  />
                ))}
              </div>
            </section>
          )
        })}

        
      </main>
      )}

      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[1480px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-red-600 text-xl font-black text-white">
                  BT
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-950">BinhTinhStore</div>
                </div>
              </div>
              
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {footerColumns.map((column) => (
                <div key={column.title}>
                  <h3 className="text-base font-black text-slate-900">{column.title}</h3>
                  <div className="mt-4 space-y-3 text-sm text-slate-500">
                    {column.links.map((link) => (
                      <button
                        key={link}
                        type="button"
                        className="block transition hover:text-red-600"
                      >
                        {link}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <FloatingSupportButtons favoriteCount={favoriteIds.length} onOpenCart={() => setCartOpen(true)} />

      <CartDrawer
        open={isCartOpen}
        items={cartItems}
        subtotal={currentQuote?.data ? currentQuote.data.subtotal : subtotal}
        quote={currentQuote?.data || null}
        quoteError={currentQuote?.error || ''}
        voucherCode={voucherCode}
        onApplyVoucher={setVoucherCode}
        onClose={() => setCartOpen(false)}
        onIncrease={(productId) => changeQuantity(productId, 1)}
        onDecrease={(productId) => changeQuantity(productId, -1)}
        onRemove={removeFromCart}
        onCheckout={goToCheckout}
        onOpenProduct={(product) => {
          setCartOpen(false)
          openProduct(product)
        }}
      />

      <ProductQuickView
        product={quickViewProduct}
        open={Boolean(quickViewProduct)}
        onClose={() => setQuickViewProduct(null)}
        onAddToCart={addToCart}
        isFavorite={quickViewProduct ? favoriteIds.includes(quickViewProduct.id) : false}
        onToggleFavorite={toggleFavorite}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(user) => {
          const normalizedUser = normalizeUser(user)
          setCurrentUser(normalizedUser)
          if (onUserChange) onUserChange(normalizedUser)
          showToast(
            normalizedUser?.role === 'admin'
              ? 'Đăng nhập admin thành công. Nút Quản lý sản phẩm đã được mở.'
              : `Đăng nhập thành công! Chào ${normalizedUser?.fullName || normalizedUser?.email}`
          )
        }}
      />

      {toast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function HeaderAction({ icon, label, value }) {
  return (
    <div className="header-action-compact">
      <StoreGlyph name={icon} className="size-5 shrink-0" />
      <div className="leading-tight">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-100">
          {label}
        </div>
        <div className="text-sm font-bold text-white">
          {value}
        </div>
      </div>
    </div>
  )
}

function MiniFeature({ label, value }) {
  return (
    <div className="rounded-[26px] bg-white/12 px-5 py-4 backdrop-blur-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/75">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  )
}

function DesktopSideAd({ align }) {
  return (
    <div
      className={classNames(
        'fixed top-[180px] z-20 hidden w-[148px] 2xl:block',
        align === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <div className="rounded-[32px] bg-gradient-to-br from-orange-400 via-red-500 to-rose-500 p-4 text-white shadow-[0_26px_70px_rgba(15,23,42,0.18)]">
        <div className="text-sm font-semibold uppercase tracking-[0.24em] text-white/80">Setup Sale</div>
        <div className="mt-3 text-3xl font-black leading-tight">Build PC</div>
        <div className="mt-2 text-sm leading-6 text-white/90">Tặng gói tối ưu hệ thống và miễn phí lắp đặt.</div>
        <div className="mt-5 rounded-[24px] bg-white/15 p-4 backdrop-blur-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Ưu đãi nhanh</div>
          <div className="mt-2 text-2xl font-black">Giảm 2%</div>
        </div>
      </div>
    </div>
  )
}

function FloatingSupportButtons({ favoriteCount, onOpenCart }) {
  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      <button
        type="button"
        onClick={onOpenCart}
        className="inline-flex items-center gap-3 rounded-full bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_50px_rgba(220,38,38,0.3)] transition hover:bg-red-700"
      >
        <StoreGlyph name="cart" className="size-4" />
        Bạn cần hỗ trợ?
      </button>
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
          <StoreGlyph name="heart" className="size-4 text-rose-500" />
          {favoriteCount} yêu thích
        </div>
        <div className="flex size-12 items-center justify-center rounded-full bg-sky-500 text-white shadow-[0_16px_40px_rgba(14,165,233,0.35)]">
          Z
        </div>
      </div>
    </div>
  )
}
