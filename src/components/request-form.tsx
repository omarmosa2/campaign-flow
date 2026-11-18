"use client";
import { useEffect, useRef, useState } from "react";
import { requestSchema, objectives } from "@/lib/requests";
import { receiptError } from "@/lib/receipts";
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
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  const busy = useRef(false);
  const key = useRef<string | null>(null);
  const lastPayload = useRef("");
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
      setStep(1);
      setErrors(
        Object.fromEntries(
          result.error.issues.map((i) => [String(i.path[0]), i.message]),
        ),
      );
      return;
    }
    setErrors({});
    if (step === 1) {
      setStep(2);
      return;
    }
    const problem = receiptError(file);
    if (problem) {
      setErrors({ receipt: problem });
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file!.arrayBuffer(),
      );
      const fileHash = Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("");
      const payload = JSON.stringify(result.data) + fileHash;
      if (!key.current || lastPayload.current !== payload) {
        key.current = crypto.randomUUID();
        lastPayload.current = payload;
      }
      const submission = new FormData();
      Object.entries(result.data).forEach(([k, v]) =>
        submission.set(k, String(v)),
      );
      submission.set("idempotency_key", key.current!);
      submission.set("receipt", file!);
      const r = await fetch(admin ? "/api/admin/orders" : "/api/orders", {
        method: "POST",
        body: submission,
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setNumber(body.order_number);
      toast.success(
        "تم إرسال طلبك بنجاح، وسيتم مراجعة إشعار الدفع من قبل الإدارة.",
      );
      formRef.current?.reset();
      setFile(null);
      setPreview("");
      key.current = null;
      lastPayload.current = "";
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
        <p>تم إرسال طلبك بنجاح، وسيتم مراجعة إشعار الدفع من قبل الإدارة.</p>
        <strong dir="ltr">{number}</strong>
      </div>
    );
  return (
    <form
      ref={formRef}
      className="stack request-form"
      noValidate
      onSubmit={submit}
    >
      <p className="eyebrow" aria-live="polite">
        الخطوة {step} من 2 — {step === 1 ? "بيانات الحملة" : "إشعار الدفع"}
      </p>
      <fieldset
        className="request-fields stack"
        hidden={step !== 1}
        disabled={pending}
      >
        <label htmlFor="placement">
          موقع عرض الإعلان
          <input
            aria-label="موقع عرض الإعلان"
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
            aria-label="الفئة العمرية"
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
            aria-label="اهتمامات الجمهور"
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
            aria-label="الهدف من الحملة الإعلانية"
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
      </fieldset>
      {step === 2 && (
        <section className="stack" aria-labelledby="payment-title">
          <h2
            id="payment-title"
            tabIndex={-1}
            ref={(node) => {
              node?.focus();
            }}
          >
            إتمام الطلب — إشعار الدفع
          </h2>
          <p className="muted">
            ارفع صورة إشعار تحويل شام كاش لإتمام طلبك. ستراجع الإدارة الإشعار.
          </p>
          <label htmlFor="receipt">
            إشعار دفع شام كاش
            <input
              id="receipt"
              name="receipt"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              required={!file}
              disabled={pending}
              aria-invalid={!!errors.receipt}
              aria-describedby="receipt-help receipt-error"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                const problem = receiptError(selected);
                setFile(problem ? null : selected);
                setPreview(
                  !problem && selected ? URL.createObjectURL(selected) : "",
                );
                setErrors(problem ? { receipt: problem } : {});
                if (problem) e.target.value = "";
              }}
            />
          </label>
          <p id="receipt-help" className="muted small">
            JPG، JPEG، PNG أو WEBP — حتى 4 ميغابايت.
          </p>
          <p id="receipt-error" className="error" role="alert">
            {errors.receipt}
          </p>
          {file && (
            <div className="stack">
              <span className="receipt-name">{file.name}</span>
              {/* Local browser preview; never sends the image to a public URL. */}
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element -- This is a local blob preview.
                <img
                  src={preview}
                  className="receipt-preview"
                  alt="معاينة إشعار دفع شام كاش"
                />
              )}
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending}
                onClick={() => {
                  setFile(null);
                  setPreview("");
                  const input = formRef.current?.elements.namedItem(
                    "receipt",
                  ) as HTMLInputElement | null;
                  if (input) input.value = "";
                }}
              >
                إزالة الملف
              </button>
            </div>
          )}
        </section>
      )}
      {errors.submit && (
        <p role="alert" className="error">
          {errors.submit}
        </p>
      )}
      {step === 2 && (
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending}
          onClick={() => {
            setStep(1);
            setErrors({});
          }}
        >
          السابق
        </button>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "جارٍ إرسال الطلب..." : step === 1 ? "التالي" : "إرسال الطلب"}
      </button>
    </form>
  );
}
