import { test, expect } from "@playwright/test";
test("public home, four-field request, responsive layout and privacy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("link", { name: "طلب خدمة", exact: true }).click();
  await expect(
    page.locator("form input,form textarea,form select"),
  ).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "الخصوصية", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "الخصوصية", exact: true }),
  ).toBeVisible();
});
test("protected orders and removed tracking page", async ({
  page,
  request,
}) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/admin\/login/);
  expect(
    (await request.get("/track/00000000-0000-4000-8000-000000000000")).status(),
  ).toBe(404);
  expect((await request.get("/api/cron/notifications")).status()).toBe(404);
  expect(
    (
      await request.get(
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong",
      )
    ).status(),
  ).toBe(403);
});
