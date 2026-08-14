import type {
  CandidateInput,
  DependencyIssue,
  DependencyReport,
  GameInput,
  ModelState,
  OpponentEntryInput,
  OpponentFieldModel,
  PortfolioPlanInput,
  PortfolioSimulationInput,
  PortfolioSimulationMetrics,
  PortfolioSimulationResult,
  SimulationMetric,
  SourceStamp,
} from "./types";

const EPSILON = 0.000001;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function fingerprintInput(input: unknown): string {
  const serialized = JSON.stringify(stableValue(input));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function validSource(source: SourceStamp | undefined): boolean {
  return Boolean(
    source
      && source.source.trim()
      && source.method.trim()
      && Number.isFinite(Date.parse(source.observedAt)),
  );
}

function addIssue(issues: DependencyIssue[], code: string, severity: DependencyIssue["severity"], message: string) {
  issues.push({ code, severity, message });
}

function weeksByNumber(input: PortfolioSimulationInput): Map<number, { week: number; games: GameInput[] }> {
  return new Map(input.weeks.map((week) => [week.week, week]));
}

function picksForEntry(plan: PortfolioPlanInput, week: number, entryId: string): string[] {
  if (week === 0) return plan.picksByEntry[entryId] ?? [];
  return plan.picksByWeek?.[String(week)]?.[entryId] ?? [];
}

function sourceForCandidate(candidate: CandidateInput, type: "probability" | "popularity"): SourceStamp | undefined {
  if (type === "probability") return candidate.probabilitySource ?? candidate.source;
  return candidate.popularitySource ?? candidate.source;
}

function validateProbability(value: number, label: string, issues: DependencyIssue[], source?: SourceStamp) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    addIssue(issues, "invalid-probability", "required", `${label} must be between 0 and 1.`);
  }
  if (!validSource(source)) {
    addIssue(issues, "missing-probability-source", "required", `${label} needs a source, observed-at time, and method.`);
  }
}

function gameForTeam(games: GameInput[], team: string): GameInput | undefined {
  return games.find((game) => game.homeTeam === team || game.awayTeam === team);
}

function validateDistribution(
  distribution: Record<string, number> | undefined,
  week: number,
  games: GameInput[],
  issues: DependencyIssue[],
) {
  if (!distribution) {
    addIssue(issues, "missing-opponent-picks", "required", `Opponent pick model is missing for Week ${week}.`);
    return;
  }
  const values = Object.values(distribution);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!values.length || Math.abs(total - 1) > EPSILON) {
    addIssue(issues, "invalid-opponent-distribution", "required", `Opponent pick probabilities for Week ${week} must sum to 1.`);
  }
  for (const [team, probability] of Object.entries(distribution)) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      addIssue(issues, "invalid-opponent-probability", "required", `${team} has an invalid opponent pick probability in Week ${week}.`);
    }
    if (!gameForTeam(games, team)) {
      addIssue(issues, "opponent-team-not-scheduled", "required", `${team} is not scheduled in Week ${week}.`);
    }
  }
}

