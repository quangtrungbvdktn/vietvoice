// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectPipeline } from "../components/project-pipeline";

describe("ProjectPipeline", () => {
  afterEach(() => vi.restoreAllMocks());
  it("loads the selected background job instead of showing fixture progress", async () => {
    localStorage.setItem("vietvoice.accessToken", "private-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{
      id: "job-1", stage: "video_input", status: "running", progress: 37, attempt: 2,
    }]), { status: 200, headers: { "content-type": "application/json" } }));
    render(<ProjectPipeline projectId="project-1" jobId="job-1" pollIntervalMs={60_000} />);
    expect(await screen.findByText("Nhận video")).toBeTruthy();
    expect(screen.getByText("37%")).toBeTruthy();
    expect(screen.getByText(/Lần thử 2/)).toBeTruthy();
  });
});
