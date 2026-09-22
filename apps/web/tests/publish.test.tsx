// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { PublishForm } from "../components/publish-form";
describe("PublishForm", () => { it("requires explicit confirmation", () => { const onPublish=vi.fn(); render(<PublishForm onPublish={onPublish}/>); fireEvent.change(screen.getByLabelText("Chú thích"),{target:{value:"Tập mới"}}); fireEvent.click(screen.getByRole("button",{name:"Xem lại và xác nhận"})); expect(onPublish).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button",{name:"Xác nhận đăng"})); expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({caption:"Tập mới",platform:"tiktok"})); }); });
