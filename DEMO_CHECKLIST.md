# ✅ Checklist Demo — Đồ án DBMS BinhTinhStore

Thực hiện đúng thứ tự các bước dưới đây để demo đầy đủ trước giảng viên.

---

## 1. Chuẩn bị Database

### SQL Server

1. Mở **SSMS** hoặc **Azure Data Studio**, kết nối vào SQL Server.
2. Chạy script tạo schema:
   ```
   database/migrations/001_create_schema.sql
   ```
3. Chạy script nạp dữ liệu mẫu:
   ```
   database/seeds/002_seed_demo_data.sql
   ```
4. Xác nhận số lượng bản ghi (chạy query kiểm tra):
   ```sql
   SELECT 'Users'      AS [Table], COUNT(*) AS [Count] FROM Users
   UNION ALL
   SELECT 'Categories',              COUNT(*) FROM Categories
   UNION ALL
   SELECT 'Products',                COUNT(*) FROM Products
   UNION ALL
   SELECT 'Orders',                  COUNT(*) FROM Orders
   UNION ALL
   SELECT 'OrderItems',              COUNT(*) FROM OrderItems
   UNION ALL
   SELECT 'Vouchers',                COUNT(*) FROM Vouchers;
   ```

### MongoDB

1. Mở **MongoDB Compass** hoặc `mongosh`.
2. Kết nối: `mongodb://admin:adminpassword@localhost:27017/?authSource=admin`
3. Vào database `ecommerce_mongo`, xác nhận có collection: `reviews`, `productlogs`.
4. (Tùy chọn) Chạy setup script:
   ```bash
   node database-demo/mongo_db_demo/00_setup_mongo.js
   ```

---

## 2. Chạy ứng dụng

### Backend

```bash
cd backend-app
cp .env.example .env        # Lần đầu setup
# Chỉnh sửa .env cho đúng thông tin DB
npm install                 # Lần đầu setup
npm run dev
```

Kiểm tra: `GET http://localhost:3000/health` → `{ "status": "ok" }`

### Frontend

```bash
cd frontend-app
npm install                 # Lần đầu setup
npm run dev
```

Mở trình duyệt: `http://localhost:5173`

---

## 3. Demo các chức năng ứng dụng

### Đăng nhập (qua Postman hoặc giao diện web)

```
POST http://localhost:3000/api/v1/auth/login
Body: { "email": "customer@btstore.local", "password": "password" }
```

Lưu `accessToken` vào browser:
```js
localStorage.setItem('bt_access_token', '<ACCESS_TOKEN>')
```

### Luồng khách hàng (demo theo thứ tự)

| # | Bước | Điểm demo |
|---|------|-----------|
| 1 | Mở trang chủ | Danh sách sản phẩm load từ SQL Server API |
| 2 | Lọc sản phẩm theo danh mục / giá | Query với composite condition |
| 3 | Xem chi tiết sản phẩm | Query với JOIN (Products + Categories) |
| 4 | Thêm vào giỏ hàng | Validate tồn kho qua API |
| 5 | Áp dụng mã voucher | Query voucher với multi-condition |
| 6 | Đặt hàng | INSERT transaction + UPDATE stock |
| 7 | Xem lịch sử đơn hàng | Query với subquery (item count) |
| 8 | Đánh giá sản phẩm | INSERT vào MongoDB |

### Luồng Admin (demo theo thứ tự)

| # | Bước | Điểm demo |
|---|------|-----------|
| 1 | Mở Admin Dashboard | Aggregate query: SUM doanh thu, COUNT đơn hàng |
| 2 | Xem top sản phẩm | Query JOIN + GROUP BY + aggregate |
| 3 | Thêm sản phẩm mới | INSERT vào SQL Server |
| 4 | Cập nhật tồn kho | UPDATE + ghi audit log MongoDB |
| 5 | Xoá sản phẩm | Soft DELETE (IsDeleted = 1) |
| 6 | Cập nhật trạng thái đơn hàng | UPDATE Orders |
| 7 | Tạo voucher mới | INSERT vào Vouchers |

---

## 4. Demo các chủ đề DBMS

### 4.1 Indexing

