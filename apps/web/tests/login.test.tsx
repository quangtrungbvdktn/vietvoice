// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "../app/login/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("private login", () => {
  it("stores the private access token locally instead of sending it in a URL", () => {
    localStorage.clear();
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Mã truy cập riêng tư"), { target: { value: "private-secret" } });
    fireEvent.submit(screen.getByRole("button", { name: "Mở VietVoice" }).closest("form")!);
    expect(localStorage.getItem("vietvoice.accessToken")).toBe("private-secret");
  });
});
