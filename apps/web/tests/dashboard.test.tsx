// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "../components/dashboard";

describe("Dashboard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows recent projects and requires confirmation before deletion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Huyền môn đại lão",
            status: "processing",
            totalDurationMs: 5_430_000,
            videoCount: 24,
            progress: 62,
            thumbnailUrl: null,
            updatedAt: "2026-09-19T12:00:00.000Z",
            version: 0,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<Dashboard />);

    expect(await screen.findByText("Huyền môn đại lão")).toBeTruthy();
    expect(screen.getByText(/^24 video/)).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Xóa Huyền môn đại lão" }));
    expect(screen.getByRole("dialog", { name: "Xóa dự án?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Giữ lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Huyền môn đại lão")).toBeTruthy();
  });
});
