import { z } from "zod";
export const settingsSchema = z
  .object({
    platform_name: z.string().min(2).max(100),
    description: z.string().max(1000).default(""),
    logo_path: z.string().max(300).default(""),
    contact: z.string().max(300).default(""),
    currency: z.enum(["USD", "SYP", "EUR", "TRY"]),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("ar", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "منطقة زمنية غير صالحة"),
    date_format: z.enum(["dd/MM/yyyy", "yyyy-MM-dd"]),
    accepting_orders: z.boolean(),
    sham_name: z.string().max(150),
    sham_account: z.string().max(150),
    payment_instructions: z.string().max(3000),
    whatsapp_enabled: z.boolean(),
    whatsapp_recipient: z.string().max(20),
    whatsapp_language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
    templates: z.record(z.string(), z.string().regex(/^[a-z0-9_]*$/)),
    notification_events: z.array(
      z.enum(["order_created", "payment_submitted", "payment_approved"]),
    ),
    recipient_consent: z.boolean(),
  })
  .refine(
    (v) =>
      !v.accepting_orders ||
      (v.sham_account.length > 0 && v.sham_name.length > 0),
    "أكمل بيانات شام كاش قبل استقبال الطلبات",
  )
  .refine(
    (v) =>
      !v.whatsapp_enabled ||
      (v.recipient_consent &&
        /^\d{8,15}$/.test(v.whatsapp_recipient) &&
        v.notification_events.every((e) => v.templates[e])),
    "أكمل رقم المستلم وموافقته والقوالب قبل تفعيل واتساب",
  );
