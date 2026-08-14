"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultPoolRules,
  requiredPicksForWeek,
  unresolvedRuleWarnings,
  validateEntryPicks,
} from "../lib/strategy/rules";
import {
  blankStrategyInputTemplate,
  derivePickerTeamOptions,
  parseStrategyInputJson,
  pickerOptionsForEntry,
  pickerSelectionIssue,
  toPortfolioSimulationInput,
} from "../lib/strategy/input";
import { createRecommendationSnapshot } from "../lib/strategy/snapshots";
import { runPortfolioSimulation } from "../lib/strategy/simulator";
import type {
  HumanDecision,
  ModelState,
  PortfolioSimulationResult,
  RecommendationSnapshot,
  SimulationMetric,
  StrategyInputPayload,
  StrategyPlanInput,
} from "../lib/strategy/types";

type Owner = "McLovin" | "Casual";
type EntryStatus = "alive" | "eliminated" | "inactive";

type Entry = {
  id: string;
  name: string;
  owner: Owner;
  status: EntryStatus;
  used: string[];
  picks: string[];
  confirmed: boolean;
};

type Candidate = {
  team: string;
  record?: string;
  spread?: string;
  winProbability?: number;
  popularity?: number;
  futureValue?: string;
  opponent?: string;
  kickoff?: string;
  rationale: string;
};

type Plan = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  metrics: {
    anyJointSurviveWeek: string;
    allJointSurviveWeek: string;
    expectedEntriesAlive: string;
    anyWinShare: string;
    expectedPrizeShare: string;
    maxSingleGameLoss: string;
    futureScarcityCost: string;
    robustness: string;
  };
  picks: Record<string, string[]>;
  recommended?: boolean;
};

type Setup = {
  poolName: string;
  week: string;
  surviving: string;
  poolSize: string;
  startingPoolEntries: string;
  currentLivePoolEntries: string;
  ourManagedEntries: string;
  ourLiveEntries: string;
  deadline: string;
  outcome: "in_progress" | "joint_eliminated" | "won_or_shared" | "season_ended";
};

type SavedWorkspace = {
  entries?: Entry[];
  selectedPlan?: string;
  notes?: string;
  setup?: Setup;
  activity?: string[];
  strategySnapshots?: RecommendationSnapshot[];
  humanDecision?: HumanDecision;
  strategyInput?: StrategyInputPayload;
};

const initialSetup: Setup = { poolName: "Last Survivor · 2026", week: "4", surviving: "4", poolSize: "12", startingPoolEntries: "12", currentLivePoolEntries: "4", ourManagedEntries: "4", ourLiveEntries: "4", deadline: "Sunday at 1:00 PM", outcome: "in_progress" };

const teamColors: Record<string, string> = {
  Bills: "#1f66c2",
  Chiefs: "#e31837",
  Eagles: "#004c54",
  "49ers": "#aa0000",
  Ravens: "#241773",
  Lions: "#0076b6",
  Packers: "#203731",
  Dolphins: "#008e97",
};

const teams = Object.keys(teamColors);

const initialEntries: Entry[] = [
  { id: "mclovin-1", name: "McLovin · Main", owner: "McLovin", status: "alive", used: ["Ravens", "Packers", "Dolphins"], picks: ["Bills"], confirmed: false },
  { id: "mclovin-2", name: "McLovin · Hedge", owner: "McLovin", status: "alive", used: ["Lions", "Eagles"], picks: ["Chiefs"], confirmed: false },
  { id: "casual-1", name: "Casual · Main", owner: "Casual", status: "alive", used: ["Bills", "49ers", "Chiefs"], picks: ["49ers"], confirmed: false },
  { id: "casual-2", name: "Casual · Longshot", owner: "Casual", status: "alive", used: ["Dolphins"], picks: ["Eagles"], confirmed: false },
  { id: "mclovin-3", name: "McLovin · Eliminated", owner: "McLovin", status: "eliminated", used: ["Bills", "Chiefs"], picks: [], confirmed: false },
];

const candidates: Candidate[] = [
  { team: "Bills", record: "3–0", spread: "−6.5", winProbability: 69, popularity: 18, futureValue: "Medium", rationale: "Strong home favorite with a moderate future-use cost." },
  { team: "Chiefs", record: "2–1", spread: "−7.0", winProbability: 72, popularity: 31, futureValue: "High", rationale: "Best raw number, but one of the most valuable teams to preserve." },
  { team: "49ers", record: "2–1", spread: "−5.5", winProbability: 66, popularity: 14, futureValue: "Low", rationale: "A quieter high-confidence option that reduces portfolio overlap." },
  { team: "Eagles", record: "2–1", spread: "−4.5", winProbability: 64, popularity: 11, futureValue: "Medium", rationale: "Slightly lower win estimate, with useful diversification value." },
  { team: "Ravens", record: "2–1", spread: "−3.5", winProbability: 61, popularity: 9, futureValue: "Low", rationale: "Available to fewer entries, so it is a clean hedge when eligible." },
];

