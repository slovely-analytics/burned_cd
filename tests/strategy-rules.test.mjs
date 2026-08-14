import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPoolRules,
  requiredPicksForWeek,
  unresolvedRuleWarnings,
  validateEntryPicks,
} from "../lib/strategy/rules.ts";
import { createRecommendationSnapshot } from "../lib/strategy/snapshots.ts";

const entry = { id: "entry-1", alive: true, usedTeams: ["Bills", "Ravens"] };

test("uses one pick normally and two picks in Weeks 17 and 18", () => {
  assert.equal(requiredPicksForWeek(4, defaultPoolRules), 1);
  assert.equal(requiredPicksForWeek(17, defaultPoolRules), 2);
  assert.equal(requiredPicksForWeek(18, defaultPoolRules), 2);
});

test("rejects duplicate or previously used teams", () => {
  const issues = validateEntryPicks(entry, 17, ["Chiefs", "Chiefs"], defaultPoolRules);
  assert.deepEqual(issues.map((issue) => issue.code), ["duplicate-team"]);

  const usedTeamIssues = validateEntryPicks(entry, 17, ["Bills", "Chiefs"], defaultPoolRules);
  assert.deepEqual(usedTeamIssues.map((issue) => issue.code), ["used-team"]);
});

test("rejects an incomplete two-pick week without inventing a replacement", () => {
  const issues = validateEntryPicks(entry, 18, ["Chiefs"], defaultPoolRules);
  assert.equal(issues[0]?.code, "wrong-pick-count");
  assert.match(issues[0]?.message ?? "", /requires 2 picks/);
});

test("preserves a human override separately from the final picks", () => {
  const snapshot = createRecommendationSnapshot({
    season: 2026,
    week: 4,
    rules: defaultPoolRules,
    candidates: [],
    plans: [{ id: "recommended", label: "recommended", picksByEntry: { "entry-1": ["Chiefs"] }, rationale: "Demo", assumptions: [] }],
    selectedPlanId: "recommended",
    finalPicksByEntry: { "entry-1": ["Bills"] },
    humanDecision: { status: "overridden", recordedAt: "2026-08-13T12:00:00.000Z", reason: "Prefer a different risk profile." },
  });

  assert.deepEqual(snapshot.finalPicksByEntry["entry-1"], ["Bills"]);
  assert.equal(snapshot.humanDecision.status, "overridden");
  assert.equal(snapshot.humanDecision.reason, "Prefer a different risk profile.");
  assert.deepEqual(snapshot.plans[0].picksByEntry["entry-1"], ["Chiefs"]);
});

test("keeps unresolved Splash behavior visible as warnings", () => {
  const warnings = unresolvedRuleWarnings(defaultPoolRules);
  assert.ok(warnings.some((warning) => /postponed-game/i.test(warning)));
  assert.ok(warnings.some((warning) => /all-entries-lose/i.test(warning)));
});
