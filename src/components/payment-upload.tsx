"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Copy } from "lucide-react";
import { Button } from "./ui/button";
export function CopyButton({ text }: { text: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("تم النسخ");
        } catch {
          toast.error("تعذر النسخ، انسخ البيانات يدوياً");
        }
      }}
    >
      <Copy size={14} />
      نسخ بيانات التحويل
    </Button>
  );
}
export function PaymentUpload({ id }: { id: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        try {
          const body = new FormData();
          body.set("file", file);
          const r = await fetch(`/api/payments/${id}`, {
            method: "POST",
            body,
          });
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          toast.success("استلمنا الإشعار، وهو بانتظار مراجعة الدفع");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        صورة إشعار التحويل
        <input
          required
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <span className="muted">PNG أو JPEG · حتى 4 ميغابايت</span>
      </label>
      <Button disabled={!file || busy}>
        <Upload size={16} />
        {busy ? "جارٍ إرسال الإشعار..." : "تأكيد إرسال الإشعار للمراجعة"}
      </Button>
    </form>
  );
}

export function NewOrderButton({
  kind,
  itemId,
  slug,
}: {
  kind: string;
  itemId: string;
  slug: string;
}) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => {
        sessionStorage.removeItem(`checkout_${kind}_${itemId}`);
        router.push(`/${kind}/${slug}`);
      }}
    >
      إنشاء طلب آخر
    </Button>
  );
}
