// Administrative setup only. Never runs during a booking, build, or deployment.
const migration = "supabase/migrations/202611240002_whatsapp_supabase_cron.sql";
class SetupError extends Error {}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let database;
try {
  database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (database.protocol !== "https:") throw Error();
} catch {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL to your hosted Supabase project.",
  );
  process.exit(1);
}
if (!serviceKey) {
  console.error(
    "Set SUPABASE_SERVICE_ROLE_KEY in the private production environment file.",
  );
  process.exit(1);
}
async function rpc(name, body = {}) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, database), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (data.code === "PGRST202")
      throw new SetupError(`Apply ${migration} in Supabase SQL Editor first.`);
    throw new SetupError(
      "Supabase scheduler setup request failed. Check the SQL migration and service role permission.",
    );
  }
  return data;
}
try {
  if (process.argv.includes("--disable")) {
    await rpc("disable_whatsapp_cron");
    console.log(
      "Only the campaign-flow-whatsapp-retry job was disabled. Direct sends remain active.",
    );
  } else {
    const status = await rpc("whatsapp_cron_status");
    if (process.argv.includes("--status")) console.log(JSON.stringify(status));
    else if (!status.available) {
      console.error(
        "Supabase Cron, pg_net or Vault is unavailable/not enabled. Direct sending and manual retries still work; check Supabase Integrations.",
      );
      process.exitCode = 2;
    } else {
      let app;
      try {
        app = new URL(process.env.APP_URL);
        if (
          app.protocol !== "https:" ||
          app.username ||
          app.password ||
          app.search ||
          app.hash ||
          app.pathname !== "/" ||
          app.port ||
          ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname)
        )
          throw Error();
      } catch {
        throw new SetupError(
          "Set APP_URL to the public HTTPS production origin before enabling Supabase Cron.",
        );
      }
      const secret = process.env.CRON_SECRET;
      if (
        !secret ||
        secret.length < 32 ||
        secret.length > 512 ||
        /[\r\n]/.test(secret)
      )
        throw new SetupError(
          "Set the same strong CRON_SECRET in Vercel and this private environment file.",
        );
      // Verify the deployed endpoint/authorization before changing an existing scheduler.
      const probe = await fetch(new URL("/api/cron/whatsapp", app), {
        headers: { Authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(55000),
      });
      if (!probe.ok)
        throw new SetupError(
          "Deploy the updated application and CRON_SECRET to Vercel first; the production worker check failed.",
        );
      const ready = await probe.json();
      if (!Number.isInteger(ready.processed))
        throw new SetupError(
          "The production worker response was not recognized. Scheduler configuration was not changed.",
        );
      const result = await rpc("configure_whatsapp_cron", {
        p_app_url: app.origin,
        p_secret: secret,
      });
      console.log(
        JSON.stringify({
          available: result.available,
          enabled: result.enabled,
          schedule: result.schedule,
        }),
      );
    }
  }
} catch (error) {
  // All messages above are authored locally; never print request/response objects or URLs with credentials.
  const safe =
    error instanceof SetupError
      ? error.message
      : "Scheduler setup could not complete. Check the connection and retry; direct booking sends remain active.";
  console.error(safe);
  process.exitCode = 1;
}
