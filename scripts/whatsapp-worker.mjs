// Local/managed-host scheduler. Keeps work inside awaited HTTP requests; no credentials in URLs.
import { setTimeout } from "node:timers/promises";
const secret = process.env.CRON_SECRET;
let url;
try {
  url = new URL("/api/cron/whatsapp", process.env.APP_URL);
} catch {
  console.error("Set APP_URL before starting the WhatsApp worker.");
  process.exit(1);
}
if (!secret || secret.length < 32) {
  console.error(
    "Set CRON_SECRET to a random secret of at least 32 characters.",
  );
  process.exit(1);
}
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => controller.abort());
do {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
    });
    if (!response.ok) throw Error("Worker request failed");
    const result = await response.json();
    if (Number(result.processed) > 0)
      console.log(
        `WhatsApp: processed ${Number(result.processed)} notification(s).`,
      );
  } catch {
    if (!controller.signal.aborted) {
      console.error(
        "WhatsApp worker request failed; the durable outbox will be checked again.",
      );
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
  }
  if (process.argv.includes("--once") || controller.signal.aborted) break;
  try {
    await setTimeout(60000, undefined, { signal: controller.signal });
  } catch {
    break;
  }
} while (!controller.signal.aborted);
