# BinhTinhStore — Full API Specification v2.0

> **Stack:** Node.js + Express · SQL Server (mssql) · MongoDB (mongoose) · JWT  
> **Môi trường thanh toán:** VNPay Sandbox  
> **Cập nhật:** Bổ sung Race Condition handling, VNPay, Refresh Token, Order Flow đầy đủ, Voucher, Rate Limiting

---

## Mục lục

1. [Kiến trúc tổng quan](#1-kiến-trúc-tổng-quan)
2. [Base URL & Quy ước Response](#2-base-url--quy-ước-response)
3. [Authentication & JWT](#3-authentication--jwt)
4. [Rate Limiting](#4-rate-limiting)
5. [Auth APIs](#5-auth-apis)
6. [User APIs](#6-user-apis)
7. [Category APIs](#7-category-apis)
8. [Product APIs](#8-product-apis)
9. [Cart APIs](#9-cart-apis)
10. [Order APIs](#10-order-apis)
11. [Payment APIs — VNPay](#11-payment-apis--vnpay)
12. [Review APIs](#12-review-apis)
13. [Voucher APIs](#13-voucher-apis)
14. [Admin Dashboard APIs](#14-admin-dashboard-apis)
15. [Inventory APIs](#15-inventory-apis)
16. [Analytics & Inventory APIs](#16-analytics--inventory-apis-admin)
17. [Race Condition — Xử lý tồn kho đồng thời](#17-race-condition--xử-lý-tồn-kho-đồng-thời)
18. [Order Status Flow](#18-order-status-flow)
19. [Data Model](#19-data-model)
20. [Cấu trúc project](#20-cấu-trúc-project)
21. [API tối thiểu để demo](#21-api-tối-thiểu-để-demo)
22. [Build PC, báo giá, lịch sử giá, bảo hành](#22-build-pc-báo-giá-lịch-sử-giá-bảo-hành)
23. [Vận hành: điều khoản, chính sách, tài khoản, giám sát](#23-vận-hành-điều-khoản-chính-sách-tài-khoản-giám-sát)

---

## 1. Kiến trúc tổng quan

```
┌─────────────┐     HTTP      ┌──────────────────┐
│  React FE   │ ──────────── │  Express Backend  │
│  (Vite)     │              │  /api/v1          │
└─────────────┘              └────────┬─────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                  │
             ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
             │ SQL Server  │  │   MongoDB   │  │  VNPay API   │
             │ (mssql)     │  │ (mongoose)  │  │  (sandbox)   │
             │             │  │             │  └──────────────┘
             │ Users       │  │ Reviews     │
             │ Categories  │  │ ProductLogs │
             │ Products    │  │ Sessions    │
             │ Orders      │  └─────────────┘
             │ OrderItems  │
             │ Vouchers    │
             └─────────────┘
```

**Luồng xử lý đặt hàng (quan trọng):**
```
FE gọi POST /orders
       │
       ▼
BEGIN TRANSACTION (SQL Server)
       │
       ├─► SELECT stock WITH (UPDLOCK, ROWLOCK)  ← khoá row
       │
       ├─► Kiểm tra stock >= quantity?
       │      │ Không → ROLLBACK → 409 Out of stock
       │      ▼ Có
       ├─► INSERT Orders
       ├─► INSERT OrderItems  
       ├─► UPDATE Products SET stock = stock - qty
       │
COMMIT TRANSACTION
       │
       ▼
Trả về orderId → FE redirect sang trang thanh toán
```

---

## 2. Base URL & Quy ước Response

```
Base URL: /api/v1
```

### Success Response

```json
{
  "success": true,
  "message": "OK",
  "data": {}
}
```

### Error Response

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email already exists"
    }
  ]
}
```

### HTTP Status Codes

| Code | Ý nghĩa |
|------|---------|
| 200 | Thành công |
| 201 | Tạo mới thành công |
| 400 | Dữ liệu không hợp lệ |
| 401 | Chưa đăng nhập |
| 403 | Không có quyền |
| 404 | Không tìm thấy |
| 409 | Conflict (hết hàng, email đã tồn tại...) |
| 422 | Business rule violation |
| 429 | Too many requests |
| 500 | Lỗi server |

---

## 3. Authentication & JWT

### Chiến lược Token

```
Access Token:  ngắn hạn — 15 phút
Refresh Token: dài hạn  — 7 ngày (lưu DB hoặc httpOnly cookie)
```

### Cách dùng

```http
Authorization: Bearer <access_token>
```

### Role

| Role | Quyền |
|------|-------|
| `customer` | Xem sản phẩm, đặt hàng, review |
| `admin` | Tất cả + quản lý sản phẩm, đơn hàng, tồn kho |

### Middleware

```javascript
// middlewares/auth.js
const authenticate = (req, res, next) => { /* verify JWT */ }
const authorize = (...roles) => (req, res, next) => { /* check role */ }

// Dùng trong route
router.get('/admin/dashboard', authenticate, authorize('admin'), handler)
router.post('/orders', authenticate, authorize('customer', 'admin'), handler)
```

---

## 4. Rate Limiting

Dùng `express-rate-limit` để chống spam và bảo vệ server.

```javascript
// middlewares/rateLimiter.js
import rateLimit from 'express-rate-limit'

// General: 1500 request / 15 phút (đổi bằng RATE_LIMIT_MAX).
// Mức 100 cũ quá thấp: một phiên mua sắm bình thường gọi vài trăm request.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  message: { success: false, message: 'Too many requests' }
})

// Auth: 10 request / 15 phút (chống brute force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts' }
})

// Order: 20 request / 1 phút (chống đặt hàng spam)
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many order requests' }
})
```

**Áp dụng:**
```javascript
app.use('/api/v1', generalLimiter)
app.use('/api/v1/auth', authLimiter)
app.use('/api/v1/orders', orderLimiter)
```

---

## 5. Auth APIs

### POST `/auth/register`

Tạo tài khoản mới.

**Request:**
```json
{
  "fullName": "Nguyen Van A",
  "email": "shopper@example.com",
  "password": "12345678",
  "phone": "0909123456"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Register successful",
  "data": {
    "user": {
      "id": 1,
      "fullName": "Nguyen Van A",
      "email": "shopper@example.com",
      "role": "customer"
    },
    "accessToken": "eyJhbGci..."
  }
}
```
Refresh token không nằm trong body: server đặt cookie `bt_refresh` (`HttpOnly; SameSite=Strict; Path=/api/v1/auth`,
`Secure` khi production hoặc `COOKIE_SECURE=true`, hết hạn theo `JWT_REFRESH_EXPIRES`). JavaScript trên trang không đọc được cookie này.

**Errors:**
- `409` — Email đã tồn tại

---

### POST `/auth/login`

**Request:**
```json
{
  "email": "shopper@example.com",
  "password": "12345678"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "fullName": "Nguyen Van A", "role": "customer" },
    "accessToken": "eyJhbGci..."
  }
}
```
Kèm cookie `bt_refresh` như khi đăng ký.

**Errors:**
- `401` — Sai email hoặc mật khẩu

---

### POST `/auth/refresh`

Lấy access token mới bằng cookie `bt_refresh` (trình duyệt tự gửi; gọi `fetch` với `credentials: 'include'`) — **không cần đăng nhập lại**.
Mỗi lần dùng, refresh token được đổi mới (có `jti` ngẫu nhiên) và token cũ hết hiệu lực.

**Request:** body rỗng. Phiên đăng nhập từ trước khi chuyển sang cookie có thể gửi `{ "refreshToken": "..." }` một lần;
server đặt cookie và từ đó dùng cookie.

**Response 200:**
```json
{
  "success": true,
  "data": { "accessToken": "eyJhbGci...(mới)..." }
}
```
Kèm cookie `bt_refresh` mới.

**Errors:**
- `401` — Thiếu cookie, refresh token hết hạn, đã dùng hoặc đã bị thu hồi (cookie bị xoá)

---

### POST `/auth/logout`

**Headers:** `Authorization: Bearer <token>`

Thu hồi refresh token trong DB và xoá cookie `bt_refresh`.

**Response 200:**
```json
{ "success": true, "message": "Logged out" }
```

---

### POST `/auth/forgot-password`

Gửi email reset mật khẩu.

**Request:**
```json
{ "email": "shopper@example.com" }
```

---

### POST `/auth/reset-password`

**Request:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "newpass123"
}
```

---

## 6. User APIs

### GET `/users/me`

**Headers:** Auth required

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "fullName": "Nguyen Van A",
    "email": "shopper@example.com",
    "phone": "0909123456",
    "role": "customer",
    "address": {
      "recipientName": "Nguyen Van A",
      "phone": "0909123456",
      "street": "268 Ly Thuong Kiet",
      "ward": "Ward 14",
      "district": "District 10",
      "city": "Ho Chi Minh City"
    },
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

---

### PATCH `/users/me`

Cập nhật thông tin cá nhân.

**Request:**
```json
{
  "fullName": "Nguyen Van A Updated",
  "phone": "0988111222"
}
```

---

### PATCH `/users/me/address`

**Request:**
```json
{
  "recipientName": "Nguyen Van A",
  "phone": "0988111222",
  "street": "268 Ly Thuong Kiet",
  "ward": "Ward 14",
  "district": "District 10",
  "city": "Ho Chi Minh City"
}
```

---

### PATCH `/users/me/password`

**Request:**
```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456"
}
```

---

## 7. Category APIs

### GET `/categories`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Laptop",
      "slug": "laptop",
      "icon": "laptop",
      "productCount": 45
    }
  ]
}
```

---

### POST `/admin/categories`

**Auth:** admin only

**Request:**
```json
{
  "name": "Laptop",
  "slug": "laptop",
  "icon": "laptop"
}
```

---

### PATCH `/admin/categories/:id`

---

### DELETE `/admin/categories/:id`

**Lưu ý:** Không xoá nếu còn sản phẩm thuộc danh mục này → trả về `409`.

---

## 8. Product APIs

### GET `/products`

Danh sách sản phẩm với filter, search, pagination.

**Query params:**
```http
/products?q=legion&category=laptop&brand=Lenovo
         &minPrice=10000000&maxPrice=60000000
         &inStock=true&featured=true
         &sort=price_asc|price_desc|rating_desc|newest|popular
         &page=1&limit=12
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Laptop gaming Lenovo Legion 5i",
        "slug": "lenovo-legion-5i",
        "brand": "Lenovo",
        "price": 52990000,
        "oldPrice": 54990000,
        "rating": 4.9,
        "reviewsCount": 27,
        "stock": 4,
        "badge": "-4%",
        "thumbnail": "https://example.com/image.jpg",
        "specs": ["Core i7-14700HX", "RTX 5070", "24GB RAM"],
        "isFeatured": true,
        "category": { "id": 1, "name": "Laptop", "slug": "laptop" }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "totalItems": 38,
      "totalPages": 4
    }
  }
}
```

**SQL Query tương ứng (có Index):**
```sql
SELECT p.*, c.Name AS CategoryName
FROM Products p
JOIN Categories c ON p.CategoryID = c.CategoryID
WHERE (@q IS NULL OR p.Name LIKE '%' + @q + '%')
  AND (@categorySlug IS NULL OR c.Slug = @categorySlug)
  AND (@minPrice IS NULL OR p.Price >= @minPrice)
  AND (@maxPrice IS NULL OR p.Price <= @maxPrice)
  AND (@inStock IS NULL OR p.Stock > 0)
ORDER BY 
  CASE WHEN @sort = 'price_asc'  THEN p.Price END ASC,
  CASE WHEN @sort = 'price_desc' THEN p.Price END DESC,
  CASE WHEN @sort = 'newest'     THEN p.CreatedAt END DESC
OFFSET (@page - 1) * @limit ROWS
FETCH NEXT @limit ROWS ONLY
```

---

> **Tìm kiếm (`q`)** không phân biệt dấu: mọi từ khoá đã bỏ dấu phải có trong `Products.SearchText`.
> Thêm `ids=1,2,3` để lấy nhiều sản phẩm theo ID (tối đa 50), `sort=relevance` (mặc định khi có `q`)
> hoặc `sort=featured` (sản phẩm nổi bật trước).

### GET `/products/suggestions`

Gợi ý khi gõ search (debounce 300ms ở FE).

```http
/products/suggestions?q=legion
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Laptop gaming Lenovo Legion 5i",
      "price": 52990000,
      "thumbnail": "https://example.com/image.jpg"
    }
  ]
}
```

---

### GET `/products/:id`

Chi tiết sản phẩm kèm review summary.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Laptop gaming Lenovo Legion 5i",
    "brand": "Lenovo",
    "description": "...",
    "price": 52990000,
    "oldPrice": 54990000,
    "stock": 4,
    "rating": 4.9,
    "reviewsCount": 27,
    "ratingBreakdown": {
      "5": 20, "4": 5, "3": 2, "2": 0, "1": 0
    },
    "specs": ["Core i7-14700HX", "RTX 5070", "24GB RAM"],
    "images": ["https://example.com/img1.jpg"],
    "category": { "id": 1, "name": "Laptop", "slug": "laptop" }
  }
}
```

---

### POST `/admin/products`

**Auth:** admin only

**Request:**
```json
{
  "name": "Laptop Lenovo Legion 5i",
  "brand": "Lenovo",
  "description": "Mô tả sản phẩm...",
  "price": 52990000,
  "oldPrice": 54990000,
  "stock": 10,
  "categoryId": 1,
  "specs": ["Core i7", "RTX 5070"],
  "images": ["https://..."],
  "isFeatured": false
}
```

---

### PATCH `/admin/products/:id`

---

### DELETE `/admin/products/:id`

**Lưu ý:** Soft delete — đặt `isDeleted = true`, không xoá khỏi DB.

---

## 9. Cart APIs

> **Chiến lược:** FE quản lý cart ở `localStorage`. Khi checkout mới gọi `POST /orders`.  
> Nếu cần cart server-side (đồng bộ đa thiết bị), dùng MongoDB `Sessions`.

### GET `/cart/validate`

Kiểm tra các sản phẩm trong giỏ hàng còn đủ hàng không — gọi trước khi checkout.

**Request:**
```json
{
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 5, "quantity": 1 }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "issues": [
      {
        "productId": 1,
        "productName": "Laptop Lenovo Legion 5i",
        "requestedQty": 2,
        "availableStock": 1,
        "issue": "insufficient_stock"
      }
    ]
  }
}
```

### GET `/cart` · PUT `/cart`

Giỏ hàng lưu ở server (bảng `CartItems`) cho khách đã đăng nhập. **Auth:** customer.
`PUT` thay toàn bộ giỏ: gộp dòng trùng, số lượng 1–99, tối đa 50 sản phẩm, bỏ qua sản phẩm đã ẩn.
Tạo đơn thành công thì các sản phẩm đã mua tự bị xoá khỏi giỏ (cùng transaction).

```json
{ "items": [{ "productId": 6, "quantity": 1 }] }
```

**Response 200:** `{ "items": [{ "productId": 6, "quantity": 1, "product": { "id": 6, "name": "...", "price": 11990000, ... } }] }`

### GET `/locations/provinces`

Danh sách 34 tỉnh/thành sau sắp xếp đơn vị hành chính (từ 01/7/2025), dùng cho form địa chỉ.

### POST `/cart/quote`

Báo giá giỏ hàng — giá lấy từ DB, phí ship, ưu đãi và voucher tính bằng **cùng hàm** với `POST /orders`
(`services/pricing.service.js`), nên số khách thấy luôn khớp số lưu vào đơn. Không cần đăng nhập, không ghi DB.

**Request:**
```json
{
  "items": [{ "productId": 1, "quantity": 2 }],
  "voucherCode": "SALE10"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [{ "productId": 1, "name": "Laptop", "unitPrice": 6000000, "quantity": 2, "lineTotal": 12000000 }],
    "issues": [],
    "subtotal": 12000000,
    "shippingFee": 0,
    "promoDiscount": 200000,
    "voucherDiscount": 100000,
    "discount": 300000,
    "total": 11700000,
    "voucher": { "code": "SALE10", "discountType": "amount", "discountValue": 100000 },
    "voucherError": null
  }
}
```

Voucher không dùng được thì báo giá vẫn trả 200, kèm `voucherError: { code, message }`.

---

## 10. Order APIs

### POST `/orders`

Tạo đơn hàng — **có xử lý race condition với UPDLOCK**.

**Auth:** customer

> **Địa chỉ giao hàng bắt buộc** và được kiểm tra ở server: `recipientName`, `phone` (0xxxxxxxxx hoặc +84),
> `province` (một trong 34 tỉnh/thành), `ward`, `street`. Sai thì trả `400` với
> `errors: { code: "invalid_address", fields: { phone: "..." } }`.

> **Quan trọng:** `subtotal`, `discount`, `shippingFee`, `total` luôn do server tính. Các trường này
> trong request bị bỏ qua; client chỉ gửi `voucherCode`. Voucher được khoá `UPDLOCK` và ghi
> `VoucherUsages` trong cùng transaction với đơn hàng.

**Request:**
```json
{
  "shippingAddress": {
    "recipientName": "Nguyen Van A",
    "phone": "0988111222",
    "street": "268 Ly Thuong Kiet",
    "ward": "Ward 14",
    "district": "District 10",
    "city": "Ho Chi Minh City"
  },
  "paymentMethod": "cod | banking | vnpay",
  "voucherCode": "SALE10",
  "note": "Gọi trước khi giao",
  "items": [
    { "productId": 1, "quantity": 1 },
    { "productId": 5, "quantity": 2 }
  ]
}
```

**Backend implementation — SQL Transaction với Locking:**
```javascript
// services/orderService.js
async function createOrder(userId, orderData) {
  const transaction = new sql.Transaction(pool)
  await transaction.begin()
  
  try {
    // 1. Validate voucher nếu có
    let discount = 0
    if (orderData.voucherCode) {
      discount = await validateAndApplyVoucher(
        orderData.voucherCode, userId, transaction
      )
    }

    // 2. Kiểm tra và khoá tồn kho (UPDLOCK + ROWLOCK)
    for (const item of orderData.items) {
      const result = await transaction.request()
        .input('productId', item.productId)
        .query(`
          SELECT ProductID, Name, Price, Stock 
          FROM Products WITH (UPDLOCK, ROWLOCK)
          WHERE ProductID = @productId AND IsDeleted = 0
        `)
      
      const product = result.recordset[0]
      
      if (!product) {
        await transaction.rollback()
        throw { status: 404, message: `Product ${item.productId} not found` }
      }
      
      if (product.Stock < item.quantity) {
        await transaction.rollback()
        throw { 
          status: 409, 
          message: `Sản phẩm "${product.Name}" chỉ còn ${product.Stock} cái`,
          data: { productId: item.productId, availableStock: product.Stock }
        }
      }
    }

    // 3. Tính tổng tiền
    const subtotal = orderData.items.reduce((sum, item) => {
      const product = /* lấy từ bước 2 */
      return sum + product.Price * item.quantity
    }, 0)
    const total = subtotal - discount

    // 4. Tạo Order
    const orderResult = await transaction.request()
      .input('userId', userId)
      .input('status', orderData.paymentMethod === 'cod' ? 'pending' : 'pending_payment')
      .input('paymentMethod', orderData.paymentMethod)
      .input('subtotal', subtotal)
      .input('discount', discount)
      .input('total', total)
      .input('shippingAddress', JSON.stringify(orderData.shippingAddress))
      .query(`
        INSERT INTO Orders 
          (UserID, Status, PaymentMethod, Subtotal, Discount, Total, ShippingAddress)
        OUTPUT INSERTED.OrderID
        VALUES 
          (@userId, @status, @paymentMethod, @subtotal, @discount, @total, @shippingAddress)
      `)
    
    const orderId = orderResult.recordset[0].OrderID

    // 5. Tạo OrderItems + Trừ tồn kho
    for (const item of orderData.items) {
      await transaction.request()
        .input('orderId', orderId)
        .input('productId', item.productId)
        .input('quantity', item.quantity)
        .input('unitPrice', item.unitPrice)
        .query(`
          INSERT INTO OrderItems (OrderID, ProductID, Quantity, UnitPrice)
          VALUES (@orderId, @productId, @quantity, @unitPrice)
        `)

      await transaction.request()
        .input('productId', item.productId)
        .input('quantity', item.quantity)
        .query(`
          UPDATE Products 
          SET Stock = Stock - @quantity
          WHERE ProductID = @productId
        `)
    }

    // 6. Đánh dấu voucher đã dùng
    if (orderData.voucherCode) {
      await markVoucherUsed(orderData.voucherCode, userId, orderId, transaction)
    }

    await transaction.commit()

    return { orderId, total, status: 'pending' }

  } catch (err) {
    await transaction.rollback()
    throw err
  }
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": 101,
    "status": "pending",
    "paymentMethod": "cod",
    "subtotal": 54990000,
    "discount": 500000,
    "total": 54490000,
    "createdAt": "2026-04-04T10:30:00Z",
    "paymentUrl": null
  }
}
```

> **Nếu paymentMethod = "vnpay"**, `paymentUrl` sẽ có giá trị — FE redirect sang đó.

**Errors:**
- `409` — Hết hàng (kèm `data.availableStock`)
- `422` — Voucher không hợp lệ

---

### GET `/orders/my-orders`

**Auth:** customer

**Query:**
```http
/orders/my-orders?page=1&limit=10&status=pending,pending_payment,confirmed,processing
```

`status` nhận một hoặc nhiều trạng thái cách nhau bằng dấu phẩy (trạng thái lạ → `400`). `counts` là số đơn của khách
theo từng trạng thái (không phụ thuộc bộ lọc), dùng cho các tab ở trang "Đơn hàng của tôi".

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 101,
        "status": "pending",
        "paymentMethod": "cod",
        "total": 54490000,
        "itemCount": 2,
        "createdAt": "2026-04-04T10:30:00Z"
      }
    ],
    "counts": { "pending": 1, "delivered": 3, "cancelled": 1 },
    "pagination": { "page": 1, "limit": 10, "totalItems": 5, "totalPages": 1 }
  }
}
```

---

### GET `/orders/:id`

Chi tiết đơn hàng.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 101,
    "status": "pending",
    "paymentMethod": "cod",
    "paymentStatus": "unpaid",
    "subtotal": 54990000,
    "discount": 500000,
    "shippingFee": 0,
    "total": 54490000,
    "note": "Gọi trước khi giao",
    "shippingAddress": {
      "recipientName": "Nguyen Van A",
      "phone": "0988111222",
      "street": "268 Ly Thuong Kiet",
      "district": "District 10",
      "city": "Ho Chi Minh City"
    },
    "items": [
      {
        "productId": 1,
        "productName": "Laptop Lenovo Legion 5i",
        "thumbnail": "https://...",
        "quantity": 1,
        "unitPrice": 52990000
      }
    ],
    "history": [
      { "from": null, "status": "pending", "by": "customer", "note": null, "at": "2026-04-04T10:30:00Z" },
      { "from": "pending", "status": "confirmed", "by": "admin", "note": null, "at": "2026-04-04T11:02:00Z" }
    ],
    "createdAt": "2026-04-04T10:30:00Z"
  }
}
```

