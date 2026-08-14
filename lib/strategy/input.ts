import type {
  PortfolioSimulationInput,
  StrategyEntryInput,
  StrategyInputPayload,
  StrategyPlanInput,
} from "./types";

export type PickerTeamOption = {
  team: string;
  scheduled: boolean;
  candidate: boolean;
};

export type PickerOption = PickerTeamOption & {
  unresolvedReason?: string;
};

type PickerEntryState = Pick<StrategyEntryInput, "usedTeams"> & {
  picks: string[];
};

export type StrategyInputParseResult =
  | { ok: true; value: StrategyInputPayload }
  | { ok: false; message: string };

export const blankStrategyInputTemplate = JSON.stringify({
  season: 2026,
  currentWeek: 4,
  seasonEndWeek: 4,
  rules: {
    "copy from the preserved project rules and configure unresolved cases": true,
  },
  pool: {
    startingPoolEntryCount: 0,
    currentLivePoolEntryCount: 0,
    ourManagedEntryCount: 0,
    ourLiveEntryCount: 0,
    source: { source: "", observedAt: "", method: "" },
  },
  ourEntries: [{ id: "entry-1", usedTeams: [], alive: true }],
  candidates: [{
    team: "TEAM",
    opponent: "OPPONENT",
    kickoff: "2026-09-27T13:00:00.000Z",
    winProbability: 0.5,
    popularity: 0.1,
    dataStatus: "manual",
    source: { source: "", observedAt: "", method: "" },
  }],
  weeks: [{
    week: 4,
    games: [{
      id: "game-1",
      week: 4,
      homeTeam: "TEAM",
      awayTeam: "OPPONENT",
      kickoff: "2026-09-27T13:00:00.000Z",
      homeWinProbability: 0.5,
      awayWinProbability: 0.49,
      tieProbability: 0.01,
      source: { source: "", observedAt: "", method: "" },
    }],
  }],
  opponentField: {
    entryCount: 0,
    source: { source: "", observedAt: "", method: "" },
    pickDistributionByWeek: { "4": { TEAM: 1 } },
  },
  plans: [{
    id: "recommended",
    label: "recommended",
    title: "Recommended plan",
    description: "Describe the recommendation and its tradeoff.",
    picksByEntry: { "entry-1": ["TEAM"] },
  }],
  simulations: 5000,
  seed: 20260813,
  modelVersion: "manual-input-1",
}, null, 2);

/**
 * Build the working-pick universe from the applied snapshot only.
 * Candidate-only teams stay in the returned set so an imported selection can
 * remain visible, but they are marked unscheduled and cannot be newly chosen.
 */
export function derivePickerTeamOptions(
  input: StrategyInputPayload,
  week = input.currentWeek,
): PickerTeamOption[] {
  const scheduledTeams = new Set(
    input.weeks
      .find((scheduleWeek) => scheduleWeek.week === week)
      ?.games.flatMap((game) => [game.homeTeam, game.awayTeam])
      .filter((team) => Boolean(team.trim())) ?? [],
  );
  const candidateTeams = new Set(
    input.candidates
      .map((candidate) => candidate.team)
      .filter((team) => Boolean(team.trim())),
  );
  const orderedTeams = [...new Set([...scheduledTeams, ...candidateTeams])];

  return orderedTeams.map((team) => ({
    team,
    scheduled: scheduledTeams.has(team),
    candidate: candidateTeams.has(team),
  }));
}

export function pickerSelectionIssue(
  team: string | undefined,
  entry: PickerEntryState,
  pickIndex: number,
  options: PickerTeamOption[],
  week: number,
): string | undefined {
  if (!team) return "Missing team.";

  const option = options.find((candidate) => candidate.team === team);
  const issues: string[] = [];
  if (!option) {
    issues.push("not in the applied schedule or candidate list");
  } else if (!option.scheduled) {
    issues.push(`not scheduled in the applied Week ${week} schedule`);
  }
  if (entry.usedTeams.includes(team)) issues.push("previously used by this entry");
  if (entry.picks.some((pick, index) => index !== pickIndex && pick === team)) {
    issues.push("already selected in another pick slot");
  }

  return issues.length ? `${team} is unresolved: ${issues.join(" and ")}.` : undefined;
}

export function pickerOptionsForEntry(
  options: PickerTeamOption[],
  entry: PickerEntryState,
  pickIndex: number,
  week: number,
): PickerOption[] {
  const currentTeam = entry.picks[pickIndex];
  const pickerOptions = options.map((option) => {
    const unresolvedReason = pickerSelectionIssue(option.team, entry, pickIndex, options, week);
    return unresolvedReason ? { ...option, unresolvedReason } : option;
  });

  if (!currentTeam || pickerOptions.some((option) => option.team === currentTeam)) {
    return pickerOptions;
  }

  const currentOption = options.find((option) => option.team === currentTeam) ?? {
    team: currentTeam,
    scheduled: false,
    candidate: false,
  };
  return [
    {
      ...currentOption,
      unresolvedReason: pickerSelectionIssue(currentTeam, entry, pickIndex, options, week) ?? "unresolved selection",
    },
    ...pickerOptions,
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasArray(value: Record<string, unknown>, key: string): boolean {
  return Array.isArray(value[key]);
}

export function parseStrategyInputJson(text: string): StrategyInputParseResult {
  if (!text.trim()) return { ok: false, message: "Paste or import a strategy-input JSON document first." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "The strategy input is not valid JSON." };
  }

  if (!isRecord(parsed)) return { ok: false, message: "The strategy input must be a JSON object." };
  const requiredArrays = ["ourEntries", "candidates", "weeks", "plans"];
  const missingArray = requiredArrays.find((key) => !hasArray(parsed, key));
  if (missingArray) return { ok: false, message: `The strategy input needs a ${missingArray} array.` };

  const requiredKeys = ["season", "currentWeek", "rules", "pool"];
  const missingKey = requiredKeys.find((key) => parsed[key] === undefined);
  if (missingKey) return { ok: false, message: `The strategy input needs a ${missingKey} value.` };
  const plans = parsed.plans;
  if (!Array.isArray(plans) || !plans.length) return { ok: false, message: "Add at least one portfolio plan with picksByEntry." };

  return { ok: true, value: parsed as unknown as StrategyInputPayload };
}

export function toPortfolioSimulationInput(
  input: StrategyInputPayload,
  plan: StrategyPlanInput,
): PortfolioSimulationInput {
  return {
    season: input.season,
    currentWeek: input.currentWeek,
    seasonEndWeek: input.seasonEndWeek ?? input.currentWeek,
    rules: input.rules,
    pool: input.pool,
    ourEntries: input.ourEntries.map((entry) => ({
      id: entry.id,
      usedTeams: entry.usedTeams,
      alive: entry.alive !== false,
    })),
    candidates: input.candidates,
    weeks: input.weeks,
    opponentField: input.opponentField,
    plan: {
      id: plan.id,
      picksByEntry: plan.picksByEntry,
      picksByWeek: plan.picksByWeek,
    },
    simulations: input.simulations ?? 5000,
    seed: input.seed ?? 1,
    modelVersion: input.modelVersion ?? "manual-input-1",
  };
}
