// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { SourceSelection, type SourceRow } from "../components/source-selection";

const rows: SourceRow[] = [
  { id: "yt:1", title: "Tập 01 · Khởi đầu", source: "YouTube", episodeNumber: 1, durationMs: 62_000, status: "ready" },
  { id: "yt:2", title: "Tập 02 · Bí mật", source: "YouTube", episodeNumber: 2, durationMs: 740_000, status: "ready", possibleDuplicate: true },
  { id: "yt:3", title: "Trailer", source: "YouTube", episodeNumber: null, durationMs: null, status: "unavailable" },
];

describe("SourceSelection", () => {
  it("filters episodes while preserving selected identities", () => {
    const onAdd = vi.fn();
    const { rerender } = render(<SourceSelection rows={rows.slice(0, 2)} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Tập 02/ }));
    rerender(<SourceSelection rows={rows} onAdd={onAdd} />);
    fireEvent.change(screen.getByPlaceholderText("Tìm tiêu đề hoặc số tập"), { target: { value: "Trailer" } });
    expect(screen.queryByText("Tập 02 · Bí mật")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Thêm 1 video vào hàng đợi/ }));
    expect(onAdd).toHaveBeenCalledWith(["yt:2"]);
  });
});
