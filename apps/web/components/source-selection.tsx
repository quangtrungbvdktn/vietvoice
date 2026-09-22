"use client";

import React, { useMemo, useState } from "react";

export interface SourceRow {
  id: string;
  title: string;
  source: string;
  episodeNumber: number | null;
  durationMs: number | null;
  status: "scanning" | "ready" | "unavailable";
  possibleDuplicate?: boolean;
}

function duration(ms: number | null): string {
  if (ms === null) return "Chưa rõ";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SourceSelection({ rows, onAdd }: { rows: SourceRow[]; onAdd(ids: string[]): void }) {
  const [query, setQuery] = useState("");
  const [durationFilter, setDurationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const visible = useMemo(() => rows.filter((row) => {
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery = !needle || row.title.toLocaleLowerCase().includes(needle) || String(row.episodeNumber ?? "").includes(needle);
    const minutes = (row.durationMs ?? -1) / 60_000;
    const matchesDuration = durationFilter === "all" || (durationFilter === "short" && minutes >= 0 && minutes < 5) || (durationFilter === "medium" && minutes >= 5 && minutes <= 20) || (durationFilter === "long" && minutes > 20) || (durationFilter === "unknown" && row.durationMs === null);
    return matchesQuery && matchesDuration && (statusFilter === "all" || row.status === statusFilter);
  }), [rows, query, durationFilter, statusFilter]);

  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function selectVisible() { setSelected((current) => new Set([...current, ...visible.filter((r) => r.status === "ready").map((r) => r.id)])); }

  return <section className="source-panel">
    <div className="source-toolbar">
      <input aria-label="Tìm video" placeholder="Tìm tiêu đề hoặc số tập" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="Lọc thời lượng" value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)}><option value="all">Mọi thời lượng</option><option value="short">Dưới 5 phút</option><option value="medium">5–20 phút</option><option value="long">Trên 20 phút</option><option value="unknown">Chưa rõ</option></select>
      <select aria-label="Lọc trạng thái" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Mọi trạng thái</option><option value="ready">Sẵn sàng</option><option value="scanning">Đang quét</option><option value="unavailable">Không khả dụng</option></select>
      <button onClick={selectVisible}>Chọn tất cả đang hiển thị</button>
    </div>
    <div className="source-table" role="table" aria-label="Danh sách video">
      <div className="source-row source-head" role="row"><span /><span>Video</span><span>Nguồn</span><span>Thời lượng</span><span>Trạng thái</span></div>
      {visible.map((row) => <div className="source-row" role="row" key={row.id}>
        <input type="checkbox" aria-label={`Chọn ${row.title}`} checked={selected.has(row.id)} disabled={row.status !== "ready"} onChange={() => toggle(row.id)} />
        <span><strong>{row.title}</strong><small>{row.episodeNumber === null ? "Chưa nhận diện tập" : `Tập ${row.episodeNumber}`}{row.possibleDuplicate ? <b className="duplicate">Có thể trùng</b> : null}</small></span>
        <span>{row.source}</span><span>{duration(row.durationMs)}</span><span className={`source-status ${row.status}`}>{row.status === "ready" ? "Sẵn sàng" : row.status === "scanning" ? "Đang quét" : "Không khả dụng"}</span>
      </div>)}
    </div>
    <footer className="source-footer"><span>Đã chọn {selected.size}/{rows.length} video</span><button className="primary" disabled={selected.size === 0} onClick={() => onAdd([...selected])}>Thêm {selected.size} video vào hàng đợi</button></footer>
  </section>;
}
