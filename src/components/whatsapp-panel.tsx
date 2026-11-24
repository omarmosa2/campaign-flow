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
        <p className="muted">
          إشعارات الحجوزات الجديدة عبر UltraMsg · الأوقات بتوقيت سوريا.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {setupRequired && (
        <section className="card stack">
          <h2>إكمال إعداد قاعدة بيانات واتساب</h2>
          <ol>
            <li>انسخ ملف SQL من الزر أدناه.</li>
            <li>
              افتح مشروعك في Supabase، ثم SQL Editor، وأنشئ استعلاماً جديداً.
            </li>
            <li>الصق الملف كاملاً واضغط Run، ثم أعد تحميل هذه الصفحة.</li>
          </ol>
          <div className="row wrap">
            <button
              className="btn"
              disabled={busy}
              onClick={() => void copyMigration()}
            >
              نسخ SQL
            </button>
            <a
              className="btn btn-outline"
              href="/api/admin/whatsapp/migration"
              download
            >
              تنزيل ملف SQL
            </a>
            <button
              className="btn btn-outline"
              onClick={() => window.location.reload()}
            >
              أعدت تنفيذ SQL — إعادة التحميل
            </button>
          </div>
        </section>
      )}
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
            {(!data.configured || !data.environment_enabled) && (
              <p className="error">
                الإرسال متوقف من إعدادات السيرفر. يلزم إعداد UltraMsg وتفعيل
                WHATSAPP_NOTIFICATIONS_ENABLED.
              </p>
            )}
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
              <label htmlFor="whatsapp-recipients">
                أرقام المستلمين (رقم دولي في كل سطر، حتى 5 أرقام)
                <textarea
                  id="whatsapp-recipients"
                  dir="ltr"
                  rows={5}
                  maxLength={100}
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="+963953705031"
                  required
                />
              </label>
              <p className="muted small">
                تسري الأرقام الجديدة على الإشعارات الجديدة. تبقى الإشعارات
                المسجلة مرتبطة بمستلميها الأصليين. لا تُرسل حجوزات فترة الإيقاف
                عند إعادة التفعيل.
              </p>
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
              <p className="muted small">
                الرسالة التجريبية تستخدم الأرقام المحفوظة. قبول المزود للطلب لا
                يعني وصول الرسالة.
              </p>
            </form>
          </section>
          <section className="card stack">
            <h2>ملخص الإشعارات</h2>
            <div className="row wrap">
              <span>المقبولة: {data.stats.accepted}</span>
              <span>في طابور المزود: {data.stats.queued}</span>
              <span>المرسلة: {data.stats.sent}</span>
              <span>المسلّمة: {data.stats.delivered}</span>
              <span>الفاشلة: {data.stats.failed}</span>
              <span>غير المؤكدة: {data.stats.uncertain}</span>
            </div>
            <p>آخر إرسال ناجح: {date(data.stats.last_sent_at)}</p>
          </section>
          <section className="card stack">
            <h2>سجل الإشعارات</h2>
            <p className="muted small">
              أحدث 100 إشعار. تتحدث حالات التسليم بواسطة المهمة المجدولة
              وWebhooks بعد التحقق من المزود.
            </p>
            {!data.notifications.length && (
              <p className="empty">لا توجد إشعارات بعد.</p>
            )}
            {data.notifications.map((n) => (
              <article className="request-tile stack" key={n.id}>
                <div className="row between wrap">
                  <strong dir="ltr">{n.recipient}</strong>
                  <span>{notificationLabels[n.status] ?? n.status}</span>
                </div>
                <p className="small">
                  المحاولات: {n.attempts} · الإنشاء: {date(n.created_at)} · آخر
                  محاولة: {date(n.last_attempt_at)} · الإرسال: {date(n.sent_at)}
                </p>
                {n.external_id && (
                  <p className="small">معرّف UltraMsg: {n.external_id}</p>
                )}
                {n.last_error && <p className="error">{n.last_error}</p>}
                <div className="row wrap">
                  {n.booking_id ? (
                    <Link
                      className="btn btn-outline btn-sm"
                      href={`/admin/orders/${n.booking_id}`}
                    >
                      تفاصيل الحجز
                    </Link>
                  ) : (
                    <span>رسالة تجريبية</span>
                  )}
                  {["failed", "uncertain"].includes(n.status) && (
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={
                        busy ||
                        !data.environment_enabled ||
                        !data.settings.enabled
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            "قد يكون المزود قد قبل الرسالة أو أرسلها بالفعل. راجع سجل UltraMsg أولاً. هل تؤكد إعادة الإرسال إلى الرقم الأصلي مع احتمال التكرار؟",
                          )
                        )
                          void action(
                            {
                              action: "retry",
                              id: n.id,
                              acknowledge_duplicate: true,
                            },
                            "تمت معالجة إعادة الإرسال؛ راجع الحالة في السجل",
                          );
                      }}
                    >
                      إعادة الإرسال
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
