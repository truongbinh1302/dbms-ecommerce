const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function isBrowser() {
  return typeof window !== 'undefined' && window.localStorage;
}

function getStoredToken() {
  if (!isBrowser()) return '';
  return window.localStorage.getItem('bt_access_token') || '';
}

// Refresh token nay nằm trong cookie httpOnly do server đặt. Khoá này chỉ còn ở trình duyệt đăng nhập
// từ trước khi chuyển sang cookie: gửi một lần để server đổi sang cookie rồi xoá.
function getLegacyRefreshToken() {
  if (!isBrowser()) return '';
  return window.localStorage.getItem('bt_refresh_token') || '';
}


function normalizeUser(user = null) {
  if (!user || typeof user !== 'object') return user;

  return {
    ...user,
    id: user.id ?? user.UserID,
    fullName: user.fullName ?? user.FullName,
    email: user.email ?? user.Email,
    role: String(user.role ?? user.Role ?? 'customer').trim().toLowerCase(),
  };
}

function storeAuthSession(data = {}) {
  if (!isBrowser()) return;
  if (data.accessToken) window.localStorage.setItem('bt_access_token', data.accessToken);
  window.localStorage.removeItem('bt_refresh_token');
  if (data.user) window.localStorage.setItem('bt_user', JSON.stringify(normalizeUser(data.user)));
}

function clearAuthSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem('bt_access_token');
  window.localStorage.removeItem('bt_refresh_token');
  window.localStorage.removeItem('bt_user');
}

function buildHeaders(options = {}) {
  const headers = { ...(options.headers || {}) };

  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const token = options.token || (options.auth ? getStoredToken() : '');
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function refreshAccessToken() {
  if (!getStoredToken() && !getLegacyRefreshToken()) return '';
  const legacy = getLegacyRefreshToken();

  // credentials: 'include' để trình duyệt gửi cookie refresh token (cả khi API ở origin khác, xem CORS_ORIGINS).
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(legacy ? { refreshToken: legacy } : {}),
  });

  const payload = await parsePayload(response);
  if (!response.ok || payload.success === false || !payload.data?.accessToken) {
    clearAuthSession();
    return '';
  }

  storeAuthSession(payload.data);
  return payload.data.accessToken;
}

async function request(path, options = {}) {
  const { retryOnAuth = true, auth = false, token, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers: buildHeaders({ ...fetchOptions, headers: options.headers, auth, token }),
  });

  const payload = await parsePayload(response);

  const isAuthError = response.status === 401 || /token/i.test(String(payload.message || ''));
  if (auth && retryOnAuth && isAuthError) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request(path, { ...options, token: newToken, retryOnAuth: false });
    }
  }

  if (!response.ok || payload.success === false) {
    const err = new Error(payload.message || `API request failed with status ${response.status}`);
    err.status = response.status;
    // Lỗi kèm chi tiết (ví dụ lỗi từng trường của địa chỉ giao hàng) nằm trong payload.errors.
    err.details = payload.errors || null;
    throw err;
  }

  return payload.data ?? payload;
}

export function fetchProducts(params = {}) {
  const search = new URLSearchParams(params);
  return request(`/products?${search.toString()}`);
}

export async function login(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password }),
  });
  const session = { ...data, user: normalizeUser(data.user) };
  storeAuthSession(session);
  return session;
}

export async function register({ fullName, email, password, phone, acceptPrivacy }) {
  const data = await request('/auth/register', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      fullName,
      email: String(email || '').trim().toLowerCase(),
      password,
      phone: phone || undefined,
      acceptPrivacy: acceptPrivacy === true,
    }),
  });
  const session = { ...data, user: normalizeUser(data.user) };
  storeAuthSession(session);
  return session;
}

export function validateCart(items, token) {
  return request('/cart/validate', {
    method: 'POST',
    auth: true,
    token,
    body: JSON.stringify({ items }),
  });
}

// Báo giá giỏ hàng: server tính tạm tính, phí ship, giảm giá và kiểm tra voucher.
// quoteCode: mã báo giá Build PC đang giữ giá (nếu khách mua theo báo giá).
export function quoteCart(items, voucherCode, quoteCode) {
  return request('/cart/quote', {
    method: 'POST',
    body: JSON.stringify({ items, voucherCode: voucherCode || undefined, quoteCode: quoteCode || undefined }),
  });
}

