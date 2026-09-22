"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { PipelineProgress, type PipelineStageView } from "./pipeline-progress";

interface JobView { id: string; stage: string; status: string; progress: number; attempt: number; error?: string }
const stageLabels: Record<string, string> = {
  video_input: "Nhận video", media_processing: "Xử lý media", audio_extraction: "Tách âm thanh",
  speech_recognition: "Nhận dạng lời thoại", language_detection: "Nhận diện ngôn ngữ", transcript: "Tạo transcript",
  subtitle_generation: "Tạo phụ đề", translation: "Dịch sang tiếng Việt", voice_generation: "Tạo giọng nói",
  audio_sync: "Đồng bộ âm thanh", video_rendering: "Kết xuất video", export: "Hoàn tất bản xuất",
};

export function ProjectPipeline({ projectId, jobId, pollIntervalMs = 2_000 }: { projectId: string; jobId: string | null; pollIntervalMs?: number }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await apiFetch(`/v1/projects/${projectId}/jobs`);
    if (!response.ok) return setMessage("Không thể tải trạng thái tác vụ.");
    const jobs = await response.json() as JobView[];
    setJob(jobs.find((item) => item.id === jobId) ?? null);
  }, [jobId, projectId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [load, pollIntervalMs]);

  async function act(_stageId: string, action: "retry" | "cancel" | "pause" | "resume") {
    if (!jobId) return setMessage("Thiếu mã tác vụ.");
    const response = await apiFetch(`/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ action }) });
    setMessage(response.ok ? "Đã cập nhật tác vụ." : "Không thể cập nhật tác vụ. Hãy thử lại.");
    if (response.ok) await load();
  }

  const stages: PipelineStageView[] = job ? [{
    id: job.id, label: stageLabels[job.stage] ?? job.stage,
    status: normalizeStatus(job.status), progress: job.progress, attempt: job.attempt, ...(job.error ? { error: job.error } : {}),
  }] : [];
  return <>{message ? <p>{message}</p> : null}{!job && !message ? <p>Đang tải tiến độ…</p> : null}<PipelineProgress stages={stages} onAction={act} /></>;
}

function normalizeStatus(status: string): PipelineStageView["status"] {
  if (status === "queued") return "pending";
  if (status === "cancelled") return "failed";
  return (["pending", "running", "completed", "failed", "paused"].includes(status) ? status : "pending") as PipelineStageView["status"];
}
