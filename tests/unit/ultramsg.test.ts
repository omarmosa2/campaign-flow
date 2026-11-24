import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  bookingMessage,
  connectionStatus,
  sendUltraMessage,
  ultraConfig,
} from "@/server/ultramsg";
import { whatsappSettingsSchema } from "@/lib/whatsapp";
beforeEach(() => {
  vi.stubEnv("ULTRAMSG_TOKEN", "private-test-token");
  vi.stubEnv("ULTRAMSG_INSTANCE_ID", "instance197517");
  vi.stubEnv("ULTRAMSG_API_URL", "https://api.ultramsg.com");
  vi.stubEnv("APP_URL", "https://booking.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("posts UTF-8 form data with tracking fields and only records acceptance", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ sent: "true", id: 497 }));
  vi.stubGlobal("fetch", fetch);
  expect(
    await sendUltraMessage(
      "+963953705031",
      "🔔 طلب جديد بالعربية",
      "booking-id",
    ),
  ).toEqual({ status: "queued", external: "497", error: null, retry: false });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("https://api.ultramsg.com/instance197517/messages/chat");
  expect(options.redirect).toBe("error");
  expect(Object.fromEntries(options.body)).toEqual({
    token: "private-test-token",
    to: "+963953705031",
    body: "🔔 طلب جديد بالعربية",
    priority: "1",
    referenceId: "booking-id",
    msgId: "",
    mentions: "",
  });
});
it("requires a valid payload rather than HTTP success alone, with no provider error leakage", async () => {
  for (const payload of [
    { sent: false, error: "private-test-token" },
    { id: 1 },
    { sent: "true" },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    const result = await sendUltraMessage("+963953705031", "طلب", "id");
    expect(result.status).not.toBe("queued");
    expect(JSON.stringify(result)).not.toContain("private-test-token");
  }
});
it("limits automatic retries to explicit temporary rejection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ sent: false }, { status: 429 })),
  );
  expect(await sendUltraMessage("+963953705031", "طلب", "id")).toMatchObject({
    status: "failed",
    retry: true,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "internal error" }, { status: 500 }),
      ),
  );
  expect(await sendUltraMessage("+963953705031", "طلب", "id")).toMatchObject({
    status: "uncertain",
    retry: false,
  });
});
it("preserves uncertainty on timeouts, malformed response and network failure", async () => {
  for (const send of [
    vi
      .fn()
      .mockRejectedValue(
        Error("https://api.ultramsg.com?token=private-test-token"),
      ),
    vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })),
  ]) {
    vi.stubGlobal("fetch", send);
    const result = await sendUltraMessage("+963953705031", "طلب", "id");
    expect(result).toMatchObject({ status: "uncertain", retry: false });
    expect(JSON.stringify(result)).not.toContain("private-test-token");
  }
});
it("reports disconnected instance without treating queued messages as delivered", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: { accountStatus: { status: "disconnected" } },
        }),
      ),
  );
  expect(await connectionStatus()).toBe("غير متصلة");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ sent: "true", id: 42 })),
  );
  expect(await sendUltraMessage("+963953705031", "طلب", "id")).toMatchObject({
    status: "queued",
  });
});
it("uses real saved fields, Syrian time, details URL and bounded Arabic text", () => {
  const snapshot = {
    id: "10000000-0000-4000-8000-000000000001",
    order_number: "REQ-1",
    ad_placement: "فيسبوك",
    age_group: 25,
    audience_interests: "تقنية".repeat(1500),
    campaign_objective: "مشاهدات",
    payment_status: "review",
    created_at: "2026-11-24T00:30:00Z",
  };
  const body = bookingMessage(snapshot);
  expect(body).toContain("فيسبوك");
  expect(body).toContain("بانتظار المراجعة");
  expect(body).toContain(
    new Intl.DateTimeFormat("ar-SY", {
      timeZone: "Asia/Damascus",
      timeStyle: "short",
    }).format(new Date(snapshot.created_at)),
  );
  expect(body).toContain(
    `https://booking.example.test/admin/orders/${snapshot.id}`,
  );
  expect(body).not.toMatch(/undefined|null|اسم العميل|رقم الهاتف|الميزانية/);
  expect(body.length).toBeLessThanOrEqual(4096);
});
it("validates admin recipients and prevents credential redirection", () => {
  expect(
    whatsappSettingsSchema.safeParse({
      enabled: true,
      recipients: ["+963953705031"],
    }).success,
  ).toBe(true);
  for (const recipients of [
    [],
    ["0953705031"],
    ["+963953705031@c.us"],
    Array(6).fill("+963953705031"),
  ])
    expect(
      whatsappSettingsSchema.safeParse({ enabled: true, recipients }).success,
    ).toBe(false);
  vi.stubEnv("ULTRAMSG_API_URL", "https://evil.example.test");
  expect(ultraConfig()).toBeNull();
});
