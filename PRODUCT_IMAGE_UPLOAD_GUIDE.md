# Hướng Dẫn Upload Ảnh Sản Phẩm

## Cách sử dụng

### 1. **Backend - API Upload**

Endpoint để upload ảnh:
```
POST /api/v1/products/admin/upload
```

**Yêu cầu:**
- Authentication: Cần token JWT (admin role)
- Content-Type: `multipart/form-data`
- Field: `image` (file ảnh)

**Ví dụ cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/products/admin/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "imageUrl": "/uploads/product-1715066400000-123456789.jpg",
    "filename": "product-1715066400000-123456789.jpg"
  }
}
```

### 2. **Frontend - Component Upload**

#### Import Component
```jsx
import ProductImageUpload from '../components/ProductImageUpload'
import { uploadProductImage } from '../api/client'
```

#### Sử dụng trong Form
```jsx
<ProductImageUpload
  onImageUploaded={(imageUrl) => {
    // Xử lý URL ảnh sau khi upload thành công
    setFormData(prev => ({
      ...prev,
      images: imageUrl
    }))
  }}
  token={authToken}
  disabled={isLoading}
/>
```

### 3. **Hiển Thị Ảnh trên Sản Phẩm**

Component `ProductCard` sẽ tự động hiển thị ảnh nếu product có field `images`:

```jsx
<ProductVisual product={product} className="aspect-[5/4]" />
```

Nếu `product.images` tồn tại, nó sẽ hiển thị ảnh thực; nếu không, sẽ hiển thị icon.

### 4. **Quản Lý Ảnh Sản Phẩm**

Sử dụng modal `ProductManagementModal`:

```jsx
<ProductManagementModal
  product={selectedProduct}
  token={authToken}
  onClose={() => setShowModal(false)}
  onSave={async (formData) => {
    // Gọi API để lưu sản phẩm với ảnh
    await updateProduct(selectedProduct.id, formData, authToken)
  }}
/>
```

## Yêu cầu Kỹ Thuật

### Backend
- **Middleware Multer**: Xử lý upload file
- **Static File Serving**: Serve ảnh từ folder `/uploads`
- **Storage**: Lưu trữ file trên disk
- **Validation**: 
  - Chỉ chấp nhận ảnh (JPEG, PNG, GIF, WebP)
  - Giới hạn 5MB

### Frontend
- **FormData API**: Gửi multipart form data
- **File Input**: Cho phép chọn file
- **Preview**: Xem trước ảnh trước upload
- **Progress**: Hiển thị trạng thái upload

## Cấu Hình Biến Môi Trường

File `.env` không cần thêm biến nào, nhưng bạn có thể tùy chỉnh:

```env
# Backend
UPLOAD_DIR=/path/to/uploads  # Nếu muốn đặt folder khác
MAX_FILE_SIZE=5242880        # 5MB (bytes)

# Frontend
VITE_API_BASE_URL=/api/v1
```

## Cây Folder Cấu Trúc

```
backend-app/
├── uploads/                    # Folder lưu ảnh
│   └── product-TIMESTAMP.jpg
├── src/
│   ├── middlewares/
│   │   └── upload.js          # Multer configuration
│   ├── routes/
│   │   └── product.route.js   # Upload endpoint
│   └── controllers/
│       └── product.controller.js  # Upload handler

frontend-app/
├── src/
│   ├── components/
│   │   ├── ProductImageUpload.jsx    # Upload component
│   │   └── ProductManagementModal.jsx # Product form
│   └── api/
│       └── client.js          # uploadProductImage function
```

## Xử Lý Lỗi

### Lỗi Upload Phổ Biến

1. **"No file uploaded"**
   - Nguyên nhân: Không chọn file
   - Giải pháp: Chọn file trước khi submit

2. **"Chỉ chấp nhận file ảnh"**
   - Nguyên nhân: File không phải ảnh
   - Giải pháp: Chọn file với định dạng: JPEG, PNG, GIF, WebP

3. **"File ảnh phải nhỏ hơn 5MB"**
   - Nguyên nhân: File quá lớn
   - Giải pháp: Nén ảnh hoặc chọn ảnh khác

4. **401 Unauthorized**
   - Nguyên nhân: Token JWT không hợp lệ/hết hạn
   - Giải pháp: Đăng nhập lại

5. **403 Forbidden**
   - Nguyên nhân: User không phải admin
   - Giải pháp: Chỉ admin mới có quyền upload

## Tính Năng Nâng Cao (Optional)

### Drag & Drop
```jsx
const handleDragOver = (e) => {
  e.preventDefault()
  e.currentTarget.classList.add('border-red-500')
}

const handleDrop = (e) => {
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  handleFileSelect({ target: { files: [file] } })
}
```

### Multiple Images
```jsx
// Thay đổi dalam upload.js
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('images', 5)  // Cho phép 5 ảnh
```

### Database Integration
```javascript
// Trong product service, lưu URL ảnh vào database
await updateProduct(id, {
  ...formData,
  images: imageUrl  // Lưu URL vào SQL Server
})
```

## Kiểm Thử

### Test Upload API
```bash
# Tạo test image
echo "fake image" > test.jpg

# Upload
curl -X POST http://localhost:3000/api/v1/products/admin/upload \
  -H "Authorization: Bearer $(JWT_TOKEN)" \
  -F "image=@test.jpg"
```

### Test Frontend
1. Mở Admin Dashboard
2. Click "Chỉnh sửa" trên sản phẩm
3. Kéo/nhấp ảnh vào upload area
4. Xác nhận ảnh hiển thị trong preview

## Troubleshooting

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-----------|----------|
| 404 upload endpoint | Route không được đăng ký | Kiểm tra `product.route.js` |
| EACCES permission denied | Folder uploads không có quyền ghi | `chmod 755 uploads/` |
| Image URL trống | File upload nhưng không trả URL | Kiểm tra response format |
| Ảnh không hiển thị | Path URL sai | Kiểm tra static file serving |

---

**Tác giả**: BinhTinhStore Development Team  
**Phiên bản**: 1.0.0  
**Cập nhật lần cuối**: 7/5/2026
