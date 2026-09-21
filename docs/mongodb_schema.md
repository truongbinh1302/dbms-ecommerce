# MongoDB Schema Design – E-commerce System

## 1. Overview

Trong hệ thống E-commerce, MongoDB được sử dụng như một cơ sở dữ liệu NoSQL nhằm tận dụng khả năng lưu trữ linh hoạt (schema-flexible) và tối ưu hiệu năng truy vấn đọc.

Khác với SQL Server (sử dụng mô hình quan hệ và chuẩn hóa dữ liệu), MongoDB sử dụng mô hình document-based, cho phép nhúng (embedding) dữ liệu để giảm thiểu phép JOIN và cải thiện hiệu năng.

---

## 2. Design Principles

Thiết kế MongoDB schema dựa trên các nguyên tắc:

* Denormalization (phi chuẩn hóa dữ liệu)
* Embedding thay vì referencing khi phù hợp
* Tối ưu cho read-heavy workload (truy vấn đọc nhiều)
* Giảm số lượng query và JOIN

---

## 3. Collections Design

### 3.1 Users Collection

Lưu trữ thông tin người dùng (bao gồm cả Customer và Administrator).

```json
{
  "_id": ObjectId,
  "username": "john_doe",
  "email": "john@example.com",
  "phone": "0123456789",
  "role": "customer",
  "createdAt": ISODate,
  "favorite": [ObjectId]
}
```

**Giải thích:**

* `role`: phân biệt customer/admin (thay thế inheritance trong SQL)
* `favorite`: danh sách sản phẩm yêu thích

---

### 3.2 Categories Collection

```json
{
  "_id": ObjectId,
  "name": "Electronics",
  "description": "Electronic devices"
}
```

---

### 3.3 Products Collection

```json
{
  "_id": ObjectId,
  "name": "iPhone 15",
  "description": "Latest Apple smartphone",
  "price": 2000,
  "stock": 50,
  "category": {
    "categoryId": ObjectId,
    "name": "Electronics"
  },
  "createdAt": ISODate
}
```

**Giải thích:**

* Category được embed để giảm JOIN
* Giúp truy vấn sản phẩm theo category nhanh hơn

---

### 3.4 Orders Collection

```json
{
  "_id": ObjectId,
  "userId": ObjectId,
  "orderDate": ISODate,
  "shipAddress": "Ho Chi Minh City",
  "status": "pending",
  "total": 4000,
  "items": [
    {
      "productId": ObjectId,
      "name": "iPhone 15",
      "price": 2000,
      "quantity": 2
    }
  ]
}
```

**Giải thích:**

* `items` được embed (thay cho bảng OrderItems)
* Giảm JOIN → tăng hiệu năng đọc
* Phù hợp với truy vấn lấy chi tiết đơn hàng

---

### 3.5 Reviews Collection (Optional)

```json
{
  "_id": ObjectId,
  "productId": ObjectId,
  "userId": ObjectId,
  "rating": 5,
  "comment": "Excellent product",
  "createdAt": ISODate
}
```

---

## 4. Indexing Strategy

Để tối ưu hiệu năng truy vấn, các index sau được sử dụng:

```javascript
db.products.createIndex({ name: 1 })

db.products.createIndex({ "category.categoryId": 1, price: 1 })

db.orders.createIndex({ userId: 1 })

db.orders.createIndex({ "items.productId": 1 })
```

---

## 5. Comparison with SQL Schema

| SQL Server         | MongoDB                |
| ------------------ | ---------------------- |
| Normalized tables  | Denormalized documents |
| JOIN operations    | Embedding              |
| Fixed schema       | Flexible schema        |
| Strong consistency | Flexible consistency   |

---

## 6. Advantages of MongoDB Design

* Giảm số lượng JOIN
* Tăng tốc độ truy vấn đọc
* Linh hoạt khi thay đổi cấu trúc dữ liệu
* Phù hợp với hệ thống có dữ liệu thay đổi nhanh

---

## 7. Limitations

* Dữ liệu có thể bị trùng lặp (do embedding)
* Khó đảm bảo tính nhất quán như SQL
* Update phức tạp hơn trong một số trường hợp

---

## 8. Conclusion

Thiết kế MongoDB sử dụng embedding cho các quan hệ chính (Orders – OrderItems, Products – Categories) giúp tối ưu hiệu năng truy vấn và phù hợp với đặc điểm của hệ thống E-commerce.

MongoDB không thay thế hoàn toàn SQL Server, nhưng là một giải pháp bổ sung hiệu quả trong các hệ thống cần khả năng mở rộng và truy vấn linh hoạt.

---
