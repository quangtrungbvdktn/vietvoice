# Windows Agent

Hỗ trợ Windows 10/11 x64. Cài FFmpeg, ffprobe, yt-dlp và `edge-tts` từ nguồn chính thức, xác minh checksum trước khi đóng gói. Agent ghép bằng mã một lần, lưu token bằng Windows safeStorage, tự polling job nền và tiếp tục từ stage cache sau khi khởi động lại.

FFmpeg/ffprobe/yt-dlp đóng gói nằm trong `resources/bin` và được thêm vào `PATH` khi Agent chạy bản cài đặt. Với môi trường phát triển, các lệnh này và `edge-tts` phải có trong `PATH` của người dùng.
