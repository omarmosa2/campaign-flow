"use client";
import { useRef, useState } from "react";
import { requestSchema, objectives } from "@/lib/requests";
import { toast } from "sonner";
export function RequestForm({
  admin = false,
  onSuccess,
}: {
  admin?: boolean;
  onSuccess?: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [number, setNumber] = useState("");
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    const form = new FormData(e.currentTarget);
    const age = String(form.get("age_group") ?? "");
    const result = requestSchema.safeParse({
      ad_placement: form.get("ad_placement"),
      age_group: /^\d+$/.test(age) ? Number(age) : NaN,
      audience_interests: form.get("audience_interests"),
      campaign_objective: form.get("campaign_objective"),
    });
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      return;
    }
    setErrors({});
    busy.current = true;
    setPending(true);
    try {
      key.current ??= crypto.randomUUID();
      const r = await fetch(admin ? "/api/admin/orders" : "/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, idempotency_key: key.current }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setNumber(body.order_number);
      toast.success("تم حفظ الطلب بنجاح");
      onSuccess?.();
    } catch (e) {
      setErrors({ submit: (e as Error).message });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (number)
    return (
      <div className="success-panel" role="status">
        <span className="eyebrow">تم استلام طلبك</span>
        <h2>خطوتك الأولى نحو حملة ناجحة</h2>
        <p>تم حفظ طلبك بنجاح. احتفظ برقم الطلب للرجوع إليه.</p>
        <strong dir="ltr">{number}</strong>
      </div>
    );
  return (
    <form className="stack request-form" noValidate onSubmit={submit}>
      <label htmlFor="placement">
        موقع عرض الإعلان
        <input
          id="placement"
          name="ad_placement"
          required
          maxLength={200}
          placeholder="فيسبوك، إنستغرام، تيك توك"
          aria-invalid={!!errors.ad_placement}
          aria-describedby="placement-error"
        />
        <span id="placement-error" className="error">
          {errors.ad_placement}
        </span>
      </label>
      <label htmlFor="age">
        الفئة العمرية
        <input
          id="age"
          name="age_group"
          type="number"
          required
          min="1"
          step="1"
          inputMode="numeric"
          placeholder="25"
          aria-invalid={!!errors.age_group}
          aria-describedby="age-error"
        />
        <span id="age-error" className="error">
          {errors.age_group}
        </span>
      </label>
      <label htmlFor="interests">
        اهتمامات الجمهور
        <textarea
          id="interests"
          name="audience_interests"
          required
          maxLength={5000}
          rows={4}
          placeholder="صف اهتمامات جمهورك المستهدف"
          aria-invalid={!!errors.audience_interests}
          aria-describedby="interests-error"
        />
        <span id="interests-error" className="error">
          {errors.audience_interests}
        </span>
      </label>
      <label htmlFor="objective">
        الهدف من الحملة الإعلانية
        <select
          id="objective"
          name="campaign_objective"
          required
          defaultValue=""
          aria-invalid={!!errors.campaign_objective}
          aria-describedby="objective-error"
        >
          <option value="" disabled>
            اختر هدف الحملة
          </option>
          {objectives.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <span id="objective-error" className="error">
          {errors.campaign_objective}
        </span>
      </label>
      {errors.submit && (
        <p role="alert" className="error">
          {errors.submit}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "جارٍ حفظ الطلب..." : admin ? "حفظ الطلب" : "إرسال الطلب"}
      </button>
    </form>
  );
}
