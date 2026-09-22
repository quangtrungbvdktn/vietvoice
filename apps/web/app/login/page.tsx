"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { saveAccessToken } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveAccessToken(String(form.get("accessToken") ?? ""));
    router.push("/");
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand"><span>V</span> VietVoice</div>
        <p className="eyebrow">Studio dịch và lồng tiếng video</p>
        <h1>Đăng nhập</h1>
        <form onSubmit={login}>
          <label>Mã truy cập riêng tư<input autoComplete="current-password" name="accessToken" required type="password" /></label>
          <button className="primary" type="submit">Mở VietVoice</button>
        </form>
        <p>Mã này chỉ được lưu trên máy đang dùng và không xuất hiện trong URL.</p>
      </section>
    </main>
  );
}
