# Backend - BinhTinhStore API

Backend dùng **Node.js + Express**, kết nối **SQL Server** cho dữ liệu quan hệ và **MongoDB** cho review/audit log.

---

## Chạy backend lần đầu

Từ thư mục gốc `dbms-ecommerce-main`:

```bash
cp backend-app/.env.example backend-app/.env
```

Trên Windows PowerShell:

```powershell
Copy-Item backend-app\.env.example backend-app\.env
```

Khởi động database bằng Docker:

```bash
cd dbms-env
docker compose up -d
cd ..
```

Cài dependencies và tạo dữ liệu:

```bash
cd backend-app
npm install
node run-migration.js
node run-seed.js
node fix-password.js
```

Chạy API:

```bash
npm run dev
```

API chạy tại:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

---

## File `.env` mẫu

Với Docker mặc định của project, `backend-app/.env` nên là:

```env
NODE_ENV=development
PORT=3000

SQL_SERVER=localhost
SQL_PORT=1433
SQL_DATABASE=ecommerce_dbms
SQL_USER=sa
SQL_PASSWORD=SuperStrongPassword123!
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERT=true

MONGO_URI=mongodb://admin:adminpassword@localhost:27017/ecommerce_mongo?authSource=admin

JWT_ACCESS_SECRET=dev_access_secret_change_me
JWT_REFRESH_SECRET=dev_refresh_secret_change_me
JWT_ACCESS_EXPIRES=2h
JWT_REFRESH_EXPIRES=7d

CLIENT_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000

VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_RETURN_URL=http://localhost:3000/api/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/api/v1/payments/vnpay/ipn
```

---

## Tài khoản demo

| Quyền | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@btstore.local` | `password` |
| Customer | `customer@btstore.local` | `password` |

Nếu admin bị invalid, chạy:

```bash
node fix-password.js
```

---

## Migration

Database mới:

```bash
node run-migration.js
node run-seed.js
node fix-password.js
```

Database đã có dữ liệu: chỉ cần chạy lại `node run-migration.js`. Lệnh này bỏ qua
`001_create_schema.sql` (file xoá và tạo lại mọi bảng) và áp các migration mới hơn,
dữ liệu được giữ nguyên.

Muốn tạo lại từ đầu (**xoá hết dữ liệu**): `node run-migration.js --reset`, rồi chạy lại `node run-seed.js`.
Chỉ chạy `run-seed.js` một lần trên database mới; chạy lại sẽ thêm trùng đơn hàng mẫu.

Lưu ý: `003_fix_admin_login.sql` đặt lại mật khẩu admin demo thành `password` mỗi lần chạy migration.
Khi triển khai thật phải bỏ file này hoặc đổi mật khẩu ngay sau khi migrate.

---

## VNPay

Endpoint tạo link thanh toán:

```text
POST /api/v1/payments/vnpay/create
```

Cần điền credential sandbox thật:

```env
VNPAY_TMN_CODE=your_sandbox_tmn_code
VNPAY_HASH_SECRET=your_sandbox_hash_secret
VNPAY_RETURN_URL=http://localhost:3000/api/v1/payments/vnpay/return
VNPAY_IPN_URL=http://localhost:3000/api/v1/payments/vnpay/ipn
```

Bản code hiện tại tạo `paymentUrl` rồi frontend redirect sang cổng VNPay. Nếu muốn QR hiện ngay trong shop, frontend cần thêm component/modal QR từ `paymentUrl` hoặc tích hợp luồng VNPay QR native riêng.

---

## Lệnh kiểm tra

```bash
# Kiểm tra syntax backend
find src -name "*.js" -print0 | xargs -0 -n 20 node --check

# Kiểm tra package audit production
npm audit --omit=dev
```

