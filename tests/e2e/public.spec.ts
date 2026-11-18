import { test, expect } from "@playwright/test";
test("واجهة عربية وحالة الإعداد دون بيانات وهمية", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: "لنجهّز مساحة العمل" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "دخول لوحة الإدارة" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("الإدارة محمية وتسجيل الدخول غير مفعل دون قاعدة البيانات", async ({
  page,
}) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/admin\/login/);
  await expect(
    page.getByRole("button", { name: "تسجيل الدخول", exact: true }),
  ).toBeDisabled();
});
test("رابط الطلب وحده لا يكشف البيانات", async ({ page }) => {
  await page.goto("/track/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("heading", { name: "الصفحة غير موجودة" }),
  ).toBeVisible();
});
test("الوضع الداكن وسياسة الخصوصية", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "تبديل المظهر" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("link", { name: "سياسة الخصوصية" }).click();
  await expect(
    page.getByRole("heading", { name: "سياسة الخصوصية" }),
  ).toBeVisible();
});
test("رفض طلبات الإدارة وCron وWebhook غير الموثقة", async ({ request }) => {
  const cron = await request.get("/api/cron/notifications");
  expect(cron.status()).toBe(401);
  const webhook = await request.get(
    "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong",
  );
  expect(webhook.status()).toBe(403);
  const result = await request.post("/api/admin/settings", {
    headers: { origin: "https://attacker.invalid" },
    data: {},
  });
  expect(result.status()).toBe(400);
});
