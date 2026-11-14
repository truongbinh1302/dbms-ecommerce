# Hướng dẫn cho người viết báo cáo

Tài liệu này dành cho người không tham gia code nhưng cần viết báo cáo về BinhTinhStore: chạy thử, tìm đúng chỗ trong code, số liệu nào đã đo, và những điểm cần ghi rõ để báo cáo không nói quá sự thật. README tiếng Anh ở thư mục gốc mô tả kỹ thuật chi tiết hơn.

## 1. Đề tài trong một đoạn

BinhTinhStore là cửa hàng bán linh kiện PC, laptop và phụ kiện, làm cho môn Hệ quản trị Cơ sở dữ liệu. Ứng dụng dùng **SQL Server** cho dữ liệu giao dịch (tài khoản, sản phẩm, kho, đơn hàng, voucher, đấu giá...) và **MongoDB** cho dữ liệu dạng tài liệu (đánh giá sản phẩm, nhật ký thay đổi sản phẩm). Trọng tâm về CSDL: giao dịch nhiều bước có `COMMIT`/`ROLLBACK`, khoá dòng để chống tranh chấp khi nhiều người mua cùng lúc, ràng buộc toàn vẹn, chỉ mục, hàm cửa sổ, sao lưu và phục hồi. Trên nền đó có các chức năng riêng: Build PC kiểm tra tương thích, trợ lý AI ráp máy, đấu giá RAM thời gian thực, "Máy chạy được gì?".

Công nghệ: React 19 + Vite + Tailwind (giao diện), Node.js + Express (API), SQL Server 2022 (`mssql`), MongoDB (`mongoose`), Docker Compose, GitHub Actions (kiểm thử tự động).

## 2. Chạy thử trên Windows

Cần cài **Docker Desktop** và bật nó lên trước.

1. Tải repo về (Code → Download ZIP rồi giải nén, hoặc `git clone`).
2. Bấm đúp `CHAY-WEBSITE.bat`. Lần đầu mất 5–10 phút: tạo file cấu hình với mật khẩu ngẫu nhiên, build image, tạo CSDL và nạp dữ liệu mẫu.
3. Mở `http://localhost:8080`.

Tài khoản mẫu (chỉ dùng trên máy):

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Quản trị | `admin@btstore.local` | `password` |
| Khách hàng | `customer@btstore.local` | `password` |

Trợ lý AI (chat mua hàng và "Nhờ AI ráp máy") cần khoá OpenAI: đăng nhập quản trị → **Trợ lý AI** → dán khoá. Không có khoá thì các chức năng khác vẫn chạy bình thường. Thanh toán VNPay là môi trường thử (sandbox), cần thông tin sandbox riêng; COD chạy được ngay.

Các file `.bat` khác: `DANH-GIA-TRO-LY-AI.bat` (đo trợ lý AI, tốn token OpenAI), `THEM-ANH-SAN-PHAM.bat` (gắn ảnh sản phẩm hàng loạt).

## 3. Chức năng và chỗ tìm trong code

Đường dẫn trang là dạng `http://localhost:8080/#/...`. Code backend ở `backend-app/src`, giao diện ở `frontend-app/src`, CSDL ở `database/`.

