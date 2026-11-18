import "server-only";
import { db } from "@/lib/supabase";
import { check } from "@/lib/http";
import { retryDelay } from "@/lib/domain";
export function whatsappReady() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_GRAPH_VERSION &&
    process.env.META_APP_SECRET &&
    process.env.WHATSAPP_VERIFY_TOKEN,
  );
}
export async function processOutbox() {
  if (!whatsappReady()) return { enabled: false, processed: 0 };
  const client = db();
  const config = check(
    await client.from("settings").select("value").eq("id", "main").single(),
  ).value;
  if (!config.whatsapp_enabled || !config.recipient_consent)
    return { enabled: false, processed: 0 };
  const jobs = check(await client.rpc("claim_notifications")) as {
    id: string;
    order_id: string;
    event: string;
    attempts: number;
    lock_token: string;
  }[];
  await Promise.all(
    jobs.map(async (job) => {
      const order = check(
        await client
          .from("orders")
          .select(
            "id,order_number,customer_name,item_name,amount,currency,payment_status",
          )
          .eq("id", job.order_id)
          .single(),
      );
      const template = config.templates[job.event];
      if (
        !template ||
        !(config.notification_events ?? []).includes(job.event)
      ) {
        check(
          await client.rpc("finish_notification", {
            p_id: job.id,
            p_lock: job.lock_token,
            p_status: "disabled",
            p_external: null,
            p_error: "الحدث غير مفعّل أو قالبه غير مضبوط",
            p_next: new Date().toISOString(),
          }),
        );
        return;
      }
      try {
        const response = await fetch(
          `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: config.whatsapp_recipient,
              type: "template",
              template: {
                name: template,
                language: { code: config.whatsapp_language },
                components: [
                  {
                    type: "body",
                    parameters: [
                      order.order_number,
                      order.customer_name,
                      order.item_name,
                      `${order.amount} ${order.currency}`,
                      order.payment_status,
                      `${process.env.APP_URL}/admin/orders/${order.id}`,
                    ].map((text) => ({ type: "text", text })),
                  },
                ],
              },
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
        const body = await response.json();
        if (response.ok && body.messages?.[0]?.id) {
          check(
            await client.rpc("finish_notification", {
              p_id: job.id,
              p_lock: job.lock_token,
              p_status: "sent",
              p_external: body.messages[0].id,
              p_error: null,
              p_next: new Date().toISOString(),
            }),
          );
        } else {
          const transient = response.status === 429 || response.status >= 500;
          check(
            await client.rpc("finish_notification", {
              p_id: job.id,
              p_lock: job.lock_token,
              p_status: transient ? "failed" : "disabled",
              p_external: null,
              p_error: `Meta HTTP ${response.status} · code ${Number(body.error?.code) || 0} · subcode ${Number(body.error?.error_subcode) || 0}`,
              p_next: new Date(
                Date.now() + retryDelay(job.attempts) * 1000,
              ).toISOString(),
            }),
          );
        }
      } catch {
        check(
          await client.rpc("finish_notification", {
            p_id: job.id,
            p_lock: job.lock_token,
            p_status: "uncertain",
            p_external: null,
            p_error:
              "تعذر تأكيد نتيجة الإرسال. تحقق من Meta قبل إعادة الإرسال لتفادي التكرار.",
            p_next: new Date().toISOString(),
          }),
        );
      }
    }),
  );
  return { enabled: true, processed: jobs.length };
}
