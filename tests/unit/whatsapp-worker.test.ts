import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  send: vi.fn(),
  message: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  db: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/server/ultramsg", () => ({
  ultraConfig: () => ({ token: "private" }),
  environmentEnabled: () => true,
  defaultRecipients: () => ["+963953705031"],
  bookingMessage: mocks.message,
  sendUltraMessage: mocks.send,
  getUltraMessage: mocks.get,
  connectionStatus: async () => "متصلة",
}));
import {
  processWhatsApp,
  queueWhatsAppTest,
  refreshWhatsAppStatus,
} from "@/server/whatsapp";
const job = {
  id: "job",
  booking_id: "booking",
  recipient: "+963953705031",
  lock_token: "lease",
  attempts: 1,
  external_id: "497",
  status: "queued",
};
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  Object.values(q).forEach((fn) => fn.mockReturnValue(q));
  return Object.assign(q, {
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === "claim_ultramsg" ? [job] : null,
    error: null,
  }));
  mocks.from.mockReturnValue(query({ snapshot: { ad_placement: "فيسبوك" } }));
  mocks.message.mockReturnValue("طلب محفوظ بالعربية");
  mocks.send.mockResolvedValue({
    status: "queued",
    external: "497",
    error: null,
    retry: false,
  });
});
it("dispatches committed data to the leased recipient and records acceptance", async () => {
  expect(await processWhatsApp("REQ-1")).toEqual({ processed: 1 });
  expect(mocks.rpc).toHaveBeenCalledWith("claim_ultramsg", {
    p_enabled: true,
    p_recipients: ["+963953705031"],
    p_number: "REQ-1",
  });
  expect(mocks.message).toHaveBeenCalledWith({ ad_placement: "فيسبوك" });
  expect(mocks.send).toHaveBeenCalledWith(
    "+963953705031",
    "طلب محفوظ بالعربية",
    "booking",
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    "finish_ultramsg",
    expect.objectContaining({
      p_lock: "lease",
      p_status: "queued",
      p_external: "497",
    }),
  );
});
it("does not convert a failed finalization after acceptance into an automatic resend", async () => {
  mocks.rpc.mockImplementation(async (name) => ({
    data: name === "claim_ultramsg" ? [job] : null,
    error: name === "finish_ultramsg" ? { message: "database down" } : null,
  }));
  await expect(processWhatsApp()).rejects.toThrow();
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(
    mocks.rpc.mock.calls.filter(([name]) => name === "finish_ultramsg"),
  ).toHaveLength(1);
});
it("keeps preparation failures retryable without calling the provider", async () => {
  mocks.message.mockImplementation(() => {
    throw Error("data missing");
  });
  await processWhatsApp();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith(
    "finish_ultramsg",
    expect.objectContaining({
      p_status: "failed",
      p_retry: true,
      p_external: null,
    }),
  );
});
it("waits for every in-flight attempt even if one finalization fails", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === "claim_ultramsg")
      return { data: [job, { ...job, id: "second" }], error: null };
    if (args.p_id === "second") await gate;
    return {
      data: null,
      error: args.p_id === "job" ? { message: "database down" } : null,
    };
  });
  const failed = vi.fn();
  const processing = processWhatsApp().catch(failed);
  await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
  expect(failed).not.toHaveBeenCalled();
  release();
  await processing;
  expect(failed).toHaveBeenCalledOnce();
});
it("updates delivery only for the verified recipient and provider ID", async () => {
  mocks.from.mockReturnValue(query([job]));
  mocks.get.mockResolvedValue({
    id: 497,
    to: "963953705031@c.us",
    status: "sent",
    ack: "device",
    sent_at: 1795478400,
  });
  await refreshWhatsAppStatus("497");
  expect(mocks.rpc).toHaveBeenCalledWith(
    "record_ultramsg_status",
    expect.objectContaining({
      p_id: "job",
      p_external: "497",
      p_status: "delivered",
    }),
  );
  mocks.rpc.mockClear();
  mocks.get.mockResolvedValue({
    id: 497,
    to: "14155552671@c.us",
    status: "sent",
    ack: "device",
  });
  await refreshWhatsAppStatus("497");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("queues test messages only to saved settings, with no arbitrary request destination", async () => {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  mocks.from.mockImplementation((table) =>
    table === "whatsapp_settings"
      ? query({ enabled: true, recipients: ["+14155552671"] })
      : { insert },
  );
  await queueWhatsAppTest();
  expect(insert).toHaveBeenCalledWith([{ recipient: "+14155552671" }]);
});
