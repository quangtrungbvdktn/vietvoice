"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  totalDurationMs: number;
  videoCount: number;
  progress: number;
  thumbnailUrl: string | null;
  updatedAt: string;
  version: number;
}

function formatDuration(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000);
  return `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`;
}

export function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    apiFetch("/v1/projects")
      .then((response) => (response.ok ? response.json() : []))
      .then((value: ProjectSummary[]) => setProjects(value))
      .finally(() => setLoading(false));
  }, []);

  async function deleteProject(project: ProjectSummary) {
    const response = await apiFetch(`/v1/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) setProjects((items) => items.filter((item) => item.id !== project.id));
    setDeleting(null);
  }

  async function createProject() {
    const name = window.prompt("Tên dự án mới");
    if (!name?.trim()) return;
    const response = await apiFetch("/v1/projects", { method: "POST", body: JSON.stringify({ name }) });
    if (response.ok) {
      const created = await response.json() as ProjectSummary;
      setProjects((items) => [created, ...items]);
    }
  }

  async function duplicateProject(project: ProjectSummary) {
    const response = await apiFetch(`/v1/projects/${project.id}/duplicate`, { method: "POST" });
    if (response.ok) {
      const duplicate = await response.json() as ProjectSummary;
      setProjects((items) => [duplicate, ...items]);
    }
  }

  async function renameProject(project: ProjectSummary) {
    const name = window.prompt("Tên mới", project.name);
    if (!name?.trim()) return;
    const response = await apiFetch(`/v1/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, version: project.version }),
    });
    if (response.ok) {
      const updated = await response.json() as ProjectSummary;
      setProjects((items) => items.map((item) => item.id === updated.id ? updated : item));
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>V</span> VietVoice</div>
        <nav aria-label="Điều hướng chính">
          <Link className="active" href="/">Dự án</Link>
          <Link href="/queue">Hàng đợi</Link>
          <Link href="/history">Lịch sử</Link>
          <Link href="/settings">Cài đặt</Link>
        </nav>
        <div className="agent-status"><i /> Windows Agent đang kết nối</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Không gian làm việc riêng tư</p>
            <h1>Dự án gần đây</h1>
          </div>
          <button className="primary" onClick={createProject}>＋ Tạo dự án mới</button>
        </header>

        {loading ? <p>Đang tải dự án…</p> : null}
        {!loading && projects.length === 0 ? (
          <section className="empty"><h2>Chưa có dự án</h2><p>Tạo dự án đầu tiên để bắt đầu xử lý video.</p></section>
        ) : null}

        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="thumbnail" aria-label={`Thumbnail ${project.name}`}>
                {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" /> : <span>VV</span>}
                <b>{Math.round(project.progress)}%</b>
              </div>
              <div className="project-body">
                <div className="project-heading"><h2>{project.name}</h2><span className={`status ${project.status}`}>{project.status === "processing" ? "Đang xử lý" : project.status}</span></div>
                <p>{project.videoCount} video · {formatDuration(project.totalDurationMs)}</p>
                <div className="progress" aria-label={`Tiến độ ${project.progress}%`}><span style={{ width: `${project.progress}%` }} /></div>
                <div className="project-actions">
                  <Link className="continue" href={`/projects/${project.id}/sources`}>Tiếp tục chỉnh sửa</Link>
                  <button onClick={() => duplicateProject(project)}>Nhân bản</button>
                  <button onClick={() => renameProject(project)}>Đổi tên</button>
                  <button aria-label={`Xóa ${project.name}`} onClick={() => setDeleting(project)}>Xóa</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {deleting ? (
        <div className="modal-backdrop">
          <section aria-label="Xóa dự án?" aria-modal="true" className="modal" role="dialog">
            <h2>Xóa dự án?</h2>
            <p>Hành động này sẽ xóa dữ liệu cloud của “{deleting.name}”. Video trên máy chỉ bị xóa khi bạn chọn riêng.</p>
            <div><button onClick={() => setDeleting(null)}>Giữ lại</button><button className="danger" onClick={() => deleteProject(deleting)}>Xóa dự án</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
