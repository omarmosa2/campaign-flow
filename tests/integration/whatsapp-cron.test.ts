import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let pg: PGlite;
const secret = "unit-test-cron-secret-with-at-least-32-characters";
async function configure(url = "https://example.test", token = secret) {
  return (
    await pg.query<{
      value: { available: boolean; enabled: boolean; schedule: string | null };
    }>("select configure_whatsapp_cron($1,$2) value", [url, token])
  ).rows[0].value;
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    grant usage on schema public to anon,authenticated,service_role;
    create table whatsapp_events(expanded_at timestamptz);
    create table whatsapp_notifications(status text,retryable boolean default false,attempts integer default 0,next_attempt_at timestamptz default now(),last_attempt_at timestamptz,external_id text);`);
  await pg.exec(
    readFileSync(
      "supabase/migrations/202611240002_whatsapp_supabase_cron.sql",
      "utf8",
    ),
  );
});
afterAll(() => pg.close());
it("allows deployment without optional hosted extensions and reports unavailability", async () => {
  expect(await configure()).toEqual({
    available: false,
    enabled: false,
    schedule: null,
  });
});
it("stores configuration through Vault and schedules only one named job without embedding credentials", async () => {
  // PGlite cannot install hosted Supabase extensions. These stubs exercise the SQL
  // integration contract, not the real scheduler/network engine or Vault encryption.
  await pg.exec(`
    create schema cron;create schema vault;create schema net;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,active boolean default true,username text default current_user,unique(jobname,username));
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname,username) do update set schedule=excluded.schedule,command=excluded.command,active=true returning jobid $$;
    create function cron.unschedule(bigint) returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;
    insert into cron.job(jobname,schedule,command) values('unrelated-job','0 0 * * *','select 1');
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text);
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(text,text,text) returns uuid language sql as $$insert into vault.secrets(secret,name,description) values($1,$2,$3) returning id$$;
    create function vault.update_secret(uuid,text,text,text) returns void language sql as $$update vault.secrets set secret=$2,name=$3,description=$4 where id=$1$$;
    create table public.test_http(id bigint generated always as identity,url text,headers jsonb,timeout_ms integer);
    create function net.http_get(url text,params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000) returns bigint language sql as $$
      insert into public.test_http(url,headers,timeout_ms) values(url,headers,timeout_milliseconds) returning id $$;
    create or replace function public.whatsapp_cron_available() returns boolean language sql as $$select true$$;
  `);
  expect(await configure()).toEqual({
    available: true,
    enabled: true,
    schedule: "* * * * *",
  });
  await configure();
  const jobs = (
    await pg.query<{ jobname: string; command: string }>(
      "select jobname,command from cron.job order by jobname",
    )
  ).rows;
  expect(jobs).toEqual([
    {
      jobname: "campaign-flow-whatsapp-retry",
      command: "SELECT public.dispatch_whatsapp_retry();",
    },
    { jobname: "unrelated-job", command: "select 1" },
  ]);
  expect(JSON.stringify(jobs)).not.toContain(secret);
  expect((await pg.query("select id from vault.secrets")).rows).toHaveLength(2);
});
it("does not call HTTP on an idle outbox and uses the authorization header for due work", async () => {
  expect(
    (await pg.query("select dispatch_whatsapp_retry() as request")).rows[0],
  ).toEqual({ request: null });
  await pg.exec(
    "insert into whatsapp_notifications(status,retryable,attempts) values('failed',true,1)",
  );
  await pg.query("select dispatch_whatsapp_retry()");
  expect(
    (await pg.query("select url,headers,timeout_ms from test_http")).rows,
  ).toEqual([
    {
      url: "https://example.test/api/cron/whatsapp",
      headers: { Authorization: `Bearer ${secret}` },
      timeout_ms: 55000,
    },
  ]);
  await pg.exec("delete from whatsapp_notifications;delete from test_http;");
  await pg.exec(
    "insert into whatsapp_notifications(status,retryable,attempts) values('uncertain',false,1),('failed',true,4)",
  );
  expect(
    (await pg.query("select dispatch_whatsapp_retry() as request")).rows[0],
  ).toEqual({ request: null });
  await pg.exec("delete from whatsapp_notifications");
});
it("rotates Vault values without duplicating scheduler jobs", async () => {
  const rotated = "rotated-cron-secret-with-at-least-32-characters";
  await configure("https://new.example.test/", rotated);
  await pg.exec("insert into whatsapp_events values(null)");
  await pg.query("select dispatch_whatsapp_retry()");
  expect((await pg.query("select url,headers from test_http")).rows).toEqual([
    {
      url: "https://new.example.test/api/cron/whatsapp",
      headers: { Authorization: `Bearer ${rotated}` },
    },
  ]);
  expect((await pg.query("select id from vault.secrets")).rows).toHaveLength(2);
  expect((await pg.query("select jobid from cron.job")).rows).toHaveLength(2);
});
it("rejects unsafe origins and weak secrets without changing existing configuration", async () => {
  for (const url of [
    "http://example.test",
    "https://localhost",
    "https://127.0.0.1",
    "https://example.test/path",
    "https://example.test?token=x",
  ])
    await expect(configure(url)).rejects.toThrow(
      "Invalid WhatsApp scheduler configuration",
    );
  await expect(configure("https://example.test", "short")).rejects.toThrow();
  await expect(
    configure("https://example.test", secret + "\n"),
  ).rejects.toThrow();
});
it("denies clients access to scheduler administration, Vault, and the dispatch function", async () => {
  for (const role of ["anon", "authenticated"]) {
    await pg.exec(`set role ${role}`);
    await expect(pg.query("select whatsapp_cron_status()")).rejects.toThrow();
    await expect(
      pg.query("select dispatch_whatsapp_retry()"),
    ).rejects.toThrow();
    await expect(
      pg.query("select * from vault.decrypted_secrets"),
    ).rejects.toThrow();
    await pg.exec("reset role");
  }
  await pg.exec("set role service_role");
  const status = (
    await pg.query<{ value: unknown }>("select whatsapp_cron_status() value")
  ).rows[0].value;
  expect(status).toMatchObject({ available: true, enabled: true });
  expect(JSON.stringify(status)).not.toContain(secret);
  await expect(pg.query("select dispatch_whatsapp_retry()")).rejects.toThrow();
  await pg.exec("reset role");
});
it("disables only its own job and keeps unrelated schedules intact", async () => {
  await pg.exec(
    "insert into cron.job(jobname,schedule,command,username) values('campaign-flow-whatsapp-retry','0 0 * * *','select 2','another-owner')",
  );
  await pg.query("select disable_whatsapp_cron()");
  expect(
    (await pg.query("select jobname from cron.job order by jobname")).rows,
  ).toEqual([
    { jobname: "campaign-flow-whatsapp-retry" },
    { jobname: "unrelated-job" },
  ]);
  expect(
    (await pg.query<{ value: unknown }>("select whatsapp_cron_status() value"))
      .rows[0].value,
  ).toMatchObject({ available: true, enabled: false });
});
it("does not expose Vault failures containing credential values", async () => {
  const sensitive = "simulated-sensitive-cron-secret-with-32-characters";
  await pg.exec(
    `create or replace function vault.update_secret(uuid,text,text,text) returns void language plpgsql as $$begin raise exception '%',$2;end$$;`,
  );
  try {
    await configure("https://example.test", sensitive);
    throw Error("Expected setup failure");
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(
      "Unable to configure optional WhatsApp scheduler",
    );
    expect(
      error instanceof Error ? error.message : String(error),
    ).not.toContain(sensitive);
  }
});
