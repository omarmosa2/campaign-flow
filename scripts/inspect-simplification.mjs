import { createClient } from "@supabase/supabase-js";
const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
for (const table of [
  "profiles",
  "orders",
  "payments",
  "attachments",
  "notification_outbox",
  "whatsapp_messages",
  "ad_requests",
]) {
  const { count, error } = await c
    .from(table)
    .select("*", { count: "exact", head: true });
  console.log(JSON.stringify({ table, count, error: error?.code ?? null }));
}
const { data, error } = await c.from("orders").select("*").limit(1);
console.log(
  JSON.stringify({
    orderColumns: data?.[0] ? Object.keys(data[0]) : [],
    error: error?.code ?? null,
  }),
);
const { data: s } = await c
  .from("settings")
  .select("value")
  .eq("id", "main")
  .maybeSingle();
console.log(JSON.stringify({ timezone: s?.value?.timezone ?? null }));
