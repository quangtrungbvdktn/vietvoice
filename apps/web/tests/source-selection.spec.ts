import { expect, test } from "@playwright/test";

test("selects a ready episode and adds it to the queue", async ({ page }) => {
  await page.goto("/projects/demo/sources");
  await page.getByRole("checkbox", { name: /Tập 01/ }).check();
  await expect(page.getByRole("button", { name: "Thêm 1 video vào hàng đợi" })).toBeEnabled();
});