`history` lấy từ bảng `OrderStatusHistory` (migration `020`): mỗi lần đơn đổi trạng thái có một dòng, ghi trong cùng
transaction với lệnh đổi trạng thái. `by` là `customer`, `admin`, `payment` (VNPay) hoặc `system` (quá hạn thanh toán).
Khách chỉ thấy `note` của lần huỷ (lý do huỷ); admin thấy mọi ghi chú. Đơn có trước migration có một dòng trạng thái hiện tại.

---

### PATCH `/orders/:id/cancel`

Huỷ đơn — **có transaction hoàn lại tồn kho**.

**Auth:** customer (chỉ huỷ đơn của mình)

**Request:**
```json
{ "reason": "Đổi ý không muốn mua nữa" }
```

**Backend:**
```javascript
// Chỉ cho huỷ khi status ∈ ['pending', 'pending_payment', 'confirmed']
// Transaction: UPDATE Orders + UPDATE Products (hoàn stock)
const CANCELLABLE_STATUSES = ['pending', 'pending_payment', 'confirmed']
```

**Response 200:**
```json
{
  "success": true,
  "message": "Order cancelled",
  "data": { "orderId": 101, "status": "cancelled" }
}
```

**Errors:**
- `422` — Đơn đang giao, không thể huỷ

