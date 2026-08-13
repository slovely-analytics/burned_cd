"use client";

import { useEffect, useMemo, useState } from "react";

type Owner = "McLovin" | "Casual";
type EntryStatus = "alive" | "eliminated" | "inactive";

type Entry = {
  id: string;
  name: string;
  owner: Owner;
  status: EntryStatus;
  used: string[];
  pick: string;
  confirmed: boolean;
};

type Candidate = {
  team: string;
  record: string;
  spread: string;
  winProbability: number;
  popularity: number;
  futureValue: "High" | "Medium" | "Low";
  rationale: string;
};

type Plan = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  survival: string;
  exposure: string;
  future: string;
  picks: Record<string, string>;
  recommended?: boolean;
};

type Setup = {
  poolName: string;
  week: string;
  surviving: string;
  poolSize: string;
  deadline: string;
};

type SavedWorkspace = {
  entries?: Entry[];
  selectedPlan?: string;
  notes?: string;
  setup?: Setup;
  activity?: string[];
};

const initialSetup: Setup = { poolName: "Last Survivor · 2026", week: "4", surviving: "4", poolSize: "12", deadline: "Sunday at 1:00 PM" };

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
  { id: "mclovin-1", name: "McLovin · Main", owner: "McLovin", status: "alive", used: ["Ravens", "Packers", "Dolphins"], pick: "Bills", confirmed: false },
  { id: "mclovin-2", name: "McLovin · Hedge", owner: "McLovin", status: "alive", used: ["Lions", "Eagles"], pick: "Chiefs", confirmed: false },
  { id: "casual-1", name: "Casual · Main", owner: "Casual", status: "alive", used: ["Bills", "49ers", "Chiefs"], pick: "49ers", confirmed: false },
  { id: "casual-2", name: "Casual · Longshot", owner: "Casual", status: "alive", used: ["Dolphins"], pick: "Eagles", confirmed: false },
  { id: "mclovin-3", name: "McLovin · Eliminated", owner: "McLovin", status: "eliminated", used: ["Bills", "Chiefs"], pick: "", confirmed: false },
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
    survival: "31.4%",
    exposure: "4 unique teams",
    future: "Preserves Chiefs for later",
    recommended: true,
    picks: { "mclovin-1": "Bills", "mclovin-2": "Chiefs", "casual-1": "49ers", "casual-2": "Eagles" },
  },
  {
    id: "anchor",
    eyebrow: "Alternative A",
    title: "Anchor on the favorite",
    description: "Prioritize this week's highest estimate across the portfolio. Easier to explain, more correlated if it misses.",
    survival: "39.8%",
    exposure: "2 unique teams",
    future: "Spends Chiefs now",
    picks: { "mclovin-1": "Bills", "mclovin-2": "Chiefs", "casual-1": "Bills", "casual-2": "Chiefs" },
  },
  {
    id: "quiet",
    eyebrow: "Alternative B",
    title: "Quiet portfolio",
    description: "Lean into lower-popularity options to improve the share of the pool if the chalk breaks against the field.",
    survival: "26.6%",
    exposure: "4 unique teams",
    future: "Preserves Chiefs",
    picks: { "mclovin-1": "Bills", "mclovin-2": "49ers", "casual-1": "Eagles", "casual-2": "Ravens" },
  },
];

const initialNotes = "Protect the portfolio first. If we keep four live entries, revisit Chiefs and Eagles before spending another premium team.";

