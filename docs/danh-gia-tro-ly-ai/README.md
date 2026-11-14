# Đánh giá trợ lý AI ráp máy

Đo bằng `scripts/eval-build-agent.js` (bấm đúp `DANH-GIA-TRO-LY-AI.bat` trên Windows) với khoá OpenAI thật, mô hình `gpt-5.4-mini`, 30 yêu cầu mẫu trong `backend-app/scripts/build-agent-cases.js`, kho 50 linh kiện máy bàn còn hàng. Mỗi yêu cầu được chấm tự động theo thông số trong kho (ngân sách, có/không card rời, hãng card, VRAM, RAM, dung lượng ổ, hãng CPU, cỡ mainboard).

| Chỉ số | Lần 1 (14/11, trước khi sửa) | Lần 2 (14/11, sau PR #12) |
|---|---|---|
| Đạt mọi điều kiện kiểm tra | 24/30 | 26/30 |
| Yêu cầu ráp máy có cấu hình hợp lệ | 22/26 | 24/26 |
| Nằm trong ngân sách | 20/20 | 22/22 |
| Cấu hình sai lọt tới khách | 0 | 0 |
| Thời gian mỗi yêu cầu (trung vị) | 9,0 s | 8,4 s |
| Token trung bình mỗi yêu cầu | 25.625 | 25.729 |
| Bộ luật từ khoá cũ, cùng 30 yêu cầu | 11/30 đạt | 11/30 đạt |

Sửa giữa hai lần (PR #12): lần 1 có 3 yêu cầu máy văn phòng, lập trình giá rẻ thất bại vì mô hình chọn CPU không có đồ hoạ tích hợp mà công cụ tìm linh kiện không có cách lọc loại CPU đó. Đã thêm bộ lọc `integratedGraphics` và gợi ý khi bị trả lại.

Sau lần 2: trợ lý ráp nhầm một PC cho câu "tư vấn laptop gaming". Câu hỏi về laptop giờ được từ chối bằng quy tắc trước khi gọi mô hình (không tốn token, không tính hạn mức).

Mô hình ngôn ngữ cho kết quả khác nhau giữa các lần chạy, nên con số dao động vài yêu cầu. Chỉ số không đổi qua cả hai lần là "cấu hình sai lọt tới khách = 0": mọi cấu hình đều qua bộ kiểm tra của máy chủ trước khi hiện ra.

- [Lần 1](lan-1-truoc-khi-sua.md)
- [Lần 2](lan-2-sau-khi-sua.md)
- [Lần 3](lan-3-catalog-2026.md)
- [Lần 4](lan-4-catalog-2026-sau-khi-sua.md)

## Catalog tháng 11/2026

Từ lần 3, kho là catalog 11/2026 (64 linh kiện, 4 socket AM4/AM5/LGA1700/LGA1851, RAM và SSD đắt gấp khoảng 3 lần) và ngân sách 23 câu được nâng theo giá mới, nên không so trực tiếp với lần 1-2.

| Chỉ số | Lần 3 (catalog mới, chưa sửa) | Lần 4 (sau PR #18) |
|---|---|---|
| Đạt mọi điều kiện kiểm tra | 15/30 | 21/30 |
| Yêu cầu ráp máy có cấu hình hợp lệ | 18/26 | 26/26 |
| Nằm trong ngân sách | 12/15 | 20/23 |
| Cấu hình sai lọt tới khách | 0 | 0 |
| Thời gian mỗi yêu cầu (trung vị) | 10,7 s | 10,1 s |
| Token trung bình mỗi yêu cầu | 38.045 | 38.311 |
| Bộ luật từ khoá cũ, cùng 30 yêu cầu | 9/30 đạt | 9/30 đạt |

Lần 3 tụt vì: 5 yêu cầu hết 10 lượt gọi mô hình khi còn đang tra linh kiện (kho nhiều đời hơn); mô hình cắt RAM xuống 16 GB hoặc chỉ dùng HDD để vừa ngân sách khi RAM, SSD đắt; chọn sai hãng CPU khách yêu cầu; một câu ráp máy văn phòng bị trả lời như câu hỏi không phải ráp PC. Đã sửa: tăng lên 14 lượt, nói rõ trong hướng dẫn cho mô hình rằng mức RAM tối thiểu và ổ SSD là bắt buộc, gợi ý nền DDR4 khi ngân sách eo hẹp, bắt buộc theo hãng khách chỉ định, không trả lời câu từ chối sau khi đã ráp.

Lần 4 còn 9 câu chưa đạt, mỗi câu một kiểu (chọn card Radeon cho câu chạy mô hình 32B, giữ 16 GB RAM cho câu Docker, quên card rời ở câu Mini-ITX và câu Ryzen chơi game, vượt ngân sách 1-10 triệu ở 3 câu, không nhắc cửa hàng chưa có dữ liệu về độ ồn/RGB). Mọi cấu hình vẫn qua bộ kiểm tra của máy chủ nên không có cấu hình sai tới tay khách; các lỗi trên là chưa đúng ý khách, không phải lắp không được.

