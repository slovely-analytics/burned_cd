import assert from "node:assert/strict";
import test from "node:test";

import { defaultPoolRules } from "../lib/strategy/rules.ts";
import { runPortfolioSimulation, validatePortfolioSimulationInput } from "../lib/strategy/simulator.ts";

const source = {
  source: "manual-test-feed",
  observedAt: "2026-08-13T12:00:00.000Z",
  method: "test-fixture",
  version: "1",
};

function rulesForTwoWeeks() {
  return {
    ...defaultPoolRules,
    picksRequiredByWeek: { "1": 1, "2": 1 },
    distinctGamesInMultiPickWeek: "configured",
    allEntriesLoseSettlement: "configured",
    allEntriesLoseOutcome: "no_winner",
  };
}

function game(id, week, homeTeam, awayTeam, homeWinProbability, awayWinProbability) {
  return {
    id,
    week,
    homeTeam,
    awayTeam,
    kickoff: `2026-09-${String(week).padStart(2, "0")}T13:00:00.000Z`,
    homeWinProbability,
    awayWinProbability,
    tieProbability: 1 - homeWinProbability - awayWinProbability,
    source,
  };
}

function baseInput(overrides = {}) {
  return {
    season: 2026,
    currentWeek: 1,
    seasonEndWeek: 2,
    rules: rulesForTwoWeeks(),
    pool: {
      startingPoolEntryCount: 10,
      currentLivePoolEntryCount: 4,
      ourManagedEntryCount: 2,
      ourLiveEntryCount: 2,
      source,
    },
    ourEntries: [
      { id: "our-1", usedTeams: [], alive: true },
      { id: "our-2", usedTeams: [], alive: true },
    ],
    candidates: [
      { team: "A", winProbability: 0.75, popularity: 0.2, source, dataStatus: "manual" },
      { team: "C", winProbability: 0.65, popularity: 0.15, source, dataStatus: "manual" },
      { team: "E", winProbability: 1, popularity: 0.2, source, dataStatus: "manual" },
      { team: "G", winProbability: 1, popularity: 0.2, source, dataStatus: "manual" },
    ],
    weeks: [
      { week: 1, games: [game("g-a", 1, "A", "B", 0.75, 0.25), game("g-c", 1, "C", "D", 0.65, 0.35)] },
      { week: 2, games: [game("g-e", 2, "E", "F", 1, 0), game("g-g", 2, "G", "H", 1, 0)] },
    ],
    opponentField: {
      source,
      entries: [
        { id: "opponent-1", usedTeams: [], picksByWeek: { "1": ["B"], "2": ["F"] } },
        { id: "opponent-2", usedTeams: [], picksByWeek: { "1": ["D"], "2": ["H"] } },
      ],
    },
    plan: {
      id: "split",
      picksByEntry: { "our-1": ["A"], "our-2": ["A"] },
      picksByWeek: { "2": { "our-1": ["E"], "our-2": ["G"] } },
    },
    simulations: 20000,
    seed: 424242,
    modelVersion: "test-model-1",
    ...overrides,
  };
}

test("simulates one shared game outcome for correlated portfolio picks", () => {
  const result = runPortfolioSimulation(baseInput());

  assert.equal(result.state, "calculated");
  assert.equal(result.metrics.ourLiveFieldShare.value, 0.5);
  assert.equal(result.metrics.maxSingleGameLoss.value, 2);
  assert.ok(Math.abs(result.metrics.anyJointEntrySurvivesCurrentWeek.value - 0.75) < 0.02);
  assert.ok(Math.abs(result.metrics.allJointEntriesSurviveCurrentWeek.value - 0.75) < 0.02);
  assert.ok(Math.abs(result.metrics.expectedJointEntriesAliveNextWeek.value - 1.5) < 0.04);
});

test("includes the opponent field in terminal win/share and prize-share metrics", () => {
  const result = runPortfolioSimulation(baseInput());

  assert.ok(result.metrics.anyJointEntryWinsOrSharesPool.value >= 0);
  assert.ok(result.metrics.anyJointEntryWinsOrSharesPool.value <= 1);
  assert.ok(result.metrics.expectedJointPrizeShare.value >= 0);
  assert.ok(result.metrics.expectedJointPrizeShare.value <= 1);
  assert.ok(result.metrics.expectedJointPrizeShare.value < 1);
});

test("replays exactly with the same seed and input fingerprint", () => {
  const input = baseInput({ simulations: 2000, seed: 9911 });
  const first = runPortfolioSimulation(input);
  const second = runPortfolioSimulation(input);

  assert.deepEqual(second, first);
  assert.equal(first.inputFingerprint, second.inputFingerprint);
});

test("marks missing required dependencies as blocked", () => {
  const input = baseInput({
    opponentField: undefined,
    weeks: [{ week: 1, games: [game("g-a", 1, "A", "B", 0.75, 0.25)] }],
  });
  const report = validatePortfolioSimulationInput(input);

  assert.equal(report.state, "blocked");
  assert.ok(report.issues.some((issue) => issue.code === "missing-opponent-field"));
  assert.ok(report.issues.some((issue) => issue.code === "missing-week-input"));
});

test("keeps missing optional popularity visible as partial while calculating", () => {
  const input = baseInput({ candidates: [] });
  const result = runPortfolioSimulation(input);

  assert.equal(result.state, "partial");
  assert.equal(result.metrics.anyJointEntrySurvivesCurrentWeek.state, "partial");
  assert.ok(typeof result.metrics.anyJointEntrySurvivesCurrentWeek.value === "number");
  assert.ok(result.dependencyReport.issues.some((issue) => issue.code === "missing-candidates"));
});

test("does not promote illustrative inputs into calculated advice", () => {
  const input = baseInput({
    candidates: [{ team: "A", winProbability: 0.75, popularity: 0.2, dataStatus: "illustrative" }],
  });
  const result = runPortfolioSimulation(input);

  assert.equal(result.state, "illustrative");
  assert.equal(result.metrics.anyJointEntryWinsOrSharesPool.value, undefined);
  assert.match(result.metrics.anyJointEntryWinsOrSharesPool.reason ?? "", /source|illustrative/i);
});