function TeamBadge({ team, muted = false }: { team: string; muted?: boolean }) {
  return (
    <span className={`team-badge ${muted ? "is-muted" : ""}`}>
      <span className="team-dot" style={{ backgroundColor: teamColors[team] ?? "#64748b" }} />
      {team}
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

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [selectedPlan, setSelectedPlan] = useState("recommended");
  const [notes, setNotes] = useState(initialNotes);
  const [showSetup, setShowSetup] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
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
        if (workspace.entries) setEntries(workspace.entries as Entry[]);
        if (workspace.selectedPlan) setSelectedPlan(workspace.selectedPlan);
        if (workspace.notes) setNotes(workspace.notes);
        if (workspace.setup) setSetup(workspace.setup);
        if (workspace.activity) setActivity(workspace.activity);
        setSaveStatus("saved");
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("error");
      });
    return () => { cancelled = true; };
  }, []);

  const aliveEntries = useMemo(() => entries.filter((entry) => entry.status === "alive"), [entries]);
  const unresolved = aliveEntries.filter((entry) => !entry.pick || !entry.confirmed);
  const confirmedCount = aliveEntries.filter((entry) => entry.confirmed).length;
  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[0];
  const byOwner = useMemo(() => ({ McLovin: aliveEntries.filter((entry) => entry.owner === "McLovin"), Casual: aliveEntries.filter((entry) => entry.owner === "Casual") }), [aliveEntries]);

  async function saveWorkspace() {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace: { entries, selectedPlan, notes, setup, activity } }),
      });
      if (!response.ok) throw new Error("Workspace could not be saved");
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  function applyPlan(plan: Plan) {
    setSelectedPlan(plan.id);
    setEntries((current) => current.map((entry) => plan.picks[entry.id] ? { ...entry, pick: plan.picks[entry.id], confirmed: false } : entry));
    setActivity((current) => [`${plan.title} applied to the working board.`, ...current].slice(0, 5));
  }

  function updatePick(entryId: string, pick: string) {
    setEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, pick, confirmed: false } : entry));
    setActivity((current) => [`Pick changed for ${entries.find((entry) => entry.id === entryId)?.name ?? "entry"}.`, ...current].slice(0, 5));
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
          <span className="saved-state"><span className={`status-dot ${saveStatus === "error" ? "is-error" : ""}`} /> {saveStatus === "loading" ? "Loading shared workspace" : saveStatus === "saving" ? "Saving shared workspace" : saveStatus === "error" ? "Shared save unavailable" : "Shared workspace"}</span>
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
              {[["Pool name", "poolName"], ["Week", "week"], ["Surviving entries", "surviving"], ["Pool size", "poolSize"], ["Pick deadline", "deadline"]].map(([label, key]) => (
                <label className="field" key={key}><span>{label}</span><input value={setup[key as keyof typeof setup]} onChange={(event) => setSetup((current) => ({ ...current, [key]: event.target.value }))} /></label>
              ))}
            </div>
            <div className="setup-footer"><span>Contest link remains external and manual.</span><a href="https://contests.app.splashsports.com/contest/contest_01KZW8ZKAJEKWC44RJKQKE4H9K" target="_blank" rel="noreferrer">Open Splash ↗</a></div>
          </section>
        ) : null}

        <section className="summary-strip" aria-label="Pool summary">
          <div className="summary-item"><span className="summary-icon">◎</span><div><span className="summary-label">Pool</span><strong>{setup.poolName}</strong></div></div>
          <div className="summary-item"><span className="summary-icon">◷</span><div><span className="summary-label">Deadline</span><strong>{setup.deadline}</strong></div></div>
          <div className="summary-item"><span className="summary-icon">◌</span><div><span className="summary-label">Pool status</span><strong>{setup.surviving} of {setup.poolSize} survive</strong></div></div>
          <div className="summary-item summary-note"><span className="summary-icon warning">!</span><div><span className="summary-label">Next watch</span><strong>Thursday games are eligible</strong></div></div>
        </section>

        <section className="section-block" id="entries">
          <SectionHeading eyebrow="01 · Portfolio" title="Every entry, one view." copy="Track ownership, past teams, and this week&apos;s working pick without opening a spreadsheet." action={<button className="text-button" onClick={() => setShowSetup(true)}>Pool settings ↗</button>} />
          <div className="entry-grid">
            {entries.map((entry) => (
              <article className={`entry-card ${entry.status !== "alive" ? "is-inactive" : ""}`} key={entry.id}>
                <div className="entry-card-top"><div><div className="entry-name">{entry.name}</div><div className="owner-label"><span className={`owner-avatar owner-${entry.owner.toLowerCase()}`}>{entry.owner[0]}</span>{entry.owner} owns this entry</div></div><span className={`status-pill status-${entry.status}`}>{entry.status}</span></div>
                <div className="history-label">Used by week</div>
                <div className="history-row">{entry.used.map((team, index) => <span className="history-chip" key={`${team}-${index}`}><span>W{index + 1}</span><TeamBadge team={team} muted /></span>)}{entry.status === "alive" ? <span className="history-chip history-empty"><span>Next</span><TeamBadge team={entry.pick || "Open"} /></span> : null}</div>
                {entry.status === "alive" ? <div className="entry-pick-row"><label htmlFor={`pick-${entry.id}`}>Working pick</label><select id={`pick-${entry.id}`} value={entry.pick} onChange={(event) => updatePick(entry.id, event.target.value)}><option value="">Choose a team</option>{teams.filter((team) => !entry.used.includes(team)).map((team) => <option value={team} key={team}>{team}</option>)}</select></div> : <div className="inactive-note">No further picks — keep for history.</div>}
              </article>
            ))}
          </div>
          <div className="inline-rule"><span>Rule check</span><strong>Teams used by an entry are unavailable to that entry in future weeks.</strong><button className="text-button" onClick={() => setShowRules((open) => !open)}>{showRules ? "Hide rules" : "View pool rules"} ↗</button></div>
          {showRules ? <div className="rules-panel panel"><div><strong>What this board enforces</strong><p>Ties count as losses. Weeks 17 and 18 require two winning picks per surviving entry. Picks are due by 1:00 PM Sunday, and Splash remains the official record.</p></div><div><strong>What this board does not assume</strong><p>Missing-pick defaults and postponed-game replacements are not guaranteed, so unresolved cases stay visible instead of being auto-filled.</p></div></div> : null}
        </section>

        <section className="section-block strategy-section" id="strategy">
          <SectionHeading eyebrow="02 · Weekly board" title={`Make the Week ${setup.week} call.`} copy="Candidate inputs are manual. The recommendation shows its assumptions so you can disagree intelligently." action={<span className="manual-inputs"><span className="status-dot" /> Manual inputs · replace before lock</span>} />
          <div className="strategy-layout">
            <div className="candidate-panel panel">
              <div className="panel-heading"><div><h3>Candidate teams</h3><p>Win estimate, market context, and future value.</p></div><span className="input-badge">5 teams</span></div>
              <div className="candidate-table" role="table" aria-label="Candidate teams">
                <div className="candidate-row candidate-header" role="row"><span>Team</span><span>Win est.</span><span>Spread</span><span>Popular</span><span>Future</span></div>
                {candidates.map((candidate) => <div className="candidate-row" role="row" key={candidate.team}><span><TeamBadge team={candidate.team} /><small>{candidate.record}</small></span><strong>{candidate.winProbability}%</strong><span className="subtle">{candidate.spread}</span><span className="popularity"><span className="popularity-track"><i style={{ width: `${candidate.popularity * 2.1}%` }} /></span>{candidate.popularity}%</span><span className={`future-value future-${candidate.futureValue.toLowerCase()}`}>{candidate.futureValue}</span></div>)}
              </div>
              <div className="candidate-footnote"><span className="info-icon">i</span> Popularity is optional context, not a prediction. Lower popularity can improve our share if a team wins.</div>
            </div>

            <div className="assumptions-card panel"><div className="panel-heading"><div><h3>How the board thinks</h3><p>Transparent heuristic · not a guarantee.</p></div><span className="spark-icon">✦</span></div><div className="formula"><span className="formula-step active">Win probability</span><span>+</span><span className="formula-step">Future value</span><span>+</span><span className="formula-step">Diversification</span><span>−</span><span className="formula-step">Correlation risk</span></div><p className="assumption-copy">The recommended plan gives up some single-week survival probability to avoid one shared upset taking every live entry out at once. It preserves the Chiefs as a later premium option and uses the 49ers as a lower-popularity hedge.</p><div className="confidence-line"><span>Recommendation confidence</span><strong>Medium</strong></div><div className="confidence-track"><span style={{ width: "62%" }} /></div><p className="assumption-foot">Confidence drops when odds, popularity, or the pool survivor count are stale.</p></div>
          </div>

          <div className="plan-heading"><div><h3>Portfolio plans</h3><p>Choose a starting point, then adjust entry-level picks above.</p></div><span className="selected-plan">{activePlan.title} selected</span></div>
          <div className="plan-grid">{plans.map((plan) => <article className={`plan-card ${plan.id === selectedPlan ? "is-selected" : ""}`} key={plan.id}><div className="plan-top"><span className={`plan-eyebrow ${plan.recommended ? "is-recommended" : ""}`}>{plan.eyebrow}</span>{plan.id === selectedPlan ? <span className="selected-check">✓</span> : null}</div><h3>{plan.title}</h3><p>{plan.description}</p><div className="plan-stats"><div><span>Est. survive</span><strong>{plan.survival}</strong></div><div><span>Exposure</span><strong>{plan.exposure}</strong></div><div><span>Future value</span><strong>{plan.future}</strong></div></div><div className="plan-picks">{aliveEntries.map((entry) => <div key={entry.id}><span>{entry.owner[0]}{entry.id.endsWith("1") ? "1" : "2"}</span><TeamBadge team={plan.picks[entry.id]} /></div>)}</div><button className={`button ${plan.id === selectedPlan ? "button-selected" : "button-secondary"}`} onClick={() => applyPlan(plan)}>{plan.id === selectedPlan ? "Plan on working board" : "Use this plan"}</button></article>)}</div>
        </section>

        <section className="section-block checklist-section" id="checklist">
          <SectionHeading eyebrow="03 · Submission" title="Finish together." copy="A clear handoff by owner. Confirm only after the pick is submitted on Splash." action={<span className={`unresolved-count ${unresolved.length ? "has-unresolved" : ""}`}>{unresolved.length} unresolved</span>} />
          <div className="checklist-layout"><div className="owner-columns">{(["McLovin", "Casual"] as Owner[]).map((owner) => <div className="owner-column panel" key={owner}><div className="owner-column-heading"><div><span className={`owner-avatar owner-${owner.toLowerCase()}`}>{owner[0]}</span><h3>{owner}</h3></div><span>{byOwner[owner].filter((entry) => entry.confirmed).length} / {byOwner[owner].length} confirmed</span></div>{byOwner[owner].map((entry) => <label className={`check-row ${entry.confirmed ? "is-confirmed" : ""}`} key={entry.id}><input type="checkbox" checked={entry.confirmed} onChange={() => toggleConfirmation(entry.id)} /><span className="custom-check">✓</span><span className="check-copy"><strong>{entry.name}</strong><span>{entry.pick ? <><TeamBadge team={entry.pick} /> · submit on Splash</> : "Choose a pick first"}</span></span><span className={`check-state ${entry.confirmed ? "done" : "pending"}`}>{entry.confirmed ? "Confirmed" : "Pending"}</span></label>)}</div>)}</div><div className="notes-card panel"><div className="panel-heading"><div><h3>Partner notes</h3><p>Leave the reasoning where both partners can see it.</p></div><span className="note-count">{notes.length}/280</span></div><textarea maxLength={280} value={notes} onChange={(event) => setNotes(event.target.value)} aria-label="Partner notes" /><div className="notes-footer"><span>Shared note · save to sync</span><button className="text-button" onClick={saveWorkspace}>Save note ↗</button></div></div></div>
          <div className="splash-reminder"><span className="warning-ring">!</span><div><strong>Splash is the official record.</strong><span>This tool never submits picks. Each owner must submit and confirm their own entries before {setup.deadline}.</span></div><a href="https://contests.app.splashsports.com/contest/contest_01KZW8ZKAJEKWC44RJKQKE4H9K" target="_blank" rel="noreferrer" className="button button-dark">Open Splash ↗</a></div>
        </section>

        <section className="history-section section-block"><SectionHeading eyebrow="04 · History" title="A small audit trail." copy="Enough context to understand what changed after the season moves on." /><div className="history-panel panel"><div className="history-log">{activity.map((item, index) => <div className="activity-row" key={`${item}-${index}`}><span className="activity-dot" /><span>{item}</span><time>{index === 0 ? "just now" : `${index}h ago`}</time></div>)}</div><div className="history-summary"><span>Week {setup.week} working board</span><strong>{confirmedCount} of {aliveEntries.length} picks confirmed</strong><span>Manual inputs only</span></div></div></section>

        <footer className="footer"><span>Survivor Pool Strategizer</span><span>Built for two partners · decisions stay human</span><span>Private workspace</span></footer>
      </div>
    </main>
  );
}