```bash
# SQL Server
database-demo/sql_sv_demo/indexing_demo.sql

# MongoDB
node database-demo/mongo_db_demo/indexing_demo.js
```

**Cần chụp màn hình:** Kết quả trước và sau khi tạo index (logical reads, elapsed time, docsExamined).

### 4.2 Query Processing

```bash
# SQL Server — Xem Execution Plan
database-demo/sql_sv_demo/query_processing_demo.sql

# MongoDB — Explain output
node database-demo/mongo_db_demo/query_processing_demo.js
```

**Cần chụp màn hình:** Execution plan (SQL Server), aggregate pipeline explain (MongoDB).

### 4.3 Transaction

```bash
# SQL Server
database-demo/sql_sv_demo/03_transaction_demo.sql

# MongoDB (cần replica set)
node database-demo/mongo_db_demo/03_transaction_demo.js
```

**Cần chụp màn hình:** Kết quả COMMIT thành công và ROLLBACK khi có lỗi.

### 4.4 Concurrency Control

```bash
# SQL Server — Dùng 2 cửa sổ SSMS
database-demo/sql_sv_demo/04_concurrency_control_demo.sql

# MongoDB
node database-demo/mongo_db_demo/04_concurrency_control_demo.js
```

**Cần chụp màn hình:** Kết quả ngăn chặn oversell (đặt quá tồn kho).

### 4.5 Backup & Recovery

```bash
# SQL Server
database-demo/sql_sv_demo/05_backup_recovery_demo.sql
# (Chỉnh sửa đường dẫn backup trong script trước khi chạy)

# MongoDB — Xem hướng dẫn
database-demo/mongo_db_demo/05_backup_recovery_demo.md
```

**Cần chụp màn hình:** Trạng thái trước xoá dữ liệu → sau xoá → sau khi restore.

---

## 5. Kiểm tra 8 loại Query/Update (theo yêu cầu đề bài)

Có thể verify trực tiếp qua ứng dụng hoặc chạy query thủ công trong SSMS:

| Yêu cầu | Demo qua | Query ví dụ |
|---------|----------|-------------|
| **a. INSERT** | Đặt hàng, thêm sản phẩm, tạo voucher | `INSERT INTO Orders ...` |
| **b. DELETE** | Xoá sản phẩm (Admin) | `UPDATE Products SET IsDeleted = 1` |
| **c. UPDATE** | Cập nhật trạng thái đơn, tồn kho | `UPDATE Orders SET Status = ...` |
| **d. Single condition** | Xem chi tiết sản phẩm | `WHERE ProductID = @id AND IsDeleted = 0` |
| **e. Composite condition** | Validate voucher | `WHERE IsActive = 1 AND StartDate <= GETDATE() AND EndDate >= GETDATE()` |
| **f. JOIN** | Chi tiết đơn hàng | `FROM Orders o JOIN Users u ON o.UserID = u.UserID` |
| **g. Subquery** | Danh sách đơn hàng | `(SELECT COUNT(*) FROM OrderItems WHERE OrderID = o.OrderID) AS itemCount` |
| **h. Aggregate** | Admin Dashboard | `SUM(oi.Quantity * oi.UnitPrice)`, `COUNT(*)`, `AVG()` |

---

## 6. Trước khi nộp bài

- [ ] Thay thế screenshot placeholder trong báo cáo/PPT bằng ảnh chụp thực trên máy
- [ ] Kiểm tra thông tin đóng góp của từng thành viên
- [ ] Xác nhận `SQL_PASSWORD` và `MONGO_URI` đúng trong `.env`
- [ ] Nén file nộp: chỉ gồm source code, database scripts, báo cáo PDF, file PPTX
- [ ] **Loại bỏ `node_modules/`** trước khi nén (dùng `npm install` để tái tạo)

```bash
# Lệnh nén (macOS/Linux)
zip -r BinhTinhStore_Submit.zip . \
  --exclude "*/node_modules/*" \
  --exclude "*/.env" \
  --exclude "*/.git/*"
```

---

*Cập nhật lần cuối: Tháng 5/2026 — BinhTinhStore DBMS Assignment*
