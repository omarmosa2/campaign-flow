import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { safeEqual, hash, failure, check } from "@/lib/http";
import { db } from "@/lib/supabase";
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (
    process.env.WHATSAPP_VERIFY_TOKEN &&
    p.get("hub.mode") === "subscribe" &&
    safeEqual(
      p.get("hub.verify_token") ?? "",
      process.env.WHATSAPP_VERIFY_TOKEN,
    )
  )
    return new Response(p.get("hub.challenge") ?? "");
  return new Response("Forbidden", { status: 403 });
}
export async function POST(req: Request) {
  try {
    if (!process.env.META_APP_SECRET)
      return new Response("Unavailable", { status: 503 });
    if (Number(req.headers.get("content-length")) > 1000000)
      return new Response("Too large", { status: 413 });
    const raw = await req.text();
    if (raw.length > 1000000) return new Response("Too large", { status: 413 });
    const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET).update(raw).digest("hex")}`;
    if (!safeEqual(req.headers.get("x-hub-signature-256") ?? "", signature))
      return new Response("Forbidden", { status: 403 });
    const body = JSON.parse(raw);
    for (const entry of body.entry ?? [])
      for (const change of entry.changes ?? [])
        for (const status of change.value?.statuses ?? []) {
          if (
            typeof status.id !== "string" ||
            !["sent", "delivered", "read", "failed"].includes(status.status)
          )
            continue;
          check(
            await db().rpc("record_webhook", {
              p_id: hash(`${status.id}:${status.status}:${status.timestamp}`),
              p_external: status.id,
              p_status: status.status,
              p_payload: {
                id: status.id,
                status: status.status,
                timestamp: status.timestamp,
                error_codes: (status.errors ?? []).map(
                  (e: { code: number }) => e.code,
                ),
              },
            }),
          );
        }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
