# Triển khai VietVoice riêng tư

## Dịch vụ

1. Sao chép `.env.example` thành `.env` trên máy chủ và tạo `VIETVOICE_PRIVATE_ACCESS_TOKEN` ngẫu nhiên tối thiểu 32 byte.
2. Cài gói Agent chứa sherpa-onnx/Paraformer đã xác minh. Gemini và OpenRouter là khóa tùy chọn chỉ ở API server; không đặt khóa AI dưới tiền tố `NEXT_PUBLIC_`.
3. Chạy `pnpm install --frozen-lockfile`, `pnpm build`, rồi `pnpm --filter @vietvoice/api start` và `pnpm --filter @vietvoice/web start` sau reverse proxy TLS.
4. Chỉ công khai Web/API; Redis, cơ sở dữ liệu và kho đối tượng phải ở mạng riêng. Sao lưu metadata dự án hằng ngày và áp dụng retention cho file tạm.

Trước mỗi bản phát hành chạy `pnpm lint && pnpm test && pnpm build && pnpm security:scan`. Token truy cập riêng tư có thể thu hồi bằng cách thay giá trị trên máy chủ và đăng nhập lại các trình duyệt.
