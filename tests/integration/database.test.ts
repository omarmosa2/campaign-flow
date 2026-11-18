import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
let pg: PGlite;
const actor = randomUUID();
let service: string, campaign: string, order: string, payment: string;
const schema = [
  {
    id: "goal",
    type: "text",
    label: "الهدف",
    required: true,
    options: [],
    description: "",
    placeholder: "",
  },
];
async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  return (await pg.query<T>(sql, params)).rows[0];
}
const item = (name: string, slug: string, price = 50) => ({
  name,
  slug,
  price,
  currency: "USD",
  description: "وصف",
  details: "تفاصيل",
  status: "active",
  form_schema: schema,
  sort_order: 0,
  duration: "",
  instructions: "",
});
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const sql = readFileSync(
    "supabase/migrations/202611180001_core.sql",
    "utf8",
  ).replace("create extension if not exists pgcrypto;", "");
  await pg.exec(sql);
  await pg.query("insert into auth.users values($1)", [actor]);
  await pg.query(
    "insert into profiles(id,display_name,role) values($1,'مدير','super_admin')",
    [actor],
  );
  await pg.exec(
    `update settings set value=value||'{"accepting_orders":true,"sham_name":"Test","sham_account":"123","whatsapp_enabled":true}'::jsonb`,
  );
});
afterAll(async () => {
  await pg?.close();
});
describe("معاملات PostgreSQL الفعلية محلياً", () => {
  it("ينشئ خدمة ويحفظ حقول النموذج", async () => {
    const r = await one<{ id: string }>(
      "select save_catalog('services',null,$1,'{}',$2) id",
      [item("خدمة", "test-service"), actor],
    );
    service = r.id;
    expect(service).toBeTruthy();
    expect(
      (await one<{ n: number }>("select count(*)::int n from form_fields")).n,
    ).toBe(1);
  });
  it("ينشئ حملة ويربط الخدمة", async () => {
    campaign = (
      await one<{ id: string }>(
        "select save_catalog('campaigns',null,$1,$2,$3) id",
        [item("حملة", "test-campaign"), [service], actor],
      )
    ).id;
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from campaign_services",
        )
      ).n,
    ).toBe(1);
  });
  it("يعدل الحملة ويعيد بناء النموذج ذرياً", async () => {
    await pg.query("select save_catalog('campaigns',$1,$2,$3,$4)", [
      campaign,
      item("حملة معدلة", "test-campaign"),
      [service],
      actor,
    ]);
    expect(
      (await one("select name from campaigns where id=$1", [campaign])).name,
    ).toBe("حملة معدلة");
  });
  it("ينشئ الطلب ومهمة الإشعار معاً ويمنع تكراره", async () => {
    order = randomUUID();
    const args = [
      "campaigns",
      "test-campaign",
      service,
      "عميل",
      "963999999999",
      { goal: "اختبار" },
      order,
      "secret-hash",
      schema,
      [],
    ];
    const sql = "select (create_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)).*";
    const first = await one(sql, args);
    const second = await one(sql, args);
    expect(first.id).toBe(second.id);
    expect(first.amount).toBe("50.00");
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from notification_outbox",
        )
      ).n,
    ).toBe(1);
  });
  it("يحفظ السعر وتعريف النموذج بعد تعديل الخدمة", async () => {
    await pg.query(
      "update services set price=99,form_schema='[]' where id=$1",
      [service],
    );
    const o = await one("select amount,form_snapshot from orders where id=$1", [
      order,
    ]);
    expect(o.amount).toBe("50.00");
    expect(o.form_snapshot).toEqual(schema);
  });
  it("يرفض الرمز غير الصحيح ورفع إشعار لطلب آخر", async () => {
    await expect(
      pg.query("select submit_payment($1,'bad','x','image/png',100)", [order]),
    ).rejects.toThrow();
    expect(
      (await one<{ n: number }>("select count(*)::int n from payments")).n,
    ).toBe(0);
  });
  it("يحفظ الإشعار ويضع الدفع في المراجعة", async () => {
    payment = (
      await one<{ id: string }>(
        "select submit_payment($1,'secret-hash',$2,'image/png',100) id",
        [order, `orders/${order}/receipt.png`],
      )
    ).id;
    expect(
      await one("select status,payment_status from orders where id=$1", [
        order,
      ]),
    ).toMatchObject({ status: "payment_review", payment_status: "review" });
  });
  it("لا يسمح ببدء التنفيذ قبل الدفع", async () => {
    await expect(
      pg.query("select update_order($1,'processing','',$2)", [order, actor]),
    ).rejects.toThrow();
  });
  it("يرفض الدفع مع الاحتفاظ بتاريخ المراجعة", async () => {
    await pg.query(
      "select review_payment($1,'rejected','المبلغ غير مطابق','ref',$2)",
      [payment, actor],
    );
    expect(
      (await one("select status from orders where id=$1", [order])).status,
    ).toBe("payment_rejected");
    expect(
      (await one<{ n: number }>("select count(*)::int n from payment_reviews"))
        .n,
    ).toBe(1);
  });
  it("يسمح بإشعار جديد دون حذف السابق", async () => {
    payment = (
      await one<{ id: string }>(
        "select submit_payment($1,'secret-hash',$2,'image/jpeg',150) id",
        [order, `orders/${order}/new.jpg`],
      )
    ).id;
    expect(
      (await one<{ n: number }>("select count(*)::int n from payments")).n,
    ).toBe(2);
  });
  it("يعتمد الدفع مرة واحدة ويضيف حدث واتساب", async () => {
    await pg.query("select review_payment($1,'approved','','R2',$2)", [
      payment,
      actor,
    ]);
    await expect(
      pg.query("select review_payment($1,'approved','','R2',$2)", [
        payment,
        actor,
      ]),
    ).rejects.toThrow();
    expect(
      await one("select status,payment_status from orders where id=$1", [
        order,
      ]),
    ).toMatchObject({ status: "paid", payment_status: "approved" });
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from notification_outbox where event='payment_approved'",
        )
      ).n,
    ).toBe(1);
  });
  it("ينفذ الطلب ويسجل الأحداث", async () => {
    await pg.query("select update_order($1,'processing','بدء التنفيذ',$2)", [
      order,
      actor,
    ]);
    await pg.query("select update_order($1,'completed','تم',$2)", [
      order,
      actor,
    ]);
    expect(
      (await one("select status from orders where id=$1", [order])).status,
    ).toBe("completed");
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from audit_logs where order_id=$1",
          [order],
        )
      ).n,
    ).toBeGreaterThan(5);
  });
  it("يجمع الإيرادات المعتمدة حسب العملة", async () => {
    const row = await one<{ data: { revenue: Record<string, number> } }>(
      "select dashboard_data() data",
    );
    expect(row.data.revenue).toEqual({ USD: 50 });
  });
  it("يمنع قراءات الزائر والدوال الحساسة", async () => {
    await pg.exec(
      "grant usage on schema public to anon;grant select on orders to anon;set role anon;",
    );
    expect((await pg.query("select * from orders")).rows).toHaveLength(0);
    await expect(pg.query("select dashboard_data()")).rejects.toThrow();
    await pg.exec("reset role");
  });
  it("يقفل صندوق المهام ولا يعطي المهمة لعامل آخر", async () => {
    const first = await pg.query<{ id: string; lock_token: string }>(
      "select * from claim_notifications()",
    );
    const second = await pg.query("select * from claim_notifications()");
    expect(first.rows.length).toBe(3);
    expect(
      second.rows.every(
        (r: unknown) =>
          !first.rows.some((f) => f.id === (r as { id: string }).id),
      ),
    ).toBe(true);
    const j = first.rows[0];
    await pg.query(
      "select finish_notification($1,$2,'failed',null,'Meta HTTP 500',now()-interval '1 minute')",
      [j.id, j.lock_token],
    );
    const retry = await pg.query<{ id: string; lock_token: string }>(
      "select * from claim_notifications()",
    );
    expect(retry.rows[0].id).toBe(j.id);
    await pg.query(
      "select finish_notification($1,$2,'sent','wamid.test',null,now())",
      [retry.rows[0].id, retry.rows[0].lock_token],
    );
  });
  it("يعالج Webhook مكرراً دون تكرار أو تراجع الحالة", async () => {
    const payload = { id: "wamid.test", status: "delivered" };
    await pg.query("select record_webhook('e1',$1,'wamid.test','delivered')", [
      payload,
    ]);
    await pg.query("select record_webhook('e1',$1,'wamid.test','delivered')", [
      payload,
    ]);
    await pg.query("select record_webhook('e2',$1,'wamid.test','sent')", [
      { id: "wamid.test", status: "sent" },
    ]);
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from webhook_events where id='e1'",
        )
      ).n,
    ).toBe(1);
    expect(
      (
        await one(
          "select status from whatsapp_messages where external_id='wamid.test'",
        )
      ).status,
    ).toBe("delivered");
  });
  it("يعزل النتائج المجهولة بدلاً من تكرار إرسالها", async () => {
    await pg.exec(
      "update notification_outbox set locked_at=now()-interval '10 minutes' where status='sending';select claim_notifications();",
    );
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from notification_outbox where status='uncertain'",
        )
      ).n,
    ).toBe(3);
  });
  it("يطبق حد الطلبات ذرياً", async () => {
    expect((await one("select rate_limit('ip',1) ok")).ok).toBe(true);
    expect((await one("select rate_limit('ip',1) ok")).ok).toBe(false);
  });
  it("يمنع تغيير السعر وسجل المراجعة بعد اعتماد الدفع", async () => {
    await expect(
      pg.query("update orders set amount=1 where id=$1", [order]),
    ).rejects.toThrow();
    await expect(pg.query("delete from payment_reviews")).rejects.toThrow();
    await expect(
      pg.query("update payments set reference='changed' where id=$1", [
        payment,
      ]),
    ).rejects.toThrow();
  });
  it("يحمي آخر مدير نظام ويمنع منح الصلاحية بواسطة مدير عادي", async () => {
    await expect(
      pg.query("select manage_profile($1,'مدير','admin',true,$1)", [actor]),
    ).rejects.toThrow();
    const member = randomUUID();
    await pg.query("insert into auth.users values($1)", [member]);
    await pg.query("select manage_profile($1,'عضو','admin',true,$2)", [
      member,
      actor,
    ]);
    await expect(
      pg.query("select manage_profile($1,'عضو','super_admin',true,$1)", [
        member,
      ]),
    ).rejects.toThrow();
  });
  it("يرفض العرض المتوقف والطلبات بعد بلوغ الحصة", async () => {
    await pg.query("update campaigns set status='draft' where id=$1", [
      campaign,
    ]);
    const args = [
      "campaigns",
      "test-campaign",
      service,
      "عميل",
      "963999999999",
      {},
      randomUUID(),
      "h",
      schema,
      [],
    ];
    await expect(
      pg.query("select create_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", args),
    ).rejects.toThrow();
    await pg.query(
      "update campaigns set status='active',max_orders=1 where id=$1",
      [campaign],
    );
    await expect(
      pg.query("select create_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", args),
    ).rejects.toThrow();
  });
 it("ينشئ طلب خدمة مباشرة دون حملة بسعرها الحالي",async()=>{const key=randomUUID();const o=await one("select (create_order('services','test-service',null,'عميل مباشر','963999999999','{}',$1,'hash','[]','[]')).*",[key]);expect(o.campaign_id).toBe(null);expect(o.service_id).toBe(service);expect(o.amount).toBe("99.00");});

});
