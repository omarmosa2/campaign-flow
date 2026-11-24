import { readFile } from "node:fs/promises";
import path from "node:path";
import { admin } from "@/lib/supabase";
import { failure, limit } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = await admin();
    await limit(req, `whatsapp-migration:${actor.id}`, 10);
    const filename =
      new URL(req.url).searchParams.get("kind") === "cron"
        ? "202611240002_whatsapp_supabase_cron.sql"
        : "202611240001_ultramsg_notifications.sql";
    let sql: string;
    try {
      sql = await readFile(
        path.join(process.cwd(), "supabase", "migrations", filename),
        "utf8",
      );
    } catch {
      return Response.json(
        {
          error:
            "تعذر تحميل ملف الترحيل؛ استخدم النسخة الموجودة في مجلد supabase/migrations بالمشروع",
        },
        { status: 503 },
      );
    }
    return new Response(sql, {
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
