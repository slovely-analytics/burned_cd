import type {
  EntryForValidation,
  PoolRules,
  RuleResolution,
} from "./types";

export const defaultPoolRules: PoolRules = {
  season: 2026,
  normalPicksPerWeek: 1,
  picksRequiredByWeek: { "17": 2, "18": 2 },
  distinctTeamsPerEntry: true,
  distinctGamesInMultiPickWeek: "unresolved",
  tiesCountAs: "loss",
  pickDeadline: "Sunday at 1:00 PM",
  postponedGameReplacement: "unresolved",
  missingPickDefault: "unresolved",
  allEntriesLoseSettlement: "unresolved",
  allEntriesLoseOutcome: undefined,
  splashIsOfficialRecord: true,
};

export type RuleValidationIssue = {
  code:
  | "inactive-entry"
  | "wrong-pick-count"
  | "missing-team"
  | "duplicate-team"
  | "used-team"
  | "unresolved-game-rule";
  message: string;
};

export function requiredPicksForWeek(week: number, rules: PoolRules): number {
  return rules.picksRequiredByWeek[String(week)] ?? rules.normalPicksPerWeek;
}

export function unresolvedRuleWarnings(rules: PoolRules): string[] {
  const warnings: string[] = [];
  const unresolved: Array<[RuleResolution, string]> = [
    [rules.postponedGameReplacement, "Postponed-game replacement is not configured."],
    [rules.missingPickDefault, "Missing-pick default behavior is not configured."],
    [rules.allEntriesLoseSettlement, "All-entries-lose settlement behavior is not configured."],
  ];

  for (const [resolution, message] of unresolved) {
    if (resolution === "unresolved") warnings.push(message);
  }

  if (rules.distinctGamesInMultiPickWeek === "unresolved") {
    warnings.push("Whether multi-pick teams must come from distinct games is not configured.");
  }

  if (rules.allEntriesLoseSettlement === "configured" && !rules.allEntriesLoseOutcome) {
    warnings.push("The configured all-entries-lose settlement has no declared outcome.");
  }

  return warnings;
}

export function validateEntryPicks(
  entry: EntryForValidation,
  week: number,
  picks: string[],
  rules: PoolRules = defaultPoolRules,
): RuleValidationIssue[] {
  if (!entry.alive) return [];

  const issues: RuleValidationIssue[] = [];
  const requiredPicks = requiredPicksForWeek(week, rules);

  if (picks.length !== requiredPicks) {
    issues.push({
      code: "wrong-pick-count",
      message: `Week ${week} requires ${requiredPicks} pick${requiredPicks === 1 ? "" : "s"} for ${entry.id}.`,
    });
  }

  if (rules.distinctTeamsPerEntry && new Set(picks).size !== picks.length) {
    issues.push({
      code: "duplicate-team",
      message: `${entry.id} has the same team more than once in its weekly picks.`,
    });
  }

  const usedTeams = new Set(entry.usedTeams);
  for (const team of picks) {
    if (!team) {
      issues.push({
        code: "missing-team",
        message: `${entry.id} has a missing team in its weekly picks.`,
      });
      continue;
    }
    if (usedTeams.has(team)) {
      issues.push({
        code: "used-team",
        message: `${team} is already used by ${entry.id} and cannot be picked again.`,
      });
    }
  }

  return issues;
}

export function validatePortfolioPicks(
  entries: EntryForValidation[],
  week: number,
  picksByEntry: Record<string, string[]>,
  rules: PoolRules = defaultPoolRules,
): RuleValidationIssue[] {
  return entries.flatMap((entry) =>
    validateEntryPicks(entry, week, picksByEntry[entry.id] ?? [], rules),
  );
}