| Chức năng | Trang | Code chính | Bảng | Điểm CSDL nên viết |
| --- | --- | --- | --- | --- |
| Đặt hàng, huỷ đơn | `#/thanh-toan`, `#/don-hang` | `services/order.service.js`, `pricing.service.js` | Orders, OrderItems, OrderStatusHistory, Products, StockMovements | Một giao dịch; khoá `UPDLOCK, ROWLOCK` theo thứ tự `ProductID`; `CHECK (Stock >= 0)`; huỷ thì trả kho trong cùng giao dịch |
| Voucher | trang thanh toán | `voucher.service.js` | Vouchers, VoucherUsages | Khoá dòng voucher để lượt dùng cuối không bị lấy hai lần |
| Hot Deal giới hạn số lượng | trang chủ, sản phẩm | `promotion.service.js`, `promotionSql.js` | Promotions, PromotionItems | `SoldCount <= QuantityLimit`; khoá sau dòng sản phẩm |
| Tìm kiếm không dấu | `#/tim-kiem` | `searchIndex.service.js`, `utils/searchText.js` | Products (`SearchText`) | Cột chuẩn hoá + chỉ mục |
| Kho, phiếu nhập, sổ kho | Quản trị → Kho | `inventory.service.js` | StockReceipts, StockReceiptItems, StockMovements | Bất biến: tổng `Change` = `Stock` |
| Lịch sử giá, "Nên mua lúc nào?" | trang sản phẩm, Build PC | `priceInsight.service.js` | PriceHistory | Trung bình theo thời gian bằng `LEAD()` |
| Build PC, báo giá giữ 48 giờ | `#/build-pc`, `#/bao-gia/:code` | `builder.service.js`, `utils/compatibility.js` | ComponentSpecs, BuildQuotes, BuildWatches | Quy tắc tương thích là hàm thuần, có unit test |
| Nhờ AI ráp máy | `#/build-pc/nho-ai` | `utils/buildAgent.js`, `buildAgent.service.js` | đọc ComponentSpecs, Products | Mô hình chỉ đề xuất, máy chủ kiểm lại từng cấu hình bằng dữ liệu trong kho |
| Đấu giá RAM | `#/dau-gia` | `auction.service.js`, `utils/auction.js` | Auctions, AuctionMaxBids, AuctionBids | Thứ tự khoá Users → Auctions (`XLOCK`) → Products; giữ hàng trong kho; cập nhật trực tiếp bằng SSE |
| Máy chạy được gì? | `#/kiem-tra-may` | `machine.service.js`, `utils/workloads.js`, `utils/laptopUpgrade.js` | LaptopModels, ComponentSpecs | Tra cứu khe RAM/SSD laptop, gợi ý nâng cấp từ hàng đang có |
| Đổi trả, hoàn tiền | `#/don-hang/:id` | `return.service.js` | ReturnRequests, ReturnRequestItems | Khoá dòng đơn để không trả quá số đã mua |
| Bảo hành, dịch vụ tại nhà, thu cũ | `#/bao-hanh`, `#/dich-vu` | `warranty.service.js`, `afterSales.service.js` | Warranties, ServiceRequests, ServiceRequestEvents | Khoá theo khoảng (`HOLDLOCK`) để không đặt quá số chỗ của khung giờ |
| Hỏi đáp, thông báo, theo dõi giá/hàng | trang sản phẩm, chuông thông báo | `question.service.js`, `notification.service.js` | ProductQuestions, Notifications, PriceWatches, StockWatches | `UPDATE/DELETE … OUTPUT INTO` để không gửi trùng |
| Đánh giá sản phẩm | trang sản phẩm | `review.service.js`, `models/review.model.js` | MongoDB `reviews` | `findOneAndUpdate` có điều kiện cho lượt "hữu ích" |
| Kiểm tra toàn vẹn dữ liệu | Quản trị → Bảng điều khiển | `integrity.service.js` | nhiều bảng | Đối chiếu kho với sổ kho, tổng tiền đơn, lượt dùng voucher |

Bảng đầy đủ các tình huống tranh chấp, cách chống và test chứng minh nằm ở README, mục **Concurrency control used across the store**.

## 4. Cơ sở dữ liệu

### SQL Server: 32 bảng (cộng `SeedHistory` ghi các file dữ liệu mẫu đã nạp)