export function createOrder(order, token) {
  return request('/orders', {
    method: 'POST',
    auth: true,
    token,
    body: JSON.stringify(order),
  });
}

export function fetchAdminOrders(params = {}, token) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return request(`/orders/admin${query ? `?${query}` : ''}`, {
    method: 'GET',
    auth: true,
    token,
  });
}

// shipment: { carrier, trackingCode } khi giao đơn cho đơn vị vận chuyển.
export function updateAdminOrderStatus(orderId, status, note, token, shipment = {}) {
  return request(`/orders/admin/${orderId}/status`, {
    method: 'PATCH',
    auth: true,
    token,
    body: JSON.stringify({ status, note, ...shipment }),
  });
}

// --- Đổi trả ---
export function createReturnRequest(orderId, payload) {
  return request(`/orders/${orderId}/returns`, { method: 'POST', auth: true, body: JSON.stringify(payload) });
}

export function cancelReturnRequest(returnId) {
  return request(`/orders/returns/${encodeURIComponent(returnId)}/cancel`, { method: 'PATCH', auth: true });
}

export function fetchAdminReturns(params, token) {
  return adminGet('/orders/admin/returns', params, token);
}

export function updateAdminReturn(returnId, payload, token) {
  return request(`/orders/admin/returns/${encodeURIComponent(returnId)}`, { method: 'PATCH', auth: true, token, body: JSON.stringify(payload) });
}

// Gợi ý khi gõ: endpoint gọn hơn /products (không đếm tổng số kết quả).
export function fetchSearchSuggestions(query) {
  return request(`/products/suggestions?${new URLSearchParams({ q: query })}`);
}

export function fetchProduct(productId) {
  return request(`/products/${productId}`);
}

// Lấy thông tin nhiều sản phẩm theo ID (giỏ hàng cần tên, giá của sản phẩm chưa có trên trang).
export function fetchProductsByIds(ids) {
  const list = [...new Set(ids)].slice(0, 50);
  return request(`/products?${new URLSearchParams({ ids: list.join(','), limit: String(list.length || 1) })}`);
}

export function fetchProvinces() {
  return request('/locations/provinces');
}

export function fetchMe() {
  return request('/users/me', { auth: true });
}

export function saveDefaultAddress(address) {
  return request('/users/me/address', {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ address }),
  });
}

export function fetchCart() {
  return request('/cart', { auth: true });
}

export function saveCart(items) {
  return request('/cart', {
    method: 'PUT',
    auth: true,
    body: JSON.stringify({ items }),
  });
}

export function fetchMyOrders(params = {}) {
  return request(`/orders/my-orders?${new URLSearchParams(params)}`, { auth: true });
}

export function fetchOrder(orderId) {
  return request(`/orders/${orderId}`, { auth: true });
}

export function cancelMyOrder(orderId, reason) {
  return request(`/orders/${orderId}/cancel`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ reason }),
  });
}

// Thông tin người bán và số liệu chính sách (phí ship, thời gian giao, số ngày đổi trả...).
export function fetchStoreInfo() {
  return request('/store/info');
}

export function fetchPriceHistory(productId, days = 180) {
  return request(`/products/${productId}/price-history?${new URLSearchParams({ days: String(days) })}`);
}

// --- Build PC ---
export function fetchBuilderComponents() {
  return request('/builder/components');
}

export function fetchBuilderPresets() {
  return request('/builder/presets');
}

export function checkBuild(items) {
  return request('/builder/check', { method: 'POST', body: JSON.stringify({ items }) });
}

export function autoBuild(presetId) {
  return request('/builder/auto', { method: 'POST', body: JSON.stringify({ presetId }) });
}

// Tư vấn từ câu mô tả nhu cầu (dò từ khoá + ngân sách ở server, giá lấy từ kho).
export function adviseBuild(text) {
  return request('/builder/advise', { method: 'POST', body: JSON.stringify({ text }) });
}

export function suggestUpgrades(current) {
  return request('/builder/upgrade', { method: 'POST', body: JSON.stringify(current) });
}

// Đăng nhập thì báo giá gắn với tài khoản; chưa đăng nhập vẫn tạo được.
export function createBuildQuote(items, title) {
  return request('/builder/quotes', {
    method: 'POST',
    auth: true,
    retryOnAuth: false,
    body: JSON.stringify({ items, title: title || undefined }),
  });
}

