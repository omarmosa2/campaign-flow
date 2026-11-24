import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  admin: vi.fn(),
  limit: vi.fn(),
  storage: vi.fn(),
  whatsapp: vi.fn(),
}));
vi.mock("@/server/whatsapp", () => ({ processWhatsApp: mocks.whatsapp }));
vi.mock("@/lib/supabase", () => ({
  db: () => ({ rpc: mocks.rpc, storage: { from: mocks.storage } }),
  admin: mocks.admin,
}));
vi.mock("@/lib/http", async (original) => ({
  ...(await original<typeof import("@/lib/http")>()),
  origin: vi.fn(),
  limit: mocks.limit,
  hash: (v: string) => v,
}));
import { submitRequest } from "@/server/requests";
import { GET } from "@/app/api/admin/orders/[id]/receipt/route";
import { receiptError, validReceipt, RECEIPT_MAX_BYTES } from "@/lib/receipts";
// GET uses the real failure helper in production; tests below target its success/auth boundary separately.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=",
  "base64",
);
function request(
  file: File | null = new File([png], "receipt.png", { type: "image/png" }),
  patch: Record<string, string> = {},
) {
  const f = new FormData();
  Object.entries({
    ad_placement: "فيسبوك",
    age_group: "25",
    audience_interests: "تقنية",
    campaign_objective: "مشاهدات",
    idempotency_key: crypto.randomUUID(),
    ...patch,
  }).forEach(([k, v]) => f.set(k, v));
  if (file) f.set("receipt", file);
  return new Request("http://localhost/api/orders", {
    method: "POST",
    body: f,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.whatsapp.mockReset().mockResolvedValue({ processed: 0 });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockReset().mockResolvedValue({
    data: new Blob([png], { type: "image/png" }),
    error: null,
  });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.storage.mockReturnValue({
    upload: mocks.upload,
    download: mocks.download,
    remove: mocks.remove,
  });
  mocks.rpc.mockImplementation(async (_name, args) => ({
    data: { order_number: "REQ-1", receipt_path: args.p_path },
    error: null,
  }));
  mocks.admin.mockResolvedValue({ id: "admin" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("preserves booking before WhatsApp migration when notifications are disabled", async () => {
  vi.stubEnv("WHATSAPP_NOTIFICATIONS_ENABLED", "false");
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
  expect(await submitRequest(request())).toEqual({ order_number: "REQ-1" });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc.mock.calls[0][0]).toBe("submit_ad_request_with_whatsapp");
  expect(mocks.rpc.mock.calls[1][0]).toBe("submit_ad_request_with_receipt");
  expect(mocks.rpc.mock.calls[1][1]).not.toHaveProperty("p_whatsapp_enabled");
  expect(mocks.rpc.mock.calls[1][1].p_path).toBe(
    mocks.rpc.mock.calls[0][1].p_path,
  );
  expect(mocks.whatsapp).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledWith(
    "whatsapp_migration_pending_notifications_disabled",
  );
});
it("never bypasses the transactional outbox when notifications are enabled", async () => {
  vi.stubEnv("WHATSAPP_NOTIFICATIONS_ENABLED", "true");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
  await expect(submitRequest(request())).rejects.toThrow("تعذر تأكيد");
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.whatsapp).not.toHaveBeenCalled();
});
it("does not fall back on ambiguous transport errors or errors inside the database function", async () => {
  vi.stubEnv("WHATSAPP_NOTIFICATIONS_ENABLED", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const code of ["", "42883", "PGRST000"]) {
    mocks.rpc
      .mockClear()
      .mockResolvedValueOnce({ data: null, error: { code } });
    await expect(submitRequest(request())).rejects.toThrow("تعذر تأكيد");
    expect(mocks.rpc).toHaveBeenCalledOnce();
  }
});
it("validates client sizes/types and WebP signatures", () => {
  expect(receiptError(null)).toContain("ارفع");
  expect(
    receiptError({ size: RECEIPT_MAX_BYTES + 1, type: "image/png" }),
  ).toContain("4");
  expect(receiptError({ size: 1, type: "application/pdf" })).toContain("JPG");
  expect(
    validReceipt(new TextEncoder().encode("RIFF1234WEBPVP8L"), "image/webp"),
  ).toBe(true);
  expect(
    validReceipt(new TextEncoder().encode("RIFF1234OTHER!!!"), "image/webp"),
  ).toBe(false);
  expect(validReceipt(new Uint8Array([255, 216, 255]), "image/jpeg")).toBe(
    true,
  );
});
it("requires a receipt and revalidates the four fields before uploading", async () => {
  await expect(submitRequest(request(null))).rejects.toThrow("ارفع");
  await expect(
    submitRequest(request(undefined, { age_group: "1.5" })),
  ).rejects.toThrow();
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("rejects executable, forged and oversized files before storage", async () => {
  for (const file of [
    new File(["MZ"], "run.exe", { type: "application/octet-stream" }),
    new File(["<html>"], "fake.png", { type: "image/png" }),
    new File([new Uint8Array(RECEIPT_MAX_BYTES + 1)], "huge.png", {
      type: "image/png",
    }),
  ])
    await expect(submitRequest(request(file))).rejects.toThrow();
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("stores privately first, finalizes atomically and returns no storage paths", async () => {
  expect(await submitRequest(request())).toEqual({ order_number: "REQ-1" });
  expect(mocks.storage).toHaveBeenCalledWith("request-receipts");
  expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.rpc.mock.invocationCallOrder[0],
  );
  expect(mocks.rpc).toHaveBeenCalledWith(
    "submit_ad_request_with_whatsapp",
    expect.objectContaining({
      p_source: "public",
      p_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});
it("never creates an order on upload failure", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "storage down" } });
  await expect(submitRequest(request())).rejects.toThrow("تعذر رفع");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.whatsapp).not.toHaveBeenCalled();
});
it("dispatches only after saved success and never fails a booking for a notification error", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.whatsapp.mockRejectedValueOnce(Error("provider down"));
  expect(await submitRequest(request())).toEqual({ order_number: "REQ-1" });
  expect(mocks.whatsapp).toHaveBeenCalledWith("REQ-1");
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.whatsapp.mock.invocationCallOrder[0],
  );
  log.mockRestore();
  mocks.whatsapp.mockClear();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "23514" } });
  await expect(submitRequest(request())).rejects.toThrow();
  expect(mocks.whatsapp).not.toHaveBeenCalled();
});
it("does not fail a booking for a malformed notification recipient environment", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ADMIN_WHATSAPP_NUMBER", "invalid");
  expect(await submitRequest(request())).toEqual({ order_number: "REQ-1" });
  expect(mocks.rpc).toHaveBeenCalledWith(
    "submit_ad_request_with_whatsapp",
    expect.objectContaining({
      p_whatsapp_enabled: false,
      p_whatsapp_recipients: [],
    }),
  );
  vi.unstubAllEnvs();
  log.mockRestore();
});
it("cleans up after database rollback and duplicate success", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { code: "23514" }, data: null });
  await expect(submitRequest(request())).rejects.toThrow("تعذر تأكيد");
  expect(mocks.remove).toHaveBeenCalledOnce();
  mocks.rpc.mockResolvedValueOnce({
    data: { order_number: "REQ-1", receipt_path: "existing/path" },
    error: null,
  });
  await submitRequest(request());
  expect(mocks.remove).toHaveBeenCalledTimes(2);
});
it("keeps a receipt on ambiguous transport failure to protect a possible committed order", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({
    error: { code: "", message: "fetch failed" },
    data: null,
  });
  await expect(submitRequest(request())).rejects.toThrow("بنفس البيانات");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(
    "receipt_reconciliation_needed",
    expect.any(String),
  );
  log.mockRestore();
});
it("authenticates administrator before upload and binds the source", async () => {
  await submitRequest(request(), true);
  expect(mocks.admin).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ p_source: "admin", p_actor: "admin" }),
  );
  mocks.admin.mockRejectedValueOnce(Error("UNAUTHORIZED"));
  await expect(submitRequest(request(), true)).rejects.toThrow("UNAUTHORIZED");
  expect(mocks.upload).toHaveBeenCalledOnce();
});
it("signs only an authorized order's receipt for sixty seconds", async () => {
  const signing = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://storage.example.test/signed" },
    error: null,
  });
  // Scope the database stub to the receipt route.
  const supabase = await import("@/lib/supabase");
  const eq = vi.fn().mockReturnValue({
    maybeSingle: async () => ({
      data: { path: "request-receipts/test.png" },
      error: null,
    }),
  });
  const stub = vi.spyOn(supabase, "db").mockReturnValue({
    from: () => ({ select: () => ({ eq }) }),
    storage: { from: () => ({ createSignedUrl: signing }) },
  } as unknown as ReturnType<typeof supabase.db>);
  const id = crypto.randomUUID();
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(302);
  expect(eq).toHaveBeenCalledWith("request_id", id);
  expect(signing).toHaveBeenCalledWith("request-receipts/test.png", 60);
  stub.mockRestore();
});

