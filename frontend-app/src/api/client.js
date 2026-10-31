const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

function isBrowser() {
  return typeof window !== 'undefined' && window.localStorage;
}

function getStoredToken() {
  if (!isBrowser()) return '';
  return window.localStorage.getItem('bt_access_token') || '';
}

function getStoredRefreshToken() {
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
  if (data.refreshToken) window.localStorage.setItem('bt_refresh_token', data.refreshToken);
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
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return '';

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
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
    body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password }),
  });
  const session = { ...data, user: normalizeUser(data.user) };
  storeAuthSession(session);
  return session;
}

export async function register({ fullName, email, password, phone }) {
  const data = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ fullName, email: String(email || '').trim().toLowerCase(), password, phone }),
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
export function quoteCart(items, voucherCode) {
  return request('/cart/quote', {
    method: 'POST',
    body: JSON.stringify({ items, voucherCode: voucherCode || undefined }),
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

export function updateAdminOrderStatus(orderId, status, note, token) {
  return request(`/orders/admin/${orderId}/status`, {
    method: 'PATCH',
    auth: true,
    token,
    body: JSON.stringify({ status, note }),
  });
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

export function fetchReviews(productId) {
  return request(`/reviews/products/${productId}`);
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

export { getStoredToken, getStoredRefreshToken, storeAuthSession, clearAuthSession, normalizeUser };
