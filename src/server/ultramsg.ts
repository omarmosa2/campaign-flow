import "server-only";
import { recipientSchema } from "@/lib/whatsapp";

export function ultraConfig() {
  const instance = process.env.ULTRAMSG_INSTANCE_ID ?? "instance197517";
  const token = process.env.ULTRAMSG_TOKEN;
  const base = process.env.ULTRAMSG_API_URL ?? "https://api.ultramsg.com";
  // Never follow redirects or send credentials to an arbitrary host.
  if (
    !token ||
    !/^instance\d+$/.test(instance) ||
    base.replace(/\/$/, "") !== "https://api.ultramsg.com"
  )
    return null;
  return { token, base: `https://api.ultramsg.com/${instance}` };
}
export function environmentEnabled() {
  return process.env.WHATSAPP_NOTIFICATIONS_ENABLED === "true";
}
export function defaultRecipients() {
  const values = (process.env.ADMIN_WHATSAPP_NUMBER ?? "+963953705031").split(
    ",",
  );
  if (values.length > 5) throw Error("عدد مستلمي واتساب يتجاوز الحد المسموح");
  return [...new Set(values.map((v) => recipientSchema.parse(v)))];
}
async function providerGet(path: string, params: Record<string, string> = {}) {
  const config = ultraConfig();
  if (!config) throw Error("خدمة واتساب غير مهيأة");
  const url = new URL(`${config.base}/${path}`);
  url.search = new URLSearchParams({
    token: config.token,
    ...params,
  }).toString();
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("تعذر الاتصال بخدمة واتساب");
  return response.json(); // Callers never log or expose the provider payload or errors.
}
export async function connectionStatus(): Promise<string> {
  if (!ultraConfig()) return "غير مهيأة";
  try {
    const body = await providerGet("instance/status");
    const state = body.status?.accountStatus?.status;
    return (
      (
        {
          authenticated: "متصلة",
          disconnected: "غير متصلة",
          qr: "تحتاج مسح رمز QR",
          initialize: "جارٍ الاتصال",
          retrying: "إعادة اتصال",
          loading: "جارٍ الاتصال",
          standby: "في وضع الانتظار",
        } as Record<string, string>
      )[state] ?? "حالة غير معروفة"
    );
  } catch {
    return "تعذر التحقق من الاتصال";
  }
}
export type SendOutcome = {
  status: "queued" | "failed" | "uncertain";
  external: string | null;
  error: string | null;
  retry: boolean;
};
export async function sendUltraMessage(
  to: string,
  body: string,
  reference: string,
): Promise<SendOutcome> {
  const config = ultraConfig();
  if (!config)
    return {
      status: "failed",
      external: null,
      error: "خدمة واتساب غير مهيأة",
      retry: false,
    };
  try {
    const response = await fetch(`${config.base}/messages/chat`, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: config.token,
        to,
        body,
        priority: "1",
        referenceId: reference,
        msgId: "",
        mentions: "",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json();
    const external = /^(?:[1-9]\d*)$/.test(String(payload.id))
      ? String(payload.id)
      : null;
    if (
      response.ok &&
      (payload.sent === "true" || payload.sent === true) &&
      external
    )
      return { status: "queued", external, error: null, retry: false };
    // A 5xx or malformed success can hide acceptance. Only explicit rejections retry.
    if (
      payload.sent === "false" ||
      payload.sent === false ||
      [400, 401, 403, 422, 429].includes(response.status)
    )
      return {
        status: "failed",
        external: null,
        error: `رفض UltraMsg الطلب (HTTP ${response.status})`,
        retry: response.status === 429 || response.status >= 500,
      };
    return {
      status: "uncertain",
      external,
      error: "تعذر تأكيد قبول الرسالة؛ راجع UltraMsg قبل إعادة الإرسال",
      retry: false,
    };
  } catch {
    return {
      status: "uncertain",
      external: null,
      error:
        "انقطع الاتصال أو انتهت المهلة؛ قد يكون المزود قبل الرسالة. تحقق قبل إعادة الإرسال",
      retry: false,
    };
  }
}
export async function getUltraMessage(external: string) {
  const body = await providerGet("messages", {
    id: external,
    status: "all",
    limit: "1",
    page: "1",
  });
  const message = Array.isArray(body.messages)
    ? body.messages.find((m: { id: unknown }) => String(m.id) === external)
    : undefined;
  return message as
    | {
        id: number;
        to: string;
        status: string;
        ack: string;
        sent_at?: number;
        referenceId?: string;
      }
    | undefined;
}

export function bookingMessage(snapshot: Record<string, unknown>) {
  const text = (v: unknown, max = 500) =>
    typeof v === "string"
      ? v
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .slice(0, max)
          .trim()
      : typeof v === "number"
        ? String(v)
        : "";
  const lines = [
    "🔔 *طلب حجز جديد*",
    "تم تسجيل طلب حجز إعلان ممول جديد عبر المنصة.",
    "━━━━━━━━━━━━━━",
  ];
  const field = (label: string, value: unknown, max?: number) => {
    const v = text(value, max);
    if (v) lines.push(`${label} ${v}`);
  };
  field("👤 *اسم العميل:*", snapshot.customer_name, 100);
  field("📱 *رقم الهاتف:*", snapshot.phone, 30);
  field("📢 *موقع عرض الإعلان:*", snapshot.ad_placement, 200);
  field("📢 *نوع الإعلان:*", snapshot.item_name, 200);
  field("👥 *الفئة العمرية:*", snapshot.age_group);
  field("📋 *اهتمامات الجمهور:*", snapshot.audience_interests, 1800);
  field("🎯 *الهدف من الحملة الإعلانية:*", snapshot.campaign_objective, 100);
  if (snapshot.amount != null)
    field(
      "💰 *الميزانية:*",
      `${text(snapshot.amount)} ${text(snapshot.currency)}`,
    );
  const date = new Date(String(snapshot.created_at));
  if (Number.isFinite(date.getTime())) {
    field(
      "📅 *تاريخ الحجز:*",
      new Intl.DateTimeFormat("ar-SY", {
        timeZone: "Asia/Damascus",
        dateStyle: "long",
      }).format(date),
    );
    field(
      "⏰ *وقت الحجز:*",
      new Intl.DateTimeFormat("ar-SY", {
        timeZone: "Asia/Damascus",
        timeStyle: "short",
      }).format(date),
    );
  }
  field("🔖 *رقم الحجز:*", snapshot.order_number, 80);
  field("🆔 *معرّف الحجز:*", snapshot.id, 36);
  field("📝 *ملاحظات العميل:*", snapshot.notes, 400);
  const statuses: Record<string, string> = {
    review: "بانتظار المراجعة",
    approved: "تمت الموافقة",
    rejected: "مرفوض",
    pending: "قيد الانتظار",
    new: "جديد",
    completed: "مكتمل",
    cancelled: "ملغى",
    pending_payment: "بانتظار الدفع",
    payment_review: "قيد مراجعة الدفع",
    paid: "مدفوع",
    processing: "قيد التنفيذ",
    payment_rejected: "الدفع مرفوض",
    expired: "منتهي",
  };
  const payment = text(snapshot.payment_status);
  if (payment) field("🟡 *حالة الدفع:*", statuses[payment] ?? payment);
  const status = text(snapshot.status);
  if (status) field("🟡 *حالة الحجز:*", statuses[status] ?? status);
  lines.push(
    "━━━━━━━━━━━━━━",
    "يرجى مراجعة لوحة التحكم للاطلاع على تفاصيل الحجز واتخاذ الإجراء المناسب.",
  );
  const base = new URL(process.env.APP_URL ?? "http://localhost:3000");
  if (/^[0-9a-f-]{36}$/i.test(text(snapshot.id)))
    lines.push(`🔗 ${base.origin}/admin/orders/${text(snapshot.id)}`);
  return lines.join("\n\n");
}
