"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { labels } from "@/lib/domain";
export function OrderActions({
  id,
  status,
  notes,
}: {
  id: string;
  status: string;
  notes: string;
}) {
  const router = useRouter();
  const [next, setNext] = useState(status);
  const [text, setText] = useState(notes);
  const [busy, setBusy] = useState(false);
  const allowed =
    status === "paid"
      ? ["processing"]
      : status === "processing"
        ? ["completed"]
        : ["pending_payment", "payment_rejected"].includes(status)
          ? ["cancelled", "expired"]
          : [];
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await fetch(`/api/admin/orders/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next, notes: text }),
          });
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          toast.success("تم تحديث الطلب");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        حالة التنفيذ
        <select value={next} onChange={(e) => setNext(e.target.value)}>
          {[status, ...allowed].map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        ملاحظات داخلية
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Button disabled={busy}>حفظ التحديث</Button>
    </form>
  );
}
export function PaymentReview({
  id,
  amount,
  currency,
}: {
  id: string;
  amount: number;
  currency: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState("approved");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await fetch(`/api/admin/payments/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision, reason, reference, confirmed }),
          });
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          toast.success("تم تسجيل قرار المراجعة");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="alert">
        المبلغ المطلوب: {amount} {currency}. تحقق من وصوله في حساب شام كاش قبل
        الاعتماد.
      </div>
      <label>
        قرار المراجعة
        <select
          value={decision}
          onChange={(e) => {
            setDecision(e.target.value);
            setConfirmed(false);
          }}
        >
          <option value="approved">اعتماد الدفع</option>
          <option value="rejected">رفض وطلب إشعار جديد</option>
        </select>
      </label>
      <label>
        مرجع التحويل (اختياري)
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <label>
        سبب الرفض / ملاحظة
        <textarea
          required={decision === "rejected"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          required
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {decision === "approved"
          ? "تحققت من استلام المبلغ وأؤكد اعتماد الدفع"
          : "أؤكد رفض الإشعار وطلب إعادة رفعه"}
      </label>
      <Button
        disabled={busy || !confirmed}
        variant={decision === "rejected" ? "destructive" : "default"}
      >
        تأكيد قرار المراجعة
      </Button>
    </form>
  );
}