export function fetchBuildQuote(code) {
  return request(`/builder/quotes/${encodeURIComponent(code)}`);
}

// --- Bảo hành ---
export function lookupWarranty(serial) {
  return request(`/warranties/${encodeURIComponent(serial)}`);
}

export function registerWarranty(payload, token) {
  return request('/warranties/admin', {
    method: 'POST',
    auth: true,
    token,
    body: JSON.stringify(payload),
  });
}

// --- Thông báo và theo dõi giá ---
export function fetchNotifications() {
  return request('/notifications', { method: 'GET', auth: true });
}

export function markNotificationRead(notificationId) {
  return request(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH', auth: true });
}

export function markAllNotificationsRead() {
  return request('/notifications/read-all', { method: 'PATCH', auth: true });
}

export function fetchPriceWatches() {
  return request('/notifications/price-watches', { method: 'GET', auth: true });
}

export function watchPrice(productId, targetPrice) {
  return request('/notifications/price-watches', { method: 'POST', auth: true, body: JSON.stringify({ productId, targetPrice }) });
}

export function unwatchPrice(productId) {
  return request(`/notifications/price-watches/${encodeURIComponent(productId)}`, { method: 'DELETE', auth: true });
}

// Báo khi có hàng (sản phẩm đang hết).
export function fetchStockWatches() {
  return request('/notifications/stock-watches', { method: 'GET', auth: true });
}

export function watchStock(productId) {
  return request('/notifications/stock-watches', { method: 'POST', auth: true, body: JSON.stringify({ productId }) });
}

export function unwatchStock(productId) {
  return request(`/notifications/stock-watches/${encodeURIComponent(productId)}`, { method: 'DELETE', auth: true });
}

// --- Dịch vụ sau bán ---
export function fetchServiceOptions() {
  return request('/services/options');
}

export function estimateTradeIn(payload) {
  return request('/services/trade-in/estimate', { method: 'POST', body: JSON.stringify(payload) });
}

export function createServiceRequest(payload) {
  return request('/services/requests', { method: 'POST', auth: true, body: JSON.stringify(payload) });
}

export function fetchMyServiceRequests() {
  return request('/services/requests', { method: 'GET', auth: true });
}

export function cancelServiceRequest(requestId, reason) {
  return request(`/services/requests/${encodeURIComponent(requestId)}/cancel`, { method: 'PATCH', auth: true, body: JSON.stringify({ reason }) });
}

export function fetchAdminServiceRequests(params, token) {
  return adminGet('/services/admin/requests', params, token);
}

export function updateAdminServiceRequest(requestId, payload, token) {
  return request(`/services/admin/requests/${encodeURIComponent(requestId)}`, { method: 'PATCH', auth: true, token, body: JSON.stringify(payload) });
}

// --- Hot Deal ---
export function fetchActivePromotions() {
  return request('/promotions/active');
}

export function fetchAdminPromotions(token) {
  return adminGet('/promotions/admin', {}, token);
}

export function fetchAdminPromotion(promotionId, token) {
  return adminGet(`/promotions/admin/${encodeURIComponent(promotionId)}`, {}, token);
}

// --- Mã giảm giá (admin) ---
export function fetchAdminVouchers(params, token) {
  return adminGet('/vouchers/admin', params, token);
}

export function createVoucher(payload, token) {
  return request('/vouchers', { method: 'POST', auth: true, token, body: JSON.stringify(payload) });
}

export function setVoucherActive(voucherId, isActive, token) {
  return request(`/vouchers/admin/${encodeURIComponent(voucherId)}`, { method: 'PATCH', auth: true, token, body: JSON.stringify({ isActive }) });
}

export function createPromotion(payload, token) {
  return request('/promotions/admin', { method: 'POST', auth: true, token, body: JSON.stringify(payload) });
}

export function stopPromotion(promotionId, token) {
  return request(`/promotions/admin/${encodeURIComponent(promotionId)}/stop`, { method: 'PATCH', auth: true, token });
}

// --- Quản trị: số liệu, báo cáo theo ngày, sổ kho ---
function adminGet(path, params = {}, token) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return request(`${path}${query ? `?${query}` : ''}`, { method: 'GET', auth: true, token });
}

