import { z } from "zod";
z.config(z.locales.ar());
export const statuses = [
  "pending_payment",
  "payment_review",
  "paid",
  "processing",
  "completed",
  "payment_rejected",
  "cancelled",
  "expired",
] as const;
export const labels: Record<string, string> = {
  pending_payment: "بانتظار الدفع",
  payment_review: "مراجعة الدفع",
  paid: "مدفوع",
  processing: "قيد التنفيذ",
  completed: "مكتمل",
  payment_rejected: "الدفع مرفوض",
  cancelled: "ملغي",
  expired: "منتهي",
  active: "نشط",
  draft: "مسودة",
  archived: "مؤرشف",
  pending: "بانتظار الإرسال",
  sent: "تم الإرسال",
  failed: "فشل الإرسال",
  disabled: "غير مفعل",
  sending: "جارٍ الإرسال",
  uncertain: "نتيجة غير مؤكدة",
  delivered: "تم التسليم",
  read: "تمت القراءة",
};
export const fieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label: z.string().min(1).max(150),
  type: z.enum([
    "text",
    "textarea",
    "number",
    "email",
    "tel",
    "url",
    "select",
    "radio",
    "checkboxes",
    "date",
    "consent",
    "file",
  ]),
  required: z.boolean().default(false),
  description: z.string().max(500).default(""),
  placeholder: z.string().max(150).default(""),
  options: z.array(z.string().min(1).max(150)).max(50).default([]),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type Field = z.infer<typeof fieldSchema>;
export const fieldsSchema = z
  .array(fieldSchema)
  .max(30)
  .superRefine((fields, ctx) => {
    if (new Set(fields.map((f) => f.id)).size !== fields.length)
      ctx.addIssue({ code: "custom", message: "معرّفات الحقول مكررة" });
    for (const f of fields) {
      if (
        ["select", "radio", "checkboxes"].includes(f.type) &&
        !f.options.length
      )
        ctx.addIssue({ code: "custom", message: "أضف خيارات للحقل" });
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        ctx.addIssue({ code: "custom", message: "الحد الأدنى أكبر من الأقصى" });
    }
  });
export const slugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine(
    (s) =>
      ![
        "admin",
        "api",
        "checkout",
        "track",
        "login",
        "new",
        "settings",
        "privacy",
      ].includes(s),
    "الرابط محجوز",
  );
export const catalogSchema = z
  .object({
    name: z.string().min(2).max(150),
    slug: slugSchema,
    description: z.string().max(500),
    details: z.string().max(10000).default(""),
    price: z.coerce.number().min(0).max(10000000).multipleOf(0.01),
    currency: z.enum(["USD", "SYP", "EUR", "TRY"]),
    status: z.enum(["draft", "active", "archived"]),
    image_path: z.string().max(300).nullable().optional(),
    starts_at: z.string().nullable().optional(),
    ends_at: z.string().nullable().optional(),
    max_orders: z.coerce.number().int().positive().nullable().optional(),
    sort_order: z.coerce.number().int().default(0),
    duration: z.string().max(150).default(""),
    instructions: z.string().max(3000).default(""),
    form_schema: fieldsSchema,
    service_ids: z.array(z.uuid()).default([]),
  })
  .refine(
    (v) =>
      !v.starts_at || !v.ends_at || new Date(v.starts_at) < new Date(v.ends_at),
    "تاريخ النهاية يجب أن يلي البداية",
  );
export const orderSchema = z.object({
  kind: z.enum(["campaigns", "services"]),
  slug: slugSchema,
  service_id: z.uuid().optional(),
  name: z.string().min(2).max(150),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  answers: z.record(z.string(), z.unknown()),
  idempotency_key: z.uuid(),
  website: z.string().max(0),
  consent: z.literal(true),
});
export function validateAnswers(
  fields: Field[],
  answers: Record<string, unknown>,
) {
  for (const f of fields) {
    const v = answers[f.id];
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && !v.length) ||
      v === false;
    if (empty) {
      if (f.required) throw Error(`الحقل «${f.label}» مطلوب`);
      continue;
    }
    if (f.type === "consent") {
      if (v !== true) throw Error(`الموافقة على ${f.label} مطلوبة`);
      continue;
    }
    if (f.type === "checkboxes") {
      if (!Array.isArray(v) || v.some((x) => !f.options.includes(String(x))))
        throw Error("اختيار غير صالح");
      continue;
    }
    if (typeof v !== "string" && typeof v !== "number")
      throw Error("قيمة غير صالحة");
    const s = String(v);
    if (s.length > 10000) throw Error("المدخل طويل جداً");
    if (["select", "radio"].includes(f.type) && !f.options.includes(s))
      throw Error("اختيار غير صالح");
    if (
      f.type === "number" &&
      (!Number.isFinite(Number(v)) ||
        (f.min !== undefined && Number(v) < f.min) ||
        (f.max !== undefined && Number(v) > f.max))
    )
      throw Error(`قيمة ${f.label} غير صالحة`);
    if (
      f.type !== "number" &&
      ((f.min !== undefined && s.length < f.min) ||
        (f.max !== undefined && s.length > f.max))
    )
      throw Error(`طول ${f.label} غير صالح`);
    if (f.type === "email" && !z.email().safeParse(s).success)
      throw Error("البريد الإلكتروني غير صالح");
    if (
      f.type === "url" &&
      (!/^https?:\/\//.test(s) || !z.url().safeParse(s).success)
    )
      throw Error("الرابط غير صالح");
    if (f.type === "tel" && !/^\+?[0-9]{8,15}$/.test(s))
      throw Error("الهاتف غير صالح");
    if (f.type === "date" && !z.iso.date().safeParse(s).success)
      throw Error("التاريخ غير صالح");
    if (
      f.type === "file" &&
      !/^orders\/[a-f0-9-]+\/[a-f0-9-]+\.(png|jpg|pdf)$/.test(s)
    )
      throw Error("مرجع الملف غير صالح");
  }
}
export function csv(rows: Record<string, unknown>[]) {
  const keys = [
    "order_number",
    "customer_name",
    "phone",
    "item_name",
    "amount",
    "currency",
    "status",
    "payment_status",
    "created_at",
  ];
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [keys, ...rows.map((r) => keys.map((k) => r[k]))]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
export function retryDelay(attempt: number) {
  return Math.min(86400, 60 * 2 ** Math.min(attempt, 10));
}
export function validFile(bytes: Uint8Array, type: string) {
  if (type === "image/png")
    return (
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71 &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    );
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "application/pdf")
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  return false;
}
