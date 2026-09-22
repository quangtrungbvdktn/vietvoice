"use client";
import React from "react";

export interface PipelineStageView { id: string; label: string; status: "pending" | "running" | "completed" | "failed" | "paused"; progress: number; attempt: number; error?: string }

export function PipelineProgress({ stages, onAction }: { stages: PipelineStageView[]; onAction(stageId: string, action: "retry" | "cancel" | "pause" | "resume"): void }) {
  return <section className="pipeline-list">{stages.map((stage) => <article className={`pipeline-stage ${stage.status}`} key={stage.id}>
    <div className="stage-dot">{stage.status === "completed" ? "✓" : stage.progress ? `${stage.progress}%` : "·"}</div>
    <div><h2>{stage.label}</h2><p>Lần thử {stage.attempt}{stage.status === "running" ? " · đang chạy nền" : ""}</p>{stage.error ? <p className="stage-error">{stage.error}</p> : null}<div className="progress"><span style={{ width: `${stage.progress}%` }} /></div></div>
    <div className="stage-actions">{stage.status === "running" ? <><button onClick={() => onAction(stage.id, "pause")}>Tạm dừng</button><button onClick={() => onAction(stage.id, "cancel")}>Hủy</button></> : null}{stage.status === "failed" ? <button onClick={() => onAction(stage.id, "retry")}>Thử lại</button> : null}{stage.status === "paused" ? <button onClick={() => onAction(stage.id, "resume")}>Tiếp tục</button> : null}</div>
  </article>)}</section>;
}
