# Khôi phục sự cố

- Lộ khóa: vô hiệu hóa khóa tại nhà cung cấp, thay biến môi trường, khởi động lại API/Worker và kiểm tra audit log theo correlation ID.
- Agent mất kết nối: không xóa checkpoint; mở lại Agent để ghép nối khi device token đã bị thu hồi. Job hoàn tất được nhận diện theo artifact nên không gọi AI lại.
- Hết dung lượng: giải phóng file tạm không còn tham chiếu rồi Retry. Bản xuất hoàn tất không bị ghi đè hay xóa.
- Hết quota hoặc timeout 45 giây: kiểm tra thông báo provider; chỉ bật lại job sau khi quota phục hồi. OpenRouter/Gemini chỉ chạy sau khi primary và số lần thử cấu hình thất bại.
- Dữ liệu lỗi: phục hồi metadata từ bản sao lưu gần nhất; giữ media gốc trên máy người dùng cho tới khi xác nhận bản xuất.

Không gửi log thô chứa URL ký, cookie nguồn, đường dẫn tuyệt đối hay payload provider. Dùng logger đã redaction và giữ correlation ID để điều tra.
