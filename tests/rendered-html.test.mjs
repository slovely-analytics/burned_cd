import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const testPassword = "Maple Sunday Keeps One Alive 27!";
const partnerPassword = "McLovin Secure Pass 27!";

function createAuthDatabase() {
  const accounts = new Map([
    ["mclovin", { id: "mclovin", display_name: "McLovin", password_hash: null, failed_attempts: 0, locked_until: null }],
    ["casual", { id: "casual", display_name: "Casual", password_hash: null, failed_attempts: 0, locked_until: null }],
  ]);
  const sessions = new Map();

  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM partner_accounts WHERE id")) return accounts.get(values[0]);
              if (sql.includes("FROM partner_sessions WHERE token_hash")) return sessions.get(values[0]);
              return undefined;
            },
            async all() {
              return { results: [...accounts.values()] };
            },
            async run() {
              if (sql.startsWith("INSERT INTO partner_accounts")) {
                accounts.set(values[0], { id: values[0], display_name: values[1], password_hash: null, failed_attempts: 0, locked_until: null });
              } else if (sql.startsWith("UPDATE partner_accounts SET password_hash")) {
                accounts.get(values[1]).password_hash = values[0];
              } else if (sql.startsWith("UPDATE partner_accounts SET failed_attempts = 0")) {
                const account = accounts.get(values[1]);
                account.failed_attempts = 0;
                account.locked_until = null;
              } else if (sql.startsWith("UPDATE partner_accounts SET failed_attempts =")) {
                const account = accounts.get(values[2]);
                account.failed_attempts = values[0];
                account.locked_until = values[1];
              } else if (sql.startsWith("INSERT INTO partner_sessions")) {
                sessions.set(values[0], { partner_id: values[1], expires_at: values[2] });
              } else if (sql.startsWith("DELETE FROM partner_sessions")) {
                sessions.delete(values[0]);
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const testEnv = {
  SURVIVOR_POOL_PASSWORD: testPassword,
  DB: createAuthDatabase(),
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};

const testContext = { waitUntil() {}, passThroughOnException() {} };

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

async function render() {
  const worker = await loadWorker();
  const accessResponse = await worker.fetch(
    new Request("http://localhost/api/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partner: "mclovin", password: partnerPassword, confirmPassword: partnerPassword, bootstrap: testPassword }),
    }),
    testEnv,
    testContext,
  );
  assert.equal(accessResponse.status, 200);

  const loginResponse = await worker.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partner: "mclovin", password: partnerPassword }),
    }),
    testEnv,
    testContext,
  );
  assert.equal(loginResponse.status, 200);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html", cookie: loginResponse.headers.get("set-cookie") ?? "" } }),
    testEnv,
    testContext,
  );
}

test("requires the shared passphrase before rendering the workspace", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/"), testEnv, testContext);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Private shared workspace/i);
  assert.match(html, /Partner account/i);
  assert.match(html, />McLovin<\/option>/i);
  assert.match(html, />Casual<\/option>/i);
  assert.match(html, /Set first password/i);
  assert.doesNotMatch(html, /Every entry, one view\./i);
});

test("server-renders the Survivor Pool Strategizer workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Survivor Pool Strategizer<\/title>/i);
  assert.match(html, /Pick together\.<br\/>/i);
  assert.match(html, /Every entry, one view\./i);
  assert.match(html, /McLovin · Main/i);
  assert.match(html, /Casual · Main/i);
  assert.match(html, /Make the Week 4 call\./i);
  assert.match(html, /Enter or import the week/i);
  assert.match(html, /Manual strategy input JSON/i);
  assert.match(html, /Import JSON file/i);
  assert.match(html, /Split the exposure/i);
  assert.match(html, /Splash is the official record\./i);
  assert.match(html, /This tool never submits picks\./i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps starter preview infrastructure removed and shared persistence wired", async () => {
  const [page, layout, packageJson, route, schema, auth, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/i);
  assert.match(layout, /Survivor Pool Strategizer/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.match(schema, /workspace_state/);
  assert.match(schema, /partner_accounts/);
  assert.match(schema, /partner_sessions/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(page, /localStorage|Local workspace/);
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /SURVIVOR_POOL_PASSWORD/);
  assert.match(worker, /sessionPartnerId/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /Set first password/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
  await assert.rejects(access(new URL("app/_sites-preview/preview.css", templateRoot)));
});
