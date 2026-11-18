import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3001";
test("دورة المدير والعميل ورفض الإشعار وإعادة رفعه واعتماده", async ({
  browser,
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByLabel("البريد الإلكتروني").fill("admin@example.test");
  await page
    .getByLabel("كلمة المرور", { exact: true })
    .fill("Strong-password-123!");
  const loginResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth"),
  );
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  const lr = await loginResponse;
  expect(lr.ok(), await lr.text()).toBe(true);
  await expect(page).toHaveURL(/admin\/dashboard/);
  // All mutations hit real application endpoints; Supabase HTTP is the local test double backed by PostgreSQL WASM.
  const api = page.request;
  const headers = { origin };
  let r = await api.post("/api/admin/catalog/services", {
    headers,
    data: {
      name: "خدمة تسويق",
      slug: "workflow-service",
      description: "خدمة اختبار محلية",
      details: "تفاصيل",
      price: 50,
      currency: "USD",
      status: "active",
      form_schema: [],
      service_ids: [],
    },
  });
  expect(r.ok(), await r.text()).toBe(true);
  const service = (await r.json()).id;
  await page.goto("/admin/campaigns/new");
  await page.getByLabel("الاسم", { exact: true }).fill("حملة متكاملة");
  await page.getByLabel("الرابط المخصص").fill("workflow-campaign");
  await page.getByLabel("وصف قصير").fill("خدمة تسويق مخصصة");
  await page.getByLabel("السعر", { exact: true }).fill("50");
  await page.getByLabel("الحالة").selectOption("active");
  await page.getByLabel("خدمة تسويق", { exact: true }).check();
  await page.getByRole("button", { name: "إضافة حقل", exact: true }).click();
  await page.getByLabel("عنوان الحقل").fill("هدف المشروع");
  await page.getByLabel("حقل إلزامي").check();
  await page.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(page).toHaveURL(/admin\/campaigns$/);
  const settings = {
    platform_name: "مدار",
    currency: "USD",
    timezone: "Asia/Damascus",
    date_format: "dd/MM/yyyy",
    accepting_orders: true,
    sham_name: "حساب الاختبار",
    sham_account: "SHAM-TEST",
    payment_instructions: "حوّل المبلغ وارفع الإشعار",
    whatsapp_enabled: false,
    whatsapp_recipient: "",
    whatsapp_language: "ar",
    templates: {},
    notification_events: [
      "order_created",
      "payment_submitted",
      "payment_approved",
    ],
    recipient_consent: false,
  };
  r = await api.post("/api/admin/settings", { headers, data: settings });
  expect(r.ok(), await r.text()).toBe(true);
  const customer = await browser.newContext({
    viewport: { width: 393, height: 851 },
  });
  const client = await customer.newPage();
  await client.goto(origin + "/campaigns/workflow-campaign");
  await client.getByLabel("الاسم الكامل").fill("عميل اختبار");
  await client.getByLabel("رقم الهاتف").fill("+963999999999");
  await client.getByLabel("اختر الخدمة").selectOption(service);
  await client.getByLabel("هدف المشروع").fill("زيادة الطلبات");
  expect(
    await client.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await client.getByRole("checkbox").check();
  await client.getByRole("button", { name: "مراجعة الطلب" }).click();
  await expect(
    client.getByRole("heading", { name: "راجع طلبك قبل التأكيد" }),
  ).toBeVisible();
  await client
    .getByRole("button", { name: "تأكيد الطلب والمتابعة للدفع" })
    .click();
  await expect(client).toHaveURL(/track\//);
  const id = client.url().split("/").pop()!;
  await expect(
    client.getByRole("heading", { name: "الدفع عبر شام كاش" }),
  ).toBeVisible();
  expect(
    await client.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const attacker = await browser.newContext();
  const unauth = await attacker.request.post(origin + "/api/admin/settings", {
    headers: { origin },
    data: {},
  });
  expect(unauth.status()).toBe(401);
  const stolen = await attacker.newPage();
  await stolen.goto(client.url());
  await expect(
    stolen.getByRole("heading", { name: "الصفحة غير موجودة" }),
  ).toBeVisible();
  await attacker.close();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7i0AAAAASUVORK5CYII=",
    "base64",
  );
  await client
    .getByLabel("صورة إشعار التحويل")
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await client
    .getByRole("button", { name: "تأكيد إرسال الإشعار للمراجعة" })
    .click();
  await expect(
    client.getByRole("heading", { name: "استلمنا إشعار التحويل" }),
  ).toBeVisible();
  await page.goto(`/admin/orders/${id}`);
  const receipt = page.getByAltText("صورة إشعار التحويل").first();
  await receipt.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      receipt.evaluate(
        (img) => img instanceof HTMLImageElement && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.getByLabel("قرار المراجعة").selectOption("rejected");
  await page.getByLabel("سبب الرفض / ملاحظة").fill("أعد رفع صورة واضحة");
  await page.getByLabel("أؤكد رفض الإشعار").check();
  await page.getByRole("button", { name: "تأكيد قرار المراجعة" }).click();
  await expect(
    page.getByText("الدفع مرفوض", { exact: true }).first(),
  ).toBeVisible();
  await client.reload();
  await expect(client.getByText(/أعد رفع صورة واضحة/)).toBeVisible();
  await client
    .getByLabel("صورة إشعار التحويل")
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  await client
    .getByRole("button", { name: "تأكيد إرسال الإشعار للمراجعة" })
    .click();
  await expect(
    client.getByRole("heading", { name: "استلمنا إشعار التحويل" }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("تحققت من استلام المبلغ").check();
  await page.getByRole("button", { name: "تأكيد قرار المراجعة" }).click();
  await expect(page.getByText("مدفوع", { exact: true }).first()).toBeVisible();
  await page.getByLabel("حالة التنفيذ").selectOption("processing");
  await page.getByRole("button", { name: "حفظ التحديث" }).click();
  await expect(
    page.getByText("قيد التنفيذ", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("حالة التنفيذ").selectOption("completed");
  await page.getByRole("button", { name: "حفظ التحديث" }).click();
  await expect(page.getByText("مكتمل", { exact: true }).first()).toBeVisible();
  await client.reload();
  await expect(
    client.getByRole("heading", { name: "تم اعتماد الدفع" }),
  ).toBeVisible();
  const exported = await api.get("/api/admin/export");
  expect(exported.ok()).toBe(true);
  expect(await exported.text()).toContain("عميل اختبار");
  await client.screenshot({
    path: "artifacts/customer-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "نظرة عامة", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await customer.close();
});
