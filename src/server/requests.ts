import "server-only";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { admin, db } from "@/lib/supabase";
import { hash, limit, origin } from "@/lib/http";
import { submissionSchema } from "@/lib/requests";
import { processWhatsApp } from "@/server/whatsapp";
import { defaultRecipients, environmentEnabled } from "@/server/ultramsg";
import {
  RECEIPT_BODY_MAX_BYTES,
  receiptError,
  validReceipt,
} from "@/lib/receipts";

// Bound actual streamed bytes, including requests without a Content-Length header.
async function multipart(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw Error("أرسل بيانات الحملة مع إشعار الدفع");
  if (Number(req.headers.get("content-length")) > RECEIPT_BODY_MAX_BYTES)
    throw Error("حجم الإشعار يجب ألا يتجاوز 4 ميغابايت");
  const reader = req.body?.getReader();
  if (!reader) throw Error("بيانات الطلب مفقودة");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > RECEIPT_BODY_MAX_BYTES) {
        await reader.cancel();
        throw Error("حجم الإشعار يجب ألا يتجاوز 4 ميغابايت");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(new Blob(chunks), {
    headers: { "content-type": req.headers.get("content-type")! },
  }).formData();
}
export async function submitRequest(req: Request, asAdmin = false) {
  origin(req);
  const actor = asAdmin ? await admin() : null;
  await limit(req, asAdmin ? "admin-request" : "public-request", 10);
  const form = await multipart(req);
  for (const name of new Set(form.keys())) {
    if (form.getAll(name).length !== 1)
      throw Error("بيانات الطلب مكررة أو غير صالحة");
  }
  const fields = Object.fromEntries(
    [...form.entries()].filter(([k]) => k !== "receipt"),
  );
  const age = String(fields.age_group ?? "");
  const body = submissionSchema.parse({
    ...fields,
    age_group: /^\d+$/.test(age) ? Number(age) : NaN,
  });
  body.idempotency_key = body.idempotency_key.toLowerCase();
  const file = form.get("receipt");
  if (!(file instanceof File)) throw Error("ارفع إشعار دفع شام كاش");
  const problem = receiptError(file);
  if (problem) throw Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validReceipt(bytes, file.type))
    throw Error("محتوى الملف غير صالح؛ ارفع صورة JPG أو PNG أو WEBP حقيقية");
  // A magic header alone does not prove an image can actually be decoded.
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: 24_000_000,
    });
    const metadata = await image.metadata();
    const expectedFormat =
      file.type === "image/jpeg"
        ? "jpeg"
        : file.type === "image/png"
          ? "png"
          : "webp";
    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) !== 1)
      throw Error("format");
    await image.resize(1, 1).raw().toBuffer();
  } catch {
    throw Error("محتوى الصورة غير صالح أو أبعادها كبيرة جداً؛ اختر صورة أخرى");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const ip = (
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for") ??
    "local"
  )
    .split(",")[0]
    .trim();
  const client = db();
  const storage = client.storage.from("request-receipts");
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `request-receipts/${body.idempotency_key}/${randomUUID()}.${ext}`;
  const uploaded = await storage.upload(path, bytes, {
    contentType: file.type,
    upsert: false,
    cacheControl: "0",
    metadata: { sha256: digest, submission_key: body.idempotency_key },
  });
  if (uploaded.error)
    throw Error("تعذر رفع إشعار الدفع، أعد المحاولة. لم يتم إرسال الطلب.");
  const cleanup = async () => {
    try {
      const removed = await storage.remove([path]);
      if (removed.error) console.error("receipt_cleanup_failed", path);
    } catch {
      console.error("receipt_cleanup_failed", path);
    }
  };
  // Verify the actual stored bytes before trusting Storage's database metadata.
  try {
    const stored = await storage.download(path);
    if (
      stored.error ||
      !stored.data ||
      stored.data.size !== bytes.length ||
      stored.data.type !== file.type
    )
      throw Error("metadata");
    const storedBytes = new Uint8Array(await stored.data.arrayBuffer());
    if (
      createHash("sha256").update(storedBytes).digest("hex") !== digest ||
      !validReceipt(storedBytes, file.type)
    )
      throw Error("content");
  } catch {
    await cleanup(); // RPC has not started: this path cannot have been linked.
    throw Error(
      "تعذر التحقق من الملف المرفوع. لم يتم إرسال الطلب؛ أعد المحاولة.",
    );
  }
  // One database transaction creates the order, private attachment and retry key.
  // Upload first: a failed upload can never produce a final order.
  let result;
  let whatsappOutboxAvailable = true;
  let notificationRecipients: string[] = [];
  try {
    notificationRecipients = defaultRecipients();
  } catch {
    console.error("whatsapp_recipient_configuration_invalid");
  }
  const bookingArgs = {
    p_key: body.idempotency_key,
    p_placement: body.ad_placement,
    p_age: body.age_group,
    p_interests: body.audience_interests,
    p_objective: body.campaign_objective,
    p_source: asAdmin ? "admin" : "public",
    p_client: hash(actor ? `admin:${actor.id}` : `public:${ip}`),
    p_actor: actor?.id ?? null,
    p_path: path,
    p_mime: file.type,
    p_size: file.size,
    p_sha256: digest,
  };
  try {
    result = await client.rpc("submit_ad_request_with_whatsapp", {
      ...bookingArgs,
      p_whatsapp_enabled:
        environmentEnabled() && notificationRecipients.length > 0,
      p_whatsapp_recipients: notificationRecipients,
    });
    // PGRST202 guarantees PostgREST never invoked the missing function. Only
    // allow a pre-migration rollout while notifications are explicitly off.
    // Transport errors or errors inside SQL must never trigger a second write.
    if (result.error?.code === "PGRST202" && !environmentEnabled()) {
      whatsappOutboxAvailable = false;
      result = await client.rpc("submit_ad_request_with_receipt", bookingArgs);
      if (!result.error)
        console.warn("whatsapp_migration_pending_notifications_disabled");
    }
  } catch {
    console.error("receipt_reconciliation_needed", path);
    throw Error(
      "تعذر تأكيد حفظ الطلب. أعد المحاولة بنفس البيانات والإشعار لتجنب التكرار.",
    );
  }
  if (result.error) {
    // SQL errors guarantee rollback. Transport errors may hide a successful commit:
    // keep the object for reconciliation rather than deleting a linked receipt.
    if (/^[0-9A-Z]{5}$/.test(result.error.code ?? "")) await cleanup();
    else console.error("receipt_reconciliation_needed", path);
    throw Error(
      "تعذر تأكيد حفظ الطلب. أعد المحاولة بنفس البيانات والإشعار لتجنب التكرار.",
    );
  }
  const data = result.data as {
    order_number: string;
    receipt_path: string;
  } | null;
  if (!data?.order_number || !data.receipt_path)
    throw Error("تعذر تأكيد اكتمال حفظ الطلب؛ أعد المحاولة");
  if (data.receipt_path !== path) await cleanup(); // A concurrent retry already saved its receipt.
  try {
    // Await inside this request. A scheduled worker recovers the durable outbox if interrupted.
    if (whatsappOutboxAvailable) await processWhatsApp(data.order_number);
  } catch {
    console.error("whatsapp_outbox_processing_failed"); // Never log provider payloads or credentials.
  }
  return { order_number: data.order_number };
}
