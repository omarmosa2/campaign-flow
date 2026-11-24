"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { notificationLabels, type WhatsAppDashboard } from "@/lib/whatsapp";

export function WhatsAppPanel() {
  const [data, setData] = useState<WhatsAppDashboard | null>(null);
  const [enabled, setEnabled] = useState(true),
    [recipients, setRecipients] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const apply = useCallback((value: WhatsAppDashboard, reset = false) => {
    setData(value);
    if (reset) {
      setEnabled(value.settings.enabled);
      setRecipients(value.settings.recipients.join("\n"));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/whatsapp", { signal: controller.signal })
      .then(async (r) => {
        const b = await r.json();
        setSetupRequired(b.setup_required === true);
        if (!r.ok) throw Error(b.error);
        apply(b, true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [apply]);
  async function action(body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      setSetupRequired(b.setup_required === true);
      if (!r.ok) throw Error(b.error);
      apply(b, body.action === "save");
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إتمام العملية");
    } finally {
      setBusy(false);
    }
  }
  async function copyMigration() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/whatsapp/migration");
      if (!response.ok)
        throw Error(
          "تعذر تحميل ملف الترحيل؛ جرّب تنزيله أو استخدام نسخة المشروع",
        );
      const sql = await response.text();
      await navigator.clipboard.writeText(sql);
      setNotice(
        "تم نسخ SQL. الصقه في Supabase SQL Editor واضغط Run، ثم أعد تحميل هذه الصفحة.",
      );
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "تعذر النسخ؛ استخدم زر تنزيل ملف SQL",
      );
    } finally {
      setBusy(false);
    }
  }
  const date = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat("ar-SY", {
          timeZone: "Asia/Damascus",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(v))
      : "لا يوجد";
  return (
    <div className="stack">
      <div>
        <span className="eyebrow">مساحة الإدارة</span>
        <h1>إشعارات واتساب</h1>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
     
      {!data ? (
        !error ? (
          <p role="status">جارٍ تحميل الإعدادات…</p>
        ) : !setupRequired ? (
          <button
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            إعادة المحاولة
          </button>
        ) : null
      ) : (
        <>
          <section className="card stack">
            <h2>إعدادات الإرسال</h2>
            <p>
              حالة الاتصال: <strong>{data.connection}</strong>
            </p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  {
                    action: "save",
                    settings: {
                      enabled,
                      recipients: recipients
                        .split(/[\n,]/)
                        .map((v) => v.trim())
                        .filter(Boolean),
                    },
                  },
                  "تم حفظ إعدادات الإشعارات",
                );
              }}
            >
              <label className="row">
                <input
                  style={{ width: "auto" }}
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />{" "}
                تفعيل إشعارات واتساب
              </label>
              <div className="row wrap">
                <button className="btn" disabled={busy}>
                  حفظ الإعدادات
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={
                    busy ||
                    !data.configured ||
                    !data.environment_enabled ||
                    !data.settings.enabled
                  }
                  onClick={() =>
                    void action(
                      { action: "test" },
                      "تمت معالجة الرسالة التجريبية؛ راجع حالتها في السجل",
                    )
                  }
                >
                  إرسال رسالة تجريبية
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      { action: "refresh" },
                      "تم تحديث الاتصال والسجل والتحقق من حالات الرسائل",
                    )
                  }
                >
                  تحديث الحالة
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}