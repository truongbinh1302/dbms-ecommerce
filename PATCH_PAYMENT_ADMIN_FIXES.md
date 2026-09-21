# Payment + Admin Product Management Fixes

Các thay đổi đã áp dụng trong bản này:

## Frontend

- `src/api/client.js`
  - Tự lấy `bt_access_token` từ `localStorage` nếu component không truyền token.
  - Lưu `bt_access_token`, `bt_refresh_token`, `bt_user` sau login/register.
  - Tự refresh access token một lần khi gặp lỗi 401/expired token.
  - Thêm API `register`, `fetchCategories`, `deleteProduct`.
  - Sửa upload ảnh dùng `FormData` đúng cách và không set `Content-Type` thủ công.

- `src/components/AuthModal.jsx`
  - Không còn gọi cứng `/api/v1`; dùng API client nên chạy được cả local và port-forward.
  - Sau login/register, thông tin user/token được lưu đồng bộ.

- `src/App.jsx`
  - Đồng bộ token sau khi login/logout, giúp trang quản lý sản phẩm có token admin ngay ở local.

- `src/pages/ProductManagement.jsx`
  - Thêm xóa sản phẩm thật qua API `DELETE /api/v1/products/admin/products/:id`.
  - Thêm/sửa sản phẩm dùng token admin mới nhất từ localStorage.
  - Load danh mục từ SQL Server qua `/api/v1/categories` thay vì hard-code hoàn toàn.
  - Hiển thị cảnh báo nếu chưa có token admin.

- `src/components/ProductManagementModal.jsx`
  - Nhận danh mục từ database.
  - Preview ảnh upload ổn định hơn.

- `src/components/ProductImageUpload.jsx`
  - Tự fallback token từ localStorage.
  - Thông báo rõ khi token admin hết hạn.

- `src/components/StoreGlyph.jsx`
  - Thêm icon `settings`, `edit`, `trash`, `image`, `cloud-upload`.

- `vite.config.js`
  - Thêm proxy `/uploads` sang backend để ảnh upload hiển thị được khi chạy frontend local.

## Database

- Thêm file `database/migrations/002_admin_product_upload_patch.sql`.
  - Chạy file này nếu database cũ thiếu cột `Images`, `PaymentStatus`, `VNPayTxnRef`, `UpdatedAt`, `Rating`, `ReviewsCount`...
  - File này không drop bảng và không xóa dữ liệu.

## Chạy lại sau khi nhận bản fix

```bash
cd dbms-env
docker compose up -d

cd ../backend-app
npm install
npm run dev

cd ../frontend-app
npm install
npm run dev
```

Nếu database cũ đã có dữ liệu, chỉ cần mở SSMS chạy thêm:

```sql
-- database/migrations/002_admin_product_upload_patch.sql
```

## Test admin

1. Đăng nhập bằng admin.
2. Vào `Quản lý sản phẩm`.
3. Thử upload ảnh, thêm sản phẩm, sửa sản phẩm, xóa sản phẩm.
4. Nếu báo token hết hạn, logout/login lại bằng admin.
