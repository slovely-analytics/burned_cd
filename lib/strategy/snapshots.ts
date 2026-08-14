import {
  STRATEGY_SNAPSHOT_SCHEMA_VERSION,
  type CandidateInput,
  type RecommendationPlanSnapshot,
  type RecommendationSnapshot,
  type PoolRules,
  type HumanDecision,
  type PortfolioSimulationResult,
} from "./types.ts";

export function createRecommendationSnapshot(input: {
  season: number;
  week: number;
  rules: PoolRules;
  candidates: CandidateInput[];
  plans: RecommendationPlanSnapshot[];
  selectedPlanId: string;
  finalPicksByEntry: Record<string, string[]>;
  humanDecision?: HumanDecision;
  decisionStatus?: RecommendationSnapshot["decisionStatus"];
  dataStatus?: RecommendationSnapshot["dataStatus"];
  unresolvedAssumptions?: string[];
  simulation?: PortfolioSimulationResult;
  result?: RecommendationSnapshot["result"];
  snapshotId?: string;
  createdAt?: string;
}): RecommendationSnapshot {
  return {
    schemaVersion: STRATEGY_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: input.snapshotId ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    season: input.season,
    week: input.week,
    dataStatus: input.dataStatus ?? "illustrative",
    model: {
      kind: input.simulation
        ? "simulation"
        : input.dataStatus === "illustrative" ? "illustrative" : "heuristic",
      version: input.simulation?.modelVersion ?? "phase-0.1",
    },
    rules: input.rules,
    candidates: input.candidates,
    plans: input.plans,
    selectedPlanId: input.selectedPlanId,
    finalPicksByEntry: input.finalPicksByEntry,
    decisionStatus: input.decisionStatus ?? "working",
    humanDecision: input.humanDecision ?? { status: "pending" },
    unresolvedAssumptions: input.unresolvedAssumptions ?? [],
    simulation: input.simulation,
    result: input.result,
  };
}
