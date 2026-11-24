import { NextResponse } from "next/server";
import { z } from "zod";
import { admin, db } from "@/lib/supabase";
import { failure, limit, origin } from "@/lib/http";
import { checkWhatsApp as check } from "@/server/whatsapp-database";
import {
  whatsappSettingsSchema,
  WHATSAPP_SETUP_REQUIRED,
  whatsappSetupMessage,
} from "@/lib/whatsapp";
import {
  processWhatsApp,
  queueWhatsAppTest,
  refreshWhatsAppStatus,
  whatsappDashboard,
} from "@/server/whatsapp";
export const runtime = "nodejs";
export const maxDuration = 60;
function whatsappFailure(error: unknown) {
  if (error instanceof Error && error.message === WHATSAPP_SETUP_REQUIRED)
    return NextResponse.json(
      { error: whatsappSetupMessage, setup_required: true },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  return failure(error);
}
const actionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("save"), settings: whatsappSettingsSchema })
    .strict(),
  z.object({ action: z.literal("test") }).strict(),
  z
    .object({
      action: z.literal("retry"),
      id: z.uuid(),
      acknowledge_duplicate: z.literal(true),
    })
    .strict(),
  z.object({ action: z.literal("refresh") }).strict(),
]);
export async function GET(req: Request) {
  try {
    const actor = await admin();
    await limit(req, `whatsapp-read:${actor.id}`, 30);
    return NextResponse.json(await whatsappDashboard(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return whatsappFailure(e);
  }
}
export async function POST(req: Request) {
  try {
    origin(req);
    const actor = await admin();
    await limit(req, `whatsapp-write:${actor.id}`, 10);
    // Stream-bound JSON, including requests without a Content-Length header.
    const reader = req.body?.getReader();
    if (!reader) throw Error("بيانات الطلب مفقودة");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) {
          await reader.cancel();
          throw Error("بيانات الطلب كبيرة جداً");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = actionSchema.parse(JSON.parse(await new Blob(chunks).text()));
    if (body.action === "save")
      check(
        await db().rpc("save_ultramsg_settings", {
          p_enabled: body.settings.enabled,
          p_recipients: body.settings.recipients,
          p_actor: actor.id,
        }),
      );
    else if (body.action === "test") {
      await limit(req, `whatsapp-test:${actor.id}`, 2);
      await queueWhatsAppTest();
      await processWhatsApp();
    } else if (body.action === "retry") {
      check(
        await db().rpc("retry_ultramsg", {
          p_id: body.id,
          p_actor: actor.id,
          p_ack: body.acknowledge_duplicate,
        }),
      );
      await processWhatsApp();
    } else await refreshWhatsAppStatus();
    return NextResponse.json(await whatsappDashboard(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return whatsappFailure(
      e instanceof SyntaxError ? Error("بيانات الطلب غير صالحة") : e,
    );
  }
}