const plans: Plan[] = [
  {
    id: "recommended",
    eyebrow: "Recommended",
    title: "Split the exposure",
    description: "Use four different high-confidence teams so one upset does not take the whole portfolio with it.",
    metrics: { anyJointSurviveWeek: "Illustrative", allJointSurviveWeek: "Illustrative", expectedEntriesAlive: "Illustrative", anyWinShare: "Illustrative", expectedPrizeShare: "Illustrative", maxSingleGameLoss: "4 entries", futureScarcityCost: "Preserves Chiefs", robustness: "Not calculated" },
    recommended: true,
    picks: { "mclovin-1": ["Bills"], "mclovin-2": ["Chiefs"], "casual-1": ["49ers"], "casual-2": ["Eagles"] },
  },
  {
    id: "anchor",
    eyebrow: "Alternative A",
    title: "Anchor on the favorite",
    description: "Prioritize this week's highest estimate across the portfolio. Easier to explain, more correlated if it misses.",
    metrics: { anyJointSurviveWeek: "Illustrative", allJointSurviveWeek: "Illustrative", expectedEntriesAlive: "Illustrative", anyWinShare: "Illustrative", expectedPrizeShare: "Illustrative", maxSingleGameLoss: "4 entries", futureScarcityCost: "Spends Chiefs", robustness: "Not calculated" },
    picks: { "mclovin-1": ["Bills"], "mclovin-2": ["Chiefs"], "casual-1": ["Bills"], "casual-2": ["Chiefs"] },
  },
  {
    id: "quiet",
    eyebrow: "Alternative B",
    title: "Quiet portfolio",
    description: "Lean into lower-popularity options to improve the share of the pool if the chalk breaks against the field.",
    metrics: { anyJointSurviveWeek: "Illustrative", allJointSurviveWeek: "Illustrative", expectedEntriesAlive: "Illustrative", anyWinShare: "Illustrative", expectedPrizeShare: "Illustrative", maxSingleGameLoss: "1 entry", futureScarcityCost: "Preserves Chiefs", robustness: "Not calculated" },
    picks: { "mclovin-1": ["Bills"], "mclovin-2": ["49ers"], "casual-1": ["Eagles"], "casual-2": ["Ravens"] },
  },
];

const initialNotes = "Protect the portfolio first. If we keep four live entries, revisit Chiefs and Eagles before spending another premium team.";

const demoInputNotice = "Illustrative demo values are shown until a source-stamped input snapshot is applied.";

function TeamBadge({ team, muted = false }: { team: string; muted?: boolean }) {
  return (
    <span className={`team-badge ${muted ? "is-muted" : ""}`}>
      <span className="team-dot" style={{ backgroundColor: teamColors[team] ?? "#64748b" }} />
      {team}
    </span>
  );
}

function PickList({ picks }: { picks: string[] }) {
  return (
    <span className="team-badge-list">
      {picks.map((pick, index) => pick ? <TeamBadge team={pick} key={`${pick}-${index}`} /> : <span key={`missing-${index}`}>Missing team</span>)}
    </span>
  );
}

function SectionHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {copy ? <p className="section-copy">{copy}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

function stateLabel(state: ModelState): string {
  return state === "calculated" ? "Calculated" : state === "partial" ? "Partial" : state === "blocked" ? "Blocked" : "Illustrative";
}

function metricText(metric: SimulationMetric<number> | undefined, format: "percent" | "number" | "count" = "percent"): string {
  if (!metric || metric.value === undefined) return metric ? stateLabel(metric.state) : "Not supplied";
  const value = format === "percent" ? `${(metric.value * 100).toFixed(1)}%` : format === "count" ? String(Math.round(metric.value)) : metric.value.toFixed(2);
  if (metric.standardError && metric.standardError > 0 && format === "percent") return `${value} ± ${(metric.standardError * 100).toFixed(1)}%`;
  return value;
}

function planDisplayLabel(plan: StrategyPlanInput, index: number): string {
  if (plan.label === "recommended") return "Recommended";
  if (plan.label === "safer") return "Safer alternative";
  if (plan.label === "leverage") return "Leverage alternative";
  return index === 0 ? "Recommended" : `Alternative ${String.fromCharCode(64 + index)}`;
}

function planDisplayDescription(plan: StrategyPlanInput): string {
  return plan.description ?? plan.rationale ?? "Imported plan; review its assumptions before accepting it.";
}

function planFromInput(plan: StrategyPlanInput, simulation: PortfolioSimulationResult | undefined, index: number): Plan {
  const futureAssumption = plan.assumptions?.find((assumption) => /future|scarcity/i.test(assumption)) ?? "Not supplied";
  return {
    id: plan.id,
    eyebrow: planDisplayLabel(plan, index),
    title: plan.title ?? plan.id,
    description: planDisplayDescription(plan),
    metrics: {
      anyJointSurviveWeek: metricText(simulation?.metrics.anyJointEntrySurvivesCurrentWeek),
      allJointSurviveWeek: metricText(simulation?.metrics.allJointEntriesSurviveCurrentWeek),
      expectedEntriesAlive: metricText(simulation?.metrics.expectedJointEntriesAliveNextWeek, "number"),
      anyWinShare: metricText(simulation?.metrics.anyJointEntryWinsOrSharesPool),
      expectedPrizeShare: metricText(simulation?.metrics.expectedJointPrizeShare),
      maxSingleGameLoss: metricText(simulation?.metrics.maxSingleGameLoss, "count"),
      futureScarcityCost: futureAssumption,
      robustness: "Not measured",
    },
    picks: plan.picksByEntry,
    recommended: plan.label === "recommended" || (!plan.label && index === 0),
  };
}

function entriesFromStrategyInput(input: StrategyInputPayload, currentEntries: Entry[]): Entry[] {
  const existingById = new Map(currentEntries.map((entry) => [entry.id, entry]));
  const recommendedPlan = input.plans.find((plan) => plan.label === "recommended") ?? input.plans[0];
  return input.ourEntries.map((entry, index) => {
    const existing = existingById.get(entry.id);
    const owner = entry.owner === "Casual" || entry.owner === "McLovin" ? entry.owner : existing?.owner ?? (index % 2 === 0 ? "McLovin" : "Casual");
    return {
      id: entry.id,
      name: entry.name ?? existing?.name ?? entry.id,
      owner,
      status: entry.alive === false ? "eliminated" : "alive",
      used: entry.usedTeams,
      picks: recommendedPlan?.picksByEntry[entry.id] ?? [],
      confirmed: false,
    };
  });
}

function setupFromStrategyInput(input: StrategyInputPayload, current: Setup): Setup {
  return {
    ...current,
    week: String(input.currentWeek),
    surviving: String(input.pool.currentLivePoolEntryCount),
    poolSize: String(input.pool.startingPoolEntryCount),
    startingPoolEntries: String(input.pool.startingPoolEntryCount),
    currentLivePoolEntries: String(input.pool.currentLivePoolEntryCount),
    ourManagedEntries: String(input.pool.ourManagedEntryCount),
    ourLiveEntries: String(input.pool.ourLiveEntryCount),
  };
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [selectedPlan, setSelectedPlan] = useState("recommended");
  const [notes, setNotes] = useState(initialNotes);
  const [strategyInput, setStrategyInput] = useState<StrategyInputPayload | null>(null);
  const [inputText, setInputText] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [strategySnapshots, setStrategySnapshots] = useState<RecommendationSnapshot[]>([]);
  const [humanDecision, setHumanDecision] = useState<HumanDecision>({ status: "pending" });
  const [decisionReason, setDecisionReason] = useState("");
  const [showInputs, setShowInputs] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error" | "needs-decision">("loading");
  const [setup, setSetup] = useState<Setup>(initialSetup);
  const [activity, setActivity] = useState<string[]>(["Working board created with manual inputs.", "Recommended portfolio drafted for Week 4."]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace unavailable");
        return (await response.json()) as { workspace?: SavedWorkspace };
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload.workspace) {
          setSaveStatus("saved");
          return;
        }
        const workspace = payload.workspace;
        if (workspace.entries) {
          setEntries((workspace.entries as Array<Entry & { pick?: string }>).map((entry) => ({
            ...entry,
            picks: entry.picks ?? (entry.pick ? [entry.pick] : []),
          })));
        }
        if (workspace.selectedPlan) setSelectedPlan(workspace.selectedPlan);
        if (workspace.notes) setNotes(workspace.notes);
        if (workspace.setup) setSetup({ ...initialSetup, ...workspace.setup, outcome: workspace.setup.outcome ?? "in_progress" });
        if (workspace.activity) setActivity(workspace.activity);
        if (workspace.strategySnapshots) setStrategySnapshots(workspace.strategySnapshots);
        if (workspace.strategyInput) {
          const imported = parseStrategyInputJson(JSON.stringify(workspace.strategyInput));
          if (imported.ok) {
            setStrategyInput(imported.value);
            setInputText(JSON.stringify(imported.value, null, 2));
            if (!workspace.entries) {
              setEntries(entriesFromStrategyInput(imported.value, initialEntries));
            }
            setSetup((current) => setupFromStrategyInput(imported.value, current));
            if (!workspace.selectedPlan) setSelectedPlan(imported.value.plans[0]?.id ?? "recommended");
          }
        }
        if (workspace.humanDecision) {
          setHumanDecision(workspace.humanDecision);
          setDecisionReason(workspace.humanDecision.reason ?? "");
        }
        setSaveStatus("saved");
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("error");
      });
    return () => { cancelled = true; };
  }, []);

  const aliveEntries = useMemo(() => entries.filter((entry) => entry.status === "alive"), [entries]);
  const currentWeek = strategyInput?.currentWeek ?? (Number.parseInt(setup.week, 10) || 1);
  const activeRules = strategyInput?.rules ?? defaultPoolRules;
  const requiredPicks = requiredPicksForWeek(currentWeek, activeRules);
  const pickerTeamOptions = useMemo(() => strategyInput
    ? derivePickerTeamOptions(strategyInput, currentWeek)
    : teams.map((team) => ({ team, scheduled: true, candidate: true })), [currentWeek, strategyInput]);
  const entryIssues = useMemo(() => new Map(aliveEntries.map((entry) => {
    const ruleIssues = validateEntryPicks({ id: entry.id, usedTeams: entry.used, alive: true }, currentWeek, entry.picks, activeRules);
    const sourceIssues = entry.picks
      .map((pick, pickIndex) => pickerSelectionIssue(pick, { usedTeams: entry.used, picks: entry.picks }, pickIndex, pickerTeamOptions, currentWeek))
      .filter((issue): issue is string => Boolean(issue))
      .map((message) => ({ code: "source-picker", message }));
    return [entry.id, [...ruleIssues, ...sourceIssues]] as const;
  })), [activeRules, aliveEntries, currentWeek, pickerTeamOptions]);
  const validationIssues = aliveEntries.flatMap((entry) => entryIssues.get(entry.id) ?? []);
  const unresolved = aliveEntries.filter((entry) => (entryIssues.get(entry.id)?.length ?? 0) > 0 || !entry.confirmed);
  const confirmedCount = aliveEntries.filter((entry) => entry.confirmed && (entryIssues.get(entry.id)?.length ?? 0) === 0).length;
  const byOwner = useMemo(() => ({ McLovin: aliveEntries.filter((entry) => entry.owner === "McLovin"), Casual: aliveEntries.filter((entry) => entry.owner === "Casual") }), [aliveEntries]);
  const ruleWarnings = useMemo(() => unresolvedRuleWarnings(activeRules), [activeRules]);
  const poolState = useMemo(() => ({
    startingPoolEntryCount: strategyInput?.pool.startingPoolEntryCount ?? (Number.parseInt(setup.startingPoolEntries, 10) || 0),
    currentLivePoolEntryCount: strategyInput?.pool.currentLivePoolEntryCount ?? (Number.parseInt(setup.currentLivePoolEntries, 10) || 0),
    ourManagedEntryCount: strategyInput?.pool.ourManagedEntryCount ?? (Number.parseInt(setup.ourManagedEntries, 10) || 0),
    ourLiveEntryCount: strategyInput?.pool.ourLiveEntryCount ?? (Number.parseInt(setup.ourLiveEntries, 10) || 0),
  }), [setup, strategyInput]);

  const importedSimulations = useMemo(() => {
    if (!strategyInput) return new Map<string, PortfolioSimulationResult>();
    return new Map(strategyInput.plans.map((plan) => [plan.id, runPortfolioSimulation(toPortfolioSimulationInput(strategyInput, plan))]));
  }, [strategyInput]);
  const importedPlans = useMemo(() => strategyInput
    ? strategyInput.plans.map((plan, index) => planFromInput(plan, importedSimulations.get(plan.id), index))
    : plans, [importedSimulations, strategyInput]);
  const activePlan = importedPlans.find((plan) => plan.id === selectedPlan) ?? importedPlans[0] ?? plans[0];
  const boardSimulation = strategyInput
    ? importedSimulations.get(activePlan.id) ?? runPortfolioSimulation(toPortfolioSimulationInput(strategyInput, strategyInput.plans[0]))
    : runPortfolioSimulation({
    season: defaultPoolRules.season,
    currentWeek,
    seasonEndWeek: currentWeek,
    rules: defaultPoolRules,
    pool: poolState,
    ourEntries: aliveEntries.map((entry) => ({ id: entry.id, usedTeams: entry.used, alive: true })),
    candidates: candidates.map((candidate) => ({
      team: candidate.team,
      opponent: "Not entered",
      kickoff: "Not entered",
      winProbability: (candidate.winProbability ?? 0) / 100,
      popularity: (candidate.popularity ?? 0) / 100,
      dataStatus: "illustrative",
    })),
    weeks: [{
      week: currentWeek,
      games: candidates.map((candidate, index) => ({
        id: `prototype-${candidate.team}`,
        week: currentWeek,
        homeTeam: candidate.team,
        awayTeam: `Opponent ${index + 1}`,
        kickoff: "Not entered",
        homeWinProbability: (candidate.winProbability ?? 0) / 100,
        awayWinProbability: 1 - (candidate.winProbability ?? 0) / 100,
        tieProbability: 0,
      })),
    }],
    opponentField: { entryCount: Math.max(0, poolState.currentLivePoolEntryCount - poolState.ourLiveEntryCount) },
    plan: { id: activePlan.id, picksByEntry: activePlan.picks },
    simulations: 1,
    seed: 20260813,
  });
  const modelState: ModelState = boardSimulation.state;
  const ourLiveFieldShare = boardSimulation.metrics.ourLiveFieldShare.value;
  const recommendationMatchesFinal = aliveEntries.every((entry) => {
    const recommendation = activePlan.picks[entry.id] ?? [];
    return recommendation.length === entry.picks.length && recommendation.every((pick, index) => pick === entry.picks[index]);
  });
  const visibleCandidates: Candidate[] = strategyInput
    ? strategyInput.candidates.map((candidate) => ({
      team: candidate.team,
      opponent: candidate.opponent,
      kickoff: candidate.kickoff,
      winProbability: candidate.winProbability === undefined ? undefined : candidate.winProbability * 100,
      popularity: candidate.popularity === undefined ? undefined : candidate.popularity * 100,
      rationale: "Imported input; review the supplied source and observed-at time.",
    }))
    : candidates;

  function applyStrategyInput(input: StrategyInputPayload, label: string) {
    setStrategyInput(input);
    setInputText(JSON.stringify(input, null, 2));
    setInputMessage(`${label} applied. The model state below reflects these inputs.`);
    setEntries(entriesFromStrategyInput(input, entries));
    setSetup((current) => setupFromStrategyInput(input, current));
    setSelectedPlan(input.plans[0]?.id ?? "recommended");
    setHumanDecision({ status: "pending" });
    setDecisionReason("");
    setActivity((current) => [`${label} applied to the strategy board.`, ...current].slice(0, 5));
  }

  function applyStrategyInputText(text: string, label = "Manual strategy input") {
    const parsed = parseStrategyInputJson(text);
    if (!parsed.ok) {
      setInputMessage(parsed.message);
      return;
    }
    applyStrategyInput(parsed.value, label);
  }

  async function importStrategyFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    applyStrategyInputText(await file.text(), file.name);
  }

  async function saveWorkspace() {
    if (!recommendationMatchesFinal && humanDecision.status !== "overridden") {
      setActivity((current) => ["Save paused: record why the final picks differ from the recommendation.", ...current].slice(0, 5));
      setSaveStatus("needs-decision");
      return;
    }
    setSaveStatus("saving");
    try {
      const snapshot = createRecommendationSnapshot({
        season: strategyInput?.season ?? defaultPoolRules.season,
        week: currentWeek,
        rules: activeRules,
        candidates: strategyInput?.candidates ?? candidates.map((candidate) => ({
          team: candidate.team,
          opponent: candidate.opponent ?? "Not entered",
          kickoff: candidate.kickoff ?? "Not entered",
          winProbability: (candidate.winProbability ?? 0) / 100,
          popularity: (candidate.popularity ?? 0) / 100,
          dataStatus: "illustrative" as const,
        })),
        plans: importedPlans.map((plan) => ({
          id: plan.id,
          label: strategyInput?.plans.find((inputPlan) => inputPlan.id === plan.id)?.label ?? (plan.recommended ? "recommended" : plan.id === "anchor" ? "safer" : "leverage"),
          picksByEntry: plan.picks,
          rationale: plan.description,
          assumptions: strategyInput?.plans.find((inputPlan) => inputPlan.id === plan.id)?.assumptions ?? [strategyInput ? "Imported plan assumptions were not supplied." : demoInputNotice],
        })),
        selectedPlanId: activePlan.id,
        dataStatus: strategyInput ? "imported" : "illustrative",
        finalPicksByEntry: Object.fromEntries(entries.map((entry) => [entry.id, entry.picks])),
        humanDecision,
        unresolvedAssumptions: [...ruleWarnings, ...boardSimulation.dependencyReport.issues.map((issue) => issue.message)],
        simulation: boardSimulation,
        result: setup.outcome === "in_progress" ? undefined : {
          status: setup.outcome === "joint_eliminated" ? "eliminated" : setup.outcome,
          recordedAt: new Date().toISOString(),
          notes,
        },
      });
      const nextSnapshots = [...strategySnapshots, snapshot].slice(-20);
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace: { entries, selectedPlan: activePlan.id, notes, setup, activity, strategySnapshots: nextSnapshots, humanDecision, strategyInput } }),
      });
      if (!response.ok) throw new Error("Workspace could not be saved");
      setStrategySnapshots(nextSnapshots);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  function applyPlan(plan: Plan) {
    setSelectedPlan(plan.id);
    setEntries((current) => current.map((entry) => plan.picks[entry.id] ? { ...entry, picks: plan.picks[entry.id], confirmed: false } : entry));
    setHumanDecision({ status: "pending" });
    setDecisionReason("");
    setActivity((current) => [`${plan.title} applied to the working board.`, ...current].slice(0, 5));
  }

  function updatePick(entryId: string, pickIndex: number, pick: string) {
    setEntries((current) => current.map((entry) => {
      if (entry.id !== entryId) return entry;
      const picks = [...entry.picks];
      picks[pickIndex] = pick;
      return { ...entry, picks, confirmed: false };
    }));
    setHumanDecision({ status: "pending" });
    setActivity((current) => [`Pick changed for ${entries.find((entry) => entry.id === entryId)?.name ?? "entry"}.`, ...current].slice(0, 5));
  }

  function acceptRecommendation() {
    if (!recommendationMatchesFinal) {
      setEntries((current) => current.map((entry) => activePlan.picks[entry.id] ? { ...entry, picks: activePlan.picks[entry.id], confirmed: false } : entry));
    }
    setHumanDecision({ status: "accepted", recordedAt: new Date().toISOString() });
    setDecisionReason("");
    setActivity((current) => ["Recommendation accepted as the final working decision.", ...current].slice(0, 5));
  }

  function recordOverride() {
    const reason = decisionReason.trim();
    if (!reason) return;
    setHumanDecision({ status: "overridden", recordedAt: new Date().toISOString(), reason });
    setActivity((current) => ["Recommendation overridden with a recorded reason.", ...current].slice(0, 5));
  }

  function toggleConfirmation(entryId: string) {
    setEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, confirmed: !entry.confirmed } : entry));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Survivor Pool Strategizer home">
          <span className="brand-mark">SP</span>
          <span>Survivor Pool <em>Strategizer</em></span>
        </a>
        <div className="topbar-actions">
          <span className="saved-state"><span className={`status-dot ${saveStatus === "error" || saveStatus === "needs-decision" ? "is-error" : ""}`} /> {saveStatus === "loading" ? "Loading shared workspace" : saveStatus === "saving" ? "Saving shared workspace" : saveStatus === "error" ? "Shared save unavailable" : saveStatus === "needs-decision" ? "Decision reason required" : "Shared workspace"}</span>
          <button className="button button-secondary" onClick={saveWorkspace} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save changes"}</button>
          <button className="avatar" aria-label="Open McLovin profile">M</button>
        </div>
      </header>

      <div className="page-content" id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="kicker"><span className="live-dot" /> Shared decision board <span className="kicker-divider">/</span> Week {setup.week}</div>
            <h1>Pick together.<br /><span>Keep one alive.</span></h1>
            <p>One calm place for McLovin and Casual to coordinate every entry, see the tradeoffs, and make the final call before Splash&apos;s deadline.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#strategy">Review strategy <span>↓</span></a>
              <button className="text-button" onClick={() => setShowSetup((open) => !open)}>{showSetup ? "Close setup" : "Edit pool setup"} <span>↗</span></button>
            </div>
          </div>
          <div className="hero-metric-card">
            <div className="metric-label">Portfolio health</div>
            <div className="metric-value">{aliveEntries.length}<span> / {entries.length}</span></div>
            <div className="metric-caption">entries still alive</div>
            <div className="health-bar"><span style={{ width: `${Math.round((aliveEntries.length / entries.length) * 100)}%` }} /></div>
            <div className="metric-foot"><span>↑ On track</span><span>{confirmedCount} confirmed</span></div>
          </div>
        </section>

        {showSetup ? (
          <section className="setup-panel panel" aria-label="Pool setup">
            <div className="setup-panel-heading"><div><p className="eyebrow">Shared pool setup</p><h2>Keep the context current.</h2></div><button className="close-button" onClick={() => setShowSetup(false)} aria-label="Close setup">×</button></div>
            <div className="form-grid">
              {[["Pool name", "poolName"], ["Week", "week"], ["Starting pool entries", "startingPoolEntries"], ["Current live pool entries", "currentLivePoolEntries"], ["Our managed entries", "ourManagedEntries"], ["Our live entries", "ourLiveEntries"], ["Pick deadline", "deadline"]].map(([label, key]) => (
                <label className="field" key={key}><span>{label}</span><input value={setup[key as keyof typeof setup]} onChange={(event) => setSetup((current) => ({ ...current, [key]: event.target.value }))} /></label>
              ))}
              <label className="field"><span>Season outcome</span><select value={setup.outcome} onChange={(event) => setSetup((current) => ({ ...current, outcome: event.target.value as Setup["outcome"] }))}><option value="in_progress">In progress</option><option value="joint_eliminated">All joint entries eliminated</option><option value="won_or_shared">Won or shared</option><option value="season_ended">Season ended</option></select></label>
            </div>
            <div className="setup-footer"><span>Contest link remains external and manual.</span><a href="https://contests.app.splashsports.com/contest/contest_01KZW8ZKAJEKWC44RJKQKE4H9K" target="_blank" rel="noreferrer">Open Splash ↗</a></div>
          </section>
        ) : null}

        <section className="strategy-input-panel panel" aria-label="Strategy inputs">
          <div className="strategy-input-heading">
            <div><p className="eyebrow">Source-stamped inputs</p><h2>Enter or import the week&apos;s evidence.</h2><p className="section-copy">Edit the JSON directly or import a file. Pool counts, schedule probabilities, popularity, opponent assumptions, and every plan pick stay together with their source and observed-at time.</p></div>
            <div className="input-heading-actions"><span className={`model-state model-state-${modelState}`}>{strategyInput ? stateLabel(modelState) : "Illustrative demo"}</span><button className="text-button" onClick={() => setShowInputs((open) => !open)}>{showInputs ? "Hide inputs" : "Show inputs"} â†—</button></div>
          </div>
          {showInputs ? <>
            <div className="input-summary-grid">
              <div><span>Pool counts</span><strong>{strategyInput?.pool.source?.source ?? "Not supplied"}</strong><small>{strategyInput?.pool.source?.observedAt ?? "Needs source + observed-at"}</small></div>
              <div><span>Schedule and probabilities</span><strong>{strategyInput ? `${strategyInput.weeks.reduce((count, week) => count + week.games.length, 0)} games loaded` : "Illustrative only"}</strong><small>{strategyInput ? "Each game must be source-stamped" : "Not used as advice"}</small></div>
              <div><span>Popularity and field</span><strong>{strategyInput?.opponentField?.source?.source ?? "Not supplied"}</strong><small>{strategyInput ? "Optional popularity can yield Partial" : "Not used as advice"}</small></div>
              <div><span>Plan picks</span><strong>{strategyInput ? `${strategyInput.plans.length} plan${strategyInput.plans.length === 1 ? "" : "s"} loaded` : "Illustrative only"}</strong><small>{strategyInput ? "Evaluated jointly per plan" : "Not used as advice"}</small></div>
            </div>
            <label className="input-json-label"><span>Manual JSON input</span><textarea value={inputText} onChange={(event) => setInputText(event.target.value)} placeholder="Paste the source-stamped strategy JSON here, or load the blank schema below." aria-label="Manual strategy input JSON" spellCheck={false} /></label>
            <div className="input-actions"><button className="button button-primary" onClick={() => applyStrategyInputText(inputText)}>Apply manual inputs</button><label className="button button-secondary file-button">Import JSON file<input type="file" accept="application/json,.json" onChange={importStrategyFile} /></label><button className="text-button" onClick={() => setInputText(blankStrategyInputTemplate)}>Load blank schema</button><span className="input-message">{inputMessage || demoInputNotice}</span></div>
            <details className="input-help"><summary>What must be supplied?</summary><p>Use the preserved rules as the authority. Each pool, game, candidate probability/popularity value, and opponent-field model needs a source, observed-at ISO timestamp, and method. A plan must include legal picks for every live managed entry. Invalid or incomplete inputs remain Blocked; missing optional popularity remains Partial.</p><pre>{blankStrategyInputTemplate}</pre></details>
          </> : null}
        </section>

        <section className="summary-strip" aria-label="Pool summary">
          <div className="summary-item"><span className="summary-icon">◎</span><div><span className="summary-label">Pool</span><strong>{setup.poolName}</strong></div></div>
          <div className="summary-item"><span className="summary-icon">◷</span><div><span className="summary-label">Deadline</span><strong>{setup.deadline}</strong></div></div>
          <div className="summary-item"><span className="summary-icon">◌</span><div><span className="summary-label">Live field</span><strong>{setup.currentLivePoolEntries} of {setup.startingPoolEntries} entries</strong></div></div>
          <div className="summary-item"><span className="summary-icon">◌</span><div><span className="summary-label">Our live-field share</span><strong>{typeof ourLiveFieldShare === "number" ? `${Math.round(ourLiveFieldShare * 100)}%` : "Unavailable"}</strong></div></div>
          <div className="summary-item summary-note"><span className="summary-icon warning">!</span><div><span className="summary-label">Next watch</span><strong>Thursday games are eligible</strong></div></div>
        </section>

        <section className="section-block" id="entries">
          <SectionHeading eyebrow="01 · Portfolio" title="Every entry, one view." copy="Track ownership, past teams, and this week&apos;s working pick without opening a spreadsheet." action={<button className="text-button" onClick={() => setShowSetup(true)}>Pool settings ↗</button>} />
          <div className="entry-grid">
            {entries.map((entry) => (
              <article className={`entry-card ${entry.status !== "alive" ? "is-inactive" : ""}`} key={entry.id}>
                <div className="entry-card-top"><div><div className="entry-name">{entry.name}</div><div className="owner-label"><span className={`owner-avatar owner-${entry.owner.toLowerCase()}`}>{entry.owner[0]}</span>{entry.owner} owns this entry</div></div><span className={`status-pill status-${entry.status}`}>{entry.status}</span></div>
                <div className="history-label">Used by week</div>
                <div className="history-row">{entry.used.map((team, index) => <span className="history-chip" key={`${team}-${index}`}><span>W{index + 1}</span><TeamBadge team={team} muted /></span>)}{entry.status === "alive" ? <span className="history-chip history-empty"><span>Next</span><span className="team-badge-list">{entry.picks.length ? entry.picks.map((pick) => <TeamBadge team={pick} key={pick} />) : <TeamBadge team="Open" />}</span></span> : null}</div>
                {entry.status === "alive" ? <div className="entry-pick-row"><label>{requiredPicks === 1 ? "Working pick" : `${requiredPicks} distinct teams`}</label><span className="pick-select-list">{Array.from({ length: requiredPicks }, (_, pickIndex) => { const currentPick = entry.picks[pickIndex] ?? ""; const currentIssue = pickerSelectionIssue(currentPick, { usedTeams: entry.used, picks: entry.picks }, pickIndex, pickerTeamOptions, currentWeek); return <select id={`pick-${entry.id}-${pickIndex}`} key={`${entry.id}-${pickIndex}`} value={currentPick} onChange={(event) => updatePick(entry.id, pickIndex, event.target.value)} aria-label={`${entry.name} pick ${pickIndex + 1}`} aria-invalid={Boolean(currentIssue)} className={currentIssue ? "is-unresolved" : undefined}><option value="">Choose team {pickIndex + 1}</option>{pickerOptionsForEntry(pickerTeamOptions, { usedTeams: entry.used, picks: entry.picks }, pickIndex, currentWeek).map((option) => <option value={option.team} key={option.team} disabled={Boolean(option.unresolvedReason)}>{option.team}{option.unresolvedReason ? ` — ${option.unresolvedReason}` : ""}</option>)}</select> })}</span></div> : <div className="inactive-note">No further picks — keep for history.</div>}
              </article>
            ))}
          </div>
          <div className="inline-rule"><span>Rule check</span><strong>{validationIssues.length ? `${validationIssues.length} current pick issue${validationIssues.length === 1 ? "" : "s"} need attention.` : "Teams used by an entry are unavailable to that entry in future weeks."}</strong><button className="text-button" onClick={() => setShowRules((open) => !open)}>{showRules ? "Hide rules" : "View pool rules"} ↗</button></div>
          {showRules ? <div className="rules-panel panel"><div><strong>What this board enforces</strong><p>Ties count as losses. Weeks 17 and 18 require two distinct teams per surviving entry. Picks are due by 1:00 PM Sunday, and Splash remains the official record.</p></div><div><strong>What this board does not assume</strong><p>{ruleWarnings.join(" ")} Unresolved cases stay visible instead of being auto-filled.</p></div></div> : null}
        </section>

        <section className="section-block strategy-section" id="strategy">
          <SectionHeading eyebrow="02 · Weekly board" title={`Make the Week ${setup.week} call.`} copy="Candidate inputs are manual. The recommendation shows its assumptions so you can disagree intelligently." action={<span className="manual-inputs"><span className="status-dot" /> Manual inputs · replace before lock · {modelState}</span>} />
          <div className="strategy-layout">
            <div className="candidate-panel panel">
              <div className="panel-heading"><div><h3>Candidate teams</h3><p>Win probability, market context, and source status.</p></div><span className="input-badge">{visibleCandidates.length} teams</span></div>
              <div className="candidate-table" role="table" aria-label="Candidate teams">
                <div className="candidate-row candidate-header" role="row"><span>Team</span><span>Win est.</span><span>Spread</span><span>Popular</span><span>Future</span></div>
                {visibleCandidates.map((candidate) => <div className="candidate-row" role="row" key={candidate.team}><span><TeamBadge team={candidate.team} /><small>{candidate.opponent ?? candidate.record ?? "Opponent not supplied"}</small></span><strong>{candidate.winProbability === undefined ? "—" : `${candidate.winProbability.toFixed(1)}%`}</strong><span className="subtle">{candidate.spread ?? (candidate.kickoff ? new Date(candidate.kickoff).toLocaleString() : "—")}</span><span className="popularity"><span className="popularity-track"><i style={{ width: `${Math.min(100, (candidate.popularity ?? 0) * 2.1)}%` }} /></span>{candidate.popularity === undefined ? "—" : `${candidate.popularity.toFixed(1)}%`}</span><span className={`future-value future-${(candidate.futureValue ?? "not-supplied").toLowerCase().replaceAll(" ", "-")}`}>{candidate.futureValue ?? "Not supplied"}</span></div>)}
              </div>
              <div className="candidate-footnote"><span className="info-icon">i</span> {strategyInput ? "Values are read from the applied input snapshot. Popularity is optional; missing popularity is reported as Partial." : "Prototype values are illustrative. They are not sent to the simulator as advice until source-stamped inputs are applied."}</div>
            </div>

            <div className="assumptions-card panel"><div className="panel-heading"><div><h3>How the board thinks</h3><p>{strategyInput ? "Joint scenario simulation · reproducible seed" : "Illustrative demo · not a recommendation"}</p></div><span className="spark-icon">✦</span></div><div className="formula"><span className="formula-step active">Shared game outcomes</span><span>+</span><span className="formula-step">Pool field</span><span>+</span><span className="formula-step">Plan picks</span><span>−</span><span className="formula-step">Missing dependencies</span></div><p className="assumption-copy">{strategyInput ? "Each NFL game is simulated once per scenario and applied to every joint and opponent entry. The selected plan is evaluated as a portfolio, not as independent picks." : "The board is showing design-time examples only. Apply source-stamped inputs to calculate plan metrics; no live odds, popularity, results, or Splash behavior are assumed."}</p><div className="confidence-line"><span>Model state</span><strong>{stateLabel(modelState)}</strong></div><div className="confidence-track"><span style={{ width: modelState === "calculated" ? "100%" : modelState === "partial" ? "66%" : "30%" }} /></div><p className="assumption-foot">{boardSimulation.dependencyReport.issues[0]?.message ?? `${boardSimulation.simulations.toLocaleString()} reproducible scenarios completed.`}</p></div>
          </div>

          <div className="plan-heading"><div><h3>Portfolio plans</h3><p>Choose a starting point, then adjust entry-level picks above. Model state: <strong>{stateLabel(modelState)}</strong>. {strategyInput ? "Metrics are calculated from the applied source snapshot." : "Prototype metrics are explicitly illustrative until source-stamped inputs are supplied."}</p></div><span className="selected-plan">{activePlan.title} selected</span></div>
          <div className="plan-grid">{importedPlans.map((plan) => <article className={`plan-card ${plan.id === activePlan.id ? "is-selected" : ""}`} key={plan.id}><div className="plan-top"><span className={`plan-eyebrow ${plan.recommended ? "is-recommended" : ""}`}>{plan.eyebrow}</span>{plan.id === activePlan.id ? <span className="selected-check">✓</span> : null}</div><h3>{plan.title}</h3><p>{plan.description}</p><div className="plan-stats"><div><span>Any joint survive</span><strong>{plan.metrics.anyJointSurviveWeek}</strong></div><div><span>All survive</span><strong>{plan.metrics.allJointSurviveWeek}</strong></div><div><span>Expected alive</span><strong>{plan.metrics.expectedEntriesAlive}</strong></div><div><span>Any win/share</span><strong>{plan.metrics.anyWinShare}</strong></div><div><span>Prize share</span><strong>{plan.metrics.expectedPrizeShare}</strong></div><div><span>Robustness</span><strong>{plan.metrics.robustness}</strong></div></div><div className="plan-picks">{aliveEntries.map((entry) => <div key={entry.id}><span>{entry.owner[0]}{entry.id.endsWith("1") ? "1" : "2"}</span><span className="team-badge-list">{(plan.picks[entry.id] ?? []).map((team) => <TeamBadge team={team} key={team} />)}</span></div>)}</div><p className="plan-detail">Max single-game loss: {plan.metrics.maxSingleGameLoss}. Future scarcity: {plan.metrics.futureScarcityCost}.</p><button className={`button ${plan.id === activePlan.id ? "button-selected" : "button-secondary"}`} onClick={() => applyPlan(plan)}>{plan.id === activePlan.id ? "Plan on working board" : "Use this plan"}</button></article>)}</div>
          <div className="decision-panel panel"><div className="panel-heading"><div><h3>Make the human decision</h3><p>Accept the selected recommendation, or record why the final picks differ.</p></div><span className={`decision-status decision-${humanDecision.status}`}>{humanDecision.status === "pending" ? "Decision pending" : humanDecision.status === "accepted" ? "Recommendation accepted" : "Override recorded"}</span></div><div className="decision-summary"><span>Recommendation: <strong>{activePlan.title}</strong></span><span>Final picks: <strong>{recommendationMatchesFinal ? "match recommendation" : "edited"}</strong></span></div><div className="decision-actions"><button className="button button-primary" onClick={acceptRecommendation}>Accept recommendation</button><button className="button button-secondary" onClick={recordOverride} disabled={!decisionReason.trim()}>Record override</button></div><label className="decision-reason"><span>Override reason {humanDecision.status === "overridden" ? "(saved)" : "(required to override)"}</span><textarea maxLength={280} value={decisionReason} onChange={(event) => { setDecisionReason(event.target.value); if (humanDecision.status === "overridden") setHumanDecision({ status: "pending" }); }} placeholder="For example: We prefer more diversification because the selected favorite is already heavily used by the field." aria-label="Override reason" /></label><p className="decision-save-note">Save changes after recording the decision. The recommendation, final picks, and human decision are archived separately.</p></div>
        </section>

        <section className="section-block checklist-section" id="checklist">
          <SectionHeading eyebrow="03 · Submission" title="Finish together." copy="A clear handoff by owner. Confirm only after the pick is submitted on Splash." action={<span className={`unresolved-count ${unresolved.length ? "has-unresolved" : ""}`}>{unresolved.length} unresolved</span>} />
          <div className="checklist-layout"><div className="owner-columns">{(["McLovin", "Casual"] as Owner[]).map((owner) => <div className="owner-column panel" key={owner}><div className="owner-column-heading"><div><span className={`owner-avatar owner-${owner.toLowerCase()}`}>{owner[0]}</span><h3>{owner}</h3></div><span>{byOwner[owner].filter((entry) => entry.confirmed && (entryIssues.get(entry.id)?.length ?? 0) === 0).length} / {byOwner[owner].length} confirmed</span></div>{byOwner[owner].map((entry) => { const entryResolved = entry.confirmed && (entryIssues.get(entry.id)?.length ?? 0) === 0; return <label className={`check-row ${entryResolved ? "is-confirmed" : ""}`} key={entry.id}><input type="checkbox" checked={entry.confirmed} onChange={() => toggleConfirmation(entry.id)} /><span className="custom-check">✓</span><span className="check-copy"><strong>{entry.name}</strong><span>{entry.picks.length ? <><PickList picks={entry.picks} /> · submit on Splash</> : "Choose a pick first"}</span></span><span className={`check-state ${entryResolved ? "done" : "pending"}`}>{entryResolved ? "Confirmed" : "Pending"}</span></label>; })}</div>)}</div><div className="notes-card panel"><div className="panel-heading"><div><h3>Partner notes</h3><p>Leave the reasoning where both partners can see it.</p></div><span className="note-count">{notes.length}/280</span></div><textarea maxLength={280} value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Partner notes" /><div className="notes-footer"><span>Shared note · save to sync</span><button className="text-button" onClick={saveWorkspace}>Save note ↗</button></div></div></div>
          <div className="splash-reminder"><span className="warning-ring">!</span><div><strong>Splash is the official record.</strong><span>This tool never submits picks. Each owner must submit and confirm their own entries before {setup.deadline}.</span></div><a href="https://contests.app.splashsports.com/contest/contest_01KZW8ZKAJEKWC44RJKQKE4H9K" target="_blank" rel="noreferrer" className="button button-dark">Open Splash ↗</a></div>
        </section>

        <section className="history-section section-block"><SectionHeading eyebrow="04 · History" title="A small audit trail." copy="Enough context to understand what changed after the season moves on." /><div className="history-panel panel"><div className="history-log">{activity.map((item, index) => <div className="activity-row" key={`${item}-${index}`}><span className="activity-dot" /><span>{item}</span><time>{index === 0 ? "just now" : `${index}h ago`}</time></div>)}</div><div className="history-summary"><span>Week {setup.week} working board</span><strong>{confirmedCount} of {aliveEntries.length} picks confirmed</strong><span>Manual inputs only</span></div></div></section>

        <footer className="footer"><span>Survivor Pool Strategizer</span><span>Built for two partners · decisions stay human</span><span>Private workspace</span></footer>
      </div>
    </main>
  );
}
