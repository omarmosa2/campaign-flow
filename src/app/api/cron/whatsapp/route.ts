import { safeEqual } from "@/lib/http";
import { processWhatsApp, refreshWhatsAppStatus } from "@/server/whatsapp";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    secret.length < 32 ||
    !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)
  )
    return Response.json({ error: "غير مصرح" }, { status: 401 });
  try {
    const results = await Promise.allSettled([
      processWhatsApp(),
      refreshWhatsAppStatus(),
    ]);
    const result = results[0];
    if (result.status !== "fulfilled" || results[1].status !== "fulfilled")
      throw Error("Worker incomplete");
    return Response.json(result.value, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "تعذرت معالجة صندوق الإشعارات؛ ستُستكمل في التشغيل التالي" },
      { status: 503 },
    );
  }
}