---

### GET `/orders/admin`

Danh sách đơn cho admin, mới nhất trước.

**Auth:** admin

**Query:**
- `status` — một hoặc nhiều trạng thái, cách nhau bằng dấu phẩy (`pending,pending_payment,confirmed,processing` là nhóm "Cần xử lý" trên dashboard). Trạng thái lạ → `400`.
- `q` — tìm theo mã đơn (`DH000123`), số đơn, tên/email khách, tên hoặc số điện thoại người nhận. Tên tìm không phân biệt dấu (`khach hoa` khớp "Khách Hoá").
- `payment` — lọc theo trạng thái thanh toán (`refund_required`, `refunded`, `paid`, …). Response có thêm `refundRequired`: số đơn đang chờ hoàn tiền.
- `from`, `to` — khoảng ngày đặt hàng `YYYY-MM-DD` theo lịch Việt Nam (gồm cả hai đầu; đổi sang giờ của máy chủ SQL như báo cáo ngày). Sai định dạng hoặc `from` sau `to` → `400`.
- `page`, `limit` (tối đa 100). Dashboard tải CSV bằng cách đọc lần lượt các trang 100 đơn (tối đa 5.000 đơn).

**Response 200:** `data.items[]` gồm `id`, `orderCode`, `status`, `paymentMethod`, `paymentStatus`, `total`, `createdAt`, `customerName`, `customerEmail`, `recipientName`, `recipientPhone`, `province`, `itemCount`, `itemsText`; kèm `data.pagination { page, limit, totalItems, totalPages }`.

Chi tiết một đơn (địa chỉ giao, ghi chú khách, sản phẩm, serial bảo hành) dùng chung `GET /orders/:id` — admin xem được mọi đơn. Dashboard có nút "In phiếu giao hàng" in từ dữ liệu này.

---

### PATCH `/orders/admin/:id/status`

Admin cập nhật trạng thái đơn hàng. Không ghi đè ghi chú của khách; khách nhận thông báo trong tài khoản.

**Request:** `{ "status": "shipped", "carrier": "Giao Hàng Nhanh (GHN)", "trackingCode": "GHN123456" }` — `carrier` (≤ 50 ký tự) và `trackingCode` (chữ, số, `.`, `-`, `_`, 3–60 ký tự) chỉ dùng khi `status = shipped`; gửi lại với mã mới để sửa mã vận đơn (khách được báo lại).

- Lần đầu sang `shipped` ghi `ShippedAt`; sang `delivered` ghi `DeliveredAt` — mốc tính hạn đổi trả. Chuyển đơn ra khỏi `delivered` thì xoá `DeliveredAt`.
- `422 has_returns` — đơn đã có yêu cầu đổi trả (chưa bị từ chối/huỷ) thì giữ trạng thái `delivered`.
- Đổi trạng thái và ghi `OrderStatusHistory` (người đổi `admin`, ghi chú `note` nếu có) trong một transaction; gửi lại cùng trạng thái không ghi thêm dòng.

`GET /orders/:id` trả thêm `shippingCarrier`, `trackingCode`, `shippedAt`, `deliveredAt`, `returns[]` và `returnWindow { days, open, deadline, items[{ productId, remaining }] }`.

---

### POST `/orders/admin/:id/refund`

Ghi nhận đã hoàn tiền cho đơn đã thanh toán rồi bị huỷ (`PaymentStatus = refund_required`). Tiền hoàn ở cổng VNPay hoặc
chuyển khoản; API chỉ lưu lại. Body `{ reference, amount?, note? }`: `reference` bắt buộc (mã giao dịch hoàn), `amount`
mặc định và tối đa bằng tổng đơn. Đơn chuyển `refunded` (`RefundAmount`, `RefundReference`, `RefundedAt`), khách nhận
thông báo; báo cáo ngày cộng vào tiền hoàn. Đơn không chờ hoàn → `422 not_refund_required`.

---

### Đổi trả

Theo Chính sách đổi trả: trong `RETURN_DAYS` ngày (mặc định 7) kể từ `DeliveredAt`, lý do `defective` (lỗi nhà sản xuất), `wrong_item` (giao sai, thiếu phụ kiện), `not_as_described` (khác mô tả).

| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| POST | `/orders/:id/returns` | Khách (đơn của mình) | Body `{ kind: "exchange" \| "refund", reason, description (≥ 10 ký tự), items: [{ productId, quantity }] }` → `201` yêu cầu `TH000001…` trạng thái `pending` |
| PATCH | `/orders/returns/:returnId/cancel` | Khách | Huỷ yêu cầu còn `pending` |
| GET | `/orders/admin/returns?status=pending,approved&page=&limit=` | Admin | Danh sách, yêu cầu đang mở lên đầu |
| PATCH | `/orders/admin/returns/:returnId` | Admin | Body `{ status, adminNote?, restock?, refundAmount? }` |

