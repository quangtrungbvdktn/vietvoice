import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: "VietVoice Studio",
  description: "Dịch, tạo phụ đề và lồng tiếng video theo dự án.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
