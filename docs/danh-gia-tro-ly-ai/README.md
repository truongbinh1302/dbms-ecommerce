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
