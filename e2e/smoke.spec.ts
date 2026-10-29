import { expect, test } from "@playwright/test";

test("홈 화면이 열리고 증상 입력창과 고지가 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("증상 상담");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "증상 상담"
  );
  await expect(page.getByLabel("증상")).toBeVisible();
  await expect(page.getByText(/구글의 서비스 개선에 쓰일 수 있/)).toBeVisible();
});
