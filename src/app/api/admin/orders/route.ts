import { NextResponse } from "next/server";
import { admin, db } from "@/lib/supabase";
import { check, failure } from "@/lib/http";
import { submitRequest } from "@/server/requests";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    return NextResponse.json(await submitRequest(req, true), { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(req: Request) {
  try {
    await admin();
    const params = new URL(req.url).searchParams;
    return NextResponse.json(
      check(
        await db().rpc("list_ad_requests", {
          p_search: (params.get("q") ?? "").slice(0, 200),
          p_page: Math.max(
            1,
            Math.min(1000000, Math.trunc(Number(params.get("page"))) || 1),
          ),
        }),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