export function fetchAdminDashboard(token) {
  return adminGet('/analytics/dashboard', {}, token);
}

export function fetchDailyReport(params, token) {
  return adminGet('/analytics/daily', params, token);
}

export function fetchLowStock(params, token) {
  return adminGet('/inventory/low-stock', params, token);
}

export function fetchStockReceipts(params, token) {
  return adminGet('/inventory/receipts', params, token);
}

export function fetchStockReceipt(receiptId, token) {
  return adminGet(`/inventory/receipts/${encodeURIComponent(receiptId)}`, {}, token);
}

export function fetchStockMovements(params, token) {
  return adminGet('/inventory/movements', params, token);
}

export function createStockReceipt(payload, token) {
  return request('/inventory/receipts', {
    method: 'POST',
    auth: true,
    token,
    body: JSON.stringify(payload),
  });
}

// Đổi mật khẩu rồi đăng nhập lại ngay bằng mật khẩu mới:
// server thu hồi refresh token cũ nên phiên hiện tại cần token mới.
export async function changePassword(email, oldPassword, newPassword) {
  await request('/users/me/password', {
    method: 'PATCH',
    auth: true,
    retryOnAuth: false,
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  return login(email, newPassword);
}

// --- Quyền dữ liệu cá nhân ---
export function exportMyData() {
  return request('/users/me/export', { auth: true });
}

export function deleteMyAccount(password) {
  return request('/users/me', {
    method: 'DELETE',
    auth: true,
    retryOnAuth: false,
    body: JSON.stringify({ password }),
  });
}

export function fetchMyWarranties() {
  return request('/warranties/me', { auth: true });
}

// --- Hỏi đáp sản phẩm ---
// Gửi kèm token nếu đã đăng nhập để thấy cả câu hỏi đang chờ của mình.
export function fetchProductQuestions(productId) {
  return request(`/products/${productId}/questions`, { auth: Boolean(getStoredToken()) });
}

export function askProductQuestion(productId, question) {
  return request(`/products/${productId}/questions`, { method: 'POST', auth: true, body: JSON.stringify({ question }) });
}

export function fetchAdminQuestions(params, token) {
  return adminGet('/products/admin/questions', params, token);
}

export function moderateQuestion(questionId, payload, token) {
  return request(`/products/admin/questions/${encodeURIComponent(questionId)}`, { method: 'PATCH', auth: true, token, body: JSON.stringify(payload) });
}

export function fetchReviews(productId) {
  return request(`/reviews/products/${productId}`);
}

export function fetchReviewEligibility(productId) {
  return request(`/reviews/products/${productId}/eligibility`, { auth: true });
}

export function createReview(productId, review) {
  return request(`/reviews/products/${productId}`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify(review),
  });
}

export function createVNPayPaymentLink(orderId, orderInfo, token) {
  return request('/payments/vnpay/create', {
    method: 'POST',
    auth: true,
    token,
    body: JSON.stringify({ orderId, orderInfo }),
  });
}

export function fetchOrderPaymentStatus(orderId, token) {
  return request(`/orders/${orderId}/payment-status`, {
    method: 'GET',
    auth: true,
    token,
  });
}

export async function logout(token) {
  try {
    return await request('/auth/logout', {
      method: 'POST',
      credentials: 'include',
      auth: true,
      token,
    });
  } finally {
    clearAuthSession();
  }
}

export function fetchCategories() {
  return request('/categories');
}

export function uploadProductImage(file, token) {
  const formData = new FormData();
  formData.append('image', file);

  return request('/products/admin/upload', {
    method: 'POST',
    auth: true,
    token,
    body: formData,
  });
}

export function createProduct(productData, token) {
  return request('/products/admin/products', {
    method: 'POST',
    auth: true,
    token,
    body: JSON.stringify(productData),
  });
}

export function updateProduct(productId, productData, token) {
  return request(`/products/admin/products/${productId}`, {
    method: 'PATCH',
    auth: true,
    token,
    body: JSON.stringify(productData),
  });
}

export function deleteProduct(productId, token) {
  return request(`/products/admin/products/${productId}`, {
    method: 'DELETE',
    auth: true,
    token,
  });
}

export { getStoredToken, storeAuthSession, clearAuthSession, normalizeUser };
