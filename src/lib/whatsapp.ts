import { z } from "zod";

export const WHATSAPP_SETUP_REQUIRED = "WHATSAPP_SETUP_REQUIRED";
export const whatsappSetupMessage =
  "لم يكتمل إعداد قاعدة بيانات واتساب. نفّذ ملف ترحيل واتساب في Supabase SQL Editor ثم أعد المحاولة.";

export const recipientSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "استخدم رقماً دولياً يبدأ بـ +");
export const whatsappSettingsSchema = z
  .object({
    enabled: z.boolean(),
    recipients: z
      .array(recipientSchema)
      .min(1)
      .max(5)
      .transform((v) => [...new Set(v)]),
  })
  .strict();
export type WhatsAppSettings = z.infer<typeof whatsappSettingsSchema>;
export type WhatsAppNotification = {
  id: string;
  booking_id: string | null;
  recipient: string;
  status: string;
  external_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  last_attempt_at: string | null;
  sent_at: string | null;
};
export type WhatsAppDashboard = {
  settings: WhatsAppSettings;
  configured: boolean;
  environment_enabled: boolean;
  connection: string;
  stats: {
    accepted: number;
    queued: number;
    sent: number;
    delivered: number;
    failed: number;
    uncertain: number;
    last_sent_at: string | null;
  };
  notifications: WhatsAppNotification[];
};
export const notificationLabels: Record<string, string> = {
  pending: "بانتظار الإرسال",
  processing: "قيد المعالجة",
  queued: "مقبولة لدى المزود",
  sent: "مرسلة",
  delivered: "تم التسليم",
  failed: "فاشلة",
  uncertain: "نتيجة غير مؤكدة",
};
