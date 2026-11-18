import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { pageAdmin } from "@/lib/page-auth";
import { check } from "@/lib/http";
import type { AdRequest } from "@/lib/requests";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pageAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const client = db();
  const { data, error } = await client
    .from("all_ad_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw Error("تعذر تحميل الطلب");
  if (!data) notFound();
  const r = data as AdRequest;
  const timezone = check(await client.rpc("request_timezone"));
  const legacy =
    r.source === "legacy"
      ? check(
          await client
            .from("orders")
            .select(
              "customer_name,phone,item_name,amount,currency,status,payment_status,form_snapshot,answers,notes",
            )
            .eq("id", id)
            .single(),
        )
      : null;
  return (
    <div className="stack">
      <Link href="/admin/orders" className="muted">
        ← جميع الطلبات
      </Link>
      <h1>تفاصيل الطلب</h1>
      <article className="card stack">
        <strong dir="ltr">{r.order_number}</strong>
        <dl className="detail-list">
          {Object.entries({
            "موقع عرض الإعلان": r.ad_placement,
            "الفئة العمرية": r.age_group,
            "اهتمامات الجمهور": r.audience_interests,
            "الهدف من الحملة الإعلانية": r.campaign_objective,
            المصدر:
              r.source === "admin"
                ? "المدير"
                : r.source === "legacy"
                  ? "سجل تاريخي"
                  : "المستخدم",
            "تاريخ الإنشاء": new Intl.DateTimeFormat("ar", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: timezone,
            }).format(new Date(r.created_at)),
          }).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "غير متوفر في النموذج القديم"}</dd>
            </div>
          ))}
        </dl>
        {legacy && (
          <section>
            <h2>بيانات الطلب التاريخية المحفوظة</h2>
            <p className="muted">
              حُفظ السجل الأصلي دون تحويل أو حذف، بما فيه المدفوعات والمرفقات
              المرتبطة.
            </p>
            <pre className="legacy-data">{JSON.stringify(legacy, null, 2)}</pre>
          </section>
        )}
      </article>
    </div>
  );
}
