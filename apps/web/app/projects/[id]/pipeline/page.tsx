"use client";
import { useParams, useSearchParams } from "next/navigation";
import { ProjectPipeline } from "../../../../components/project-pipeline";
export default function PipelinePage() {
  const { id } = useParams<{ id: string }>();
  const jobId = useSearchParams().get("jobId");
  return <main className="sources-shell"><header><p className="eyebrow">Bước 3/3 · AI Pipeline</p><h1>Đang xử lý nền</h1><p>Bạn có thể rời trang này; Windows Agent vẫn tiếp tục và đồng bộ tiến độ.</p></header><ProjectPipeline projectId={id} jobId={jobId} /></main>;
}