function validatePlanPicks(
  input: PortfolioSimulationInput,
  week: number,
  games: GameInput[],
  issues: DependencyIssue[],
) {
  const requiredPicks = input.rules.picksRequiredByWeek[String(week)] ?? input.rules.normalPicksPerWeek;
  const gameTeams = new Map(games.flatMap((game) => [[game.homeTeam, game.id], [game.awayTeam, game.id]]));

  for (const entry of input.ourEntries.filter((candidate) => candidate.alive)) {
    const picks = week === input.currentWeek
      ? input.plan.picksByEntry[entry.id] ?? []
      : input.plan.picksByWeek?.[String(week)]?.[entry.id] ?? [];
    if (picks.length !== requiredPicks) {
      addIssue(issues, "missing-portfolio-picks", "required", `${entry.id} needs ${requiredPicks} pick(s) for Week ${week}.`);
    }
    if (new Set(picks).size !== picks.length) {
      addIssue(issues, "duplicate-portfolio-pick", "required", `${entry.id} repeats a team in Week ${week}.`);
    }
    const used = new Set(entry.usedTeams);
    for (const team of picks) {
      if (!team || used.has(team)) {
        addIssue(issues, "illegal-portfolio-pick", "required", `${entry.id} has a missing or previously used team in Week ${week}.`);
      }
      if (!gameTeams.has(team)) {
        addIssue(issues, "unscheduled-portfolio-pick", "required", `${team || "A blank pick"} is not scheduled in Week ${week}.`);
      }
    }
    if (requiredPicks > 1 && input.rules.distinctGamesInMultiPickWeek === "configured") {
      const gameIds = picks.map((team) => gameTeams.get(team));
      if (new Set(gameIds).size !== gameIds.length) {
        addIssue(issues, "duplicate-portfolio-game", "required", `${entry.id} uses two teams from one game in Week ${week}.`);
      }
    }
    if (requiredPicks > 1 && input.rules.distinctGamesInMultiPickWeek === "unresolved") {
      addIssue(issues, "unresolved-multi-pick-rule", "required", `Distinct-game handling is unresolved for Week ${week}.`);
    }
  }
}

function validateOpponentEntries(
  field: OpponentFieldModel,
  input: PortfolioSimulationInput,
  weeks: Map<number, { week: number; games: GameInput[] }>,
  seasonEndWeek: number,
  issues: DependencyIssue[],
) {
  if (!validSource(field.source)) {
    addIssue(issues, "missing-opponent-source", "required", "Opponent-field assumptions need a source, observed-at time, and method.");
  }
  const entries = field.entries ?? [];
  for (let week = input.currentWeek; week <= seasonEndWeek; week += 1) {
    const simulationWeek = weeks.get(week);
    if (!simulationWeek) continue;
    if (!entries.length) {
      validateDistribution(field.pickDistributionByWeek?.[String(week)], week, simulationWeek.games, issues);
      continue;
    }
    const requiredPicks = input.rules.picksRequiredByWeek[String(week)] ?? input.rules.normalPicksPerWeek;
    for (const entry of entries) {
      const picks = entry.picksByWeek?.[String(week)];
      if (!picks || picks.length !== requiredPicks) {
        addIssue(issues, "missing-opponent-entry-picks", "required", `${entry.id} needs ${requiredPicks} opponent pick(s) for Week ${week}.`);
        continue;
      }
      if (new Set([...entry.usedTeams, ...picks]).size !== entry.usedTeams.length + picks.length) {
        addIssue(issues, "illegal-opponent-entry-pick", "required", `${entry.id} repeats a previously used team in Week ${week}.`);
      }
      for (const team of picks) {
        if (!gameForTeam(simulationWeek.games, team)) {
          addIssue(issues, "opponent-team-not-scheduled", "required", `${team} is not scheduled for ${entry.id} in Week ${week}.`);
        }
      }
      if (requiredPicks > 1 && input.rules.distinctGamesInMultiPickWeek === "configured") {
        const gameIds = picks.map((team) => gameForTeam(simulationWeek.games, team)?.id);
        if (new Set(gameIds).size !== gameIds.length) {
          addIssue(issues, "duplicate-opponent-game", "required", `${entry.id} uses two teams from one game in Week ${week}.`);
        }
      }
      if (requiredPicks > 1 && input.rules.distinctGamesInMultiPickWeek === "unresolved") {
        addIssue(issues, "unresolved-multi-pick-rule", "required", `Distinct-game handling is unresolved for Week ${week}.`);
      }
    }
  }
}

