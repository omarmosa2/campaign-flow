import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./supabase";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function origin(req: Request) {
  const expected = process.env.APP_URL;
  if (!expected || req.headers.get("origin") !== new URL(expected).origin)
    throw Error("مصدر الطلب غير مسموح");
}
export async function limit(req: Request, scope: string, max = 20) {
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
    req.headers.get("x-forwarded-for")?.split(",")[0] ??
    "local";
  const { data, error } = await db().rpc("rate_limit", {
    p_key: hash(scope + ip),
    p_max: max,
  });
  if (error) throw Error("تعذر التحقق من حد الطلبات");
  if (!data) throw Error("طلبات كثيرة، حاول لاحقاً");
}
export function failure(e: unknown) {
  const message =
    e instanceof ZodError
      ? e.issues.map((x) => x.message).join("، ")
      : e instanceof Error
        ? e.message
        : "تعذر إتمام العملية";
  const status =
    message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
  return NextResponse.json(
    {
      error:
        message === "UNAUTHORIZED"
          ? "سجّل الدخول أولاً"
          : message === "FORBIDDEN"
            ? "لا تملك الصلاحية"
            : message,
    },
    { status },
  );
}
export function check<T>(r: { data: T; error: { message: string } | null }) {
  if (r.error)
    throw Error(
      "تعذر حفظ البيانات أو تحميلها. تحقق من المدخلات والصلاحيات ثم أعد المحاولة.",
    );
  return r.data as NonNullable<T>;
}
