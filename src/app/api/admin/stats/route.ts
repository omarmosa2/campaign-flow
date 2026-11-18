import { NextResponse } from "next/server";
import { admin, db } from "@/lib/supabase";
import { check, failure } from "@/lib/http";
export async function GET() {
  try {
    await admin();
    return NextResponse.json(check(await db().rpc("ad_request_stats")), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
