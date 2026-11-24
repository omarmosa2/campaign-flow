import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";

let server: Server | undefined;
const secret = "test-worker-secret-with-at-least-32-characters";
function runWorker(appUrl: string, token = secret) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/whatsapp-worker.mjs", "--once"],
        {
          env: { ...process.env, APP_URL: appUrl, CRON_SECRET: token },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (v) => {
        stdout += v;
      });
      child.stderr.on("data", (v) => {
        stderr += v;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
}
async function localServer(status = 200) {
  const received: { url?: string; authorization?: string } = {};
  server = createServer((req, res) => {
    received.url = req.url;
    received.authorization = req.headers.authorization;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        status === 200
          ? { processed: 0 }
          : { error: "private-provider-error-must-not-be-logged" },
      ),
    );
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("No test server address");
  return { url: `http://127.0.0.1:${address.port}`, received };
}
afterEach(async () => {
  if (server) {
    const current = server;
    server = undefined;
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }
});
it("invokes the protected worker once with authorization and no secret in the URL", async () => {
  const test = await localServer();
  const result = await runWorker(test.url);
  expect(result.code).toBe(0);
  expect(test.received).toEqual({
    url: "/api/cron/whatsapp",
    authorization: `Bearer ${secret}`,
  });
  expect(result.stdout + result.stderr).not.toContain(secret);
});
it("fails scheduled runs on HTTP failure without logging response contents", async () => {
  const test = await localServer(401);
  const result = await runWorker(test.url);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("worker request failed");
  expect(result.stdout + result.stderr).not.toContain("private-provider-error");
});
it("refuses to transmit the scheduler secret to remote plain HTTP", async () => {
  const result = await runWorker("http://example.invalid");
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("HTTPS");
});
it("rejects weak scheduler secrets before making a request", async () => {
  const test = await localServer();
  const result = await runWorker(test.url, "short");
  expect(result.code).toBe(1);
  expect(test.received).toEqual({});
});
