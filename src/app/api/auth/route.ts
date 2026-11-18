import { NextResponse } from "next/server";
import { auth, configured, db } from "@/lib/supabase";
import { failure, origin, limit } from "@/lib/http";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    origin(req);
    if (!configured()) throw Error("يلزم إعداد Supabase أولاً");
    await limit(req, "login", 8);
    const body = z
      .object({ email: z.email(), password: z.string().min(8).max(200) })
      .parse(await req.json());
    const client = await auth();
    const { data, error } = await client.auth.signInWithPassword(body);
    if (error) throw Error("بيانات تسجيل الدخول غير صحيحة");
    const { data: profile, error: profileError } = await db()
      .from("profiles")
      .select("id")
      .eq("id", data.user!.id)
      .eq("enabled", true)
      .single();
    if (profileError || !profile) {
      await client.auth.signOut();
      throw Error("الحساب غير مخوّل للوصول إلى الإدارة");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    origin(req);
    const client = await auth();
    const { error } = await client.auth.signOut();
    if (error) throw Error("تعذر تسجيل الخروج، حاول مجدداً");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
