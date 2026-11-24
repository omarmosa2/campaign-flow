import { limit } from "@/lib/http";
import { refreshWhatsAppStatus } from "@/server/whatsapp";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  // UltraMsg's public docs don't specify a verifiable signature. Treat webhooks
  // only as hints and verify delivery using the authenticated provider API.
  try {
    await limit(req, "ultramsg-webhook", 30);
    const reader = req.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16384) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = JSON.parse(await new Blob(chunks).text());
    if (
      ["message_ack", "message_create"].includes(body.event_type) &&
      /^[1-9]\d{0,19}$/.test(String(body.id))
    )
      await refreshWhatsAppStatus(String(body.id));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "تعذر التحقق من الإشعار" }, { status: 400 });
  }
}
