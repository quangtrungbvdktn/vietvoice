import { expect, test } from "@playwright/test";

test("shows recent projects and requires confirmation before deletion", async ({
  page,
}) => {
  await page.route("**/v1/projects", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
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
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dự án gần đây" })).toBeVisible();
  await expect(page.getByText("Huyền môn đại lão")).toBeVisible();
  await expect(page.getByText("24 video")).toBeVisible();
  await expect(page.getByText("62%")).toBeVisible();

  await page.getByRole("button", { name: "Xóa Huyền môn đại lão" }).click();
  await expect(page.getByRole("dialog", { name: "Xóa dự án?" })).toBeVisible();
  await page.getByRole("button", { name: "Giữ lại" }).click();
  await expect(page.getByText("Huyền môn đại lão")).toBeVisible();
});
