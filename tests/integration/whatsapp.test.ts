import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
let pg: PGlite;
const actor = randomUUID();
const recipients = ["+963953705031", "+14155552671"];
type Job = {
  id: string;
  booking_id: string;
  recipient: string;
  lock_token: string;
  attempts: number;
  status: string;
};
async function claim(number: string | null = null, enabled = true) {
  return (
    await pg.query<Job>("select * from claim_ultramsg($1,$2,$3)", [
      enabled,
      recipients,
      number,
    ])
  ).rows;
}
async function submit(key = randomUUID()) {
  return (
    await pg.query<{ v: { order_number: string } }>(
      "select submit_ad_request($1,$2,25,'التقنية','مشاهدات','public',$3) v",
      [key, `فيسبوك ${key}`, key],
    )
  ).rows[0].v.order_number;
}
async function finish(
  job: Job,
  status = "queued",
  external: string | null = "123",
  retry = false,
) {
  await pg.query("select finish_ultramsg($1,$2,$3,$4,$5,$6)", [
    job.id,
    job.lock_token,
    status,
    external,
    status === "queued" ? null : "فشل",
    retry,
  ]);
}
async function settings(enabled: boolean, numbers = recipients) {
  await pg.query("select save_ultramsg_settings($1,$2,$3)", [
    enabled,
    numbers,
    actor,
  ]);
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema public to anon,authenticated,service_role;",
  );
  for (const path of [
    "supabase/migrations/202611180001_core.sql",
    "supabase/migrations/202611180002_simple_requests.sql",
    "tests/helpers/storage-schema.sql",
    "supabase/migrations/202611180003_request_receipts.sql",
  ])
    await pg.exec(
      readFileSync(path, "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await pg.query("insert into auth.users values($1)", [actor]);
  await pg.query(
    "insert into profiles(id,display_name,role) values($1,'مدير','admin')",
    [actor],
  );
  await submit(); // This historical booking must never get an event.
  await pg.exec(
    readFileSync(
      "supabase/migrations/202611240001_ultramsg_notifications.sql",
      "utf8",
    ),
  );
});
afterAll(() => pg.close());
it("does not backfill and commits a durable envelope only on successful insert", async () => {
  expect((await pg.query("select * from whatsapp_events")).rows).toHaveLength(
    0,
  );
  await pg.exec(
    "begin;insert into ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source) values('اختبار',25,'تقنية','مشاهدات','public');rollback;",
  );
  expect((await pg.query("select * from whatsapp_events")).rows).toHaveLength(
    0,
  );
  await expect(
    pg.query(
      "insert into ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source) values('اختبار',0,'تقنية','مشاهدات','public')",
    ),
  ).rejects.toThrow();
  expect((await pg.query("select * from whatsapp_events")).rows).toHaveLength(
    0,
  );
});
it("captures committed receipt status inside the same transaction", async () => {
  const key = randomUUID(),
    path = `request-receipts/${key}/${randomUUID()}.png`,
    sha = "a".repeat(64);
  await pg.query(
    "insert into storage.objects(bucket_id,name,metadata,user_metadata) values('request-receipts',$1,$2,$3)",
    [
      path,
      JSON.stringify({ size: 100, mimetype: "image/png" }),
      JSON.stringify({ sha256: sha, submission_key: key }),
    ],
  );
  const args = [key, "Instagram", path, sha];
  const sql =
    "select submit_ad_request_with_whatsapp($1,$2,25,'التقنية','مشاهدات','public','client',$3,'image/png',100,$4,true,array['+963953705031'])";
  await pg.query(sql, args);
  await pg.query(sql, args);
  const events = (
    await pg.query<{
      snapshot: { payment_status: string; ad_placement: string };
    }>("select snapshot from whatsapp_events")
  ).rows;
  expect(events).toHaveLength(1);
  expect(events[0].snapshot).toMatchObject({
    payment_status: "review",
    ad_placement: "Instagram",
  });
  // Recipients are frozen at commit, even if settings change before the worker runs.
  await settings(true, ["+14155552671"]);
  expect((await claim()).map((j) => j.recipient)).toEqual(["+963953705031"]);
  await settings(true);
});
it("persists environment disable at booking commit even if the request dies before dispatch", async () => {
  const key = randomUUID(),
    path = `request-receipts/${key}/${randomUUID()}.png`,
    sha = "b".repeat(64);
  await pg.query(
    "insert into storage.objects(bucket_id,name,metadata,user_metadata) values('request-receipts',$1,$2,$3)",
    [
      path,
      JSON.stringify({ size: 100, mimetype: "image/png" }),
      JSON.stringify({ sha256: sha, submission_key: key }),
    ],
  );
  await pg.query(
    "select submit_ad_request_with_whatsapp($1,'إيقاف',25,'تقنية','متابعين','public','client',$2,'image/png',100,$3,false,array['+963953705031'])",
    [key, path, sha],
  );
  expect(await claim()).toHaveLength(0);
});
it("deduplicates repeated submissions and atomically leases one row per booking/recipient", async () => {
  const key = randomUUID(),
    number = await submit(key);
  expect(await submit(key)).toBe(number);
  const jobs = await claim(number);
  expect(jobs).toHaveLength(2);
  expect(new Set(jobs.map((j) => j.recipient))).toEqual(new Set(recipients));
  expect(await claim(number)).toHaveLength(0);
  await Promise.all(jobs.map((j) => finish(j)));
  const rows = (
    await pg.query(
      "select status,sent_at from whatsapp_notifications where id=$1",
      [jobs[0].id],
    )
  ).rows;
  expect(rows).toEqual([{ status: "queued", sent_at: null }]);
  await expect(finish(jobs[0])).rejects.toThrow();
  await expect(
    pg.query(
      "insert into whatsapp_notifications(booking_id,recipient) values($1,$2)",
      [jobs[0].booking_id, jobs[0].recipient],
    ),
  ).rejects.toThrow();
});
it("several sequential bookings each have their own notifications", async () => {
  const numbers = await Promise.all([submit(), submit(), submit()]);
  for (const number of numbers) expect(await claim(number)).toHaveLength(2);
});
it("preserves booking on failure and retries only explicit temporary failures with a bounded backoff", async () => {
  const number = await submit();
  const [job] = await claim(number);
  await finish(job, "failed", null, true);
  expect(await claim(number)).toHaveLength(0); // Backoff not due yet.
  for (let attempt = 2; attempt <= 4; attempt++) {
    await pg.query(
      "update whatsapp_notifications set next_attempt_at=now()-interval '1 second' where id=$1",
      [job.id],
    );
    const [retry] = await claim(number);
    expect(retry.attempts).toBe(attempt);
    await finish(retry, "failed", null, true);
  }
  await pg.query(
    "update whatsapp_notifications set next_attempt_at=now()-interval '1 second' where id=$1",
    [job.id],
  );
  expect(await claim(number)).toHaveLength(0);
  expect(
    (
      await pg.query("select id from ad_requests where order_number=$1", [
        number,
      ])
    ).rows,
  ).toHaveLength(1);
});
it("never automatically retries a lost lease or an ambiguous send", async () => {
  const number = await submit(),
    jobs = await claim(number);
  await pg.query(
    "update whatsapp_notifications set last_attempt_at=now()-interval '6 minutes' where id=$1",
    [jobs[0].id],
  );
  await finish(jobs[1], "uncertain", null);
  expect(await claim(number)).toHaveLength(0);
  expect(
    (
      await pg.query(
        "select status from whatsapp_notifications where booking_id=$1",
        [jobs[0].booking_id],
      )
    ).rows,
  ).toEqual([{ status: "uncertain" }, { status: "uncertain" }]);
  await expect(
    pg.query("select retry_ultramsg($1,$2,false)", [jobs[0].id, actor]),
  ).rejects.toThrow();
  await expect(
    pg.query("select retry_ultramsg($1,$2,true)", [jobs[0].id, randomUUID()]),
  ).rejects.toThrow();
  await pg.query("select retry_ultramsg($1,$2,true)", [jobs[0].id, actor]);
  expect((await claim(number))[0].attempts).toBe(2);
});
it("takes recipient overrides for new events and preserves original recipients on retries", async () => {
  const old = await submit(),
    oldJobs = await claim(old);
  await finish(oldJobs[0], "failed", null);
  await settings(true, ["+442071838750"]);
  const number = await submit();
  expect((await claim(number)).map((j) => j.recipient)).toEqual([
    "+442071838750",
  ]);
  await pg.query("select retry_ultramsg($1,$2,true)", [oldJobs[0].id, actor]);
  expect((await claim(old))[0].recipient).toBe(oldJobs[0].recipient);
});
it("suppresses bookings during disable and respects the server master switch", async () => {
  await settings(false);
  const disabled = await submit();
  expect(await claim(disabled)).toHaveLength(0);
  await settings(true);
  expect(await claim(disabled)).toHaveLength(0);
  const envDisabled = await submit();
  expect(await claim(envDisabled, false)).toHaveLength(0);
  expect(await claim(envDisabled, true)).toHaveLength(0);
  expect(await claim(await submit())).toHaveLength(2);
});
it("correlates provider status and never regresses sent/delivered", async () => {
  const [job] = await claim(await submit());
  await finish(job, "queued", "999");
  const update = (external: string, status: string) =>
    pg.query("select record_ultramsg_status($1,$2,$3,null)", [
      job.id,
      external,
      status,
    ]);
  await update("wrong", "delivered");
  expect(
    (
      await pg.query("select status from whatsapp_notifications where id=$1", [
        job.id,
      ])
    ).rows[0],
  ).toEqual({ status: "queued" });
  await update("999", "sent");
  await update("999", "queued");
  expect(
    (
      await pg.query("select status from whatsapp_notifications where id=$1", [
        job.id,
      ])
    ).rows[0],
  ).toEqual({ status: "sent" });
  await update("999", "delivered");
  await update("999", "sent");
  expect(
    (
      await pg.query(
        "select status,sent_at is not null as has_sent_at from whatsapp_notifications where id=$1",
        [job.id],
      )
    ).rows[0],
  ).toEqual({ status: "delivered", has_sent_at: true });
});
it("includes new inserts in the legacy booking table without replaying historical rows", async () => {
  await pg.exec(
    "insert into services(name,slug,price,currency) values('إعلان','whatsapp-test',50,'USD')",
  );
  const result = await pg.query<{ id: string }>(
    "insert into orders(customer_name,phone,service_id,item_name,amount,currency,form_snapshot,answers,access_hash,idempotency_key) select 'عميل','12345678',id,'إعلان',50,'USD','[]','{}','secret',gen_random_uuid() from services where slug='whatsapp-test' returning id",
  );
  const event = (
    await pg.query<{ snapshot: Record<string, unknown> }>(
      "select snapshot from whatsapp_events where id=$1",
      [result.rows[0].id],
    )
  ).rows[0];
  expect(event.snapshot.customer_name).toBe("عميل");
  expect(event.snapshot).not.toHaveProperty("access_hash");
});
it("RLS denies anonymous and non-admin reads/writes and RPC execution", async () => {
  await pg.exec("set role anon;");
  await expect(
    pg.query("select * from whatsapp_notifications"),
  ).rejects.toThrow();
  await expect(
    pg.query("select claim_ultramsg(true,array['+963953705031'])"),
  ).rejects.toThrow();
  await pg.exec("reset role;set role authenticated");
  expect(
    (await pg.query("select * from whatsapp_notifications")).rows,
  ).toHaveLength(0);
  await expect(
    pg.query("update whatsapp_settings set enabled=true"),
  ).rejects.toThrow();
  await pg.exec(
    `reset role;create or replace function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;set role authenticated;`,
  );
  expect(
    (await pg.query("select * from whatsapp_notifications")).rows.length,
  ).toBeGreaterThan(0);
  await pg.exec("reset role");
  await pg.query("update profiles set enabled=false where id=$1", [actor]);
  await pg.exec("set role authenticated");
  expect(
    (await pg.query("select * from whatsapp_notifications")).rows,
  ).toHaveLength(0);
  await pg.exec("reset role");
});