Các bước: `pending → approved | rejected`, `approved → received | rejected`, `received → completed`; khách tự huỷ → `cancelled`.
- `rejected` cần `adminNote` (lý do gửi khách).
- `received` với `restock: true`: cộng lại kho, sổ kho ghi lý do `return`.
- `completed` với `kind = refund`: `refundAmount` mặc định bằng giá trị hàng trả, không vượt số khách đã trả cho đơn trừ các lần hoàn trước (`400 refund_too_large`). Với `kind = exchange`: trừ kho hàng mới gửi khách, sổ kho ghi `exchange`; hết hàng → `409 out_of_stock`.
- Mỗi bước gửi thông báo cho khách.

Lỗi khi khách gửi: `422 not_delivered`, `422 return_window_closed` (gợi ý bảo hành theo serial), `409 return_quantity_exceeded` (`data.available` = số còn yêu cầu được). Tạo yêu cầu khoá dòng đơn hàng (`UPDLOCK`) nên nhiều yêu cầu gửi cùng lúc không vượt số đã mua.

**Auth:** admin

**Request:**
```json
{
  "status": "confirmed | processing | shipping | delivered | completed | cancelled | refunded",
  "note": "Đã bàn giao cho đơn vị vận chuyển"
}
```

---

### POST `/orders/:id/return`

Khách yêu cầu trả hàng.

**Auth:** customer

**Chỉ cho phép khi:** status = `completed` và trong vòng 7 ngày.

**Request:**
```json
{
  "reason": "Hàng bị lỗi",
  "items": [{ "productId": 1, "quantity": 1 }]
}
```

---

## 11. Payment APIs — VNPay

> Dùng VNPay Sandbox để test. Tài khoản sandbox: https://sandbox.vnpayment.vn/devreg/

### POST `/payments/vnpay/create`

Tạo link thanh toán VNPay — gọi sau khi tạo đơn hàng với `paymentMethod: "vnpay"`.

**Auth:** customer

**Request:**
```json
{ "orderId": 101 }
```

**Backend implementation:**
```javascript
// services/vnpayService.js
import crypto from 'crypto'
import querystring from 'qs'

export function createVNPayUrl(orderId, amount, ipAddr) {
  const tmnCode    = process.env.VNPAY_TMN_CODE
  const secretKey  = process.env.VNPAY_HASH_SECRET
  const returnUrl  = process.env.VNPAY_RETURN_URL
  const vnpUrl     = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
  
  const date = new Date()
  const createDate = date.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  const txnRef = `${orderId}_${Date.now()}`

  let params = {
    vnp_Version:     '2.1.0',
    vnp_Command:     'pay',
    vnp_TmnCode:     tmnCode,
    vnp_Amount:      amount * 100,        // VNPay nhân 100
    vnp_CreateDate:  createDate,
    vnp_CurrCode:    'VND',
    vnp_IpAddr:      ipAddr,
    vnp_Locale:      'vn',
    vnp_OrderInfo:   `Thanh toan don hang ${orderId}`,
    vnp_OrderType:   'other',
    vnp_ReturnUrl:   returnUrl,
    vnp_TxnRef:      txnRef,
  }

  // Sắp xếp params theo alphabet và ký HMAC-SHA512
  const sortedParams = Object.keys(params).sort().reduce((obj, key) => {
    obj[key] = params[key]
    return obj
  }, {})

  const signData = querystring.stringify(sortedParams, { encode: false })
  const hmac = crypto.createHmac('sha512', secretKey)
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex')

  sortedParams['vnp_SecureHash'] = signed
  return `${vnpUrl}?${querystring.stringify(sortedParams, { encode: false })}`
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_..."
  }
}
```

---

### GET `/payments/vnpay/return`

VNPay redirect user về sau khi thanh toán (FE nhận kết quả).

**Query params từ VNPay:**
```http
/payments/vnpay/return?vnp_TxnRef=101_xxx&vnp_ResponseCode=00&vnp_SecureHash=...
```

**Backend:**
```javascript
// Verify chữ ký trước khi xử lý
// ResponseCode = '00' → thanh toán thành công
// Cập nhật Orders SET paymentStatus = 'paid', status = 'confirmed'
```

**Response:** Redirect về FE với kết quả

```
Frontend URL: /order-result?success=true&orderId=101
              /order-result?success=false&message=cancelled
```

---

### POST `/payments/vnpay/ipn`

VNPay gọi server-to-server để xác nhận thanh toán (IPN — Instant Payment Notification).

> **Quan trọng:** Đây là endpoint chính để cập nhật trạng thái đơn hàng — không phụ thuộc vào redirect của user.

**Backend:**
```javascript
router.post('/payments/vnpay/ipn', async (req, res) => {
  const { vnp_SecureHash, vnp_TxnRef, vnp_ResponseCode, vnp_Amount } = req.query
  
  // 1. Verify chữ ký
  if (!verifyVNPaySignature(req.query)) {
    return res.json({ RspCode: '97', Message: 'Invalid signature' })
  }
  
  // 2. Kiểm tra order tồn tại
  const orderId = vnp_TxnRef.split('_')[0]
  const order = await getOrder(orderId)
  if (!order) return res.json({ RspCode: '01', Message: 'Order not found' })
  
  // 3. Kiểm tra số tiền khớp
  if (order.total * 100 !== parseInt(vnp_Amount)) {
    return res.json({ RspCode: '04', Message: 'Amount mismatch' })
  }
  
  // 4. Cập nhật trạng thái nếu chưa xử lý
  if (order.paymentStatus === 'unpaid') {
    if (vnp_ResponseCode === '00') {
      await updateOrderPayment(orderId, 'paid', 'confirmed')
    } else {
      await updateOrderPayment(orderId, 'failed', 'payment_failed')
      // Hoàn lại tồn kho
      await restoreStock(orderId)
    }
  }
  
  res.json({ RspCode: '00', Message: 'Confirmed' })
})
```

---

### GET `/orders/:id/payment-status`

