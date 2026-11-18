"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { RefreshCw } from "lucide-react";
export function NotificationAction({
  id,
  test = false,
}: {
  id?: string;
  test?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="row wrap">
      {id && !confirm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirm(true)}
        >
          إعادة الإرسال
        </Button>
      ) : (
        <>
          {id && (
            <span className="small error">
              تحققت من Meta وأقبل احتمال تكرار الرسالة
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await fetch("/api/admin/notifications", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: test ? "test" : id ? "retry" : "process",
                    id,
                    confirmed: confirm,
                  }),
                });
                const b = await r.json();
                if (!r.ok) throw Error(b.error);
                toast.success(
                  b.message ??
                    (b.enabled
                      ? `تمت معالجة ${b.processed} مهام`
                      : "التكامل غير مفعّل أو تنقصه بيانات الاعتماد"),
                );
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
                setConfirm(false);
              }
            }}
          >
            <RefreshCw size={14} />
            {test
              ? "اختبار اتصال Meta"
              : id
                ? "تأكيد إعادة الإرسال"
                : "معالجة المهام المستحقة"}
          </Button>
        </>
      )}
    </div>
  );
}
