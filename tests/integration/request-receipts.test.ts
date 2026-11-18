import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
let pg: PGlite;
const actor = randomUUID();
const digest = "a".repeat(64);
type Input = {
  key: string;
  path: string;
  sha: string;
  mime: string;
  size: number;
  placement: string;
  source: string;
  client: string;
  actor: string | null;
};
function input(patch: Partial<Input> = {}): Input {
  const key = patch.key ?? randomUUID();
  return {
    key,
    path: `request-receipts/${key}/${randomUUID()}.png`,
    sha: digest,
    mime: "image/png",
    size: 100,
    placement: "فيسبوك",
    source: "public",
    client: "test-client",
    actor: null,
    ...patch,
  };
}
async function object(v: Input, patch: Record<string, unknown> = {}) {
  await pg.query(
    "insert into storage.objects(bucket_id,name,metadata,user_metadata) values('request-receipts',$1,$2,$3)",
    [
      v.path,
      JSON.stringify({ size: v.size, mimetype: v.mime, ...patch }),
      JSON.stringify({ sha256: v.sha, submission_key: v.key }),
    ],
  );
}
async function submit(v: Input) {
  return (
    await pg.query<{ s: { order_number: string; receipt_path: string } }>(
      "select public.submit_ad_request_with_receipt($1,$2,25,'تقنية','مشاهدات',$3,$4,$5,$6,$7,$8,$9) s",
      [
        v.key,
        v.placement,
        v.source,
        v.client,
        v.path,
        v.mime,
        v.size,
        v.sha,
        v.actor,
      ],
    )
  ).rows[0].s;
}
async function count(table = "ad_requests") {
  return (
    await pg.query<{ n: number }>(`select count(*)::int n from public.${table}`)
  ).rows[0].n;
}
async function role<T>(name: string, fn: () => Promise<T>) {
  await pg.exec(`set role ${name}`);
  try {
    return await fn();
  } finally {
    await pg.exec("reset role");
  }
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema public to anon,authenticated,service_role;",
  );
  await pg.exec(readFileSync("tests/helpers/storage-schema.sql", "utf8"));
  await pg.exec(
    readFileSync("supabase/migrations/202611180001_core.sql", "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
  await pg.exec(
    readFileSync(
      "supabase/migrations/202611180002_simple_requests.sql",
      "utf8",
    ),
  );
  await pg.query("insert into auth.users values($1)", [actor]);
  await pg.query(
    "insert into public.profiles(id,display_name,role) values($1,'مدير','super_admin')",
    [actor],
  );
  await pg.exec(
    "insert into public.ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source) values('طلب سابق',25,'قديم','مشاهدات','public');insert into storage.buckets(id,name,public) values('request-receipts','request-receipts',true);insert into storage.objects(bucket_id,name) values('request-receipts','existing.png');",
  );
  await pg.exec(
    readFileSync(
      "supabase/migrations/202611180003_request_receipts.sql",
      "utf8",
    ),
  );
});
afterAll(() => pg.close());
it("preserves records, repairs an existing public bucket, retains the old API before cutover", async () => {
  expect(await count()).toBe(1);
  expect(await count("profiles")).toBe(1);
  expect(
    (
      await pg.query(
        "select name from storage.objects where name='existing.png'",
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await pg.query(
        "select public,file_size_limit from storage.buckets where id='request-receipts'",
      )
    ).rows,
  ).toEqual([{ public: false, file_size_limit: 4194304 }]);
  await role("service_role", () =>
    pg.query(
      "select public.submit_ad_request(gen_random_uuid(),'قديم',25,'قديم','مشاهدات','public','legacy-client')",
    ),
  );
});
it("creates an order, its exact attachment and review status in a single transaction", async () => {
  const v = input();
  await object(v);
  const before = await count();
  const result = await role("service_role", () => submit(v));
  expect(result.receipt_path).toBe(v.path);
  expect(await count()).toBe(before + 1);
  const rows = (
    await pg.query(
      "select a.order_number,r.path,r.payment_status,r.storage_object_id=o.id as correct_object from public.ad_requests a join public.ad_request_receipts r on r.request_id=a.id join storage.objects o on o.name=r.path where r.path=$1",
      [v.path],
    )
  ).rows;
  expect(rows).toEqual([
    {
      order_number: result.order_number,
      path: v.path,
      payment_status: "review",
      correct_object: true,
    },
  ]);
});
it("retries only the same intent, keeps its first receipt, rejects changed content, and accepts a roaming IP", async () => {
  const v = input();
  await object(v);
  const first = await submit(v);
  const retry = input({
    ...v,
    path: `request-receipts/${v.key}/${randomUUID()}.png`,
    client: "roaming-client",
  });
  await object(retry);
  expect(await submit(retry)).toEqual(first);
  expect(
    (
      await pg.query(
        "select path from public.ad_request_receipts where path=$1",
        [retry.path],
      )
    ).rows,
  ).toHaveLength(0);
  for (const patch of [
    { sha: "b".repeat(64) },
    { placement: "حملة أخرى" },
    { source: "admin", actor },
  ])
    await expect(submit({ ...retry, ...patch })).rejects.toThrow("معرّف الطلب");
  // A distinct key is a distinct request even if it reuses identical campaign data and image bytes.
  const second = input();
  await object(second);
  expect((await submit(second)).order_number).not.toBe(first.order_number);
});
it("serializes concurrent retries and never attaches their duplicate objects", async () => {
  const first = input();
  const second = input({ key: first.key });
  await object(first);
  await object(second);
  const before = await count();
  const results = await Promise.all([
    submit(first),
    submit(second),
    submit(first),
  ]);
  expect(new Set(results.map((r) => r.order_number)).size).toBe(1);
  expect(await count()).toBe(before + 1);
  expect(
    (
      await pg.query(
        "select path from public.ad_request_receipts where path=$1 or path=$2",
        [first.path, second.path],
      )
    ).rows,
  ).toHaveLength(1);
});
it("rejects missing storage, mismatched real size/mime/digest/key, foreign paths and invalid inputs", async () => {
  const before = await count();
  const missing = input();
  await expect(submit(missing)).rejects.toThrow("مفقود");
  for (const patch of [{ size: 101 }, { mimetype: "text/html" }]) {
    const v = input();
    await object(v, patch);
    await expect(submit(v)).rejects.toThrow("خصائصه");
  }
  for (const patch of [
    { sha256: "b".repeat(64) },
    { submission_key: randomUUID() },
  ]) {
    const v = input();
    await object(v);
    await pg.query(
      "update storage.objects set user_metadata=user_metadata||$2::jsonb where name=$1",
      [v.path, JSON.stringify(patch)],
    );
    await expect(submit(v)).rejects.toThrow("خصائصه");
  }
  const foreign = input();
  await object(foreign);
  await expect(submit({ ...foreign, key: randomUUID() })).rejects.toThrow(
    "معرّف الإرسال",
  );
  for (const patch of [
    { size: 0 },
    { size: 4194305 },
    { mime: "application/pdf" },
    { sha: "bad" },
    { source: "admin" },
    { actor, source: "public" },
    { placement: "" },
  ])
    await expect(submit(input(patch))).rejects.toThrow();
  expect(await count()).toBe(before);
});
it("rejects stale orphan links while preserving maximum-length campaign fields", async () => {
  const v = input();
  await object(v);
  await pg.query(
    "update storage.objects set created_at=now()-interval '2 hours' where name=$1",
    [v.path],
  );
  await expect(submit(v)).rejects.toThrow("مفقود");
  const large = input();
  await object(large);
  const result = await pg.query(
    "select public.submit_ad_request_with_receipt($1,$2,25,$3,'مشاهدات','public','long-client',$4,'image/png',100,$5)",
    [large.key, "ع".repeat(200), "ا".repeat(5000), large.path, large.sha],
  );
  expect(result.rows).toHaveLength(1);
});
it("rolls back both order and receipt if inserting the idempotency record fails", async () => {
  await pg.exec(
    "alter table public.ad_request_keys add constraint test_failure check(client_hash <> 'fail-test')",
  );
  const before = await count(),
    receipts = await count("ad_request_receipts");
  const v = input({ client: "fail-test" });
  await object(v);
  await expect(submit(v)).rejects.toThrow();
  expect(await count()).toBe(before);
  expect(await count("ad_request_receipts")).toBe(receipts);
});
it("validates the saved object even on retry and never relinks a replacement", async () => {
  const v = input();
  await object(v);
  await submit(v);
  await pg.query(
    "update storage.objects set id=gen_random_uuid() where name=$1",
    [v.path],
  );
  await expect(submit(v)).rejects.toThrow("المحفوظ");
});
it("isolates receipt metadata and Storage despite broad old policies", async () => {
  const v = input();
  await object(v);
  await submit(v);
  for (const r of ["anon", "authenticated"])
    await role(r, async () => {
      expect(
        (
          await pg.query(
            "select * from storage.objects where bucket_id='request-receipts'",
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await pg.query(
            "select * from storage.buckets where id='request-receipts'",
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        pg.query(
          "insert into storage.objects(bucket_id,name) values('request-receipts','attack.png')",
        ),
      ).rejects.toThrow();
      expect(
        (
          await pg.query(
            "update storage.objects set metadata='{}' where name=$1 returning id",
            [v.path],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await pg.query(
            "delete from storage.objects where name=$1 returning id",
            [v.path],
          )
        ).rows,
      ).toHaveLength(0);
      await expect(submit(input())).rejects.toThrow();
      await expect(
        pg.query("select public.activate_request_receipt_requirement()"),
      ).rejects.toThrow();
    });
  await role("anon", async () => {
    await expect(
      pg.query("select * from public.ad_request_receipts"),
    ).rejects.toThrow();
  });
  await role("authenticated", async () => {
    expect(
      (await pg.query("select * from public.ad_request_receipts")).rows,
    ).toHaveLength(0);
  });
  await pg.exec(
    `create or replace function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$`,
  );
  await role("authenticated", async () => {
    expect(
      (await pg.query("select * from public.ad_request_receipts")).rows.length,
    ).toBeGreaterThan(0);
  });
  await pg.query("update public.profiles set enabled=false where id=$1", [
    actor,
  ]);
  await role("authenticated", async () => {
    expect(
      (await pg.query("select * from public.ad_request_receipts")).rows,
    ).toHaveLength(0);
  });
  await expect(submit(input({ source: "admin", actor }))).rejects.toThrow(
    "غير مصرح",
  );
  await pg.query("update public.profiles set enabled=true where id=$1", [
    actor,
  ]);
  const adminInput = input({ source: "admin", actor });
  await object(adminInput);
  await submit(adminInput);
  await role("service_role", async () => {
    await expect(
      pg.query("update public.ad_request_receipts set path='attack'"),
    ).rejects.toThrow();
  });
});
it("pins definer search paths and requires explicit activation after deployment", async () => {
  const defs = (
    await pg.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef,proconfig from pg_proc where proname in ('submit_ad_request_with_receipt','activate_request_receipt_requirement','check_ad_request_receipt')",
    )
  ).rows;
  expect(defs).toHaveLength(3);
  for (const d of defs) {
    expect(d.prosecdef).toBe(true);
    expect(d.proconfig).toContain('search_path=""');
  }
  const before = await count();
  await role("service_role", () =>
    pg.query("select public.activate_request_receipt_requirement()"),
  );
  await role("service_role", async () => {
    await expect(
      pg.query(
        "select public.submit_ad_request(gen_random_uuid(),'قديم',25,'قديم','مشاهدات','public','legacy-new')",
      ),
    ).rejects.toThrow();
  });
  await expect(
    pg.query(
      "insert into public.ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source) values('غير مكتمل',25,'x','مشاهدات','public')",
    ),
  ).rejects.toThrow("إشعار الدفع إلزامي");
  expect(await count()).toBe(before);
  const v = input();
  await object(v);
  await role("service_role", () => submit(v));
  expect(await count()).toBe(before + 1);
  expect(
    (
      await pg.query(
        "select * from public.ad_requests where ad_placement='طلب سابق'",
      )
    ).rows,
  ).toHaveLength(1);
});