FE polling để kiểm tra trạng thái thanh toán.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "orderId": 101,
    "paymentStatus": "paid | unpaid | failed",
    "orderStatus": "confirmed | payment_failed"
  }
}
```

---

## 12. Review APIs

Đánh giá lưu ở MongoDB (collection `reviews`); điểm sao và số đánh giá trong bảng `Products` được tính lại từ
các đánh giá **đang hiện** mỗi khi đánh giá được thêm, sửa, xoá, ẩn hoặc hiện lại (và đồng bộ toàn bộ khi API khởi động).

### GET `/reviews/products/:productId?page=1&limit=10`

Công khai. Chỉ trả đánh giá đang hiện, mới nhất trước, kèm phản hồi của cửa hàng nếu có. Không trả thông tin kiểm duyệt.

```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "6731…",
        "productId": 1,
        "userId": 7,
        "rating": 1,
        "title": "Quạt kêu to",
        "content": "Card chạy được nhưng quạt kêu to khi chơi game.",
        "helpful_count": 3,
        "storeReply": { "content": "Cửa hàng sẽ gọi để đổi quạt cho bạn.", "repliedAt": "2026-11-12T04:21:00Z" },
        "createdAt": "2026-11-10T08:00:00Z"
      }
    ],
    "total": 1, "page": 1, "pages": 1,
    "statistics": { "overall_rating": 1, "total_reviews": 1, "rating_breakdown": { "1": 1, "2": 0, "3": 0, "4": 0, "5": 0 } }
  }
}
```

### GET `/reviews/products/:productId/eligibility`

**Auth:** customer. `{ canReview, reason }` với `reason` là `null`, `not_purchased` hoặc `already_reviewed`.
Nếu đánh giá của chính khách đang bị ẩn: thêm `hidden: true` và `hiddenReason`.

### POST `/reviews/products/:productId`

**Auth:** customer. Body `{ rating: 1..5, title, content (≥ 10 ký tự) }`. Chỉ khách có đơn chứa sản phẩm ở trạng thái
`delivered` hoặc `completed` mới đánh giá được (truy vấn SQL Server), mỗi khách một đánh giá cho mỗi sản phẩm.

```sql
SELECT COUNT(*) AS purchase_count
FROM Orders o JOIN OrderItems oi ON o.OrderID = oi.OrderID
WHERE o.UserID = @userId AND oi.ProductID = @productId AND o.Status IN ('delivered', 'completed')
```

### PATCH `/reviews/:reviewId`, DELETE `/reviews/:reviewId`

**Auth:** người viết. Sửa hoặc xoá đánh giá của mình.

### PATCH `/reviews/:reviewId/helpful`

**Auth:** customer. Mỗi người tính một lần (`409` nếu bấm lại); điều kiện và cập nhật nằm trong một lệnh `findOneAndUpdate`.

### GET `/reviews/my`

**Auth:** customer. Đánh giá của chính khách (kể cả đang bị ẩn).

### GET `/reviews/admin?filter=needs_reply&page=1&limit=20`

**Auth:** admin. `filter`: `all`, `visible`, `hidden`, `needs_reply` (1-2 sao, đang hiện, chưa phản hồi).

```json
{
  "items": [
    {
      "id": "6731…", "productId": 1, "productName": "MSI RTX 4060 Ventus",
      "userId": 7, "author": { "fullName": "Nguyễn Văn Khách", "email": "khach@btstore.test" },
      "rating": 1, "title": "Quạt kêu to", "content": "…", "helpfulCount": 3,
      "hidden": false, "hiddenReason": null, "hiddenAt": null, "storeReply": null,
      "createdAt": "2026-11-10T08:00:00Z"
    }
  ],
  "total": 1, "page": 1, "pages": 1, "needsReply": 1
}
```

### PATCH `/reviews/admin/:reviewId`

**Auth:** admin. Body gồm một hoặc nhiều trường:

| Trường | Ý nghĩa |
| --- | --- |
| `hidden: true` + `reason` | Ẩn đánh giá. `reason` bắt buộc: `spam`, `offensive`, `personal_info`, `off_topic`. Người viết nhận thông báo (loại `review`) kèm lý do. |
| `hidden: false` | Hiện lại. |
| `reply: "…"` | Đăng hoặc sửa phản hồi công khai (2–1000 ký tự). Người viết được báo ở lần phản hồi đầu tiên; sửa phản hồi không báo lại. |
| `reply: ""` hoặc `null` | Gỡ phản hồi. |

Ẩn hoặc hiện lại thì điểm sao của sản phẩm được tính lại. Lỗi: `400` (thiếu lý do, phản hồi quá ngắn/dài,
không có thay đổi, mã sai), `404` (không tìm thấy).

---

## 13. Voucher APIs

### POST `/vouchers/validate`

Kiểm tra mã giảm giá — gọi khi user nhập voucher ở checkout.

**Auth:** customer

**Request:**
```json
{
  "code": "SALE10",
  "orderTotal": 54990000,
  "items": [{ "productId": 1, "quantity": 1 }]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "code": "SALE10",
    "discountType": "percent | fixed",
    "discountValue": 10,
    "discountAmount": 5499000,
    "finalTotal": 49491000,
    "message": "Giảm 10% toàn đơn hàng"
  }
}
```

**Errors:**
- `422` — Mã không tồn tại, hết hạn, đã dùng, không đủ điều kiện

---

### GET `/vouchers/admin?state=`

**Auth:** admin. `state` (tuỳ chọn): `active`, `scheduled`, `expired`, `used_up`, `disabled`.

**Response 200:** mảng mã, mới nhất trước:
```json
{
  "id": 1, "code": "DBMS10", "discountType": "percent", "discountValue": 10,
  "minOrderAmount": 1000000, "maxDiscount": 500000, "usageLimit": 100, "usedCount": 23,
  "isActive": true, "startsAt": "2026-11-01T00:00:00.000Z", "endsAt": "2026-12-31T00:00:00.000Z",
  "state": "active", "orders": 23, "revenue": 104000000
}
```
`orders`/`revenue`: số đơn chưa huỷ có dùng mã và tổng tiền các đơn đó.

---

### POST `/vouchers`

**Auth:** admin

**Request:**
```json
{
  "code": "SALE10",
  "discountType": "percent",
  "discountValue": 10,
  "minOrderAmount": 1000000,
  "maxDiscount": 500000,
  "usageLimit": 100,
  "startDate": "2026-11-20T08:00:00+07:00",
  "endDate": "2026-11-30T23:59:00+07:00"
}
```
- `code`: 3–30 ký tự chữ không dấu, số, `-`, `_` (lưu chữ hoa). Trùng mã → `409 voucher_exists`.
- `discountType`: `amount` (từ 1.000đ, không lớn hơn `minOrderAmount` nếu có) hoặc `percent` (1–90, `maxDiscount` tuỳ chọn).
- `usageLimit` trống = không giới hạn. `startDate`/`endDate` là thời điểm có múi giờ; server đổi sang giờ máy chủ SQL (giờ mà lúc đặt hàng dùng để so).
- Vẫn nhận tên trường cũ `discount`, `quantity`.

**Response 201:** mã vừa tạo, cùng dạng với danh sách.

---

### PATCH `/vouchers/admin/:id`

**Auth:** admin. Body `{ "isActive": false }` để tắt (khách nhập sẽ nhận `voucher_inactive`), `true` để bật lại. Đơn đã đặt bằng mã không bị ảnh hưởng.

---

## 14. Admin Dashboard APIs

### GET `/admin/dashboard`

**Auth:** admin

**Response 200:**
```json
{
  "success": true,
  "data": {
    "summary": [
      { "id": "newCustomers",  "label": "Khách mới",    "value": 128, "delta": "+12%" },
      { "id": "ordersToday",   "label": "Đơn hôm nay",  "value": 42,  "delta": "+8%"  },
      { "id": "revenueToday",  "label": "Doanh thu hôm nay", "value": 125000000, "delta": "+15%" },
      { "id": "pendingOrders", "label": "Đơn chờ xử lý", "value": 18, "delta": null }
    ],
    "recentOrders": [
      {
        "id": 101,
        "customerName": "Nguyen Van A",
        "status": "pending",
        "total": 54490000,
        "createdAt": "2026-04-04T10:30:00Z"
      }
    ],
    "inventoryAlerts": [
      {
        "productId": 100,
        "productName": "Chuột Logitech G Pro X",
        "stock": 3,
        "threshold": 5
      }
    ],
    "topProducts": [
      {
        "productId": 1,
        "productName": "Laptop Lenovo Legion 5i",
        "sold": 18,
        "revenue": 953820000
      }
    ],
    "categoryPerformance": [
      {
        "categoryId": 1,
        "categoryName": "Laptop",
        "revenue": 250000000,
        "orders": 24
      }
    ]
  }
}
```

**SQL Query cho dashboard:**
```sql
-- Summary: Khách mới hôm nay
SELECT COUNT(*) AS NewCustomers 
FROM Users 
WHERE CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)

-- Đơn hàng hôm nay
SELECT COUNT(*) AS OrdersToday, SUM(Total) AS RevenueToday
FROM Orders
WHERE CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)

-- Top products (aggregate query)
SELECT TOP 5 p.Name, SUM(oi.Quantity) AS Sold,
       SUM(oi.Quantity * oi.UnitPrice) AS Revenue
FROM OrderItems oi
JOIN Products p ON oi.ProductID = p.ProductID
JOIN Orders o ON oi.OrderID = o.OrderID
WHERE o.Status NOT IN ('cancelled', 'payment_failed')
GROUP BY p.ProductID, p.Name
ORDER BY Revenue DESC

-- Inventory alerts (subquery)
SELECT ProductID, Name, Stock
FROM Products
WHERE Stock <= 5 AND IsDeleted = 0
ORDER BY Stock ASC
```

---

## 15. Inventory APIs

### GET `/admin/inventory`

**Query:**
```http
/admin/inventory?page=1&limit=20&lowStock=true&category=laptop
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "productId": 1,
        "productName": "Laptop Lenovo Legion 5i",
        "category": "Laptop",
        "stock": 4,
        "status": "low | ok | out"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "totalItems": 50 }
  }
}
```

---

### PATCH `/admin/products/:id/stock`

**Auth:** admin

**Request:**
```json
{
  "stock": 25,
  "reason": "Nhập hàng mới từ kho"
}
```

**Backend:** Ghi log vào MongoDB `ProductLogs`:
```javascript
// MongoDB log
await ProductLog.create({
  productId: id,
  action: 'stock_update',
  oldStock: currentStock,
  newStock: stock,
  reason,
  adminId: req.user.id,
  timestamp: new Date()
})
```

---

### GET `/admin/inventory/alerts`

```http
/admin/inventory/alerts?threshold=5
```

---

## Trợ lý mua hàng (OpenAI)

Bật khi máy chủ có `OPENAI_API_KEY` (mô hình `OPENAI_MODEL`, mặc định `gpt-5.4-mini`).

### GET `/assistant/status`

`{ "enabled": true }` — website chỉ hiện nút trợ lý khi `enabled`.

### POST `/assistant/chat`

Không cần đăng nhập. Giới hạn `ASSISTANT_MAX_PER_HOUR` câu/giờ mỗi IP (mặc định 20) và `ASSISTANT_DAILY_LIMIT` câu/ngày
cho cả cửa hàng (mặc định 500, `429 assistant_daily_limit`).

**Request:** `{ "messages": [{ "role": "user", "content": "Laptop lập trình dưới 20 triệu" }] }` — chỉ vai `user`/`assistant`,
tối đa 12 tin, mỗi tin ≤ 1.000 ký tự, tin cuối là của khách.

**Response 200:**
```json
{ "reply": "Bạn tham khảo Laptop Gaming X giá 18.500.000 đ, còn 2 máy.",
  "products": [{ "id": 2, "name": "Laptop Gaming X", "price": 18500000, "stock": 2, "hotDeal": false }] }