export function validatePortfolioSimulationInput(input: PortfolioSimulationInput): DependencyReport {
  const issues: DependencyIssue[] = [];
  const weeks = weeksByNumber(input);
  const seasonEndWeek = input.seasonEndWeek ?? Math.max(18, input.currentWeek);
  const illustrative = input.candidates.some((candidate) => candidate.dataStatus === "illustrative");

  if (!Number.isInteger(input.simulations) || input.simulations < 1) {
    addIssue(issues, "invalid-simulation-count", "required", "Simulation count must be a positive integer.");
  }
  if (!Number.isInteger(input.seed)) {
    addIssue(issues, "invalid-seed", "required", "A reproducible integer seed is required.");
  }
  if (!Number.isInteger(input.pool.startingPoolEntryCount) || input.pool.startingPoolEntryCount < 1) {
    addIssue(issues, "invalid-starting-count", "required", "Starting pool entry count must be a positive integer.");
  }
  if (!Number.isInteger(input.pool.currentLivePoolEntryCount) || input.pool.currentLivePoolEntryCount < 1) {
    addIssue(issues, "invalid-live-count", "required", "Current live pool entry count must be a positive integer.");
  }
  if (input.pool.currentLivePoolEntryCount > input.pool.startingPoolEntryCount) {
    addIssue(issues, "live-count-exceeds-starting", "required", "Current live entries cannot exceed starting entries.");
  }
  if (!validSource(input.pool.source)) {
    addIssue(issues, "missing-pool-state-source", "required", "Pool counts need a source, observed-at time, and method.");
  }
  const ourLiveEntries = input.ourEntries.filter((entry) => entry.alive);
  if (ourLiveEntries.length !== input.pool.ourLiveEntryCount) {
    addIssue(issues, "our-live-count-mismatch", "required", "Our live-entry count does not match the supplied live entries.");
  }
  if (input.pool.ourManagedEntryCount < input.pool.ourLiveEntryCount) {
    addIssue(issues, "our-managed-count-too-small", "required", "Managed entry count cannot be below our live-entry count.");
  }
  if (input.pool.ourManagedEntryCount !== input.ourEntries.length) {
    addIssue(issues, "our-managed-count-mismatch", "required", "Managed entry count does not match the supplied managed entries.");
  }
  const opponentCount = input.pool.currentLivePoolEntryCount - input.pool.ourLiveEntryCount;
  if (input.opponentField) {
    const modeledCount = input.opponentField.entries?.length ?? input.opponentField.entryCount;
    if (modeledCount !== opponentCount) {
      addIssue(issues, "opponent-count-mismatch", "required", `Opponent model has ${modeledCount ?? 0} entries but the live field requires ${opponentCount}.`);
    }
  } else {
    addIssue(issues, "missing-opponent-field", "required", "A current live opponent-field model is required for terminal win/share metrics.");
  }

  for (let week = input.currentWeek; week <= seasonEndWeek; week += 1) {
    const simulationWeek = weeks.get(week);
    if (!simulationWeek) {
      addIssue(issues, "missing-week-input", "required", `Schedule and probabilities are missing for Week ${week}.`);
      continue;
    }
    if (!simulationWeek.games.length) {
      addIssue(issues, "missing-games", "required", `No games were supplied for Week ${week}.`);
    }
    const gameIds = new Set<string>();
    for (const game of simulationWeek.games) {
      if (gameIds.has(game.id)) addIssue(issues, "duplicate-game", "required", `Game ${game.id} is duplicated in Week ${week}.`);
      gameIds.add(game.id);
      const total = game.homeWinProbability + game.awayWinProbability + game.tieProbability;
      if (Math.abs(total - 1) > EPSILON) addIssue(issues, "probabilities-do-not-sum", "required", `Outcome probabilities for ${game.id} must sum to 1.`);
      validateProbability(game.homeWinProbability, `${game.id} home-win probability`, issues, game.source);
      validateProbability(game.awayWinProbability, `${game.id} away-win probability`, issues, game.source);
      validateProbability(game.tieProbability, `${game.id} tie probability`, issues, game.source);
    }
    validatePlanPicks(input, week, simulationWeek.games, issues);
  }

  for (const candidate of input.candidates) {
    if (candidate.winProbability !== undefined) {
      validateProbability(candidate.winProbability, `${candidate.team} win probability`, issues, sourceForCandidate(candidate, "probability"));
    }
    if (candidate.popularity !== undefined) {
      if (!Number.isFinite(candidate.popularity) || candidate.popularity < 0 || candidate.popularity > 1) {
        addIssue(issues, "invalid-popularity", "optional", `${candidate.team} popularity must be between 0 and 1.`);
      }
      if (!validSource(sourceForCandidate(candidate, "popularity"))) {
        addIssue(issues, "missing-popularity-source", "optional", `${candidate.team} popularity needs a source, observed-at time, and method.`);
      }
    } else {
      addIssue(issues, "missing-popularity", "optional", `${candidate.team} has no projected pick popularity.`);
    }
  }
  if (!input.candidates.length) addIssue(issues, "missing-candidates", "optional", "No candidate-team input was supplied; popularity and rationale are unavailable.");

  if (input.opponentField) validateOpponentEntries(input.opponentField, input, weeks, seasonEndWeek, issues);
  if (input.rules.allEntriesLoseSettlement !== "configured" || !input.rules.allEntriesLoseOutcome) {
    addIssue(issues, "unresolved-terminal-settlement", "required", "All-entries-lose settlement must be configured before terminal prize-share metrics can be calculated.");
  }

  const requiredIssues = issues.some((issue) => issue.severity === "required");
  const optionalIssues = issues.some((issue) => issue.severity === "optional");
  const state: ModelState = illustrative
    ? "illustrative"
    : requiredIssues
      ? "blocked"
      : optionalIssues
        ? "partial"
        : "calculated";

  return { state, issues, inputFingerprint: fingerprintInput(input) };
}

