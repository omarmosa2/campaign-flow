import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { requestSchema } from "../../src/lib/requests";
let pg: PGlite;
const actor = randomUUID();
const payload = {
  ad_placement: "فيسبوك Instagram",
  age_group: 25,
  audience_interests: "التقنية والتصميم",
  campaign_objective: "مشاهدات",
};
async function submit(
  key = randomUUID(),
  client = "client",
  age = 25,
  objective = "مشاهدات",
  source = "public",
  admin: string | null = null,
) {
  return (
    await pg.query<{ data: { order_number: string } }>(
      "select submit_ad_request($1,'فيسبوك Instagram',$2,'التقنية والتصميم',$3,$4,$5,$6) data",
      [key, age, objective, source, client, admin],
    )
  ).rows[0].data;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await pg.exec(
    readFileSync("supabase/migrations/202611180001_core.sql", "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
  await pg.query("insert into auth.users values($1)", [actor]);
  await pg.query(
    "insert into profiles(id,display_name,role) values($1,'مدير','super_admin')",
    [actor],
  );
  // Seed an actual historical order and related payment before the new migration.
  await pg.exec(
    "insert into services(id,name,slug,price,currency) values('20000000-0000-4000-8000-000000000001','قديم','old',50,'USD');insert into orders(customer_name,phone,service_id,item_name,amount,currency,form_snapshot,answers,access_hash,idempotency_key,created_at) values('عميل قديم','123','20000000-0000-4000-8000-000000000001','قديم',50,'USD','[]','{}','hash',gen_random_uuid(),'2020-01-01');",
  );
  await pg.exec(
    "insert into attachments(order_id,path,mime,size,purpose) select id,'historical/receipt.png','image/png',100,'receipt' from orders;insert into payments(order_id,attachment_id) select order_id,id from attachments;",
  );
  await pg.exec(
    readFileSync(
      "supabase/migrations/202611180002_simple_requests.sql",
      "utf8",
    ),
  );
});
afterAll(() => pg.close());
it("shared validation rejects empty, fractional, string and unknown objectives", () => {
  expect(requestSchema.safeParse(payload).success).toBe(true);
  for (const patch of [
    { ad_placement: " " },
    { age_group: 1.5 },
    { age_group: "25" },
    { age_group: NaN },
    { age_group: 0 },
    { audience_interests: "" },
    { campaign_objective: "sales" },
    { phone: "123" },
  ])
    expect(requestSchema.safeParse({ ...payload, ...patch }).success).toBe(
      false,
    );
});
it("creates public and admin orders, retries exactly once, deduplicates fresh keys", async () => {
  const key = randomUUID();
  const first = await submit(key);
  expect(await submit(key)).toEqual(first);
  expect(await submit()).toEqual(first);
  await expect(submit(key, "client", 26)).rejects.toThrow();
  await expect(submit(randomUUID(), "bad", 25, "sales")).rejects.toThrow();
  await expect(submit(randomUUID(), "bad", 0)).rejects.toThrow();
  await expect(
    submit(randomUUID(), "bad", 25, "مشاهدات", "admin"),
  ).rejects.toThrow();
  await submit(randomUUID(), "admin", 25, "مشاهدات", "admin", actor);
  const rows = (await pg.query("select source from ad_requests")).rows;
  expect(rows).toEqual([{ source: "public" }, { source: "admin" }]);
  expect(
    (
      await pg.query<{ n: number }>(
        "select count(*)::int n from notification_outbox",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("counts all historical and new orders with timezone boundaries, searches and paginates", async () => {
  await pg.exec(
    "update settings set value=jsonb_set(value,'{timezone}','\"Asia/Damascus\"');",
  );
  const stats = (
    await pg.query<{ s: { total: number; today: number } }>(
      "select ad_request_stats() s",
    )
  ).rows[0].s;
  expect(stats).toEqual({ total: 3, today: 2 });
  await pg.exec(
    "insert into ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source,created_at) select 'حد يوم',25,'اختبار','متابعين','public', (date_trunc('day',now() at time zone 'Asia/Damascus') at time zone 'Asia/Damascus') + v from (values (interval '-1 second'),(interval '0 seconds'),(interval '1 day')) t(v)",
  );
  const next = (
    await pg.query<{ s: { total: number; today: number } }>(
      "select ad_request_stats() s",
    )
  ).rows[0].s;
  expect(next).toEqual({ total: 6, today: 3 });
  const list = (
    await pg.query<{ s: { total: number; rows: unknown[] } }>(
      "select list_ad_requests('Instagram',1) s",
    )
  ).rows[0].s;
  expect(list.total).toBe(2);
  expect(list.rows).toHaveLength(2);
  await pg.exec(
    "insert into ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source) select 'صفحة',20,'اختبار','متابعين','public' from generate_series(1,21)",
  );
  const paged = (
    await pg.query<{ s: { total: number; rows: unknown[] } }>(
      "select list_ad_requests('صفحة',2) s",
    )
  ).rows[0].s;
  expect(paged.total).toBe(21);
  expect(paged.rows).toHaveLength(1);
});
it("preserves historical data and profiles and denies visitors reads/writes/RPC", async () => {
  expect(
    (await pg.query("select customer_name,amount from orders")).rows,
  ).toEqual([{ customer_name: "عميل قديم", amount: "50.00" }]);
  expect(
    (await pg.query<{ n: number }>("select count(*)::int n from profiles"))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await pg.query<{ n: number }>("select count(*)::int n from payments"))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await pg.query<{ path: string }>("select path from attachments")).rows[0]
      .path,
  ).toBe("historical/receipt.png");
  await pg.exec(
    "grant usage on schema public to anon,authenticated;set role anon;",
  );
  for (const sql of [
    "select * from ad_requests",
    "select * from all_ad_requests",
    "select ad_request_stats()",
    "select list_ad_requests()",
    "select submit_ad_request(gen_random_uuid(),'x',20,'x','مشاهدات','public','x')",
  ])
    await expect(pg.query(sql)).rejects.toThrow();
  await pg.exec("reset role;set role authenticated;");
  expect((await pg.query("select * from ad_requests")).rows).toHaveLength(0);
  await expect(pg.query("select * from ad_request_keys")).rejects.toThrow();
  await pg.exec("reset role");
});

it("allows an enabled admin through RLS and removes access when disabled", async () => {
  await pg.exec(
    `create or replace function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;set role authenticated;`,
  );
  expect(
    (await pg.query("select * from ad_requests")).rows.length,
  ).toBeGreaterThan(0);
  await pg.exec("reset role");
  await pg.query("update profiles set enabled=false where id=$1", [actor]);
  await pg.exec("set role authenticated");
  expect((await pg.query("select * from ad_requests")).rows).toHaveLength(0);
  await pg.exec("reset role");
});