```

Mô hình trả lời qua các hàm của website (`search_products`, `get_product`, `advise_build`, `get_store_policies`), tối đa 4 vòng.
`products` lấy từ kết quả các hàm đó (giá khách trả, đã tính Hot Deal), chỉ gồm sản phẩm được nhắc trong câu trả lời.
Lỗi phía OpenAI (khoá sai, quá tải, mất mạng) → `503` với lời nhắn chung. Máy chủ không lưu hội thoại.

---

## 16. Analytics & Inventory APIs (admin)

Tất cả cần `Authorization: Bearer <admin token>`.

### GET `/analytics/dashboard`

Số liệu tổng quan: `summary` (tổng khách, sản phẩm, đơn, doanh thu đơn đã giao, số sản phẩm tồn ≤ 5),
`revenueByCategory`, `topProducts` (theo đơn `delivered`/`completed`).

### GET `/analytics/integrity`

Kiểm tra toàn vẹn dữ liệu, chỉ đọc. Mỗi kiểm tra là một bất biến mà code giữ trong transaction; dòng sai nghĩa là
dữ liệu bị sửa thẳng trong DB hoặc có lỗi cần tìm.

| `key` | Bất biến |
| --- | --- |
| `stock_ledger` | `Products.Stock` = tổng `StockMovements.Change` của sản phẩm |
| `order_total` | `Total = Subtotal − Discount + ShippingFee` |
| `order_lines` | `Subtotal` = tổng `Quantity × UnitPrice` của đơn |
| `voucher_usage` | `Vouchers.UsedCount` = số dòng `VoucherUsages` của mã |
| `status_history` | trạng thái cuối trong `OrderStatusHistory` = `Orders.Status` |

```json
{
  "checkedAt": "2026-11-12T04:54:00Z", "durationMs": 42, "ok": false,
  "checks": [
    { "key": "stock_ledger", "label": "Tồn kho khớp sổ kho", "rule": "…", "ok": false, "problems": 1,
      "sample": [{ "id": 51, "name": "RAM 16GB", "stock": 7, "ledger": 5 }] }
  ]
}
```

`sample` có tối đa 20 dòng mới nhất (ID lớn trước).

### GET `/analytics/daily?from=YYYY-MM-DD&to=YYYY-MM-DD`

Báo cáo theo ngày, **chia ngày theo giờ Việt Nam (UTC+7)** bất kể máy chủ SQL đặt múi giờ nào.
Mặc định 30 ngày gần nhất, tối đa 92 ngày một lần.

```json
{
  "from": "2026-11-06", "to": "2026-11-12", "timezone": "Asia/Ho_Chi_Minh",
  "days": [
    { "date": "2026-11-12", "orders": 3, "cancelledOrders": 0, "netSales": 2760000, "paidAmount": 0,
      "unitsSold": 3, "newCustomers": 3, "receipts": 1, "unitsReceived": 9, "receiptCost": 18900000 }
  ],
  "totals": { "orders": 8, "netSales": 22460000, "...": "..." }
}
```

`netSales` không tính đơn đã huỷ; `paidAmount` là phần đã thanh toán (`PaymentStatus = paid`).

### POST `/inventory/receipts`

Tạo phiếu nhập kho; cộng tồn và ghi sổ kho trong một transaction (khoá sản phẩm theo thứ tự `ProductID`).

```json
{
  "supplier": "Công ty Phân phối ABC",
  "note": "HĐ 0012345",
  "items": [{ "productId": 50002, "quantity": 10, "unitCost": 2100000 }]
}
```

**Response 201:** phiếu kèm `code` dạng `NK000001`, `totalQuantity`, `totalCost`, `items`.
Lỗi 400: thiếu nhà cung cấp, dòng lặp sản phẩm, số lượng ngoài 1–100.000, sản phẩm không tồn tại hoặc đã ẩn
(`errors.productIds`).

### GET `/inventory/receipts?page=&limit=` · GET `/inventory/receipts/:id`

Danh sách phiếu nhập gần nhất; chi tiết một phiếu.

### GET `/inventory/movements?productId=&reason=&limit=`

Sổ kho: mỗi lần tồn thay đổi có một dòng (`opening`, `receipt`, `sale`, `cancel`, `adjust`) với `change`,
`stockAfter`, mã đơn hoặc mã phiếu. Tổng `change` của một sản phẩm luôn bằng tồn hiện tại.

### GET `/inventory/low-stock?threshold=5&limit=20`

Sản phẩm sắp hết kèm số đã bán 30 ngày qua và giá nhập gần nhất.

---

### Hot Deal — `/promotions`

- `GET /promotions/active` (công khai): `{ serverNow, running: [...], upcoming: [...] }`, mỗi chương trình có
  `items` là sản phẩm kèm `promotion { salePrice, endsAt, quantityLimit, soldCount, remaining, perOrderLimit }`.
  `serverNow` để trình duyệt đếm ngược theo giờ máy chủ.
- `POST /promotions/admin` (admin):

```json
{
  "name": "Hot Deal cuối tuần",
  "startsAt": "2026-11-14T20:00:00+07:00",
  "endsAt": "2026-11-14T23:59:00+07:00",
  "items": [{ "productId": 50002, "salePrice": 2190000, "quantityLimit": 20, "perOrderLimit": 2 }]
}
```

  Giờ phải kèm múi giờ. Lỗi 400: giá khuyến mãi không thấp hơn giá niêm yết, giờ kết thúc đã qua, quá 31 ngày,
  sản phẩm đã có trong chương trình khác trùng khung giờ.
- `GET /promotions/admin`, `GET /promotions/admin/:id`, `PATCH /promotions/admin/:id/stop`.

Sản phẩm (`GET /products`, `GET /products/:id`, giỏ hàng) trả thêm `promotion` khi có Hot Deal đang chạy;
`price` vẫn là giá niêm yết. `POST /cart/quote` và `POST /orders` tự áp giá Hot Deal: một dòng chỉ được giá
khuyến mãi khi cả dòng nằm trong giới hạn mỗi đơn và số suất còn lại (nếu không, dòng có `promotionNote`).
`POST /orders` nhận thêm `expectedTotal` (tổng tiền khách đã thấy); nếu khác tổng mới thì trả
**409** `errors.code = "price_changed"` và không tạo đơn.

---

### Dịch vụ sau bán — `/services`

- `GET /services/options` (công khai): loại dịch vụ tại nhà, 14 ngày tới với số chỗ còn lại mỗi khung giờ,
  danh mục và tình trạng cho thu cũ. Chỉ nhận lịch trong `STORE_PROVINCE`, mỗi khung giờ tối đa
  `SERVICE_SLOT_CAPACITY` lịch.
- `POST /services/trade-in/estimate` (công khai): `{ category, purchasePrice, ageMonths, condition }` →
  `{ low, high, explanation }` (giá tham khảo, chốt sau khi kiểm tra máy).
- `POST /services/requests` (đăng nhập), theo `type`:
  - `home_service`: `{ serviceKind, scheduledDate: "YYYY-MM-DD", timeSlot: "08:00-10:00", address, description?, orderId? }`.
    409 `slot_full` khi khung giờ vừa kín (đếm lịch bằng `UPDLOCK, HOLDLOCK`), 409 `duplicate_slot`.
  - `trade_in`: `{ category, brandModel, purchasePrice, ageMonths, condition, contactPhone, description? }`.
  - `warranty`: `{ serialNumber, description, contactPhone, handoff: "store" | "pickup" }`; chỉ serial trong đơn của
    chính khách, còn hạn (400 `warranty_expired`), mỗi serial một yêu cầu đang mở (409 `open_request`).
- `GET /services/requests`, `GET /services/requests/:id`, `PATCH /services/requests/:id/cancel` (khi còn `new`/`confirmed`).
- Admin: `GET /services/admin/requests?type=&status=open|new|...`, `PATCH /services/admin/requests/:id`
  `{ status?, note?, finalPrice?, internal? }`. Trạng thái: `new → confirmed → in_progress → completed`, huỷ được
  trước khi hoàn tất. Ghi chú `internal` khách không thấy.

---

### Hỏi đáp sản phẩm

- `GET /products/:id/questions` (không bắt buộc đăng nhập) → `{ items, mine }`: `items` là câu đã trả lời (công khai,
  tối đa 50, mới trả lời trước); `mine` là câu đang chờ của chính người xem (cần gửi token).
- `POST /products/:id/questions` `{ question }` (đăng nhập, ≥ 10 ký tự) → `201`. Mỗi người tối đa 5 câu đang chờ
  (`409 too_many_pending`); tên hiển thị chỉ là tên gọi.
- Admin: `GET /products/admin/questions?status=pending|answered|hidden` → `{ items, pendingCount }`;
  `PATCH /products/admin/questions/:questionId` `{ answer }` để trả lời (công khai, báo người hỏi một lần bằng
  thông báo `question_answered`) hoặc `{ hidden: true }` để ẩn.

---

### Thông báo và theo dõi giá — `/notifications` (đăng nhập)

- `GET /notifications` → `{ unread, items: [{ id, type, title, body, link, read, createdAt }] }`;
  `type` là `price_drop`, `order_status`, `service_update`, `back_in_stock`, `question_answered` hoặc `review` (đánh giá bị ẩn, cửa hàng phản hồi).
- `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- `GET /notifications/price-watches`, `POST /notifications/price-watches` `{ productId, targetPrice? }`,
  `DELETE /notifications/price-watches/:productId`.
- Báo khi có hàng: `GET /notifications/stock-watches`, `POST /notifications/stock-watches` `{ productId }`
  (chỉ sản phẩm đang hết, còn hàng → 400 `in_stock`; tối đa 50), `DELETE /notifications/stock-watches/:productId`.
  Khi tồn > 0 (nhập kho, huỷ đơn, hàng trả nhập lại, admin sửa tồn, hoặc lượt quét định kỳ), server ghi thông báo
  `back_in_stock` ("Hiện còn N sản phẩm, giá X") và xoá lượt chờ trong cùng transaction: mỗi lượt báo một lần.

Giá so sánh là giá khách trả được lúc đó (giá Hot Deal đang chạy nếu thấp hơn giá niêm yết). Server quét định kỳ
(`PRICE_WATCH_SWEEP_MS`, mặc định 5 phút) và quét ngay khi admin đổi giá hoặc tạo Hot Deal. Mỗi mức giá chỉ báo
một lần; giá tăng lại rồi giảm thì báo lại. Admin đổi trạng thái đơn hàng không còn ghi đè ghi chú của khách
(`Orders.Note`); khách nhận thông báo `order_status`.

---

## 17. Race Condition — Xử lý tồn kho đồng thời

> Đây là phần quan trọng nhất liên quan đến **Transaction & Concurrency Control** trong assignment.

### Vấn đề

Khi 100 user cùng mua 1 sản phẩm chỉ còn 10 cái:

```
T1: SELECT stock = 10  ←── Cùng lúc
T2: SELECT stock = 10  ←── Cùng lúc

T1: UPDATE stock = 10 - 1 = 9  ✓
T2: UPDATE stock = 10 - 1 = 9  ✗ (đáng lẽ phải là 8)

→ Kết quả: oversell — bán nhiều hơn tồn kho
```

### Giải pháp 1: Pessimistic Locking (SQL Server UPDLOCK)

Phù hợp khi: traffic trung bình, ưu tiên đơn giản.

```sql
BEGIN TRANSACTION

  -- Khoá row TRƯỚC khi đọc — các transaction khác phải chờ
  SELECT Stock FROM Products 
  WITH (UPDLOCK, ROWLOCK)
  WHERE ProductID = @productId

  IF @@ROWCOUNT = 0 OR (SELECT Stock FROM Products WHERE ProductID = @productId) < @qty
  BEGIN
    ROLLBACK
    RETURN  -- Hết hàng
  END

  UPDATE Products 
  SET Stock = Stock - @qty
  WHERE ProductID = @productId

  INSERT INTO Orders ...
  INSERT INTO OrderItems ...

COMMIT
```