function metric<T>(state: ModelState, value?: T, standardError?: number, reason?: string): SimulationMetric<T> {
  return { state, value, standardError, reason };
}

function emptyMetrics(state: ModelState, reason: string, ourLiveFieldShare?: number): PortfolioSimulationMetrics {
  return {
    anyJointEntrySurvivesCurrentWeek: metric(state, undefined, undefined, reason),
    allJointEntriesSurviveCurrentWeek: metric(state, undefined, undefined, reason),
    expectedJointEntriesAliveNextWeek: metric(state, undefined, undefined, reason),
    anyJointEntryWinsOrSharesPool: metric(state, undefined, undefined, reason),
    expectedJointPrizeShare: metric(state, undefined, undefined, reason),
    maxSingleGameLoss: metric(state, undefined, undefined, reason),
    ourLiveFieldShare: metric(state, ourLiveFieldShare, undefined, reason),
  };
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleOutcome(game: GameInput, random: () => number): string {
  const draw = random();
  if (draw < game.homeWinProbability) return game.homeTeam;
  if (draw < game.homeWinProbability + game.awayWinProbability) return game.awayTeam;
  return "tie";
}

function sampleFromDistribution(distribution: Record<string, number>, random: () => number, excluded: Set<string>): string | undefined {
  const available = Object.entries(distribution).filter(([team, probability]) => probability > 0 && !excluded.has(team));
  const total = available.reduce((sum, [, probability]) => sum + probability, 0);
  if (!total) return undefined;
  let draw = random() * total;
  for (const [team, probability] of available) {
    draw -= probability;
    if (draw <= 0) return team;
  }
  return available.at(-1)?.[0];
}

function opponentPicks(
  entry: OpponentEntryInput,
  week: number,
  requiredPicks: number,
  field: OpponentFieldModel,
  random: () => number,
  usedTeams: Set<string>,
  games: GameInput[],
  distinctGames: boolean,
): string[] {
  const fixed = entry.picksByWeek?.[String(week)];
  if (fixed) return fixed;
  const distribution = field.pickDistributionByWeek?.[String(week)] ?? {};
  const picks: string[] = [];
  const excluded = new Set([...usedTeams]);
  const excludedGames = new Set<string>();
  for (let index = 0; index < requiredPicks; index += 1) {
    const eligibleDistribution = distinctGames
      ? Object.fromEntries(Object.entries(distribution).filter(([team]) => {
        const game = gameForTeam(games, team);
        return Boolean(game && !excludedGames.has(game.id));
      }))
      : distribution;
    const pick = sampleFromDistribution(eligibleDistribution, random, excluded);
    if (!pick) return [];
    picks.push(pick);
    excluded.add(pick);
    if (distinctGames) {
      const game = gameForTeam(games, pick);
      if (game) excludedGames.add(game.id);
    }
  }
  return picks;
}

function isEntryAlive(picks: string[], gamesByTeam: Map<string, GameInput>, outcomes: Map<string, string>): boolean {
  return picks.length > 0 && picks.every((team) => {
    const game = gamesByTeam.get(team);
    return Boolean(game && outcomes.get(game.id) === team);
  });
}

function standardError(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function maxSingleGameLoss(input: PortfolioSimulationInput, currentGames: GameInput[]): number {
  const lossCounts = currentGames.map((game) => {
    const picks = input.ourEntries
      .filter((entry) => entry.alive)
      .flatMap((entry) => input.plan.picksByEntry[entry.id] ?? [])
      .filter((team) => game.homeTeam === team || game.awayTeam === team);
    const homePicks = picks.filter((team) => team === game.homeTeam).length;
    const awayPicks = picks.filter((team) => team === game.awayTeam).length;
    return game.tieProbability > 0 ? picks.length : Math.max(homePicks, awayPicks);
  });
  return Math.max(0, ...lossCounts);
}

export function runPortfolioSimulation(input: PortfolioSimulationInput): PortfolioSimulationResult {
  const dependencyReport = validatePortfolioSimulationInput(input);
  const liveShare = input.pool.currentLivePoolEntryCount > 0
    ? input.pool.ourLiveEntryCount / input.pool.currentLivePoolEntryCount
    : undefined;
  if (dependencyReport.state === "blocked" || dependencyReport.state === "illustrative") {
    const reason = dependencyReport.issues[0]?.message ?? `Inputs are ${dependencyReport.state}.`;
    return {
      state: dependencyReport.state,
      dependencyReport,
      metrics: emptyMetrics(dependencyReport.state, reason, liveShare),
      simulations: input.simulations,
      seed: input.seed,
      modelVersion: input.modelVersion ?? "joint-monte-carlo-1",
      inputFingerprint: dependencyReport.inputFingerprint,
    };
  }

  const weeks = weeksByNumber(input);
  const seasonEndWeek = input.seasonEndWeek ?? Math.max(18, input.currentWeek);
  const currentWeek = weeks.get(input.currentWeek)!;
  const opponentEntries = input.opponentField?.entries
    ?? Array.from({ length: input.pool.currentLivePoolEntryCount - input.pool.ourLiveEntryCount }, (_, index) => ({ id: `opponent-${index + 1}`, usedTeams: [] }));
  const random = createRandom(input.seed);
  const anyCurrent: number[] = [];
  const allCurrent: number[] = [];
  const expectedAlive: number[] = [];
  const terminalAny: number[] = [];
  const terminalPrizeShare: number[] = [];

  for (let simulation = 0; simulation < input.simulations; simulation += 1) {
    const ourAlive = new Set(input.ourEntries.filter((entry) => entry.alive).map((entry) => entry.id));
    const opponentAlive = new Set(opponentEntries.map((entry) => entry.id));
    const ourUsed = new Map(input.ourEntries.map((entry) => [entry.id, new Set(entry.usedTeams)]));
    const opponentUsed = new Map(opponentEntries.map((entry) => [entry.id, new Set(entry.usedTeams)]));
    let capturedCurrent = false;
    let capturedTerminal = false;
    for (let week = input.currentWeek; week <= seasonEndWeek; week += 1) {
      const simulationWeek = weeks.get(week);
      if (!simulationWeek) break;
      const outcomes = new Map(simulationWeek.games.map((game) => [game.id, sampleOutcome(game, random)]));
      const gamesByTeam = new Map(simulationWeek.games.flatMap((game) => [[game.homeTeam, game], [game.awayTeam, game]]));
      const requiredPicks = input.rules.picksRequiredByWeek[String(week)] ?? input.rules.normalPicksPerWeek;
      const field = input.opponentField ?? {};

      for (const entry of input.ourEntries.filter((candidate) => ourAlive.has(candidate.id))) {
        const picks = week === input.currentWeek
          ? input.plan.picksByEntry[entry.id] ?? []
          : picksForEntry(input.plan, week, entry.id);
        if (!isEntryAlive(picks, gamesByTeam, outcomes)) ourAlive.delete(entry.id);
        else picks.forEach((team) => ourUsed.get(entry.id)?.add(team));
      }
      for (const entry of opponentEntries.filter((candidate) => opponentAlive.has(candidate.id))) {
        const used = opponentUsed.get(entry.id) ?? new Set<string>();
        const picks = opponentPicks(
          entry,
          week,
          requiredPicks,
          field,
          random,
          used,
          simulationWeek.games,
          input.rules.distinctGamesInMultiPickWeek === "configured",
        );
        if (!isEntryAlive(picks, gamesByTeam, outcomes)) opponentAlive.delete(entry.id);
        else picks.forEach((team) => used.add(team));
      }

      if (week === input.currentWeek) {
        const aliveCount = ourAlive.size;
        anyCurrent.push(aliveCount > 0 ? 1 : 0);
        allCurrent.push(aliveCount === input.pool.ourLiveEntryCount ? 1 : 0);
        expectedAlive.push(aliveCount);
        capturedCurrent = true;
      }

      const totalAlive = ourAlive.size + opponentAlive.size;
      if (totalAlive <= 1 || week === seasonEndWeek) {
        terminalAny.push(ourAlive.size > 0 ? 1 : 0);
        terminalPrizeShare.push(totalAlive > 0 ? ourAlive.size / totalAlive : 0);
        capturedTerminal = true;
        break;
      }
    }
    if (!capturedCurrent) {
      anyCurrent.push(0);
      allCurrent.push(0);
      expectedAlive.push(0);
    }
    if (!capturedTerminal) {
      terminalAny.push(0);
      terminalPrizeShare.push(0);
    }
  }

  const anyCurrentMean = anyCurrent.reduce((sum, value) => sum + value, 0) / input.simulations;
  const allCurrentMean = allCurrent.reduce((sum, value) => sum + value, 0) / input.simulations;
  const expectedAliveMean = expectedAlive.reduce((sum, value) => sum + value, 0) / input.simulations;
  const terminalAnyMean = terminalAny.reduce((sum, value) => sum + value, 0) / input.simulations;
  const terminalShareMean = terminalPrizeShare.reduce((sum, value) => sum + value, 0) / input.simulations;
  const state = dependencyReport.state;
  const reason = dependencyReport.issues.find((issue) => issue.severity === "optional")?.message;
  return {
    state,
    dependencyReport,
    metrics: {
      anyJointEntrySurvivesCurrentWeek: metric(state, anyCurrentMean, standardError(anyCurrent, anyCurrentMean), reason),
      allJointEntriesSurviveCurrentWeek: metric(state, allCurrentMean, standardError(allCurrent, allCurrentMean), reason),
      expectedJointEntriesAliveNextWeek: metric(state, expectedAliveMean, standardError(expectedAlive, expectedAliveMean), reason),
      anyJointEntryWinsOrSharesPool: metric(state, terminalAnyMean, standardError(terminalAny, terminalAnyMean), reason),
      expectedJointPrizeShare: metric(state, terminalShareMean, standardError(terminalPrizeShare, terminalShareMean), reason),
      maxSingleGameLoss: metric(state, maxSingleGameLoss(input, currentWeek.games), 0, reason),
      ourLiveFieldShare: metric(state, liveShare, 0, reason),
    },
    simulations: input.simulations,
    seed: input.seed,
    modelVersion: input.modelVersion ?? "joint-monte-carlo-1",
    inputFingerprint: dependencyReport.inputFingerprint,
  };
}
