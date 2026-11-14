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

## Đối chiếu lại (seed 014)

Các con số trước đó còn ước tính đã được kiểm tra lại cùng ngày:

- Mẫu GearVN không còn bán thì ngừng bán và thay bằng mẫu đang bán: ASUS Prime RTX 5070 → GIGABYTE RTX 5070 WINDFORCE OC SFF (29,99 triệu); ASUS TUF RTX 5080 → ASUS Prime RTX 5080 (51,99 triệu); Seasonic Focus GX-850 → Corsair RM850e; B650M-A WIFI II, PRO B650-P, ASRock B650I, B760M DS3H DDR4, PRO B760M-A WIFI → MSI/GIGABYTE B650M GAMING PLUS WIFI, B850I AORUS PRO, PRO B760M-E DDR4, PRIME B760M-A D4-CSM, MAG B760M MORTAR II WIFI; Samsung 870 EVO → PNY CS900; AK400 và Peerless Assassin → AK400 DIGITAL, Hyper 620S, SE-214-XT.
- Giá đúng theo shop: RTX 5070 Ti 44,99 triệu, RM750e 2,89 triệu, RM1000e 4,59 triệu, MSI A650BN 1,19 triệu, B550M-A 2,49 triệu, BarraCuda 2TB 3,99 triệu.
- Chiều dài card theo trang hãng và GPU-Monkey/BuildCores: RTX 5050 Twin Edge 221mm, RTX 5060 Ti Twin Edge 221mm, RTX 5060 Ventus 197mm, RX 9060 XT 281mm, RX 9070 288mm, RX 9070 XT Prime 312mm. Card chuẩn SFF-Ready (RTX 5070 WINDFORCE SFF, RTX 5080 Prime) ghi 304mm, mức tối đa của chuẩn.
- Số khe M.2 của mainboard ghi theo số tối thiểu chắc chắn có, nên Build PC không bao giờ hứa lắp nhiều ổ hơn máy có.

## Ảnh minh hoạ

Mọi sản phẩm thật đều có ảnh minh hoạ SVG (`frontend-app/public/images/products/`), vẽ theo loại sản phẩm với màu nhấn theo hãng, ghi tên và thông số chính. Ảnh do `scripts/generate-product-images.js` sinh từ chính các file seed, không dùng ảnh chụp của hãng hay của shop (tránh vấn đề bản quyền). Seed 014 gắn ảnh cho sản phẩm chưa có ảnh và không ghi đè ảnh quản trị đã tải lên. Sản phẩm không có file riêng (quản trị thêm mới, 50.000 sản phẩm sinh tự động) hiện ảnh theo danh mục ở giao diện.

Thêm sản phẩm vào seed thì chạy lại `node scripts/generate-product-images.js` và thêm slug vào danh sách ảnh trong seed mới.

## Đấu giá

Phiên còn mở mà giá khởi điểm dưới 40% giá niêm yết hiện tại (mở theo giá RAM cũ) được seed 014 huỷ như quản trị bấm huỷ: trả sản phẩm về kho, ghi sổ kho, báo cho người đã trả giá. Sau đó mở đợt mới theo giá hiện tại.

## Ảnh hưởng tới đánh giá trợ lý AI

Lần đo 1 và 2 trong `docs/danh-gia-tro-ly-ai/` chạy trên catalog và ngân sách cũ. Bộ 30 câu đã nâng ngân sách theo giá mới (mỗi câu ráp máy còn dư khoảng 20–40% so với cấu hình rẻ nhất hợp lệ trong kho), câu "CPU Intel" chấp nhận cả LGA1851. Lần đo 3 dùng catalog 11/2026.

## Nguồn

- GearVN: [CPU](https://gearvn.com/collections/cpu-bo-vi-xu-ly), [RAM](https://gearvn.com/collections/ram-pc), [card đồ hoạ](https://gearvn.com/collections/vga-card-man-hinh), [mainboard](https://gearvn.com/collections/mainboard-bo-mach-chu), [SSD](https://gearvn.com/collections/ssd-o-cung-the-ran), [nguồn](https://gearvn.com/collections/psu-nguon-may-tinh), [tản khí](https://gearvn.com/collections/tan-nhiet-khi), [case](https://gearvn.com/collections/case-thung-may-tinh) và trang tìm kiếm từng mẫu.
- Phong Vũ: [CPU Ryzen 9000](https://phongvu.vn/c/cpu-amd-ryzen-9000-series).
- Hacom: [ThinkBook 14 G8 21SJ0072VN](https://hacom.vn/laptop-lenovo-thinkbook-14-g8-21sj0072vn).
- Trang hãng: [GIGABYTE RX 9070 GAMING OC](https://www.gigabyte.com/Graphics-Card/GV-R9070GAMING-OC-16GD/sp), [GIGABYTE RX 9060 XT GAMING OC](https://www.gigabyte.com/Graphics-Card/GV-R9060XTGAMING-OC-8GD/sp), [ASUS Prime RX 9070 XT](https://www.asus.com/motherboards-components/graphics-cards/prime/prime-rx9070xt-o16g/techspec/), [MSI RTX 5060 Ventus 2X OC](https://storage-asset.msi.com/datasheet/vga/us/GeForce-RTX-5060-8G-VENTUS-2X-OC.pdf).
- [GPU-Monkey RTX 5050 Twin Edge OC](https://www.gpu-monkey.com/en/gpu-zotac_geforce_rtx_5050_twin_edge_oc), [BuildCores RTX 5060 Ti Twin Edge OC](https://www.buildcores.com/products/GPU/3r8k5sj3x/ZOTAC-GAMING-GeForce-RTX-5060-Ti-16GB-GDDR7-Twin-Edge-OC).
- Lenovo PSREF: [Legion 5 15IAX11](https://psref.lenovo.com/syspool/Sys/PDF/Legion/Legion_5_15IAX11/Legion_5_15IAX11_Spec.html).
- Ultrabookreview: [Zephyrus G16 GU606](https://www.ultrabookreview.com/75392-asus-rog-zephyrus-g16-gu606-review/).
- Xu hướng giá RAM: [VnExpress 29/3/2026](https://vnexpress.net/gia-ram-bat-ngo-giam-5056026.html).