**Ưu điểm:** Đảm bảo tuyệt đối không oversell  
**Nhược điểm:** Các transaction phải xếp hàng chờ → giảm throughput khi nhiều user

### Giải pháp 2: Optimistic Locking (Version/Timestamp)

Phù hợp khi: traffic cao, chấp nhận retry.

```sql
-- Thêm cột Version vào Products
ALTER TABLE Products ADD Version INT DEFAULT 0

-- Update với điều kiện version
UPDATE Products 
SET Stock = Stock - @qty, Version = Version + 1
WHERE ProductID = @productId 
  AND Stock >= @qty
  AND Version = @expectedVersion  -- ← kiểm tra không có ai sửa trước

IF @@ROWCOUNT = 0
  -- Conflict → báo lỗi, FE retry
  ROLLBACK
```

**Ưu điểm:** Không khoá → throughput cao  
**Nhược điểm:** Cần xử lý retry logic

### Giải pháp 3: Atomic Update (Đơn giản nhất)

```sql
-- Chỉ 1 câu UPDATE, điều kiện kiểm tra tích hợp
UPDATE Products 
SET Stock = Stock - @qty
OUTPUT INSERTED.Stock
WHERE ProductID = @productId AND Stock >= @qty

-- Nếu @@ROWCOUNT = 0 → hết hàng → rollback
```

### Demo cho assignment

```javascript
// Tạo 2 session đồng thời, cùng mua sản phẩm còn 1 cái
// Kết quả mong đợi: 1 thành công, 1 báo lỗi 409

// Session A
const orderA = createOrder(userId: 1, productId: 1, qty: 1)

// Session B (cùng lúc)  
const orderB = createOrder(userId: 2, productId: 1, qty: 1)

// Với UPDLOCK: B phải chờ A xong → B thấy stock = 0 → 409
// Không có lock: cả 2 đều thành công → stock = -1 (bug!)
```

---

## 18. Order Status Flow

```
                    ┌─────────────┐
                    │   CREATED   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    paymentMethod=cod         paymentMethod=vnpay
              │                         │
              ▼                         ▼
        ┌─────────┐             ┌───────────────┐
        │ PENDING │             │PENDING_PAYMENT│
        └────┬────┘             └───────┬───────┘
             │                          │
             │                 ┌────────┴────────┐
             │                 │                 │
             │            Paid ▼           Failed▼
             │          ┌──────────┐    ┌────────────────┐
             │          │  PAID /  │    │ PAYMENT_FAILED │
             │          │CONFIRMED │    └───────┬────────┘
             │          └────┬─────┘            │
             │               │          Hoàn tồn kho
             └───────────────┤
                             ▼
                      ┌────────────┐
                      │ PROCESSING │
                      └─────┬──────┘
                             │
                             ▼
                      ┌──────────┐
                      │ SHIPPING │
                      └─────┬────┘
                             │
                             ▼
                      ┌───────────┐
                      │ DELIVERED │
                      └─────┬─────┘
                             │
                             ▼
                      ┌───────────┐
                      │ COMPLETED │
                      └─────┬─────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
            ┌──────────────┐  ┌──────────┐
            │RETURN_REQUEST│  │(kết thúc)│
            └──────┬───────┘  └──────────┘
                   │
                   ▼
            ┌──────────┐
            │ REFUNDED │
            └──────────┘

Có thể huỷ (CANCELLED) từ: pending, pending_payment, confirmed
```

---

## 19. Data Model

### SQL Server

```sql
-- Users
CREATE TABLE Users (
  UserID       INT PRIMARY KEY IDENTITY,
  FullName     NVARCHAR(200) NOT NULL,
  Email        NVARCHAR(200) UNIQUE NOT NULL,
  Password     NVARCHAR(255) NOT NULL,  -- bcrypt hash
  Phone        NVARCHAR(20),
  Role         NVARCHAR(20) DEFAULT 'customer',
  Address      NVARCHAR(MAX),           -- JSON string
  RefreshToken NVARCHAR(500),
  IsActive     BIT DEFAULT 1,
  CreatedAt    DATETIME DEFAULT GETDATE()
)

-- Categories
CREATE TABLE Categories (
  CategoryID INT PRIMARY KEY IDENTITY,
  Name       NVARCHAR(100) NOT NULL,
  Slug       NVARCHAR(100) UNIQUE NOT NULL,
  Icon       NVARCHAR(50)
)

-- Products
CREATE TABLE Products (
  ProductID   INT PRIMARY KEY IDENTITY,
  Name        NVARCHAR(200) NOT NULL,
  Slug        NVARCHAR(200) UNIQUE NOT NULL,
  Brand       NVARCHAR(100),
  Description NVARCHAR(MAX),
  Price       DECIMAL(15,0) NOT NULL,
  OldPrice    DECIMAL(15,0),
  Stock       INT DEFAULT 0,
  CategoryID  INT REFERENCES Categories(CategoryID),
  Specs       NVARCHAR(MAX),   -- JSON array
  Images      NVARCHAR(MAX),   -- JSON array
  IsFeatured  BIT DEFAULT 0,
  IsDeleted   BIT DEFAULT 0,
  Version     INT DEFAULT 0,   -- Optimistic locking
  CreatedAt   DATETIME DEFAULT GETDATE()
)

-- Orders
CREATE TABLE Orders (
  OrderID         INT PRIMARY KEY IDENTITY,
  UserID          INT REFERENCES Users(UserID),
  Status          NVARCHAR(50) DEFAULT 'pending',
  PaymentMethod   NVARCHAR(50) DEFAULT 'cod',
  PaymentStatus   NVARCHAR(50) DEFAULT 'unpaid',
  VNPayTxnRef     NVARCHAR(100),
  Subtotal        DECIMAL(15,0),
  Discount        DECIMAL(15,0) DEFAULT 0,
  ShippingFee     DECIMAL(15,0) DEFAULT 0,
  Total           DECIMAL(15,0),
  ShippingAddress NVARCHAR(MAX),  -- JSON
  Note            NVARCHAR(500),
  CancelReason    NVARCHAR(500),
  CreatedAt       DATETIME DEFAULT GETDATE(),
  UpdatedAt       DATETIME DEFAULT GETDATE()
)

-- OrderItems
CREATE TABLE OrderItems (
  OrderItemID INT PRIMARY KEY IDENTITY,
  OrderID     INT REFERENCES Orders(OrderID),
  ProductID   INT REFERENCES Products(ProductID),
  Quantity    INT NOT NULL,
  UnitPrice   DECIMAL(15,0) NOT NULL
)

-- Vouchers
CREATE TABLE Vouchers (
  VoucherID      INT PRIMARY KEY IDENTITY,
  Code           NVARCHAR(50) UNIQUE NOT NULL,
  DiscountType   NVARCHAR(20) NOT NULL,  -- percent | fixed
  DiscountValue  DECIMAL(15,0) NOT NULL,
  MinOrderAmount DECIMAL(15,0) DEFAULT 0,
  MaxDiscount    DECIMAL(15,0),
  UsageLimit     INT DEFAULT 1,
  UsedCount      INT DEFAULT 0,
  StartDate      DATETIME,
  EndDate        DATETIME,
  IsActive       BIT DEFAULT 1
)

-- VoucherUsages
CREATE TABLE VoucherUsages (
  UsageID   INT PRIMARY KEY IDENTITY,
  VoucherID INT REFERENCES Vouchers(VoucherID),
  UserID    INT REFERENCES Users(UserID),
  OrderID   INT REFERENCES Orders(OrderID),
  UsedAt    DATETIME DEFAULT GETDATE()
)
```

### MongoDB

```javascript
// Reviews collection
{
  _id: ObjectId,
  productId: Number,      // ref SQL Server Products.ProductID
  userId: Number,         // ref SQL Server Users.UserID
  userName: String,
  userAvatar: String,
  rating: Number,         // 1-5
  comment: String,
  createdAt: Date
}

// ProductLogs collection (audit trail)
{
  _id: ObjectId,
  productId: Number,
  action: String,         // 'stock_update' | 'price_change' | 'created'
  oldValue: Mixed,
  newValue: Mixed,
  reason: String,
  adminId: Number,
  timestamp: Date
}

// Sessions collection (cart server-side, optional)
{
  _id: ObjectId,
  userId: Number,
  cart: [
    { productId: Number, quantity: Number, addedAt: Date }
  ],
  updatedAt: Date,
  expiresAt: Date         // TTL index
}
```

---

## 20. Cấu trúc project

```
backend-app/
├── src/
│   ├── config/
│   │   ├── db.sql.js          ← kết nối SQL Server
│   │   ├── db.mongo.js        ← kết nối MongoDB
│   │   └── env.js
│   ├── middlewares/
│   │   ├── auth.js            ← JWT verify
│   │   ├── rateLimiter.js     ← rate limiting
│   │   └── errorHandler.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── product.routes.js
│   │   ├── order.routes.js
│   │   ├── payment.routes.js
│   │   ├── review.routes.js
│   │   ├── voucher.routes.js
│   │   └── admin.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── order.controller.js
│   │   └── ...
│   ├── services/
│   │   ├── orderService.js    ← transaction + locking logic
│   │   ├── vnpayService.js    ← VNPay integration
│   │   └── voucherService.js
│   ├── models/
│   │   ├── review.model.js    ← Mongoose schema
│   │   └── productLog.model.js
│   └── app.js
├── .env
├── package.json
└── README.md
```

### .env

