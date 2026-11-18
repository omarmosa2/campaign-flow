import { z } from "zod";
export const objectives = ["رسائل واتصال هاتفي", "مشاهدات", "متابعين"] as const;
export const requestSchema = z
  .object({
    ad_placement: z
      .string({ error: "أدخل موقع عرض الإعلان" })
      .trim()
      .min(1, "أدخل موقع عرض الإعلان")
      .max(200, "الحد الأقصى 200 حرف"),
    age_group: z
      .number({ error: "أدخل الفئة العمرية كعدد صحيح" })
      .int("الفئة العمرية عدد صحيح فقط")
      .min(1, "أدخل عمراً أكبر من صفر")
      .max(2147483647, "قيمة العمر كبيرة جداً"),
    audience_interests: z
      .string({ error: "أدخل اهتمامات الجمهور" })
      .trim()
      .min(1, "أدخل اهتمامات الجمهور")
      .max(5000, "الحد الأقصى 5000 حرف"),
    campaign_objective: z.enum(objectives, {
      error: "اختر هدفاً معتمداً للحملة",
    }),
  })
  .strict();
export const submissionSchema = requestSchema.extend({
  idempotency_key: z.uuid("معرّف الطلب غير صالح"),
});
export type AdRequest = {
  id: string;
  order_number: string;
  ad_placement: string | null;
  age_group: number | null;
  audience_interests: string | null;
  campaign_objective: string | null;
  source: "public" | "admin" | "legacy";
  created_at: string;
  legacy_data?: Record<string, unknown>;
};
export type RequestList = {
  rows: AdRequest[];
  total: number;
  timezone: string;
};
