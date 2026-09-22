"use client";

import React, { useState } from "react";

export interface EditorSegment { id: string; startMs: number; endMs: number; original: string; translation: string; role: string; voice: string }
export interface ExportSelection { preset: "original" | "vertical" | "square" | "landscape" | "short_form"; resolution: "original" | "720p" | "1080p"; quality: "economy" | "balanced" | "high"; frameMode: "crop" | "fit_blur" | "preserve" }

export function ProjectEditor({ segments, onSave, onExport }: { segments: EditorSegment[]; onSave(segment: EditorSegment): void; onExport(profile: ExportSelection): void }) {
  const [items, setItems] = useState(segments);
  const [selected, setSelected] = useState(0);
  const [profile, setProfile] = useState<ExportSelection>({ preset: "original", resolution: "original", quality: "balanced", frameMode: "preserve" });
  const current = items[selected];
  const update = (patch: Partial<EditorSegment>) => setItems((value) => value.map((item, index) => index === selected ? { ...item, ...patch } : item));

  return <section className="editor-grid">
    <div className="editor-preview"><video controls /><p>Xem trước đồng bộ theo timecode.</p></div>
    <div className="editor-controls"><h2>Đoạn thoại</h2><div className="segment-tabs">{items.map((segment, index) => <button className={index === selected ? "active" : ""} key={segment.id} onClick={() => setSelected(index)}>{Math.round(segment.startMs / 1000)}s · {segment.role}</button>)}</div>
      {current ? <><label>Nguyên bản<textarea readOnly value={current.original} /></label><label>Bản dịch<textarea aria-label={`Bản dịch ${current.id}`} value={current.translation} onChange={(event) => update({ translation: event.target.value })} /></label><label>Vai<input value={current.role} onChange={(event) => update({ role: event.target.value })} /></label><label>Giọng<select value={current.voice} onChange={(event) => update({ voice: event.target.value })}><option>Hoài My</option><option>Nam Minh</option><option>Gemini hội thoại</option></select></label><button onClick={() => onSave(current)}>Lưu thay đổi</button></> : null}
      <h2>Xuất video</h2><label>Preset<select value={profile.preset} onChange={(event) => setProfile({ ...profile, preset: event.target.value as ExportSelection["preset"] })}><option value="original">Original</option><option value="vertical">Vertical</option><option value="square">Square</option><option value="landscape">Landscape</option><option value="short_form">Short-form</option></select></label><label>Độ phân giải<select value={profile.resolution} onChange={(event) => setProfile({ ...profile, resolution: event.target.value as ExportSelection["resolution"] })}><option value="original">Original</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label><label>Chất lượng<select value={profile.quality} onChange={(event) => setProfile({ ...profile, quality: event.target.value as ExportSelection["quality"] })}><option value="economy">Tiết kiệm</option><option value="balanced">Cân bằng</option><option value="high">Cao</option></select></label><button className="primary" onClick={() => onExport(profile)}>Xuất phiên bản mới</button>
    </div>
  </section>;
}
