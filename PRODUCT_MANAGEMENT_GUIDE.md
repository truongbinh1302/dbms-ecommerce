# Hướng Dẫn: Thêm, Sửa, Xóa Sản Phẩm với Upload Ảnh

## 📱 Giao Diện người dùng

### 1. **Trang Chủ (CustomerSite)**
   - Nhấp vào nút **"Quản trị demo"** hoặc **"Quản lý sản phẩm"** 
   - Hoặc từ Admin Dashboard → click **"Quản lý sản phẩm"**

### 2. **Trang Quản Lý Sản Phẩm (ProductManagement)**
   - Hiển thị danh sách sản phẩm từ database
   - Có tính năng:
     - **Tìm kiếm** sản phẩm theo tên
     - **Phân trang** (12 sản phẩm/trang)
     - **Thêm sản phẩm** (nút "Thêm sản phẩm" ở góc phải)
     - **Sửa sản phẩm** (nút "Sửa" trên mỗi card)
     - **Xóa sản phẩm** (nút "Xóa" - chưa hoàn thành)

### 3. **Modal Tạo/Sửa Sản Phẩm**
   - **Các trường nhập:**
     - Tên sản phẩm (bắt buộc)
     - Thương hiệu
     - Giá bán (bắt buộc)
     - Giá cũ (để hiển thị discount)
     - Tồn kho
     - Danh mục (15 loại sản phẩm)
     - Mô tả sản phẩm
     - **Upload ảnh** (kéo/chọn file)
   
   - **Nút hành động:**
     - "Hủy" - Đóng modal mà không lưu
     - "Lưu sản phẩm" - Gửi lên API

## 🔄 Quy Trình Làm Việc

### **Thêm Sản Phẩm Mới**

```
1. Vào trang Quản Lý Sản Phẩm
2. Click "Thêm sản phẩm"
3. Điền form:
   - Tên: "Laptop ASUS TUF Gaming 16"
   - Thương hiệu: "ASUS"
   - Giá: 25000000
   - Giá cũ: 30000000
   - Tồn kho: 50
   - Danh mục: "Gaming Laptops"
   - Mô tả: "Laptop gaming hiệu suất cao..."
4. Upload ảnh:
   - Kéo file ảnh vào upload area
   - Hoặc click để chọn file
   - Chờ upload hoàn thành
5. Click "Lưu sản phẩm"
6. Sản phẩm được tạo trong database ✅
```

### **Sửa Sản Phẩm Hiện Có**

```
1. Tìm sản phẩm cần sửa (dùng search nếu cần)
2. Click nút "Sửa" trên card sản phẩm
3. Modal mở với dữ liệu cũ đã được điền sẵn
4. Cập nhật các trường cần thay đổi
5. Nếu muốn đổi ảnh:
   - Upload ảnh mới (sẽ ghi đè ảnh cũ)
6. Click "Lưu sản phẩm"
7. Dữ liệu được cập nhật ✅
```

### **Xóa Sản Phẩm** (Chưa hoàn thành)
```
Click nút "Xóa" sẽ show alert (TODO)
Cần thêm: 
  - xác nhận trước khi xóa
  - gọi API DELETE
  - reload danh sách
```

## 🗄️ Dữ Liệu Được Lưu

Khi bạn nhấp **"Lưu sản phẩm"**, dữ liệu được gửi lên API:

```javascript
{
  "name": "Tên sản phẩm",
  "brand": "Thương hiệu",
  "description": "Mô tả",
  "price": 25000000,
  "oldPrice": 30000000,
  "stock": 50,
  "categoryId": 2,
  "images": ["/uploads/product-TIMESTAMP-RANDOM.jpg"],
  "specs": []
}
```

**API Endpoints:**
- **POST** `/api/v1/products/admin/products` → Tạo sản phẩm
- **PATCH** `/api/v1/products/admin/products/{id}` → Cập nhật sản phẩm
- **POST** `/api/v1/products/admin/upload` → Upload ảnh

**Database Fields (SQL Server):**
```sql
Products (
  ProductID INT,
  Name NVARCHAR(255),
  Slug NVARCHAR(255),
  Brand NVARCHAR(100),
  Description NVARCHAR(MAX),
  Price DECIMAL(18,2),
  OldPrice DECIMAL(18,2),
  Stock INT,
  CategoryID INT,
  Specs NVARCHAR(MAX), -- JSON
  Images NVARCHAR(MAX), -- JSON array
  IsFeatured BIT,
  Rating DECIMAL(3,1),
  ReviewsCount INT,
  CreatedAt DATETIME,
  UpdatedAt DATETIME,
  IsDeleted BIT
)
```

