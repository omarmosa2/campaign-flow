import { test, expect } from "@playwright/test";
test("public submission, admin session, counts, search, pagination and retired routes", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ابدأ حملتك الإعلانية بسهولة" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "طلب خدمة", exact: true }).click();
  await expect(page).toHaveURL(/\/request$/);
  await expect(
    page.locator("form input,form textarea,form select"),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "إرسال الطلب", exact: true }).click();
  await expect(
    page.getByText("أدخل موقع عرض الإعلان", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("موقع عرض الإعلان", { exact: true })
    .fill("Instagram طلب المستخدم " + test.info().project.name);
  await page.getByLabel("الفئة العمرية", { exact: true }).fill("25");
  await page
    .getByLabel("اهتمامات الجمهور", { exact: true })
    .fill("التصميم والتقنية");
  await page
    .getByLabel("الهدف من الحملة الإعلانية", { exact: true })
    .selectOption("مشاهدات");
  await page.getByRole("button", { name: "إرسال الطلب", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "تم استلام طلبك" }),
  ).toBeVisible();
  const order = await page.locator(".success-panel strong").innerText();
  expect((await request.get("/api/orders")).status()).toBe(405);
  expect((await request.get("/api/admin/orders")).status()).toBe(401);
  expect((await request.get("/api/admin/stats")).status()).toBe(401);
  for (const patch of [
    { ad_placement: "" },
    { age_group: 2.5 },
    { age_group: "25" },
    { campaign_objective: "sales" },
  ]) {
    const r = await request.post("/api/orders", {
      headers: { Origin: "http://127.0.0.1:3001" },
      data: {
        ad_placement: "Facebook",
        age_group: 25,
        audience_interests: "تقنية",
        campaign_objective: "مشاهدات",
        idempotency_key: crypto.randomUUID(),
        ...patch,
      },
    });
    expect(r.status()).toBe(400);
  }
  await page.goto("/admin/login");
  await page
    .getByLabel("البريد الإلكتروني", { exact: true })
    .fill("admin@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Strong-password-123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.locator(".request-stat")).toHaveCount(2);
  let stats = await (await page.request.get("/api/admin/stats")).json();
  const baseline = stats.total;
  expect(stats.today).toBe(baseline);
  await page.goto("/admin/orders");
  await expect(
    page.getByText(order, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ إضافة طلب جديد", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("موقع عرض الإعلان", { exact: true })
    .fill("TikTok طلب المدير " + test.info().project.name);
  await page.getByLabel("الفئة العمرية", { exact: true }).fill("30");
  await page.getByLabel("اهتمامات الجمهور", { exact: true }).fill("الرياضة");
  await page
    .getByLabel("الهدف من الحملة الإعلانية", { exact: true })
    .selectOption("متابعين");
  await page.getByRole("button", { name: "حفظ الطلب", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page
      .getByText("TikTok طلب المدير " + test.info().project.name, {
        exact: true,
      })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  stats = await (await page.request.get("/api/admin/stats")).json();
  expect(stats).toEqual({ total: baseline + 1, today: baseline + 1 });
  const key = crypto.randomUUID();
  const body = {
    ad_placement: "مكرر " + test.info().project.name,
    age_group: 30,
    audience_interests: "اختبار",
    campaign_objective: "متابعين",
    idempotency_key: key,
  };
  const options = { headers: { Origin: "http://127.0.0.1:3001" }, data: body };
  const first = await page.request.post("/api/admin/orders", options);
  expect(first.status()).toBe(201);
  expect(
    await (await page.request.post("/api/admin/orders", options)).json(),
  ).toEqual(await first.json());
  await page.getByLabel("البحث في الطلبات").fill("Instagram");
  await expect(
    page
      .getByText("TikTok طلب المدير " + test.info().project.name, {
        exact: true,
      })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(order, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "عرض التفاصيل", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "تفاصيل الطلب", exact: true }),
  ).toBeVisible();
  for (const path of [
    "/admin/campaigns",
    "/admin/services",
    "/admin/team",
    "/admin/settings",
    "/admin/notifications",
    "/campaigns/old",
    "/services/old",
    "/api/admin/settings",
    "/api/payments/old",
    "/api/cron/notifications",
  ])
    expect((await page.request.get(path)).status(), path).toBe(404);
  await page.goto("/admin/dashboard");
  await expect(page.locator(".request-stat strong").first()).toHaveText(
    (baseline + 2).toLocaleString("ar"),
  );
  const refreshed = await page.request.post("/api/admin/orders", {
    headers: {Origin:"http://127.0.0.1:3001"},
    data:{...body,ad_placement:"تحديث مباشر "+test.info().project.name,idempotency_key:crypto.randomUUID()},
  });
  expect(refreshed.status()).toBe(201);
  await expect(page.locator(".request-stat strong").first()).toHaveText((baseline+3).toLocaleString("ar"));
  await page.screenshot({
    path: `artifacts/simplified-dashboard-${test.info().project.name}.png`,
    fullPage: true,
    caret: "initial",
  });
  await page.goto("/admin/orders");
  await page.screenshot({
    path: `artifacts/simplified-orders-${test.info().project.name}.png`,
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (test.info().project.name === "mobile")
    await page
      .getByRole("button", { name: "فتح القائمة", exact: true })
      .click();
  await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/");
  await page.screenshot({
    path: `artifacts/simplified-home-${test.info().project.name}.png`,
    fullPage: true,
    caret: "initial",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
