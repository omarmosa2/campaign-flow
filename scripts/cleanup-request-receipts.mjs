import { createClient } from "@supabase/supabase-js";
// Dry run by default. Only dedicated, unreferenced objects older than 24h are candidates.
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const bucket = client.storage.from("request-receipts");
const candidates = [];
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
const apply = process.argv.includes("--apply");
async function collect(prefix, depth = 0) {
  if (depth > 1) return;
  for (let offset = 0; ; offset += 100) {
    const listed = await bucket.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (listed.error) throw listed.error;
    for (const object of listed.data) {
      const path = `${prefix}/${object.name}`;
      if (!object.id) {
        if (/^[0-9a-f-]{36}$/.test(object.name)) await collect(path, depth + 1);
        continue;
      }
      if (
        !/^request-receipts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(
          path,
        )
      )
        continue;
      const created = new Date(object.created_at).getTime();
      if (!Number.isFinite(created) || created >= cutoff) continue;
      const reference = await client
        .from("ad_request_receipts")
        .select("request_id")
        .eq("path", path)
        .maybeSingle();
      if (reference.error) throw reference.error;
      if (!reference.data) candidates.push(path);
    }
    if (listed.data.length < 100) break;
  }
}
await collect("request-receipts");
for (const path of candidates) {
  console.log(apply ? "remove" : "candidate", path);
  if (apply) {
    // Recheck immediately before removal. The RPC rejects new links to objects older than 1h; candidates here are older than 24h.
    const check = await client
      .from("ad_request_receipts")
      .select("request_id")
      .eq("path", path)
      .maybeSingle();
    if (check.error) throw check.error;
    if (!check.data) {
      const removed = await bucket.remove([path]);
      if (removed.error) throw removed.error;
    }
  }
}