it("does not finalize when uploaded bytes, size or MIME differ from the validated file", async () => {
  for (const data of [
    new Blob([png], { type: "image/jpeg" }),
    new Blob([png.subarray(0, 8)], { type: "image/png" }),
    new Blob([Buffer.alloc(png.length)], { type: "image/png" }),
  ]) {
    mocks.download.mockResolvedValueOnce({ data, error: null });
    await expect(submitRequest(request())).rejects.toThrow("تعذر التحقق");
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledTimes(3);
});
it("rejects signature-only images and duplicate multipart fields", async () => {
  await expect(
    submitRequest(
      request(
        new File(
          [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
          "fake.png",
          { type: "image/png" },
        ),
      ),
    ),
  ).rejects.toThrow("محتوى الصورة");
  const original = request();
  const form = await original.formData();
  form.append("receipt", new File([png], "other.png", { type: "image/png" }));
  await expect(
    submitRequest(new Request(original.url, { method: "POST", body: form })),
  ).rejects.toThrow("مكررة");
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("keeps ambiguous thrown RPC failures for reconciliation and preserves the retry key", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.rpc.mockRejectedValueOnce(Error("connection reset after commit"));
  await expect(submitRequest(request())).rejects.toThrow("بنفس البيانات");
  expect(mocks.remove).not.toHaveBeenCalled();
  log.mockRestore();
});
it("denies unauthenticated receipt access and creates no signed link", async () => {
  mocks.admin.mockRejectedValueOnce(Error("UNAUTHORIZED"));
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ id: crypto.randomUUID() }),
  });
  expect(response.status).toBe(401);
  expect(mocks.storage).not.toHaveBeenCalled();
});
