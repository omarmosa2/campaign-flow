"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Item } from "@/types";
import { validateAnswers, orderSchema } from "@/lib/domain";
import { DynamicFields } from "./dynamic-fields";
import { Button } from "./ui/button";
import Link from "next/link";
export function CheckoutForm({
  kind,
  item,
  services,
  enabled,
}: {
  kind: string;
  item: Item;
  services: { id: string; name: string; price: number; currency: string }[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [service, setService] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = services.find((s) => s.id === service);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const storageKey = `checkout_${kind}_${item.id}`;
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem(storageKey, key);
      }
      const input = orderSchema.parse({
        kind,
        slug: item.slug,
        name,
        phone,
        answers,
        idempotency_key: key,
        consent,
        website,
        service_id: service || undefined,
      });
      const checkAnswers = { ...answers };
      for (const [id] of Object.entries(files))
        checkAnswers[id] =
          `orders/${key}/00000000-0000-4000-8000-000000000000.pdf`;
      validateAnswers(item.form_schema, checkAnswers);
      if (!review) {
        setReview(true);
        return;
      }
      setBusy(true);
      const form = new FormData();
      form.set("payload", JSON.stringify(input));
      Object.entries(files).forEach(([id, file]) =>
        form.set(`file_${id}`, file),
      );
      const r = await fetch("/api/orders", { method: "POST", body: form });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      router.push(b.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row" style={{ marginBottom: 5 }}>
        <span className="step">
          <b>1</b>بيانات الطلب
        </span>
        <span className="muted">—</span>
        <span className="step">
          <b>2</b>المراجعة والدفع
        </span>
      </div>
      <h2>{review ? "راجع طلبك قبل التأكيد" : "أخبرنا بتفاصيل طلبك"}</h2>
      {review ? (
        <>
          <div className="card stack" style={{ background: "var(--bg)" }}>
            <p>الاسم: {name}</p>
            <p>
              الهاتف: <span dir="ltr">{phone}</span>
            </p>
            {selected && <p>الخدمة: {selected.name}</p>}
            {item.form_schema.map((f) => (
              <div key={f.id}>
                <span className="muted small">{f.label}</span>
                <p>
                  {files[f.id]?.name ??
                    (Array.isArray(answers[f.id])
                      ? (answers[f.id] as string[]).join("، ")
                      : typeof answers[f.id] === "boolean"
                        ? answers[f.id]
                          ? "نعم"
                          : "لا"
                        : String(answers[f.id] ?? "—"))}
                </p>
              </div>
            ))}
            <h2>
              المبلغ: {selected?.price ?? item.price}{" "}
              {selected?.currency ?? item.currency}
            </h2>
          </div>
          <p className="small muted">
            بعد التأكيد ستحصل على رقم طلب وتعليمات التحويل عبر شام كاش.
          </p>
          <Button disabled={busy || !enabled}>
            {busy ? "جارٍ إنشاء الطلب..." : "تأكيد الطلب والمتابعة للدفع"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setReview(false)}
          >
            تعديل البيانات
          </Button>
        </>
      ) : (
        <>
          <label>
            الاسم الكامل *
            <input
              required
              maxLength={150}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            رقم الهاتف *
            <input
              type="tel"
              dir="ltr"
              required
              autoComplete="tel"
              placeholder="+963..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          {services.length > 0 && (
            <label>
              اختر الخدمة أو سعر الحملة
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                <option value="">
                  {item.name} — {item.price} {item.currency}
                </option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.price} {s.currency}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DynamicFields
            fields={item.form_schema}
            answers={answers}
            onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
            onFile={(id, f) =>
              setFiles((v) => {
                const next = { ...v };
                if (f) next[id] = f;
                else delete next[id];
                return next;
              })
            }
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clipPath: "inset(50%)",
              pointerEvents: "none",
            }}
          >
            <label>
              Website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={consent}
              required
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              أوافق على{" "}
              <Link href="/privacy" style={{ textDecoration: "underline" }}>
                سياسة الخصوصية
              </Link>{" "}
              واستخدام بياناتي لتنفيذ الطلب وإشعار الإدارة.
            </span>
          </label>
          <Button disabled={!enabled}>مراجعة الطلب ←</Button>
        </>
      )}
      {!enabled && <div className="alert">استقبال الطلبات متوقف مؤقتاً.</div>}
      <p className="small muted">
        لن يُعتبر الدفع مؤكداً حتى يراجعه المدير. احتفظ بهذا المتصفح لمتابعة الطلب
        بأمان.
      </p>
    </form>
  );
}
