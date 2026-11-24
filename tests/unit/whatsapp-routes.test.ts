import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  rpc: vi.fn(),
  limit: vi.fn(),
  dashboard: vi.fn(),
  process: vi.fn(),
  test: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  admin: mocks.admin,
  db: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/http", async (original) => ({
  ...(await original<typeof import("@/lib/http")>()),
  limit: mocks.limit,
}));
vi.mock("@/server/whatsapp", () => ({
  whatsappDashboard: mocks.dashboard,
  processWhatsApp: mocks.process,
  queueWhatsAppTest: mocks.test,
  refreshWhatsAppStatus: mocks.refresh,
}));
import { GET, POST } from "@/app/api/admin/whatsapp/route";
import { GET as cron } from "@/app/api/cron/whatsapp/route";
import { POST as webhook } from "@/app/api/whatsapp/ultramsg/route";
import { GET as migration } from "@/app/api/admin/whatsapp/migration/route";
import { WHATSAPP_SETUP_REQUIRED, whatsappSetupMessage } from "@/lib/whatsapp";
const request = (body: unknown, origin = "https://example.test") =>
  new Request("https://example.test/api/admin/whatsapp", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://example.test");
  vi.stubEnv("CRON_SECRET", "a".repeat(32));
  mocks.admin.mockResolvedValue({ id: "actor" });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.dashboard.mockResolvedValue({ configured: true });
  mocks.process.mockResolvedValue({ processed: 1 });
});
afterEach(() => vi.unstubAllEnvs());
it("reports a missing migration as a service setup prerequisite", async () => {
  mocks.dashboard.mockRejectedValue(Error(WHATSAPP_SETUP_REQUIRED));
  const response = await GET(new Request("https://example.test"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: whatsappSetupMessage,
    setup_required: true,
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("provides the exact migration file to authenticated administrators only", async () => {
  const response = await migration(new Request("https://example.test"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain(
    "202611240001_ultramsg_notifications.sql",
  );
  const sql = await response.text();
  expect(sql).toContain("CREATE TABLE public.whatsapp_notifications");
  expect(sql).toContain("REVOKE ALL ON FUNCTION");
  expect(sql).not.toContain("ULTRAMSG_TOKEN=");
  mocks.admin.mockRejectedValue(Error("UNAUTHORIZED"));
  expect((await migration(new Request("https://example.test"))).status).toBe(
    401,
  );
});
it("returns the setup prerequisite for missing write RPCs without attempting dispatch", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: "PGRST202", message: "raw internal schema details" },
  });
  const response = await POST(
    request({
      action: "save",
      settings: { enabled: true, recipients: ["+963953705031"] },
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: whatsappSetupMessage,
    setup_required: true,
  });
  expect(mocks.process).not.toHaveBeenCalled();
});
it("downloads the optional Supabase Cron migration only from the fixed allowlist", async () => {
  const response = await migration(
    new Request("https://example.test/api/admin/whatsapp/migration?kind=cron"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain(
    "202611240002_whatsapp_supabase_cron.sql",
  );
  expect(await response.text()).toContain("public.configure_whatsapp_cron");
});
it("denies unauthenticated reads and mutations before dispatch", async () => {
  mocks.admin.mockRejectedValue(Error("UNAUTHORIZED"));
  expect((await GET(new Request("https://example.test"))).status).toBe(401);
  expect((await POST(request({ action: "test" }))).status).toBe(401);
  expect(mocks.test).not.toHaveBeenCalled();
  expect(mocks.dashboard).not.toHaveBeenCalled();
});
it("rejects cross-origin mutations and arbitrary message recipients", async () => {
  expect(
    (await POST(request({ action: "test" }, "https://evil.test"))).status,
  ).toBe(400);
  expect(
    (await POST(request({ action: "test", to: "+123456789", body: "spam" })))
      .status,
  ).toBe(400);
  expect(mocks.test).not.toHaveBeenCalled();
});
it("saves validated settings using the authenticated actor", async () => {
  const response = await POST(
    request({
      action: "save",
      settings: { enabled: true, recipients: ["+963953705031"] },
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("save_ultramsg_settings", {
    p_enabled: true,
    p_recipients: ["+963953705031"],
    p_actor: "actor",
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("queues a test message and applies a stricter rate limit", async () => {
  expect((await POST(request({ action: "test" }))).status).toBe(200);
  expect(mocks.limit).toHaveBeenCalledWith(
    expect.any(Request),
    "whatsapp-test:actor",
    2,
  );
  expect(mocks.test).toHaveBeenCalledOnce();
  expect(mocks.process).toHaveBeenCalledOnce();
  expect(mocks.test.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.process.mock.invocationCallOrder[0],
  );
});
it("requires duplicate-risk acknowledgement for manual resend", async () => {
  const id = crypto.randomUUID();
  expect((await POST(request({ action: "retry", id }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(
    (await POST(request({ action: "retry", id, acknowledge_duplicate: true })))
      .status,
  ).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("retry_ultramsg", {
    p_id: id,
    p_actor: "actor",
    p_ack: true,
  });
});
it("protects the scheduled worker and returns only safe failures", async () => {
  expect((await cron(new Request("https://example.test"))).status).toBe(401);
  mocks.process.mockRejectedValue(Error("private-provider-token"));
  const result = await cron(
    new Request("https://example.test", {
      headers: { authorization: `Bearer ${"a".repeat(32)}` },
    }),
  );
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("private-provider-token");
});
it("treats webhook data as a hint and never directly trusts its claimed delivery status", async () => {
  expect(
    (
      await webhook(
        request({
          event_type: "message_ack",
          id: 497,
          data: { ack: "device" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.refresh).toHaveBeenCalledWith("497");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("bounds JSON bodies before any sending action", async () => {
  expect(
    (await POST(request({ action: "test", padding: "x".repeat(5000) }))).status,
  ).toBe(400);
  expect(mocks.test).not.toHaveBeenCalled();
  expect((await webhook(request({ padding: "x".repeat(17000) }))).status).toBe(
    413,
  );
});