```env
# Server
PORT=3000
NODE_ENV=development

# SQL Server
SQL_SERVER=localhost,1433
SQL_DATABASE=ecommerce_dbms
SQL_USER=sa
SQL_PASSWORD=MyPass@123

# MongoDB
MONGO_URI=mongodb://localhost:27017/ecommerce_mongo

# JWT
JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# VNPay Sandbox
VNPAY_TMN_CODE=your_tmn_code
VNPAY_HASH_SECRET=your_hash_secret
VNPAY_RETURN_URL=http://localhost:3000/api/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/api/v1/payments/vnpay/ipn
```

---

## 21. API tối thiểu để demo

Thứ tự implement — ưu tiên từ trên xuống:

```
Tuần 3 — Sprint 1 (Core):
  POST  /auth/register
  POST  /auth/login
  POST  /auth/refresh
  GET   /users/me
  GET   /categories
  GET   /products
  GET   /products/suggestions
  GET   /products/:id

Tuần 3 — Sprint 2 (Order + Transaction):
  GET   /cart/validate
  POST  /orders                    ← QUAN TRỌNG: có UPDLOCK
  GET   /orders/my-orders
  GET   /orders/:id
  PATCH /orders/:id/cancel

Tuần 3 — Sprint 3 (Admin + Review):
  GET   /admin/dashboard
  POST  /admin/products
  PATCH /admin/products/:id
  DELETE /admin/products/:id
  PATCH /admin/products/:id/stock
  GET   /reviews/products/:id
  POST  /reviews/products/:id

Tuần 4 — Bonus (Payment + Voucher):
  POST  /payments/vnpay/create
  GET   /payments/vnpay/return
  POST  /payments/vnpay/ipn
  POST  /vouchers/validate
  POST  /admin/vouchers
```

---

*Tài liệu này là phiên bản mở rộng từ API_SPEC.md ban đầu. Lưu tại `docs/API_SPEC_FULL.md`.*

---

## 22. Build PC, báo giá, lịch sử giá, bảo hành

Thêm ở giai đoạn 2 (migration `007_build_pc.sql`, seed `003_seed_components.sql`).

### Build PC — `/builder` (không cần đăng nhập)

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/builder/components` | Toàn bộ linh kiện có thông số, kèm danh sách ô (`cpu`, `mainboard`, `ram`, `gpu`, `storage`, `cooler`, `psu`, `case`) |
| GET | `/builder/presets` | Nhu cầu theo phần mềm: văn phòng, lập trình web, Android, đồ hoạ 3D, AI local |
| POST | `/builder/check` | Kiểm tra cấu hình. Body `{ items: [{ productId, quantity?, owned? }] }`; `owned: true` là linh kiện khách đã có, không tính tiền |
| POST | `/builder/auto` | Ráp cấu hình rẻ nhất còn hàng cho một nhu cầu. Body `{ presetId }` |
| POST | `/builder/advise` | Tư vấn từ câu mô tả. Body `{ text }` (≤ 500 ký tự). Dò nhu cầu bằng từ khoá (Docker, Android Studio, Blender, Stable Diffusion, Office…) và ngân sách ("20 triệu", "15-20tr", "25tr5", "20.000.000đ"), rồi ráp như `/builder/auto`. Trả thêm `advice { matched, budget, withinBudget, difference, notes }`. Không nhận ra nhu cầu → `preset: null` kèm `message`, không đoán. Giá luôn lấy từ kho |
| POST | `/builder/upgrade` | Gợi ý nâng cấp. Body `{ socket?, memoryType?, psuWatts?, maxGpuLengthMm?, cpuPowerW?, gpuPowerW?, hasM2Slot? }` |
| POST | `/builder/quotes` | Lưu báo giá giữ giá 48 giờ (đăng nhập thì gắn với tài khoản). Body `{ items, title? }` |
| GET | `/builder/quotes/:code` | Xem báo giá: giá báo, giá hiện tại, còn hạn hay không, kết quả kiểm tra |

Kết quả `check`:

```json
{
  "ok": false,
  "complete": true,
  "errors": [{ "code": "socket_mismatch", "message": "CPU dùng socket AM5 nhưng mainboard là socket LGA1700", "types": ["cpu", "mainboard"] }],
  "warnings": [{ "code": "psu_low_headroom", "message": "Nguồn 550 W hơi sát; nên dùng từ 650 W", "types": ["psu"] }],
  "estimatedPowerW": 475,
  "recommendedPsuW": 650
}
```

Mã lỗi: `too_many`, `socket_mismatch`, `memory_type_mismatch`, `memory_slots`, `m2_slots`, `form_factor`,
`gpu_length`, `cooler_socket`, `cooler_height`, `no_display_output`, `psu_too_weak`.
Cảnh báo: `no_cooler`, `psu_low_headroom`, `incomplete`.
Công suất ước tính = 75 W (mainboard, RAM, ổ, quạt) + CPU + card; nguồn nên dư 30%, làm tròn lên bội số 50 W.

### Giữ giá theo báo giá

- `POST /cart/quote` và `POST /orders` nhận thêm `quoteCode`.
- Mỗi dòng tính theo giá thấp hơn giữa giá hiện tại và giá báo, khi số lượng mua không vượt số lượng đã báo.
- `/cart/quote` trả `priceLock: { code, expiresAt }` hoặc `priceLockError: { code: "quote_expired" | "quote_not_found" }`,
  từng dòng có `listPrice`, `unitPrice`, `priceLocked`.
- `POST /orders` với báo giá hết hạn trả **410** `{ errors: { code: "quote_expired" } }` và không tạo đơn,
  để khách xem lại giá thay vì bị tính số tiền khác với số đã thấy. Đơn lưu mã ở cột `Orders.QuoteCode`.
- Báo giá không giữ hàng trong kho.

### Lịch sử giá

`GET /products/:id/price-history?days=180` (7–730 ngày):

```json
{
  "productId": 50003,
  "days": 180,
  "currentPrice": 4990000,
  "lowestPrice": 4990000,
  "highestPrice": 5490000,
  "points": [{ "price": 4990000, "oldPrice": 5490000, "changedAt": "2026-11-01T03:30:00.000Z" }]
}
```

Mốc giá được ghi trong cùng transaction với câu `INSERT`/`UPDATE` sản phẩm qua API, chỉ khi giá bán thay đổi.

### Bảo hành — `/warranties`

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/warranties/:serial` | Công khai (60 lần/15 phút) | Tên sản phẩm, ngày bắt đầu/kết thúc, `status: active/expired`, `daysLeft`. Không trả thông tin người mua |
| GET | `/warranties/me` | Khách | Bảo hành của các đơn của mình |
| POST | `/warranties/admin` | Admin | Body `{ serialNumber, orderId, productId, months, startDate? }` |

Quy tắc đăng ký: đơn phải ở trạng thái `confirmed`, `processing`, `shipped` hoặc `delivered`;
số serial của một sản phẩm không vượt số lượng đã mua (khoá `UPDLOCK, HOLDLOCK` để hai admin đăng ký cùng lúc không vượt);
serial trùng trả 409. Ngày hết hạn = ngày bắt đầu + số tháng − 1 ngày.

---

## 23. Vận hành: điều khoản, chính sách, tài khoản, giám sát

Thêm ở giai đoạn 3 (migration `008_account_deletion.sql`, `009_order_terms.sql`).

### Đặt hàng phải đồng ý điều khoản

`POST /orders` cần thêm `"acceptTerms": true` (Luật Thương mại điện tử 122/2025/QH15, Điều 12).
Thiếu thì trả **400** `{ errors: { code: "terms_required" } }`. Đơn lưu phiên bản điều khoản khách đã đồng ý
ở `Orders.TermsVersion` (lấy từ `STORE_TERMS_VERSION`), trả về trong chi tiết đơn là `termsVersion`.

### Thông tin cửa hàng — `GET /store/info` (công khai)

Thông tin người bán (`STORE_LEGAL_NAME`, `STORE_TAX_CODE`, `STORE_ADDRESS`, `STORE_PHONE`, `STORE_EMAIL`,
`STORE_REPRESENTATIVE`; `null` khi chưa cấu hình), phiên bản điều khoản, phí ship và mốc miễn phí, thời gian giao
(`DELIVERY_DAYS_LOCAL` cho `STORE_PROVINCE`, `DELIVERY_DAYS_OTHER` cho tỉnh khác), ưu đãi theo giá trị đơn,
thời hạn thanh toán VNPay, số ngày đổi trả (`RETURN_DAYS`), số ngày phản hồi khiếu nại (`COMPLAINT_RESPONSE_DAYS`).
Giao diện dùng endpoint này cho trang `#/chinh-sach/:slug`, chân trang và trang thanh toán, nên chính sách công bố
luôn khớp với cách hệ thống tính tiền.

### Tài khoản

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/auth/register` | Cần `"acceptPrivacy": true`; lưu `Users.PrivacyConsentAt`. Mật khẩu từ 8 ký tự; `phone` không bắt buộc |
| PATCH | `/users/me/password` | `{ oldPassword, newPassword }`; mật khẩu mới từ 8 ký tự và khác mật khẩu cũ; thu hồi refresh token (máy khác phải đăng nhập lại) |
| GET | `/users/me/export` | Toàn bộ dữ liệu cá nhân dạng JSON (hồ sơ, đơn, giỏ, báo giá, bảo hành, voucher đã dùng, đánh giá); không có mật khẩu, token |
| DELETE | `/users/me` | `{ password }`. Ẩn danh hồ sơ, khoá tài khoản, xoá giỏ và đánh giá, giữ đơn. 409 `open_orders` khi còn đơn chưa xong; 403 với admin |

### Giám sát

- `GET /health`: tiến trình còn chạy.
- `GET /health/ready`: kiểm tra SQL Server và MongoDB, trả 503 `DEGRADED` khi một trong hai lỗi.
- Lỗi 5xx ghi một dòng JSON vào log, có `errorId`. Ở production khách chỉ nhận thông báo chung kèm `errorId`.
