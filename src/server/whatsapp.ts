import "server-only";
import { db } from "@/lib/supabase";
import { checkWhatsApp as check } from "@/server/whatsapp-database";
import type { WhatsAppDashboard, WhatsAppNotification } from "@/lib/whatsapp";
import {
  bookingMessage,
  connectionStatus,
  defaultRecipients,
  environmentEnabled,
  getUltraMessage,
  sendUltraMessage,
  ultraConfig,
} from "./ultramsg";

type Job = WhatsAppNotification & { lock_token: string };
export async function processWhatsApp(orderNumber?: string) {
  if (environmentEnabled() && !ultraConfig()) return { processed: 0 };
  const client = db();
  const jobs = check(
    await client.rpc("claim_ultramsg", {
      p_enabled: environmentEnabled(),
      p_recipients: defaultRecipients(),
      p_number: orderNumber ?? null,
    }),
  ) as Job[];
  const outcomes = await Promise.allSettled(
    jobs.map(async (job) => {
      // Errors before dispatch are unambiguous. Errors after dispatch must preserve uncertainty.
      let message: string;
      try {
        if (job.booking_id) {
          const event = check(
            await client
              .from("whatsapp_events")
              .select("snapshot")
              .eq("id", job.booking_id)
              .single(),
          );
          message = bookingMessage(event.snapshot);
        } else
          message =
            "🔔 *رسالة تجريبية*\n\nتم إعداد إشعارات واتساب لمنصة الحجوزات بنجاح.";
      } catch {
        check(
          await client.rpc("finish_ultramsg", {
            p_id: job.id,
            p_lock: job.lock_token,
            p_status: "failed",
            p_external: null,
            p_error: "تعذر تجهيز بيانات الإشعار المحفوظة",
            p_retry: true,
          }),
        );
        return;
      }
      const result = await sendUltraMessage(
        job.recipient,
        message,
        job.booking_id ?? job.id,
      );
      // If finalization fails the lease expires into uncertain, never an automatic duplicate.
      check(
        await client.rpc("finish_ultramsg", {
          p_id: job.id,
          p_lock: job.lock_token,
          p_status: result.status,
          p_external: result.external,
          p_error: result.error,
          p_retry: result.retry,
        }),
      );
    }),
  );
  if (outcomes.some((result) => result.status === "rejected"))
    throw Error("تعذرت معالجة بعض الإشعارات؛ بقيت محفوظة للمراجعة");
  return { processed: jobs.length };
}

export async function refreshWhatsAppStatus(id?: string) {
  if (!ultraConfig()) return;
  const client = db();
  let query = client
    .from("whatsapp_notifications")
    .select("id,external_id,recipient,status")
    .in("status", ["queued", "sent"])
    .not("external_id", "is", null);
  if (id) query = query.eq("external_id", id);
  const jobs = check(
    await query
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(5),
  );
  const outcomes = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        const message = await getUltraMessage(job.external_id);
        // Correlate the exact provider ID and recipient; never trust webhook status.
        const recipient = message?.to
          ?.replace(/@c\.us$/, "")
          .replace(/^\+/, "");
        if (message && recipient === job.recipient.slice(1)) {
          const status = ["device", "read", "played"].includes(
            message.ack?.toLowerCase(),
          )
            ? "delivered"
            : message.status === "sent"
              ? "sent"
              : ["unsent", "invalid", "expired"].includes(message.status)
                ? "failed"
                : "queued";
          const timestamp = Number(message.sent_at);
          check(
            await client.rpc("record_ultramsg_status", {
              p_id: job.id,
              p_external: job.external_id,
              p_status: status,
              p_sent_at:
                timestamp > 0 && timestamp < 8640000000000
                  ? new Date(timestamp * 1000).toISOString()
                  : null,
            }),
          );
        }
      } catch {
        /* Read-only verification failure never changes delivery state. */
      }
      check(
        await client
          .from("whatsapp_notifications")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", job.id),
      );
    }),
  );
  if (outcomes.some((result) => result.status === "rejected"))
    throw Error("تعذر تحديث بعض الإشعارات");
}

export async function whatsappDashboard(): Promise<WhatsAppDashboard> {
  const client = db();
  const [config, stats, notifications, connection] = await Promise.all([
    client
      .from("whatsapp_settings")
      .select("enabled,recipients")
      .eq("id", true)
      .single(),
    client.rpc("ultramsg_stats"),
    client
      .from("whatsapp_notifications")
      .select(
        "id,booking_id,recipient,status,external_id,attempts,last_error,created_at,last_attempt_at,sent_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    connectionStatus(),
  ]);
  const settings = check(config);
  return {
    settings: {
      enabled: settings.enabled ?? true,
      recipients: settings.recipients ?? defaultRecipients(),
    },
    configured: Boolean(ultraConfig()),
    environment_enabled: environmentEnabled(),
    connection,
    stats: check(stats),
    notifications: check(notifications),
  };
}

export async function queueWhatsAppTest() {
  if (!ultraConfig() || !environmentEnabled())
    throw Error("فعّل متغيرات بيئة خدمة واتساب أولاً");
  const client = db();
  const config = check(
    await client
      .from("whatsapp_settings")
      .select("enabled,recipients")
      .eq("id", true)
      .single(),
  );
  if (config.enabled === false)
    throw Error("فعّل إشعارات واتساب واحفظ الإعدادات أولاً");
  check(
    await client.from("whatsapp_notifications").insert(
      (config.recipients ?? defaultRecipients()).map((recipient: string) => ({
        recipient,
      })),
    ),
  );
}
