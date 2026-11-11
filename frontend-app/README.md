# Frontend - BinhTinhStore

Frontend dùng **React + Vite**, gồm giao diện storefront cho khách hàng và giao diện quản trị cho admin.

---

## Chạy frontend

Từ thư mục gốc `dbms-ecommerce-main`:

```bash
cp frontend-app/.env.example frontend-app/.env
cd frontend-app
npm install
npm run dev
```

Trên Windows PowerShell:

```powershell
Copy-Item frontend-app\.env.example frontend-app\.env
cd frontend-app
npm install
npm run dev
```

Frontend chạy tại:

```text
http://localhost:5173
```

Backend cần chạy song song tại:

```text
http://localhost:3000
```

---

## File `.env`

Mặc định nên dùng:

```env
VITE_API_BASE_URL=/api/v1
```

`vite.config.js` đã proxy `/api` và `/uploads` sang backend `http://localhost:3000`.

Nếu không muốn dùng proxy, đổi thành:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

Khi đó backend cần `CORS_ORIGINS=http://localhost:5173` trong `backend-app/.env` để trình duyệt gửi cookie
refresh token (`bt_refresh`, httpOnly) sang API khác origin; thiếu dòng này thì sau khi access token hết hạn
(15 phút) bạn sẽ phải đăng nhập lại.

Sau khi sửa `.env`, restart lại `npm run dev`.

---

## Đăng nhập demo

| Quyền | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@btstore.local` | `password` |
| Customer | `customer@btstore.local` | `password` |

Khi đăng nhập admin thành công, nút quản lý/quản trị sản phẩm sẽ hiện trên giao diện.

Nếu browser còn lưu session cũ, xóa localStorage các key sau rồi đăng nhập lại:

```text
bt_access_token
bt_refresh_token
bt_user
```

---

## Thanh toán VNPay

Khi chọn VNPay, frontend gọi backend tạo `paymentUrl`, sau đó chuyển sang trang thanh toán VNPay. Nếu không thấy QR ngay trong shop thì không phải lỗi chạy frontend; bản code hiện tại chưa render QR nội bộ trong modal.

---

## Lệnh kiểm tra

```bash
npm run lint
npm run build
```

