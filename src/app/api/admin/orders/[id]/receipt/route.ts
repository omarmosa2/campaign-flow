import { NextResponse } from "next/server";
import { admin, db } from "@/lib/supabase";
import { failure } from "@/lib/http";
import { z } from "zod";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await admin();
    const id = z.uuid().parse((await context.params).id);
    const client = db();
    const { data, error } = await client
      .from("ad_request_receipts")
      .select("path")
      .eq("request_id", id)
      .maybeSingle();
    if (error) throw Error("تعذر تحميل إشعار الدفع");
    if (!data)
      return NextResponse.json(
        { error: "لا يوجد إشعار دفع لهذا الطلب" },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    const signed = await client.storage
      .from("request-receipts")
      .createSignedUrl(data.path, 60);
    if (signed.error || !signed.data?.signedUrl)
      throw Error("تعذر فتح إشعار الدفع");
    return NextResponse.redirect(signed.data.signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    const response = failure(e);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
