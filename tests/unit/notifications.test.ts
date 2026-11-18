import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ db: () => mock }));
import { processOutbox } from "@/server/notifications";
import {
  POST as webhook,
  GET as verify,
} from "@/app/api/whatsapp/webhook/route";
let config: Record<string, unknown>;
beforeEach(() => {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-secret");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v-test");
  vi.stubEnv("META_APP_SECRET", "test-app-secret");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify");
  vi.stubEnv("APP_URL", "https://example.test");
  config = {
    whatsapp_enabled: true,
    notification_events: ["order_created"],
    recipient_consent: true,
    templates: { order_created: "new_order" },
    whatsapp_recipient: "1234567890",
    whatsapp_language: "ar",
  };
  mock.rpc.mockReset();
  mock.from.mockReset();
  mock.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "claim_notifications"
        ? [
            {
              id: "j1",
              order_id: "o1",
              event: "order_created",
              attempts: 1,
              lock_token: "l1",
            },
          ]
        : null,
    error: null,
  }));
  mock.from.mockImplementation((table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({
        data:
          table === "settings"
            ? { value: config }
            : {
                id: "o1",
                order_number: "CF-1",
                customer_name: "عميل",
                item_name: "خدمة",
                amount: 50,
                currency: "USD",
                payment_status: "pending",
              },
        error: null,
      }),
    };
    return q;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("تكامل Meta باستخدام Mock فقط", () => {
  it("لا يسحب مهاماً إذا غابت بيانات الاعتماد", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const result = await processOutbox();
    expect(result.enabled).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("يرسل قالباً مع ستة معاملات ويحفظ معرف Meta", async () => {
    const send = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", send);
    expect((await processOutbox()).processed).toBe(1);
    const body = JSON.parse(send.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.template.components[0].parameters).toHaveLength(6);
    expect(body.template.components[0].parameters[5].text).toContain(
      "/admin/orders/o1",
    );
    expect(mock.rpc).toHaveBeenCalledWith(
      "finish_notification",
      expect.objectContaining({
        p_status: "sent",
        p_external: "wamid.1",
        p_lock: "l1",
      }),
    );
  });
  it("يسجل الخطأ المؤقت ويؤجل المحاولة", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 130429, message: "sensitive raw text" },
          }),
          { status: 429 },
        ),
      ),
    );
    await processOutbox();
    const call = mock.rpc.mock.calls.find(
      (c) => c[0] === "finish_notification",
    )![1];
    expect(call.p_status).toBe("failed");
    expect(new Date(call.p_next).getTime()).toBeGreaterThan(Date.now());
    expect(call.p_error).not.toContain("sensitive raw text");
  });
  it("يعزل خطأ Meta الدائم ويعرض رقمه", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 132001 } }), {
          status: 400,
        }),
      ),
    );
    await processOutbox();
    expect(mock.rpc).toHaveBeenCalledWith(
      "finish_notification",
      expect.objectContaining({
        p_status: "disabled",
        p_error: expect.stringContaining("132001"),
      }),
    );
  });
  it("لا يعيد الإرسال تلقائياً عند مهلة أو انقطاع بنتيجة مجهولة", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("timeout")));
    await processOutbox();
    expect(mock.rpc).toHaveBeenCalledWith(
      "finish_notification",
      expect.objectContaining({ p_status: "uncertain" }),
    );
  });
  it("يرفض Webhook دون توقيع", async () => {
    const response = await webhook(
      new Request("https://example.test/api/whatsapp/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("يقبل التوقيع الصحيح ويكتب حدثاً مقتضباً", async () => {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.1",
                    status: "delivered",
                    timestamp: "123",
                    recipient_id: "sensitive",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature =
      "sha256=" +
      createHmac("sha256", "test-app-secret").update(body).digest("hex");
    const response = await webhook(
      new Request("https://example.test/api/whatsapp/webhook", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": signature },
      }),
    );
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(
      "record_webhook",
      expect.objectContaining({
        p_status: "delivered",
        p_payload: expect.not.objectContaining({
          recipient_id: expect.anything(),
        }),
      }),
    );
  });
  it("يتحقق من تحدي Meta", async () => {
    const response = await verify(
      new Request(
        "https://example.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=1234",
      ),
    );
    expect(await response.text()).toBe("1234");
  });
  it("يحترم تعطيل الحدث قبل الإرسال", async () => {
    config.notification_events = [];
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    await processOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith(
      "finish_notification",
      expect.objectContaining({ p_status: "disabled" }),
    );
  });
});
