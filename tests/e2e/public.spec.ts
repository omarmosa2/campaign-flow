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
test("tolerates extension attributes on body while hydrating the request form", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated/i.test(message.text())
    )
      hydrationErrors.push(message.text());
  });
  await page.addInitScript(() => {
    const inject = () => {
      if (!document.body) return false;
      document.body.setAttribute("cz-shortcut-listen", "true");
      return true;
    };
    if (!inject()) {
      const observer = new MutationObserver(() => {
        if (inject()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  });
  await page.goto("/request");
  await page
    .getByLabel("موقع عرض الإعلان", { exact: true })
    .fill("اختبار الإضافة");
  await page.getByLabel("الفئة العمرية", { exact: true }).fill("25");
  await page.getByLabel("اهتمامات الجمهور", { exact: true }).fill("تقنية");
  await page
    .getByLabel("الهدف من الحملة الإعلانية", { exact: true })
    .selectOption("مشاهدات");
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute(
    "cz-shortcut-listen",
    "true",
  );
  await expect(
    page.getByRole("heading", {
      name: "إتمام الطلب — إشعار الدفع",
      exact: true,
    }),
  ).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});
