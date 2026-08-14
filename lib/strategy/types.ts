export const STRATEGY_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type RuleResolution = "configured" | "unresolved";

export type ModelState = "calculated" | "partial" | "blocked" | "illustrative";

export type DependencySeverity = "required" | "optional" | "informational";

export type PoolRules = {
  season: number;
  normalPicksPerWeek: number;
  picksRequiredByWeek: Record<string, number>;
  distinctTeamsPerEntry: boolean;
  distinctGamesInMultiPickWeek: RuleResolution;
  tiesCountAs: "loss";
  pickDeadline: string;
  postponedGameReplacement: RuleResolution;
  missingPickDefault: RuleResolution;
  allEntriesLoseSettlement: RuleResolution;
  allEntriesLoseOutcome?: "no_winner" | "continues";
  splashIsOfficialRecord: true;
};

export type DataStatus = "illustrative" | "manual" | "imported" | "simulated";

export type SourceStamp = {
  source: string;
  observedAt: string;
  method: string;
  version?: string;
};

export type PoolState = {
  startingPoolEntryCount: number;
  currentLivePoolEntryCount: number;
  ourManagedEntryCount: number;
  ourLiveEntryCount: number;
  source?: SourceStamp;
};

export type GameInput = {
  id: string;
  week: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  homeWinProbability: number;
  awayWinProbability: number;
  tieProbability: number;
  source?: SourceStamp;
};

export type OpponentEntryInput = {
  id: string;
  usedTeams: string[];
  picksByWeek?: Record<string, string[]>;
};

export type OpponentFieldModel = {
  source?: SourceStamp;
  entries?: OpponentEntryInput[];
  entryCount?: number;
  pickDistributionByWeek?: Record<string, Record<string, number>>;
};

export type StrategyEntryInput = {
  id: string;
  name?: string;
  owner?: string;
  usedTeams: string[];
  alive?: boolean;
};

export type CandidateInput = {
  team: string;
  opponent: string;
  kickoff: string;
  winProbability?: number;
  winProbabilityRange?: [number, number];
  popularity?: number;
  popularityRange?: [number, number];
  source?: SourceStamp;
  probabilitySource?: SourceStamp;
  popularitySource?: SourceStamp;
  dataStatus: DataStatus;
};

export type PortfolioPlanInput = {
  id: string;
  picksByEntry: Record<string, string[]>;
  picksByWeek?: Record<string, Record<string, string[]>>;
};

export type StrategyPlanInput = PortfolioPlanInput & {
  label?: "safer" | "recommended" | "leverage";
  title?: string;
  description?: string;
  rationale?: string;
  assumptions?: string[];
};

export type StrategyInputPayload = {
  season: number;
  currentWeek: number;
  seasonEndWeek?: number;
  rules: PoolRules;
  pool: PoolState;
  ourEntries: StrategyEntryInput[];
  candidates: CandidateInput[];
  weeks: Array<{ week: number; games: GameInput[] }>;
  opponentField?: OpponentFieldModel;
  plans: StrategyPlanInput[];
  simulations?: number;
  seed?: number;
  modelVersion?: string;
};

export type PortfolioSimulationInput = {
  season: number;
  currentWeek: number;
  seasonEndWeek?: number;
  rules: PoolRules;
  pool: PoolState;
  ourEntries: Array<{ id: string; usedTeams: string[]; alive: boolean }>;
  candidates: CandidateInput[];
  weeks: Array<{ week: number; games: GameInput[] }>;
  opponentField?: OpponentFieldModel;
  plan: PortfolioPlanInput;
  simulations: number;
  seed: number;
  modelVersion?: string;
};

export type DependencyIssue = {
  code: string;
  severity: DependencySeverity;
  message: string;
};

export type DependencyReport = {
  state: ModelState;
  issues: DependencyIssue[];
  inputFingerprint: string;
};

export type SimulationMetric<T> = {
  state: ModelState;
  value?: T;
  standardError?: number;
  reason?: string;
};

export type PortfolioSimulationMetrics = {
  anyJointEntrySurvivesCurrentWeek: SimulationMetric<number>;
  allJointEntriesSurviveCurrentWeek: SimulationMetric<number>;
  expectedJointEntriesAliveNextWeek: SimulationMetric<number>;
  anyJointEntryWinsOrSharesPool: SimulationMetric<number>;
  expectedJointPrizeShare: SimulationMetric<number>;
  maxSingleGameLoss: SimulationMetric<number>;
  ourLiveFieldShare: SimulationMetric<number>;
};

export type PortfolioSimulationResult = {
  state: ModelState;
  dependencyReport: DependencyReport;
  metrics: PortfolioSimulationMetrics;
  simulations: number;
  seed: number;
  modelVersion: string;
  inputFingerprint: string;
};

export type RecommendationPlanSnapshot = {
  id: string;
  label: "safer" | "recommended" | "leverage";
  picksByEntry: Record<string, string[]>;
  rationale: string;
  assumptions: string[];
};

export type HumanDecision = {
  status: "pending" | "accepted" | "overridden";
  recordedAt?: string;
  reason?: string;
};

export type RecommendationSnapshot = {
  schemaVersion: typeof STRATEGY_SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  createdAt: string;
  season: number;
  week: number;
  dataStatus: DataStatus;
  model: {
    kind: "illustrative" | "heuristic" | "simulation" | "optimizer";
    version: string;
  };
  rules: PoolRules;
  candidates: CandidateInput[];
  plans: RecommendationPlanSnapshot[];
  selectedPlanId: string;
  finalPicksByEntry: Record<string, string[]>;
  decisionStatus: "working" | "locked" | "submitted";
  humanDecision: HumanDecision;
  unresolvedAssumptions: string[];
  simulation?: PortfolioSimulationResult;
  result?: {
    status: "pending" | "survived" | "eliminated" | "won_or_shared" | "season_ended";
    recordedAt: string;
    notes?: string;
  };
};

export type EntryForValidation = {
  id: string;
  usedTeams: string[];
  alive: boolean;
};
