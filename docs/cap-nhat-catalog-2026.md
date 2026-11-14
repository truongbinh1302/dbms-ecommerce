# Cập nhật catalog tháng 11/2026

File `database/seeds/013_seed_catalog_2026.sql`. Giá lấy ngày 14/11/2026 từ trang bán của GearVN (chính), Phong Vũ và Hacom; làm tròn theo giá shop, `OldPrice` là giá niêm yết trước giảm. Đây là giá tham khảo cho bài demo, không phải báo giá.

## Thị trường đang thế nào

- **RAM và SSD tăng rất mạnh** vì nhu cầu AI: bộ DDR5 32GB (2x16GB) khoảng 10–14 triệu, DDR4 16GB khoảng 3,4–4 triệu, SSD NVMe 1TB khoảng 5 triệu. Đầu năm 2025 các món này rẻ hơn khoảng 3 lần.
- Hệ quả cho Build PC: nền DDR4 (AM4, Intel 12–14 bản DDR4) rẻ hơn rõ rệt, nên bộ ráp tự động hay chọn DDR4 cho máy văn phòng và lập trình. Máy chơi game có card rời rẻ nhất giờ khoảng 20 triệu trở lên.
- Card đồ hoạ: RTX 50 và RX 9000 đã thay hẳn RTX 40 / RX 7000. Giá cũng tăng theo bộ nhớ VRAM.
- CPU: Ryzen 9000 (AM5), Intel Core Ultra 200S và bản làm mới 200S Plus (socket LGA1851, chỉ dùng DDR5).

## Thay đổi

| Nhóm | Ngừng bán | Thêm mới | Đổi giá |
|---|---|---|---|
| CPU | Ryzen 5 5600, Ryzen 7 7700, Ryzen 9 7900X | Ryzen 5 5600X, Ryzen 5 9600X, Ryzen 7 9700X, Ryzen 7 9800X3D, Ryzen 9 9900X, Core Ultra 5 225, Core Ultra 5 250K Plus, Core Ultra 7 270K Plus | 6 mẫu còn bán |
| Mainboard | MSI PRO Z790-A | B850M AORUS ELITE, B850 AORUS ELITE, B860M DS3H, Z890 EAGLE | 6 mẫu |
| RAM | | | 7 bộ máy bàn, 8 bộ laptop |
| Card đồ hoạ | RX 7600, RTX 4060, RTX 3060, RTX 4060 Ti | RTX 5050, RTX 5060, RTX 5060 Ti 16GB, RX 9060 XT, RX 9070, RX 9070 XT | Arc B580, RTX 5070, 5070 Ti, 5080 |
| Ổ cứng | WD SN580, Crucial MX500 | Kingston NV3 1TB, Samsung 9100 PRO 1TB (Gen5), KLEVV C710 256GB | 5 mẫu |
| Nguồn | Corsair CV550 | Corsair CX650, Cooler Master MWE Gold 850 V2 | 4 mẫu |
| Laptop | Zephyrus G16 2024, Legion Slim 5, ThinkBook 14 G7 | Zephyrus G16 (2026) GU606, Legion 5 15IAX11, ThinkBook 14 G8 IAL | |
| Phụ kiện | UltraSharp 27 4K, Odyssey 27 240Hz, Keychron K8 Pro, G Pro X Superlight, Cloud Alpha Wireless | UltraSharp U2724DE, Odyssey OLED G6 360Hz, Keychron K5M, G Pro X Superlight 2, Cloud Alpha 2 Wireless | Brio 4K, 990 Pro 2TB |
| Máy bộ | | | BT RTX 5070 Gaming PC (Ryzen 7 9700X, 59,99 triệu), Creator Studio PC Pro (Core Ultra 9 285K + RTX 5080, 124,99 triệu) |

Khác:
- Tản nhiệt nhận thêm socket LGA1851 (chung ngàm với LGA1700).
- "Máy chạy được gì?" có 3 model laptop 2026, thông số theo Lenovo PSREF, trang ASUS và shop bán. Các model cũ vẫn giữ để khách dùng máy cũ tra cứu.
- Phiên đấu giá RAM mẫu (seed 012) dùng giá mới. Database đã chạy từ trước mà không còn phiên nào mở thì 013 mở một đợt mới.
- Sản phẩm ngừng bán dùng cờ `IsDeleted` như khi quản trị xoá; đơn hàng, đánh giá và lịch sử giá cũ vẫn giữ.

## Chưa xác minh được

Một số thông số lấy theo mẫu gần nhất và cần đối chiếu trước khi bán thật: chiều dài card ZOTAC RTX 5050 Twin Edge, số khe M.2 của các mainboard B850/Z890. Giá của ASUS Prime RTX 5070 và nguồn Seasonic/Corsair RM được ước theo mẫu cùng phân khúc đang bán.

## Ảnh hưởng tới đánh giá trợ lý AI

Hai lần đo trong `docs/danh-gia-tro-ly-ai/` chạy trên catalog cũ. Ngân sách trong bộ 30 câu không đổi, nên với giá mới nhiều câu ngân sách thấp sẽ thành "không đủ tiền". Lần đo sau cần ghi rõ là catalog 11/2026.

## Nguồn

- GearVN: [CPU](https://gearvn.com/collections/cpu-bo-vi-xu-ly), [RAM](https://gearvn.com/collections/ram-pc), [card đồ hoạ](https://gearvn.com/collections/vga-card-man-hinh), [mainboard](https://gearvn.com/collections/mainboard-bo-mach-chu), [SSD](https://gearvn.com/collections/ssd-o-cung-the-ran), [nguồn](https://gearvn.com/collections/psu-nguon-may-tinh), [tản khí](https://gearvn.com/collections/tan-nhiet-khi), [case](https://gearvn.com/collections/case-thung-may-tinh) và trang tìm kiếm từng mẫu.
- Phong Vũ: [CPU Ryzen 9000](https://phongvu.vn/c/cpu-amd-ryzen-9000-series).
- Hacom: [ThinkBook 14 G8 21SJ0072VN](https://hacom.vn/laptop-lenovo-thinkbook-14-g8-21sj0072vn).
- Lenovo PSREF: [Legion 5 15IAX11](https://psref.lenovo.com/syspool/Sys/PDF/Legion/Legion_5_15IAX11/Legion_5_15IAX11_Spec.html).
- Ultrabookreview: [Zephyrus G16 GU606](https://www.ultrabookreview.com/75392-asus-rog-zephyrus-g16-gu606-review/).
- Xu hướng giá RAM: [VnExpress 29/3/2026](https://vnexpress.net/gia-ram-bat-ngo-giam-5056026.html).
