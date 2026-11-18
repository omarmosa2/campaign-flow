// LOCAL TEST DOUBLE ONLY. Not imported by production application code.
import { createServer } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
const pg = new PGlite();
await pg.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
await pg.exec(
  readFileSync("supabase/migrations/202611180001_core.sql", "utf8").replace(
    "create extension if not exists pgcrypto;",
    "",
  ),
);
await pg.exec(readFileSync("supabase/migrations/202611180002_simple_requests.sql", "utf8"));
const actor = "10000000-0000-4000-8000-000000000001";
const user = {
  id: actor,
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.test",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
};
await pg.query("insert into auth.users values($1)", [actor]);
await pg.query(
  "insert into profiles(id,display_name,role) values($1,'مدير الاختبار','super_admin')",
  [actor],
);
const jwtPart = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const jwtData = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart({ sub: actor, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400, iat: Math.floor(Date.now() / 1000) })}`;
const access =
  jwtData +
  "." +
  createHmac("sha256", "local-test").update(jwtData).digest("base64url");
const files = new Map();
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1:54329");
  const send = (code, data) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  let body;
  try {
    body = raw.length ? JSON.parse(raw.toString()) : {};
  } catch {
    body = {};
  }
  try {
    if (u.pathname === "/health") return send(200, { ok: true });
    if (u.pathname === "/auth/v1/token") {
      if (
        body.email !== "admin@example.test" ||
        body.password !== "Strong-password-123!"
      )
        return send(400, { msg: "invalid credentials" });
      return send(200, {
        access_token: access,
        token_type: "bearer",
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: "refresh-local-test",
        user,
      });
    }
    if (u.pathname === "/auth/v1/user") {
      if (req.headers.authorization !== `Bearer ${access}`)
        return send(401, { msg: "invalid JWT" });
      return send(200, user);
    }
    if (u.pathname === "/auth/v1/logout") return send(200, {});
    if (u.pathname.startsWith("/storage/v1/object/sign/private-assets/"))
      return send(200, {
        signedURL: "/object/local/" + u.pathname.split("/private-assets/")[1],
      });
    if (u.pathname.startsWith("/storage/v1/object/local/")) {
      const f = files.get(decodeURIComponent(u.pathname.split("/local/")[1]));
      if (!f) return send(404, {});
      res.writeHead(200, { "Content-Type": f.type });
      res.end(f.bytes);
      return;
    }
    if (u.pathname.startsWith("/storage/v1/object/private-assets/")) {
      const path = decodeURIComponent(u.pathname.split("/private-assets/")[1]);
      if (req.method === "POST") {
        files.set(path, { bytes: raw, type: req.headers["content-type"] });
        return send(200, { Key: `private-assets/${path}` });
      }
    }
    if (
      u.pathname === "/storage/v1/object/private-assets" &&
      req.method === "DELETE"
    ) {
      (body.prefixes ?? []).forEach((x) => files.delete(x));
      return send(200, []);
    }
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const name = u.pathname.split("/").pop();
      if (!/^[a-z_]+$/.test(name)) throw Error("invalid function");
      const entries = Object.entries(body);
      const args = entries.map(([k], i) => `${k} => $${i + 1}`).join(",");
      const values = entries.map(([, v]) => v);
      if (["create_order", "claim_notifications"].includes(name)) {
        const { rows } = await pg.query(
          `select * from ${name}(${args})`,
          values,
        );
        return send(
          200,
          req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] : rows,
        );
      }
      const { rows } = await pg.query(
        `select ${name}(${args}) as result`,
        values,
      );
      return send(200, rows[0].result);
    }
    if (u.pathname.startsWith("/rest/v1/")) {
      const table = u.pathname.split("/").pop();
      if (!/^[a-z_]+$/.test(table)) throw Error("invalid table");
      if (req.method === "POST") {
        const keys = Object.keys(body);
        await pg.query(
          `insert into ${table}(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
          Object.values(body),
        );
        return send(201, null);
      }
      let selection = u.searchParams.get("select") ?? "*";
      let extra = "";
      if (selection.includes("attachments(path)")) {
        selection = selection.replace(
          "attachments(path)",
          "json_build_object('path',(select path from attachments where id=t.attachment_id)) attachments",
        );
      }
      if (selection.includes("profiles(display_name)"))
        selection = selection.replace(
          "profiles(display_name)",
          "(select json_build_object('display_name',display_name) from profiles where id=t.actor) profiles",
        );
      if (selection.includes("orders(order_number)"))
        selection = selection.replace(
          "orders(order_number)",
          "(select json_build_object('order_number',order_number) from orders where id=t.order_id) orders",
        );
      const params = [];
      const filters = [];
      for (const [key, val] of u.searchParams) {
        if (["select", "order", "limit", "offset"].includes(key)) continue;
        if (key === "or") {
          const terms = val
            .slice(1, -1)
            .split(",")
            .map((v) => {
              const [col, , ...rest] = v.split(".");
              params.push(rest.join("."));
              return `${col} ilike $${params.length}`;
            });
          filters.push("(" + terms.join(" or ") + ")");
          continue;
        }
        if (!/^[a-z_]+$/.test(key)) continue;
        const dot = val.indexOf(".");
        const op = val.slice(0, dot),
          v = val.slice(dot + 1);
        if (op === "in") {
          const terms = v
            .slice(1, -1)
            .split(",")
            .map((x) => {
              params.push(x.replaceAll('"', ""));
              return "$" + params.length;
            });
          filters.push(`${key} in (${terms.join(",")})`);
        } else {
          const ops = { eq: "=", neq: "<>", gte: ">=", lte: "<=" };
          if (!ops[op]) continue;
          params.push(v);
          filters.push(`${key} ${ops[op]} $${params.length}`);
        }
      }
      const where = filters.length ? " where " + filters.join(" and ") : "";
      const count = (
        await pg.query(`select count(*)::int n from ${table} t${where}`, params)
      ).rows[0].n;
      const order = u.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        if (/^[a-z_]+$/.test(col))
          extra += ` order by ${col} ${dir === "desc" ? "desc" : "asc"}`;
      }
      const offset = Number(u.searchParams.get("offset")) || 0,
        limit = Number(u.searchParams.get("limit")) || 1000;
      extra += ` limit ${Math.min(limit, 10000)} offset ${offset}`;
      const rows =
        req.method === "HEAD"
          ? []
          : (
              await pg.query(
                `select ${selection} from ${table} t${where}${extra}`,
                params,
              )
            ).rows;
      res.setHeader(
        "Content-Range",
        `${offset}-${Math.max(offset, offset + rows.length - 1)}/${count}`,
      );
      if (req.headers.accept?.includes("vnd.pgrst.object")) {
        if (!rows.length)
          return send(406, {
            code: "PGRST116",
            details: "The result contains 0 rows",
            message: "no rows",
          });
        return send(200, rows[0]);
      }
      return send(200, rows);
    }
    return send(404, { message: "mock endpoint not implemented" });
  } catch (e) {
    console.error("Mock DB:", u.pathname, e.message);
    send(400, { message: e.message, code: e.code ?? "LOCAL_TEST" });
  }
});
server.listen(54329, "127.0.0.1", () =>
  console.log("Local Supabase test double ready"),
);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3001",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      APP_URL: "http://127.0.0.1:3001",
      ORDER_TOKEN_SECRET: "a".repeat(64),
      WHATSAPP_ACCESS_TOKEN: "",
      CRON_SECRET: "local-cron",
    },
  },
);
process.on("SIGTERM", () => {
  child.kill();
  server.close();
});
process.on("SIGINT", () => {
  child.kill();
  server.close();
});
child.on("exit", () => {
  server.close();
  pg.close();
});