Sơ đồ vẽ tự động từ CSDL đang chạy (khoá chính PK, khoá ngoại FK), nằm trong `docs/erd/`. File `.mmd` là mã Mermaid, mở bằng [mermaid.live](https://mermaid.live) để sửa hoặc xuất lại ảnh.

| Sơ đồ | Nội dung |
| --- | --- |
| [Tổng quan](erd/0-tong-quan.png) | Toàn bộ bảng theo nhóm và quan hệ khoá ngoại |
| [Bán hàng](erd/1-ban-hang.png) | Users, Categories, Products, CartItems, Orders, OrderItems, OrderStatusHistory, Vouchers, VoucherUsages |
| [Kho và giá](erd/2-kho-gia.png) | StockReceipts, StockReceiptItems, StockMovements, Promotions, PromotionItems, PriceHistory, PriceWatches, StockWatches |
| [Build PC](erd/3-build-pc.png) | ComponentSpecs, BuildQuotes, BuildWatches, LaptopModels |
| [Đấu giá](erd/4-dau-gia.png) | Auctions, AuctionMaxBids, AuctionBids |
| [Hậu mãi](erd/5-hau-mai.png) | ReturnRequests, ReturnRequestItems, Warranties, ServiceRequests, ServiceRequestEvents, ProductQuestions, Notifications |

Ngoài ra có `AppSettings` (cấu hình trợ lý AI, khoá được mã hoá). Ảnh ERD cũ (chỉ có 7 bảng ban đầu) đã được thay bằng các sơ đồ trên.

Lược đồ được tạo bằng 23 file migration trong `database/migrations` (đọc theo thứ tự số để thấy CSDL lớn dần theo từng chức năng). Dữ liệu mẫu ở `database/seeds`. Dữ liệu mẫu có 50.000 sản phẩm sinh tự động (`IsGenerated = 1`, ẩn khỏi cửa hàng) và 5.000 đơn hàng để thử chỉ mục và kế hoạch thực thi.

### MongoDB

Ứng dụng đang dùng hai collection: `reviews` (đánh giá, lượt hữu ích, ẩn có lý do, phản hồi của cửa hàng) và `product_logs` (nhật ký thay đổi sản phẩm). File `docs/mongodb_schema.md` là bản thiết kế ban đầu, có cả các collection như users, orders mà bản chạy thật không dùng (những dữ liệu đó nằm ở SQL Server). Khi viết báo cáo nên mô tả theo hai collection đang dùng và nêu lý do tách: đánh giá có cấu trúc linh hoạt, đọc nhiều, không cần giao dịch với đơn hàng.

### Bài minh hoạ riêng cho môn học

`database-demo/` có các script độc lập cho SQL Server và MongoDB: tạo lược đồ, xử lý truy vấn và kế hoạch thực thi, chỉ mục, giao dịch và rollback, điều khiển tương tranh, sao lưu và phục hồi. Đây là phần dễ đưa vào báo cáo nhất vì mỗi file chứng minh một khái niệm.

## 5. Số liệu đã đo (có thể trích)

| Nội dung | Kết quả | Nguồn |
| --- | --- | --- |
| Unit test backend | 158 test, đều đạt | `cd backend-app && npm test` |
| Integration test trên SQL Server + MongoDB thật | 94 test trong 19 file, đều đạt, gồm các test bắn yêu cầu đồng thời | `npm run test:db`; chạy tự động mỗi lần đẩy code (`.github/workflows/ci.yml`) |
| Deadlock đấu giá | 50 người trả giá + 50 người xem cùng lúc: `UPDLOCK` gây deadlock 2/3 lần chạy, đổi sang `XLOCK` thì 0/11 | `backend-app/test/integration/auction.test.js` |
| Trợ lý AI ráp máy, 30 yêu cầu mẫu | Catalog 11/2026: 21/30 đạt mọi điều kiện, 26/26 yêu cầu ráp máy ra cấu hình hợp lệ, 0 cấu hình sai tới tay khách, trung vị 10,1 giây; bộ luật từ khoá cũ chỉ 9/30 | `docs/danh-gia-tro-ly-ai/` |

Kết quả đánh giá AI phụ thuộc mô hình và thời điểm chạy: hai lần chạy cùng code có thể lệch vài câu. Nếu trích, ghi rõ lần đo và ngày.

## 6. Những điểm cần ghi rõ trong báo cáo

- **Giá và sản phẩm** là giá tham khảo các shop lớn ngày 14/11/2026, làm tròn, dùng cho demo (nguồn ở `docs/cap-nhat-catalog-2026.md`). Không phải báo giá thật.
- **Ảnh sản phẩm**: repo chỉ chứa ảnh minh hoạ tự vẽ (SVG). Ảnh chụp thật không có trong repo; máy nào muốn có thì dùng `THEM-ANH-SAN-PHAM.bat` với ảnh tự chuẩn bị.
- **Khách hàng, đơn hàng, đánh giá** trong dữ liệu mẫu là dữ liệu ảo.
- **Trợ lý AI** gọi OpenAI qua API (mô hình mặc định `gpt-5.4-mini`), tốn phí theo token, có giới hạn số câu mỗi giờ và mỗi ngày.
- **Dự án chạy trên máy cá nhân**, chưa triển khai công khai. Phần sao lưu, giám sát và cấu hình production có trong code nhưng chưa vận hành thật.
- **Đóng góp cá nhân**: README ghi rõ phần đóng góp chính ban đầu là xử lý giao dịch và API đặt hàng. Nếu báo cáo nói về phân công, đối chiếu với lịch sử commit trên GitHub.

## 7. Gợi ý dàn ý

1. Giới thiệu bài toán và phạm vi (mục 1).
2. Kiến trúc hệ thống và công nghệ (README, mục Architecture, Tech stack).
3. Thiết kế CSDL: sơ đồ tổng quan, từng nhóm bảng, lý do dùng thêm MongoDB (mục 4).
4. Xử lý giao dịch: luồng đặt hàng và huỷ đơn (README, mục Transaction processing).
5. Điều khiển tương tranh: bảng các tình huống, ca deadlock của đấu giá và cách sửa (mục 5).
6. Chỉ mục và tối ưu truy vấn: tìm kiếm không dấu, `database-demo/` (chỉ mục, kế hoạch thực thi trên 50.000 sản phẩm).
7. Sao lưu và phục hồi (`scripts/backup.sh`, `scripts/restore.sh`, `database-demo/`).
8. Chức năng nổi bật: Build PC, trợ lý AI và kết quả đo, đấu giá RAM.
9. Kiểm thử (mục 5) và hạn chế (mục 6).

Ảnh chụp màn hình: chạy web, đăng nhập bằng tài khoản mẫu và chụp từng trang ở mục 3. Trang quản trị nằm ở nút **Quản trị demo** trên thanh đầu trang sau khi đăng nhập tài khoản quản trị.
