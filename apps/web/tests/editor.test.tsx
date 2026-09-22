// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectEditor } from "../components/editor/project-editor";

describe("ProjectEditor", () => {
  it("saves translation edits and creates a non-destructive re-export", () => {
    const onSave = vi.fn();
    const onExport = vi.fn();
    render(<ProjectEditor segments={[{ id: "s1", startMs: 2_000, endMs: 4_000, original: "你好", translation: "Xin chào", role: "Nữ chính", voice: "Hoài My" }]} onSave={onSave} onExport={onExport} />);

    fireEvent.change(screen.getByLabelText("Bản dịch s1"), { target: { value: "Chào bạn" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", translation: "Chào bạn" }));
    fireEvent.click(screen.getByRole("button", { name: "Xuất phiên bản mới" }));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ preset: "original", resolution: "original" }));
  });
});
