"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SourceSelection, type SourceRow } from "../../../../components/source-selection";
import { apiFetch } from "../../../../lib/api";

const previewRows: SourceRow[] = [
  { id: "yt:01", title: "Tập 01 · Cuộc gặp định mệnh", source: "YouTube", episodeNumber: 1, durationMs: 742_000, status: "ready" },
  { id: "yt:02", title: "Tập 02 · Bí mật trong đêm", source: "YouTube", episodeNumber: 2, durationMs: 805_000, status: "ready" },
  { id: "local:03", title: "Episode 03.mp4", source: "Máy tính", episodeNumber: 3, durationMs: null, status: "scanning" },
];

export default function ProjectSourcesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<"translate_subtitle" | "translate_dub">("translate_dub");
  const [concurrency, setConcurrency] = useState(1);
  const [error, setError] = useState("");
  async function add(sourceIds: string[]) {
    const response = await apiFetch(`/v1/projects/${id}/jobs`, { method: "POST", body: JSON.stringify({ sourceIds, mode, concurrency }) });
    if (!response.ok) return setError("Không thể thêm video vào hàng đợi. Hãy kiểm tra Agent và thử lại.");
    const job = await response.json() as { id: string };
    router.push(`/projects/${id}/pipeline?jobId=${job.id}`);
  }
  return <main className="sources-shell"><header><p className="eyebrow">Bước 2/3 · Chọn video</p><h1>Chọn tập cần xử lý</h1><p>Kết quả xuất hiện ngay khi Agent quét xong từng video. Lựa chọn của bạn được giữ nguyên.</p></header><section className="source-toolbar"><label>Kiểu xử lý<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="translate_subtitle">Dịch + phụ đề</option><option value="translate_dub">Dịch + phụ đề + lồng tiếng</option></select></label><label>Số luồng<select value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))}><option value={1}>1 luồng</option><option value={2}>2 luồng</option><option value={3}>3 luồng</option></select></label></section>{error ? <p className="stage-error">{error}</p> : null}<SourceSelection rows={previewRows} onAdd={add} /></main>;
}
