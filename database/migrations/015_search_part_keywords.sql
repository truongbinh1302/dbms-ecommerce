/*
  Tìm kiếm: trước đây mọi sản phẩm danh mục "components" mang chung từ khoá "cpu vga card do hoa mainboard",
  nên gõ "card đồ hoạ" ra cả CPU, RAM, mainboard. Nay mỗi linh kiện có từ khoá theo loại trong ComponentSpecs
  (xem backend-app/src/utils/searchText.js). Xoá SearchText cũ của các dòng đó để API điền lại khi khởi động
  (backfillSearchText). Dòng đã điền lại không còn cụm từ cũ nên chạy lại migration không làm gì thêm.
*/
UPDATE dbo.Products
SET SearchText = NULL
WHERE SearchText LIKE N'%linh kien cpu vga card do hoa mainboard%';
GO
