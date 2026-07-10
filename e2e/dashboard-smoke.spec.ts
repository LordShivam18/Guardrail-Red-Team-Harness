import { expect, test } from "@playwright/test";

test("dashboard renders the control room", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByText("Red-Team Control Room")).toBeVisible();
});
