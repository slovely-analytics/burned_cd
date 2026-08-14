import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { blankStrategyInputTemplate, derivePickerTeamOptions, parseStrategyInputJson, pickerOptionsForEntry, pickerSelectionIssue, toPortfolioSimulationInput } from "../lib/strategy/input.ts";
import { runPortfolioSimulation } from "../lib/strategy/simulator.ts";

const source = {
  source: "manual-fixture",
  observedAt: "2026-08-13T12:00:00.000Z",
  method: "test-json",
};

const fixture = JSON.parse(await readFile(new URL("./fixtures/strategy-input-test.json", import.meta.url), "utf8"));

function payload() {
  return {
    season: 2026,
    currentWeek: 4,
    seasonEndWeek: 4,
    rules: {
      season: 2026,
      normalPicksPerWeek: 1,
      picksRequiredByWeek: { "17": 2, "18": 2 },
      distinctTeamsPerEntry: true,
      distinctGamesInMultiPickWeek: "configured",
      tiesCountAs: "loss",
      pickDeadline: "Sunday at 1:00 PM",
      postponedGameReplacement: "unresolved",
      missingPickDefault: "unresolved",
      allEntriesLoseSettlement: "configured",
      allEntriesLoseOutcome: "no_winner",
      splashIsOfficialRecord: true,
    },
    pool: {
      startingPoolEntryCount: 10,
      currentLivePoolEntryCount: 4,
      ourManagedEntryCount: 2,
      ourLiveEntryCount: 2,
      source,
    },
    ourEntries: [
      { id: "our-1", name: "Partner A", owner: "McLovin", usedTeams: [], alive: true },
      { id: "our-2", name: "Partner B", owner: "Casual", usedTeams: [], alive: true },
    ],
    candidates: [{ team: "A", opponent: "B", kickoff: "2026-09-27T13:00:00.000Z", winProbability: 0.7, popularity: 0.2, dataStatus: "manual", source }],
    weeks: [{ week: 4, games: [{ id: "game-1", week: 4, homeTeam: "A", awayTeam: "B", kickoff: "2026-09-27T13:00:00.000Z", homeWinProbability: 0.7, awayWinProbability: 0.29, tieProbability: 0.01, source }] }],
    opponentField: { entryCount: 2, source, pickDistributionByWeek: { "4": { B: 1 } } },
    plans: [{ id: "recommended", label: "recommended", title: "A plan", picksByEntry: { "our-1": ["A"], "our-2": ["A"] } }],
    simulations: 25,
    seed: 7,
  };
}

test("parses a manual/importable snapshot without dropping provenance", () => {
  const input = payload();
  const result = parseStrategyInputJson(JSON.stringify(input));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.pool.source, source);
  assert.deepEqual(result.value.weeks[0].games[0].source, source);
  assert.equal(result.value.plans[0].picksByEntry["our-2"][0], "A");
});

test("rejects malformed or incomplete input before it reaches the simulator", () => {
  assert.equal(parseStrategyInputJson("not-json").ok, false);
  const incomplete = parseStrategyInputJson(JSON.stringify({ season: 2026 }));
  assert.equal(incomplete.ok, false);
  if (incomplete.ok) return;
  assert.match(incomplete.message, /ourEntries array/i);
  assert.equal(parseStrategyInputJson(blankStrategyInputTemplate).ok, true);
});

test("maps each imported plan to the simulator with its source-stamped pool and schedule", () => {
  const input = payload();
  const result = parseStrategyInputJson(JSON.stringify(input));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const simulationInput = toPortfolioSimulationInput(result.value, result.value.plans[0]);
  assert.equal(simulationInput.simulations, 25);
  assert.equal(simulationInput.plan.id, "recommended");
  assert.equal(simulationInput.pool.source.source, "manual-fixture");
  assert.equal(simulationInput.weeks[0].games[0].homeWinProbability, 0.7);
});

test("derives working-pick options from imported schedule and candidate teams", () => {
  const input = payload();
  input.candidates.push({ team: "C", opponent: "D", kickoff: "2026-09-27T20:20:00.000Z", dataStatus: "manual", source });
  input.weeks[0].games[0].awayTeam = "B";

  const options = derivePickerTeamOptions(input);
  assert.deepEqual(options.map((option) => option.team), ["A", "B", "C"]);
  assert.equal(options.find((option) => option.team === "A")?.scheduled, true);
  assert.equal(options.find((option) => option.team === "C")?.scheduled, false);
  assert.equal(pickerOptionsForEntry(options, { usedTeams: [], picks: [""] }, 0, input.currentWeek).find((option) => option.team === "C")?.unresolvedReason?.includes("not scheduled"), true);
});

test("keeps a previously used imported team unavailable while showing it as unresolved", () => {
  const input = payload();
  const options = derivePickerTeamOptions(input);
  const entry = { usedTeams: ["A"], picks: ["A"] };

  const pickerOptions = pickerOptionsForEntry(options, entry, 0, input.currentWeek);
  assert.equal(pickerOptions.some((option) => option.team === "A" && option.unresolvedReason), true);
  assert.equal(pickerOptions.find((option) => option.team === "A")?.unresolvedReason?.includes("previously used"), true);
  assert.equal(pickerOptions.some((option) => option.team === "B"), true);
  assert.equal(pickerSelectionIssue("A", entry, 0, options, input.currentWeek)?.includes("previously used"), true);
});

test("keeps an imported unscheduled team visibly unresolved", () => {
  const input = payload();
  const options = derivePickerTeamOptions(input);
  const entry = { usedTeams: [], picks: ["Unscheduled Team"] };

  const pickerOptions = pickerOptionsForEntry(options, entry, 0, input.currentWeek);
  const unresolvedOption = pickerOptions.find((option) => option.team === "Unscheduled Team");
  assert.equal(unresolvedOption?.unresolvedReason?.includes("not in the applied schedule or candidate list"), true);
  assert.match(pickerSelectionIssue("Unscheduled Team", entry, 0, options, input.currentWeek) ?? "", /unresolved/i);
});

test("the browser-validation fixture is calculated without live-data claims", () => {
  const result = runPortfolioSimulation(toPortfolioSimulationInput(fixture, fixture.plans[0]));

  assert.equal(result.state, "calculated");
  assert.equal(result.modelVersion, "browser-validation-fixture-1");
  assert.equal(result.metrics.anyJointEntrySurvivesCurrentWeek.state, "calculated");
  assert.equal(result.metrics.anyJointEntryWinsOrSharesPool.state, "calculated");
  assert.equal(fixture.fixturePurpose, "test-only; not live contest data");
});
