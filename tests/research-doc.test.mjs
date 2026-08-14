import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps the strategy research discoverable and decision-safe", async () => {
  const [agents, readme, productBrief, contextIndex, research] = await Promise.all([
    readFile(new URL("AGENTS.md", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("docs/PRODUCT_BRIEF.md", root), "utf8"),
    readFile(new URL("source/context/README.md", root), "utf8"),
    readFile(new URL("docs/SURVIVOR_POOL_STRATEGY_RESEARCH.md", root), "utf8"),
  ]);

  for (const index of [agents, readme, productBrief, contextIndex]) {
    assert.match(index, /SURVIVOR_POOL_STRATEGY_RESEARCH\.md/);
  }

  assert.match(agents, /current prototype.*illustrative/i);
  assert.match(productBrief, /probability that at least one jointly managed entry wins or shares/i);
  assert.match(productBrief, /decision advisor/i);
  assert.match(productBrief, /accept, edit, or override/i);
  assert.match(productBrief, /Starting pool entry count/i);
  assert.match(productBrief, /label `survival` by itself is not acceptable/i);
  assert.match(research, /rolling-horizon, opponent-aware Monte Carlo optimizer/i);
  assert.match(research, /Product operating contract/i);
  assert.match(research, /original recommendation, override reason, final picks/i);
  assert.match(research, /P\(at least one joint entry survives this week\)/i);
  assert.match(research, /Weeks 17 and 18 require two winning picks/i);
  assert.match(research, /https:\/\/doi\.org\/10\.1287\/opre\.2017\.1633/);
  assert.match(research, /https:\/\/www\.survivorgrid\.com\/strategy/);
  assert.match(research, /https:\/\/subvertadown\.com\/article\/survivor-pool-strategy/);
  assert.match(research, /playing-multiple-entries-strategy/);
});
