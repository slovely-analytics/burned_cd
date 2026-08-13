import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Survivor Pool Strategizer workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Survivor Pool Strategizer<\/title>/i);
  assert.match(html, /Pick together\.<br\/>/i);
  assert.match(html, /Every entry, one view\./i);
  assert.match(html, /Make the Week 4 call\./i);
  assert.match(html, /Split the exposure/i);
  assert.match(html, /Splash is the official record\./i);
  assert.match(html, /This tool never submits picks\./i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps starter preview infrastructure removed and product metadata current", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/i);
  assert.match(layout, /Survivor Pool Strategizer/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
  await assert.rejects(access(new URL("app/_sites-preview/preview.css", templateRoot)));
});
