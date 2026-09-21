# 📋 Hướng dẫn nộp bài cuối kỳ — BinhTinhStore

Tài liệu này tóm tắt những gì đã hoàn thành và các bước cần thực hiện trước khi nộp lên LMS.

---

## ✅ Những gì đã hoàn thành

### Backend (Express + SQL Server + MongoDB)

- [x] Kết nối SQL Server qua `mssql` (export chuẩn `getPool`, `sql`)
- [x] Kết nối MongoDB qua `mongoose`
- [x] Schema SQL Server đầy đủ với constraints, indexes, và foreign keys
- [x] Seed script nạp dữ liệu mẫu thực tế
- [x] **Auth API**: đăng ký, đăng nhập, refresh token, đăng xuất (JWT)
- [x] **Product API**: CRUD, tìm kiếm, lọc, phân trang, gợi ý
- [x] **Order API**: tạo đơn hàng với transaction + UPDLOCK, xem, huỷ
- [x] **Cart API**: validate tồn kho
- [x] **Review API**: CRUD đánh giá lưu MongoDB, aggregation thống kê
- [x] **Voucher API**: validate, tạo mới
- [x] **Payment API**: tích hợp VNPay sandbox
- [x] **Category API**: xem và quản lý danh mục
- [x] **Analytics API**: dashboard thống kê doanh thu, top sản phẩm
- [x] **User API**: xem/cập nhật profile
- [x] Middleware: JWT guard, role guard, rate limiter, error handler
- [x] Audit log sản phẩm ghi vào MongoDB (`ProductLog`)

### Frontend (React + Vite + Tailwind CSS)

- [x] Giao diện Storefront: hero, danh mục, lọc/tìm kiếm sản phẩm
- [x] Giỏ hàng (CartDrawer) với localStorage
- [x] Xem nhanh sản phẩm (modal)
- [x] Tích hợp API đặt hàng thật (gọi backend SQL Server)
- [x] Admin Dashboard: thống kê, quản lý sản phẩm, đơn hàng
- [x] Responsive layout

### Database Scripts demo

- [x] SQL Server: Indexing, Query Processing, Transaction, Concurrency Control, Backup & Recovery
- [x] MongoDB: Indexing, Query Processing, Transaction, Concurrency Control, Backup & Recovery

### Tài liệu

- [x] README chính (kiến trúc, setup, API reference)
- [x] README backend (hướng dẫn setup chi tiết)
- [x] README frontend (hướng dẫn setup và cấu trúc)
- [x] DEMO_CHECKLIST.md (thứ tự demo trước giảng viên)
- [x] API_SPEC.md (tài liệu API đầy đủ)
- [x] Báo cáo PDF & PPTX (trong `final-deliverables/`)

---

## 📌 Việc cần làm trước khi nộp

### Bắt buộc

- [ ] **Chạy toàn bộ ứng dụng** trên máy mình ít nhất 1 lần thành công
- [ ] **Chụp screenshot thực** thay cho ảnh placeholder trong báo cáo PDF và PPTX
- [ ] **Chạy các script demo DBMS** trong `database-demo/` và chụp kết quả
- [ ] **Xác nhận tỷ lệ đóng góp** của từng thành viên trong báo cáo
- [ ] **Điền đầy đủ thông tin nhóm** (MSSV, họ tên) trong báo cáo và PPT

### Kiểm tra kỹ thuật

- [ ] File `.env` đã điền đúng `SQL_PASSWORD`, `SQL_SERVER`, `MONGO_URI`
- [ ] Chạy migration: `node run-migration.js`
- [ ] Chạy seed: `node run-seed.js`
- [ ] Backend khởi động không lỗi: `npm run dev`
- [ ] Frontend hiển thị sản phẩm từ API: `npm run dev`
- [ ] Đặt hàng thành công → kiểm tra trong SQL Server

### Đóng gói nộp bài

```bash
# Nén thư mục, loại bỏ node_modules và .env
zip -r BinhTinhStore_MSSV.zip . \
  --exclude "*/node_modules/*" \
  --exclude "*/.env" \
  --exclude "*/.git/*" \
  --exclude "*/dist/*"
```

**File nộp phải bao gồm:**
- `dbms-ecommerce-main/` (source code)
- `final-deliverables/DBMS_Final_Report_Completed.pdf`
- `final-deliverables/DBMS_Final_Presentation.pptx`

**Không được đưa vào:**
- `node_modules/` (có thể tái tạo bằng `npm install`)
- `.env` (chứa thông tin nhạy cảm)
- `.git/` (lịch sử git)

---

## 🎯 Đáp ứng tiêu chí chấm điểm

| Tiêu chí | Trạng thái | Ghi chú |
|---------|-----------|---------|
| Ứng dụng web hoạt động | ✅ | React + Express |
| Kiến trúc 3-tier / MVC | ✅ | Frontend → Backend → DB |
| Ít nhất 1 DBMS | ✅ | SQL Server + MongoDB (2 DBMS) |
| ≥ 5 chức năng (n=5) | ✅ | 9 chức năng được triển khai |
| INSERT | ✅ | Orders, Products, Vouchers, Reviews |
| DELETE | ✅ | Soft delete Products, hard delete Reviews |
| UPDATE | ✅ | Orders status, Products stock |
| Query điều kiện đơn | ✅ | WHERE ProductID = @id |
| Query điều kiện phức hợp | ✅ | Voucher validation |
| Query JOIN | ✅ | Orders + Users + Products + Categories |
| Query Subquery | ✅ | Item count trong danh sách đơn hàng |
| Query Aggregate | ✅ | SUM, COUNT, AVG — SQL + MongoDB |

---

*Tài liệu này chỉ dùng nội bộ nhóm — Không cần nộp lên LMS*
