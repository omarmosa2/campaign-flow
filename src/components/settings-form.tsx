"use client";
import { useState } from "react";
import { toast } from "sonner";
import { settingsSchema } from "@/lib/settings";
import type { z } from "zod";
import { Button } from "./ui/button";
import { NotificationAction } from "./notification-actions";
import { Save } from "lucide-react";
type Settings = z.infer<typeof settingsSchema>;
export function SettingsForm({
  initial,
  canEdit,
  ready,
}: {
  initial: Settings;
  canEdit: boolean;
  ready: boolean;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  function patch(p: Partial<Settings>) {
    setData((d) => ({ ...d, ...p }));
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = settingsSchema.safeParse(data);
        if (!parsed.success) {
          toast.error(parsed.error.issues.map((i) => i.message).join("، "));
          return;
        }
        setBusy(true);
        try {
          const r = await fetch("/api/admin/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
          });
          const b = await r.json();
          if (!r.ok) throw Error(b.error);
          toast.success("تم حفظ إعدادات المنصة");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="page-head">
        <div>
          <span className="eyebrow">تخصيص مساحة العمل</span>
          <h1>إعدادات النظام</h1>
          <p>بيانات منصتك، حساب الدفع والإشعارات.</p>
        </div>
        <Button disabled={!canEdit || busy}>
          <Save size={16} />
          حفظ الإعدادات
        </Button>
      </div>
      {!canEdit && (
        <div className="alert">
          يمكنك الاطلاع. تعديل الإعدادات متاح لمدير النظام فقط.
        </div>
      )}
      <fieldset
        disabled={!canEdit}
        style={{ border: 0, padding: 0, display: "grid", gap: 24 }}
      >
        <section className="card stack">
          <h2>الإعدادات العامة</h2>
          <div className="form-grid">
            <label>
              اسم المنصة
              <input
                required
                value={data.platform_name}
                onChange={(e) => patch({ platform_name: e.target.value })}
              />
            </label>
            <label>
              التواصل
              <input
                value={data.contact}
                onChange={(e) => patch({ contact: e.target.value })}
              />
            </label>
            <label className="full">
              الوصف
              <textarea
                value={data.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label>
              العملة الافتراضية
              <select
                value={data.currency}
                onChange={(e) =>
                  patch({ currency: e.target.value as Settings["currency"] })
                }
              >
                {["USD", "SYP", "EUR", "TRY"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              المنطقة الزمنية
              <input
                dir="ltr"
                value={data.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
              />
            </label>
            <label>
              تنسيق التاريخ
              <select
                value={data.date_format}
                onChange={(e) =>
                  patch({
                    date_format: e.target.value as Settings["date_format"],
                  })
                }
              >
                <option>dd/MM/yyyy</option>
                <option>yyyy-MM-dd</option>
              </select>
            </label>
            <label>
              شعار المنصة
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const body = new FormData();
                    body.set("file", file);
                    const r = await fetch("/api/admin/uploads", {
                      method: "POST",
                      body,
                    });
                    const b = await r.json();
                    if (!r.ok) throw Error(b.error);
                    patch({ logo_path: b.path });
                    toast.success("تم الرفع. احفظ الإعدادات لتطبيق الشعار.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
        </section>
        <section className="card stack">
          <h2>الدفع اليدوي · شام كاش</h2>
          <div className="form-grid">
            <label>
              اسم صاحب الحساب
              <input
                value={data.sham_name}
                onChange={(e) => patch({ sham_name: e.target.value })}
              />
            </label>
            <label>
              رقم / معرّف الحساب
              <input
                dir="ltr"
                value={data.sham_account}
                onChange={(e) => patch({ sham_account: e.target.value })}
              />
            </label>
            <label className="full">
              تعليمات الدفع
              <textarea
                value={data.payment_instructions}
                onChange={(e) =>
                  patch({ payment_instructions: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={data.accepting_orders}
                onChange={(e) => patch({ accepting_orders: e.target.checked })}
              />
              تفعيل استقبال الطلبات
            </label>
          </div>
          <p className="small muted">
            لا يوجد ربط آلي بشام كاش. لا يُعتمد أي دفع إلا بقرار المدير.
          </p>
        </section>
        <section className="card stack">
          <div className="row between">
            <h2>WhatsApp Business Cloud API</h2>
            <span className="badge">
              {ready
                ? "بيانات البيئة متاحة، يلزم اختبارها"
                : "بيانات البيئة غير مكتملة"}
            </span>
          </div>
          <p className="small muted">
            الرموز السرية تُضبط في بيئة الخادم فقط. لا تُعرض أو تُحفظ ضمن هذه
            الإعدادات.
          </p>
          <div className="form-grid">
            <label>
              رقم المستلم (دولي دون +)
              <input
                dir="ltr"
                value={data.whatsapp_recipient}
                onChange={(e) => patch({ whatsapp_recipient: e.target.value })}
              />
            </label>
            <label>
              لغة القوالب
              <input
                dir="ltr"
                value={data.whatsapp_language}
                onChange={(e) => patch({ whatsapp_language: e.target.value })}
              />
            </label>
            {(
              [
                ["order_created", "طلب جديد"],
                ["payment_submitted", "إشعار دفع"],
                ["payment_approved", "اعتماد دفع"],
              ] as const
            ).map(([event, label]) => (
              <div key={event} className="stack" style={{ gap: 8 }}>
                <label>
                  اسم قالب {label}
                  <input
                    dir="ltr"
                    value={data.templates[event] ?? ""}
                    onChange={(e) =>
                      patch({
                        templates: {
                          ...data.templates,
                          [event]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={data.notification_events.includes(event)}
                    onChange={(e) =>
                      patch({
                        notification_events: e.target.checked
                          ? [...data.notification_events, event]
                          : data.notification_events.filter((x) => x !== event),
                      })
                    }
                  />
                  تفعيل حدث {label}
                </label>
              </div>
            ))}
            <label className="full">
              <input
                type="checkbox"
                checked={data.recipient_consent}
                onChange={(e) => patch({ recipient_consent: e.target.checked })}
              />
              لدي موافقة المستلم على الإشعارات وأستخدم قوالب معتمدة
            </label>
            <label className="full">
              <input
                type="checkbox"
                checked={data.whatsapp_enabled}
                onChange={(e) => patch({ whatsapp_enabled: e.target.checked })}
              />
              تفعيل الإشعارات التلقائية
            </label>
          </div>
          {canEdit && <NotificationAction test />}
        </section>
      </fieldset>
    </form>
  );
}