## 📸 Upload Ảnh

### **Điều Kiện Chấp Nhận:**
- Định dạng: JPEG, PNG, GIF, WebP
- Kích thước: Tối đa 5MB
- Hình ảnh được lưu vào folder `/uploads`

### **URL Ảnh:**
```
/uploads/product-1715066400000-123456789.jpg
```

### **Hiển Thị Trên Frontend:**
- Ảnh được hiển thị trên **ProductCard** tự động
- Nếu không có ảnh, sẽ hiển thị icon thay thế

### **Công Thức Upload Ảnh:**

```javascript
// 1. Chọn file
const file = document.getElementById('imageInput').files[0]

// 2. Tạo FormData
const formData = new FormData()
formData.append('image', file)

// 3. Upload
fetch('/api/v1/products/admin/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: formData
})
.then(res => res.json())
.then(data => {
  console.log(data.data.imageUrl) // /uploads/product-xxx.jpg
})
```

## 🔐 Yêu Cầu Xác Thực

Bạn cần **JWT token** để:
- Thêm sản phẩm
- Sửa sản phẩm
- Upload ảnh

**Token được lưu tại:**
```javascript
localStorage.getItem('bt_access_token')
```

**Cách lấy token:**
1. Đăng nhập với tài khoản Admin
2. Token sẽ được lưu tự động
3. Frontend sẽ tự gửi token trong request

## 📊 Danh Mục Sản Phẩm

Có 15 danh mục có sẵn:

| ID | Tên | 
|----|----|
| 1 | Gaming PC |
| 2 | Gaming Laptops |
| 3 | Office Laptops |
| 4 | Monitors |
| 5 | Keyboards |
| 6 | Mice |
| 7 | Headsets |
| 8 | Components |
| 9 | Storage |
| 10 | Networking |
| 11 | Cameras |
| 12 | Printers |
| 13 | Chairs |
| 14 | Smart Devices |
| 15 | Accessories |

## ✅ Quy Trình Kiểm Thử

### Test 1: Tạo sản phẩm mới
```
✅ Điền tất cả trường bắt buộc
✅ Upload ảnh thành công
✅ Click lưu
✅ Sản phẩm xuất hiện trên trang chủ
✅ Ảnh hiển thị đúng
```

### Test 2: Sửa sản phẩm
```
✅ Click "Sửa" trên sản phẩm
✅ Form điền đầy đủ dữ liệu cũ
✅ Thay đổi giá/tên/ảnh
✅ Click lưu
✅ Dữ liệu cập nhật trên trang chủ
```

### Test 3: Upload ảnh
```
✅ Kéo ảnh vào upload area
✅ Hoặc click chọn file
✅ Xem preview ảnh
✅ Upload hoàn thành
✅ Ảnh hiển thị trong modal
```

## 🐛 Xử Lý Lỗi

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-----------|----------|
| "401 Unauthorized" | Token hết hạn/không hợp lệ | Đăng nhập lại |
| "Chỉ chấp nhận file ảnh" | Định dạng sai | Dùng JPEG/PNG/GIF/WebP |
| "File ảnh phải nhỏ hơn 5MB" | File quá lớn | Nén ảnh lại |
| "Vui lòng nhập tên sản phẩm" | Tên rỗng | Nhập tên sản phẩm |
| "API Error 500" | Lỗi server | Kiểm tra backend logs |

## 🔧 Cấu Hình Backend

**File: `backend-app/src/middlewares/upload.js`**
- Cấu hình multer
- Định dạng ảnh cho phép
- Giới hạn kích thước file

**File: `backend-app/src/routes/product.route.js`**
- Endpoint upload: `POST /admin/upload`
- Endpoint tạo: `POST /admin/products`
- Endpoint sửa: `PATCH /admin/products/:id`

**File: `backend-app/src/app.js`**
- Static file serving: `/uploads`

## 📝 Ghi Chú

1. **Ảnh được lưu trên disk server** - Không phải cloud
2. **URL ảnh là tương đối** - Tự động chuyển sang domain
3. **Slug tự động tạo** - Từ tên sản phẩm
4. **Dữ liệu đồng bộ real-time** - Sau khi lưu thành công
5. **Database tự động cập nhật** - SQL Server + MongoDB log

---

**Tác giả**: BinhTinhStore Development Team  
**Phiên bản**: 1.0.0  
**Cập nhật**: 7/5/2026
