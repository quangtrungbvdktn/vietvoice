# Thiết lập dịch vụ

Nhận dạng chính chạy miễn phí trên Windows Agent bằng sherpa-onnx Paraformer INT8: `ASR_ENGINE=paraformer`, `PARAFORMER_DEVICE=cpu`. Không cần khóa cloud để nhận dạng local.

`GEMINI_API_KEY` và `OPENROUTER_API_KEY` là tùy chọn, chỉ đặt trên API server và không dùng tên `NEXT_PUBLIC_*`. Nếu bật OpenRouter ASR, phải đặt rõ `OPENROUTER_ASR_MODEL` là model hỗ trợ audio. Agent chỉ tải WAV tạm lên API sau khi nhận dạng local thất bại; file hết hạn sau một giờ. Local thành công thì audio không rời máy.

Timeout provider mặc định là 45 giây và thử lại 2 lần. Gemini là dịch vụ dịch chính; OpenRouter chỉ chạy sau khi Gemini hết quota, lỗi hoặc timeout qua toàn bộ lần thử.

Edge TTS là giọng đọc chính trên Agent; Gemini TTS chỉ chạy khi Edge TTS thất bại. Có thể đặt số luồng CPU bằng `PARAFORMER_THREADS=4` và thư mục tài nguyên đã xác minh bằng `PARAFORMER_RESOURCE_DIR`.
