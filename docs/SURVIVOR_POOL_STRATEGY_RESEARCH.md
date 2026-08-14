# NFL Survivor Pool Strategy: Research and Optimization Guide

**Status:** Technical research reference for future product and recommendation-model work  
**Research date:** August 13, 2026  
**Primary decision:** How should a two-partner, multi-entry survivor portfolio choose weekly picks to maximize the probability that at least one jointly managed entry wins or shares the pool?

## Technical summary

The tool should optimize the contest outcome, not merely the next pick. The safest team this week maximizes only one-step survival. A pool-winning strategy must jointly account for (1) calibrated win probability, (2) the opportunity cost of consuming a team that may be more valuable later, (3) opponent pick popularity and team availability, (4) the dependence created by assigning the same game to multiple entries, (5) pool size and the actual number and identity of survivors, and (6) rule and deadline risk. This synthesis matches the three-factor framework used by [SurvivorGrid](https://www.survivorgrid.com/strategy) and [PoolGenius](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/holy-trinity-survivor-pick-strategy-data/), while extending it to the jointly managed portfolio objective in this project.

The recommended engine is a **rolling-horizon, opponent-aware Monte Carlo optimizer**. Each week it should simulate NFL outcomes, opponent choices, pool termination, future team availability, and all jointly managed entries under the same scenario. It should rank whole portfolio plans by the probability of a joint win or share and expected prize share, while exposing current-week survival and concentration risk as separate diagnostics. Bergman and Imbrogno's peer-reviewed survivor-pool research found that partial-season planning produced the highest survival probabilities among the tested models and dominated millions of random strategies; that supports re-optimization with a bounded horizon rather than trusting one preseason path for all 18 weeks ([Operations Research, 2017](https://doi.org/10.1287/opre.2017.1633)).

Until that simulator is validated, the product should use a transparent heuristic, show credible alternatives, label illustrative values as such, and never present an unexplained scalar score as a probability. The current prototype's `Est. survive` field is not decision-safe because it does not say whether it means at least one entry survives, every entry survives, or some other event.

No source establishes a guaranteed edge, and no historical backtest was performed for this document. Industry sites supply valuable strategy explanations but also sell survivor products, so their proprietary performance claims are not treated as independent validation. Recommendations below are a synthesis of contest mathematics, peer-reviewed optimization work, market-probability research, and the project's actual rules.

## Product operating contract

This research supports a decision-advisor platform. The partners supply or confirm the dependencies; the platform validates the inputs, performs the portfolio math, recommends a plan, explains the alternatives and uncertainty, and records the human decision. Manual inputs are an acceptable data-collection method, not a reason to leave the strategy calculation to the partners.

The advisor must distinguish four states:

- **Calculated:** required inputs are present, valid, source-stamped, and the selected model produced the metrics.
- **Partial:** some optional inputs are missing, so the result is calculated with widened uncertainty and clearly named limitations.
- **Blocked:** a required rule or dependency is missing, stale, or invalid, so the platform cannot responsibly produce a recommendation.
- **Illustrative:** demo values are being shown for product/design purposes and must never be presented as current advice.

Partners may accept, edit, or override a recommendation. The original recommendation, override reason, final picks, Splash confirmation, and eventual outcome are separate evidence records. An override is not a model failure by itself; it is an observable human decision that should be available for later retrospective analysis.

## 1. Scope and rule-specific objective

This guide applies to the private pool described in [the preserved contest rules](../source/context/NFL%20Survivor%20Pool%20rules.md): one team normally must win each week; a team cannot be reused by the same entry; ties lose; Weeks 17 and 18 require two winning picks; picks are due by 1:00 PM Sunday even for later games; Thursday games are eligible; and multiple survivors split the prize at the end of the regular season. Splash is the official record.

These local rules override generic advice. In particular:

- A tie is a failure, so `P(survive)` is `P(win)`, not `P(not lose)`.
- A Week 17 or 18 entry survives only if both required picks win. Those weeks consume two unused teams and create late-season team scarcity.
- The Sunday deadline prevents waiting for all late-game information. A Thursday pick has an earlier practical lock time.
- The preserved rules do not conclusively define every missing-pick, postponed-game, or zero-survivor settlement case. The optimizer must not invent those rules; unresolved cases should remain explicit configuration and operational warnings.
- Up to 25 entries are permitted per participant, but this product initially coordinates the partners' actual entries rather than assuming the maximum.

### 1.1 The primary and secondary objectives

Let `K_ours(ω)` be the number of jointly managed entries receiving a terminal prize share in simulated scenario `ω`, and `K_all(ω)` the total number of prize-sharing entries. The project brief's primary objective is:

`P(K_ours > 0)` — the probability that at least one jointly managed entry wins or shares.

The most useful financial secondary objective is:

`E[K_ours / K_all]` — expected fraction of the prize pool, with rule-specific handling for scenarios in which a pool reverts to the prior round or otherwise settles after all live entries lose.

These are not interchangeable. A plan could slightly improve the chance of any prize while reducing expected share by creating more duplicate joint survivors in crowded outcomes. The recommendation should therefore display both and either:

1. rank by `P(any joint win/share)` with expected prize share as the tie-breaker, matching the current product goal; or
2. allow an explicit objective setting after the partners decide whether probability of any return or expected dollars is primary.

Do not silently blend the two into an arbitrary score.

## 2. Core findings

### 2.1 The safest weekly pick is a benchmark, not the answer

Picking the highest win-probability team maximizes the chance of reaching next week, but it ignores the contest's competitive and sequential structure. SurvivorGrid illustrates that a slightly less safe, much less popular team can improve the chance of outlasting the field, and defines current-week expected value from win probability and pick percentage ([strategy guide](https://www.survivorgrid.com/strategy)). PoolGenius similarly defines weekly EV as expected pot share across possible game outcomes rather than simple survival ([EV explainer](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/expected-value-survivor-pool-picks/)).

Implication for the tool: always calculate a `highest-win-probability` benchmark, but recommend it only when its safety compensates for popularity and future opportunity cost.

### 2.2 Popularity is valuable only when connected to outcomes and the actual pool

Low popularity is not automatically good. The value of contrarianism depends on the probability the popular teams lose, which opponents choose them, which alternatives those opponents have left, and how many entries survive each joint game-outcome scenario. PoolGenius's worked examples show that a change in one game's win probability can change the EV of teams in other games because the surviving field changes; it also shows that one's own pick materially changes EV when only a few entries remain ([EV explainer](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/expected-value-survivor-pool-picks/)).

Implication: do not rank teams using a shortcut such as `win probability / popularity`. Enumerate or simulate the slate and model jointly managed picks as part of the field.

### 2.3 Future value is opportunity cost, not a permanent team grade

A team's future value depends on its future opponents, the quality of alternatives in those same weeks, pool survival into those weeks, the entry's already-used teams, rule variants, and forecast uncertainty. PoolGenius describes future value as future weekly value weighted by the probability the pool reaches each week and discounted as uncertainty increases ([future-value guide](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/future-value-survivor-pool-picks/)). SurvivorGrid likewise makes the expected pool ending week part of the save-or-use decision ([strategy guide](https://www.survivorgrid.com/strategy)).

The clean model definition is **marginal continuation value**:

`FV(entry, team, week) = optimal continuation value with team available - optimal continuation value after team is consumed now`.

That value is entry-specific and changes every week. A fixed `High / Medium / Low` team label is acceptable only as explanatory UI derived from the model; it must not be the model input.

### 2.4 Plan far enough to preserve options, but re-plan every week

For a fixed path with conditional weekly win probabilities `p1 ... pH`, its survival-through-horizon probability is:

`P(survive H picks) = product(pj), j = 1 ... H`.

Adding probabilities is wrong. Subvertadown correctly emphasizes the product and demonstrates that path order changes expected longevity even when a set of probabilities is unchanged ([strategy article](https://subvertadown.com/article/survivor-pool-strategy)). Expected number of additional picks survived is:

`E[L] = sum(product(pj), j = 1 ... k), k = 1 ... H`.

Expected longevity is a useful diagnostic, not the final contest objective, because it omits opponent behavior and prize sharing. It nevertheless gives early survival appropriate weight and is a credible benchmark.

Far-future schedules are uncertain. A preseason Week 14 favorite may no longer be strong after injuries or changes in team quality. Bergman and Imbrogno's result in favor of partial planning and the industry guidance to discount distant weeks point in the same direction ([Operations Research](https://doi.org/10.1287/opre.2017.1633); [PoolGenius future-value guide](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/future-value-survivor-pool-picks/)). Use a tested rolling horizon plus a terminal scarcity value, not a rigid full-season route.

### 2.5 Diversification is valuable, but maximum diversification is usually wasteful

If two entries use the same team, their results on that pick are perfectly correlated. Splitting entries across credible alternatives can prevent one upset from eliminating the entire joint portfolio. But adding successively weaker teams reduces expected entries alive and often expected prize share. In PoolGenius's four-entry example, moving from one team to two reduced total-elimination risk from 10% to 2%; further spreading to three and four teams produced much smaller reductions while lowering the chance all four survived ([multi-entry guide](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/playing-multiple-entries-strategy/)). Those figures are illustrative, not universal.

The correct choice is **controlled concentration**: concentrate on a small number of high-value teams, adding a second or occasionally third route only when the reduction in catastrophic portfolio loss is worth its lower safety, current EV, or future value. The allocation must be recalculated weekly; a fixed rule such as “always split” or “always stack the favorite” is indefensible.

This connects to multi-entry optimization in other top-heavy sports pools. Recent March Madness research finds that evaluating the best outcome across multiple entries is computationally difficult, sensitive to win-probability inputs, and suited to dynamic programming, heuristics, and robustness checks rather than naive independent-entry optimization ([Decary et al., *The Madness of Multiple Entries in March Madness*](https://arxiv.org/abs/2407.13438)). Survivor entries have a different structure, but the transferable lesson is that a portfolio must be optimized jointly against the payout function.

### 2.6 Pool state determines how much safety, leverage, and future matter

Pool size is not a preseason constant. The relevant state is the actual count and identity of live opponents, their remaining teams, the jointly managed entries' share of the live field, and the probability the pool reaches later weeks. PoolGenius argues that small pools tend to end earlier, making far-future team value less important, while actual early survivor results can move the expected ending week sharply ([pool-size guide](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/why-pool-size-should-influence-nfl-survivor-picks/)).

Near the endgame, generic public popularity becomes a poor substitute for opponent-specific analysis. If histories are visible, the tool should model each opponent's eligible teams and tendencies. If they are unavailable, it should widen uncertainty rather than create false precision.

### 2.7 Weeks 17 and 18 need explicit scarcity and motivation modeling

The local pool requires two winners in each of the last two weeks, which turns two nominal weeks into four team consumptions. The optimizer should reserve enough plausible teams and enforce two distinct legal picks for every entry that may reach those weeks. It must also raise forecast uncertainty around teams that may rest starters or have unusual playoff incentives. Historical research on NFL line movement notes a Week 17 peak commonly associated with playoff qualification and resting decisions, though it did not find a consistent exploitable betting pattern ([Szalkowski and Nelson, 2012](https://arxiv.org/abs/1211.4000)). The takeaway is operational uncertainty, not a deterministic fade or follow rule.

## 3. Probability and data methodology

### 3.1 Use market-implied probability as the baseline

For the current week, the most defensible default is a consensus, de-vigged moneyline probability captured as late as operationally safe. Public betting markets rapidly incorporate injuries, weather, lineup news, and other information; SurvivorGrid therefore treats market-based win probability as the container for those factors rather than separately double-counting them ([strategy guide](https://www.survivorgrid.com/strategy)).

For American moneylines, convert each side to raw implied probability:

- negative odds `-A`: `q = A / (A + 100)`
- positive odds `+B`: `q = 100 / (B + 100)`

Because both raw probabilities usually sum above 1, remove the bookmaker margin. Proportional normalization, `p_i = q_i / sum(q)`, is a transparent baseline. It is not the only defensible method: Berkowitz, Depken, and Gandar show that common moneyline conversion methods reduce to three distinct estimates and that one can be biased for heavy favorites, so method choice and favorite-longshot sensitivity should be documented ([Journal of Sports Economics, 2018](https://doi.org/10.1177/1527002517696957)).

Recommended implementation:

1. store both sides of the market and source timestamp;
2. compute proportional de-vig as the baseline;
3. optionally compare a power or favorite-longshot-adjusted method;
4. flag a candidate when its recommendation changes across reasonable de-vig methods.

### 3.2 If only point spreads are available, fit and calibrate a bounded model

A simple historical approximation for modest NFL spreads is roughly `0.50 + 0.03 * favorite spread`, but it fails at large spreads because it can exceed 100%. Huggins, Bailey, and Guardiola demonstrate why a logistic curve is preferable for the full range and why sparse historical bins can appear to imply certainty ([INFORMS Transactions on Education, 2020](https://doi.org/10.1287/ited.2019.0230ca)). Older NFL data also support a normal-CDF mapping from spread to straight-up win probability, but the parameters must not be assumed current ([Szalkowski and Nelson, 2012](https://arxiv.org/abs/1211.4000)).

If the product must estimate from spreads:

- Fit on historical NFL games using season-based or rolling time splits, never random leakage across time.
- Consider spread, total, home/away/neutral status, and only features known at the snapshot time.
- Bound predictions in `(0, 1)` with logistic, probit, or another calibrated probabilistic model.
- Recalibrate on held-out seasons and refresh the mapping as scoring environment and market behavior change.
- Prefer consensus moneylines when reliable because they directly price straight-up outcomes.

### 3.3 Judge forecasts by calibration and proper scoring rules, not pick accuracy

The optimizer needs probabilities, not just a winner label. A model that calls every 55% favorite correctly more often than not can still be badly overconfident and damage portfolio decisions.

Maintain out-of-sample weekly reports for:

- Brier score;
- log loss;
- calibration intercept and slope;
- reliability bins with sample counts and confidence intervals;
- performance by probability band, week range, market source, and forecast lead time;
- difference from a de-vigged consensus-market baseline.

Do not promote an internal model merely because it picks more winners in a small sample. Blend it with or shrink it toward the market until it demonstrates stable out-of-sample calibration. Store the exact model/version and observed-at time used for every recommendation.

### 3.4 Forecast future weeks as distributions, not point estimates

Current-week markets are observable; future-week win probabilities usually are not. Generate future scenarios from team-strength ratings, schedule, home field, rest, and uncertainty rather than treating projected spreads as facts. Uncertainty should widen with lead time.

A practical approach is:

1. estimate team strengths with a market-anchored rating;
2. simulate future point spreads and win probabilities with parameter and injury/availability uncertainty;
3. discount continuation values by both probability the pool reaches the week and forecast uncertainty;
4. re-run after each week's results and material news.

Preseason futures or season-win markets may inform priors, but they should not be converted into precise weekly matchup probabilities without a validated model.

### 3.5 Estimate popularity conditionally

Popularity should be a distribution over picks, conditioned on:

- the pool's hosting platform and participant behavior;
- current win odds and obvious favorites;
- each entry's used-team history and therefore eligibility;
- pool size and stage;
- rules such as two-pick weeks;
- observed public pick percentages from more than one source when available;
- the jointly managed entries' own picks.

For a large pool with unknown histories, sample opponent pick shares from an uncertainty distribution around blended public estimates. For a small pool, model named opponents individually. A Dirichlet-multinomial or another overdispersed model is safer than assuming every opponent independently draws from one exact percentage vector, because pool-specific behavior can be clustered.

## 4. The optimization model

### 4.1 State

At decision time `t`, the state must contain:

- contest rules and unresolved rule assumptions;
- current week, deadline, eligible games, and postponed/cancelled status;
- all jointly managed entries, owner, alive status, and used teams;
- live opponent count and, when available, opponent histories;
- starting pool entry count, current live-entry count, jointly managed starting entries, jointly managed live entries, and the resulting share of the live field;
- current and future win-probability distributions with source and time;
- current and future popularity distributions;
- prize pool and settlement rule if expected dollars are calculated;
- locked or already-started picks;
- data-quality and freshness flags.

The used-team set belongs to each entry, not to the joint portfolio. Two joint entries may use the same team if both remain individually eligible.

### 4.2 Legal action constraints

For every entry and week:

- choose exactly the configured number of teams if the entry is alive;
- choose no team already used by that entry;
- choose only a team playing an eligible game before the rule deadline;
- in a two-pick week, choose two distinct legal teams and enforce any contest-specific same-game restriction once verified;
- treat ties as losses;
- respect already locked picks and game start times;
- never auto-fill a missing or postponed-game replacement unless the exact Splash rule is confirmed and configured.

### 4.3 Scenario simulation preserves dependence

One Monte Carlo scenario should draw every game result once and apply it to every joint and opponent entry. This automatically makes entries on the same team perfectly correlated and teams on opposite sides of one game mutually exclusive. Do not calculate joint-portfolio survival by multiplying entry probabilities when entries share outcomes.

Within scenario `ω`:

1. draw game outcomes from calibrated probabilities, including ties as a separate losing outcome if modeled;
2. draw opponent picks conditional on eligibility and the scenario's popularity parameters;
3. apply each entry's current picks and eliminate failures;
4. update used-team histories for survivors;
5. continue through the rolling horizon using the policy under evaluation;
6. apply pool termination and prize-sharing rules;
7. record joint and field outcomes.

At minimum record:

- `P(at least one joint entry survives this week)`;
- `P(all joint entries survive this week)`;
- expected number of joint entries alive next week;
- probability distribution of joint entries alive;
- `P(at least one joint entry wins or shares)`;
- expected prize share and expected dollars if the pot is known;
- probability a single game upset eliminates the entire joint portfolio;
- continuation value and remaining-team scarcity by entry.

### 4.4 Search strategy

With a small number of entries and candidates, enumerate all legal portfolio assignments after pruning clearly dominated teams. As entries and horizon grow, use beam search, stochastic search, mixed-integer programming, or simulation optimization.

Recommended sequence:

1. Generate entry-specific candidate teams using a permissive win-probability floor and top current/future value ranks.
2. Enumerate or beam-search current-week portfolio allocations.
3. For each allocation, approximate optimal continuation with a rolling-horizon policy.
4. Evaluate allocations on common random scenarios so differences have lower simulation noise.
5. Re-simulate finalists with more draws and uncertainty scenarios.
6. Return the best plan plus at least two alternatives representing safer and more leveraged choices.

Use a terminal value at the horizon boundary to represent remaining-team quality and late double-pick scarcity. Otherwise a short horizon will spend every valuable team just beyond its view.

### 4.5 A transparent heuristic before simulation

Before the full optimizer is trustworthy, score candidate assignments from clearly named components:

- current win probability or current-week EV;
- marginal continuation value lost by consuming the team;
- pool-adjusted popularity leverage;
- concentration penalty for common failure events across joint entries;
- operational penalty for stale data, early lock, injury uncertainty, or unresolved rules.

The components should be separately visible. Weights must be configuration with rationale and backtest results, not hidden constants. Never label the resulting weighted score as `survival probability`, `win probability`, or `expected value`.

## 5. Multi-entry portfolio strategy

### 5.1 Why expected entries alive is not enough

For entries with individual current-week survival probabilities `p_e`, the expected number alive is `sum(p_e)`. This expectation does not reveal whether those survivors occur together or in mutually different scenarios. Two plans can have the same expected number alive and radically different probabilities of total elimination.

Therefore show both the mean and the distribution. The partners' stated goal makes the left tail—zero surviving joint entries—especially important.

### 5.2 Controlled concentration rule

A useful nonbinding policy for the heuristic stage is:

1. Start with the highest total contest value assignment, ignoring diversification.
2. Identify the game outcome that causes the largest joint loss.
3. Test moving one or more entries to the best credible alternative.
4. Keep the split only if the reduction in `P(zero joint survivors)` or improvement in `P(any joint win/share)` exceeds the loss in expected prize share and future value.
5. Stop when marginal diversification benefit is small.

This operationalizes the diminishing returns described in PoolGenius's multi-entry analysis without hard-coding its example allocations ([multi-entry guide](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/playing-multiple-entries-strategy/)).

### 5.3 Entry differentiation should consider future paths

Two entries using different teams this week can still converge onto the same scarce future route. Conversely, two entries stacked on one strong team this week may preserve different team sets and produce valuable later flexibility. Diversification should therefore consider **path overlap**, not just the current number of unique teams.

Useful plan diagnostics include:

- number of unique current teams;
- largest current team exposure;
- largest game-outcome exposure;
- overlap of projected next three to five picks;
- count of credible unused teams for each future week;
- number of legal two-pick combinations remaining for Weeks 17 and 18.

### 5.4 Endgame strategy becomes opponent-specific

When few entries remain, forecast each opponent's legal choices and compute each joint entry's impact on the surviving group. Generic ownership percentages can reverse a decision when the joint portfolio itself becomes a material share of a small pool. PoolGenius explicitly shows own-pick EV effects becoming large in small fields ([EV explainer](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/expected-value-survivor-pool-picks/)).

The endgame view should therefore show:

- likely opponent picks and eligibility evidence;
- head-to-head outcome branches;
- which choices create solo-win, shared-win, and mutual-elimination scenarios;
- sensitivity when one opponent chooses a different team.

## 6. What the product should display

### 6.1 Candidate-team fields

Every current-week candidate should show:

- opponent, location, kickoff, and lock status;
- consensus market spread and moneyline;
- de-vigged win probability and uncertainty range;
- source, observed-at time, and stale-data status;
- projected pool popularity with range and source;
- entry-specific eligibility;
- marginal future value / continuation cost;
- current-week EV or leverage measure, with definition;
- important rule or information risk;
- plain-English reason it is or is not recommended.

### 6.2 Portfolio-plan fields

Replace ambiguous `Est. survive` with explicit labels:

| Metric | Exact meaning | Why it matters |
| --- | --- | --- |
| Any survive this week | Probability at least one joint entry advances | Immediate portfolio ruin risk |
| All survive this week | Probability every currently live joint entry advances | Concentration and preservation |
| Expected entries alive | Mean count next week | Portfolio depth, but not tail risk |
| Any win/share pool | Probability at least one joint entry receives a terminal share | Primary project objective |
| Expected prize share | Mean joint fraction of the final pot | Financial objective and tie size |
| Max single-outcome loss | Entries lost if the most damaging one-game upset occurs | Explainable correlation risk |
| Future scarcity cost | Change in continuation value from teams consumed now | Cost of using premium future teams |
| Confidence / robustness | Stability across input and model scenarios | Whether the rank is trustworthy |

Each plan should also list the exact picks per entry, legal checks, source snapshot, major assumptions, and the most plausible reason it could be wrong.

### 6.3 Confidence must be computed, not decorated

Recommendation confidence should decrease when:

- market data are stale or books disagree materially;
- a key player's status is unresolved;
- popularity sources disagree;
- the recommendation flips under reasonable probability or popularity changes;
- future value dominates but distant forecasts are uncertain;
- opponent histories or a settlement rule are missing;
- Monte Carlo error is too large to separate plans.

Report a confidence band or stability statement such as “recommended in 82% of sensitivity scenarios,” not an unexplained progress bar.

## 7. Validation and backtesting plan

### 7.1 Replay decisions without hindsight

Backtests must use only information available before each historical pool deadline. Store time-stamped weekly snapshots of odds, forecasts, schedules, popularity, injury state, and pool state. Closing lines after a Thursday kickoff or Sunday deadline are leakage for that decision.

Replay at least these policies:

1. highest current win probability;
2. highest current-week EV;
3. highest expected longevity;
4. rolling future-value planner without opponent popularity;
5. opponent-aware single-entry optimizer;
6. joint portfolio optimizer;
7. simple controlled-concentration heuristic.

For each, evaluate across many simulated pools and, where reliable histories exist, real historical pool states. Do not judge a strategy by one season's winner.

### 7.2 Validate inputs separately from decision quality

**Forecast validation**

- Brier score, log loss, and calibration by probability band;
- comparison with de-vigged market baseline;
- calibration by forecast horizon;
- stability by season and early/late season.

**Popularity validation**

- mean absolute error and log loss against observed pick shares;
- calibration of popularity ranges;
- error by platform, pool size, and week;
- separate results with and without entry-history conditioning.

**Optimizer validation**

- simulated `P(any win/share)` and expected prize share;
- regret versus exhaustive search in small cases;
- Monte Carlo standard error and repeatability;
- constraint correctness under random generated states;
- rank stability under probability, popularity, horizon, and terminal-value changes.

**Operational validation**

- zero illegal team reuses;
- zero missing required picks at lock;
- correct tie and double-pick handling;
- all displayed facts source-stamped;
- every saved recommendation reproducible from its stored snapshot and model version.

### 7.3 Robustness scenarios

At minimum, re-evaluate finalist plans under:

- win probabilities shifted toward 50% and toward the market consensus;
- alternative de-vig methods for heavy favorites;
- popularity shifted within source disagreement ranges;
- shorter and longer pool-duration assumptions;
- different rolling horizons and terminal scarcity weights;
- one key candidate removed or downgraded;
- late-season starter-rest uncertainty;
- opponent-specific versus public-popularity models.

A small nominal edge that disappears in most reasonable scenarios should be reported as a near tie, not a confident recommendation.

## 8. Failure modes and guardrails

1. **Optimizing only next-week survival.** Keep it as a benchmark; rank on the contest objective.
2. **Adding path probabilities.** Fixed-path survival multiplies conditional weekly probabilities; expected longevity sums cumulative products.
3. **Treating entries as independent.** Simulate each NFL game once per scenario and apply it to all entries.
4. **Maximizing unique teams.** Diversify only until marginal ruin-risk reduction no longer pays for weaker choices.
5. **Saving a team because it is elite.** Future value depends on future schedule scarcity and pool duration, not brand strength.
6. **Trusting distant point estimates.** Use rolling horizons, uncertainty, and terminal scarcity values.
7. **Using popularity without eligibility.** Condition opponent choices on teams already used whenever possible.
8. **Ignoring one's own field impact.** Joint picks can materially change EV in a small pool.
9. **Using an unbounded spread conversion.** Fit and calibrate a logistic/probit/empirical model or use de-vigged moneylines.
10. **Calling a heuristic score a probability.** Display component scores and reserve probability labels for scenario frequencies or calibrated models.
11. **Treating source-site performance claims as proof.** Independently backtest; industry publishers have commercial incentives.
12. **Forgetting two-pick weeks.** Model four late-season team consumptions and joint-win requirements explicitly.
13. **Assuming missing, postponement, or zero-survivor rules.** Require verified configuration or show an unresolved-rule warning.
14. **Optimizing expected prize while hiding ruin risk.** Show both payout expectation and `P(zero joint survivors)`.
15. **Optimizing a single forecast.** Recommendations must survive sensitivity checks around probability and popularity error.

## 9. Recommended implementation roadmap

### Phase 0 — Correct semantics and provenance

- Make the local rules a required configuration input.
- Replace ambiguous plan metrics with the definitions in Section 6.
- Label all current prototype numbers as sample/illustrative until computed.
- Store source, observed-at time, and method for every probability and popularity value.
- Add legal validation for per-entry team reuse and configurable multi-pick weeks.

### Phase 1 — Transparent weekly decision model

- Add de-vigged consensus win probabilities and calibration metadata.
- Add entry-specific future schedule scarcity.
- Add pool-adjusted popularity with uncertainty.
- Produce transparent candidate scores and safe / balanced / leverage alternatives.
- Archive the input snapshot, picks, rationale, and eventual result.

### Phase 2 — Joint scenario simulator

- Simulate game outcomes once per scenario across all entries.
- Simulate opponent choices and pool attrition.
- Calculate explicit portfolio metrics and Monte Carlo error.
- Enumerate current-week assignments for the small initial portfolio.
- Model Weeks 17 and 18 as two-pick weeks from the start of the season.

### Phase 3 — Rolling-horizon optimizer

- Add entry-specific continuation policies and terminal scarcity value.
- Tune horizon and terminal value on historical/synthetic pools.
- Optimize the primary win/share objective and expected prize-share secondary objective.
- Add opponent-specific endgame modeling.
- Add sensitivity and rank-stability reporting.

### Phase 4 — Evidence loop

- Maintain time-valid historical snapshots.
- Run forecast, popularity, and optimizer validation after every week.
- Compare recommendations with benchmark policies without outcome-based storytelling.
- Publish a season-end model card describing calibration, decisions, failures, and changes.

## 10. Future-agent decision checklist

Before changing recommendation logic, a future agent should answer:

- What exact pool rule and deadline configuration is active?
- What is the explicit objective: any joint prize, expected share, or a constrained blend?
- What does each displayed probability mean?
- Are win probabilities de-vigged, calibrated, current, and source-stamped?
- Is popularity pool-specific, eligibility-conditioned, and uncertain?
- Is future value marginal, entry-specific, and pool-duration weighted?
- Are shared NFL outcomes simulated once across every entry?
- Are the partners' own entries included in surviving-field and EV calculations?
- Are Weeks 17 and 18 consuming two legal teams and requiring both to win?
- Does the result remain preferred across reasonable input and horizon changes?
- Is there a safe alternative and a leverage alternative with the tradeoff explained?
- Can the recommendation be reproduced later from stored inputs and model version?
- Does the platform calculate the strategy once the required dependencies are present, rather than leaving the partners to combine raw inputs manually?
- Are recommendation acceptance, edits, overrides, Splash confirmations, and outcomes stored as separate records?

If any answer is unknown, surface the gap instead of manufacturing precision.

## 11. Evidence boundaries and open questions

This guide supports the model architecture but does not settle several pool-specific decisions:

- Exact handling when all remaining entries lose in the same week.
- Exact Splash default-pick and postponed-game replacement behavior.
- Whether the two required late-season picks must be from distinct games (the preserved wording says “pick 2 games,” but implementation should verify the official rule).
- Actual number of entries each partner will manage.
- Whether full opponent team-use histories can be exported from Splash.
- Acceptable market-odds and popularity data providers, licensing, and refresh cadence.
- Whether the partners prefer maximizing any-prize probability or expected prize share when those objectives disagree.
- Whether entry fees are sunk for the in-season optimizer or should matter for preseason entry-count decisions.

These questions should become explicit configuration or product decisions before the optimizer claims rule-complete recommendations.

## 12. Source assessment

### Primary and academic sources

- David Bergman and Jason Imbrogno, [“Surviving a National Football League Survivor Pool,” *Operations Research* 65(5), 2017](https://doi.org/10.1287/opre.2017.1633). Peer-reviewed survivor-specific optimization; strongest support for bounded-horizon planning. The accessible abstract does not expose every model detail, so this guide does not claim more than the published result.
- Jason Imbrogno and David Bergman, [“Computing the Number of Winning NFL Survivor Pool Entries,” *The College Mathematics Journal* 53(4), 2022](https://doi.org/10.1080/07468342.2022.2099704). Survivor-specific combinatorics and prize-sharing context; reinforces that multiple terminal winners are a material part of the objective.
- Jason P. Berkowitz, Craig A. Depken II, and John M. Gandar, [“The Conversion of Money Lines Into Win Probabilities,” *Journal of Sports Economics* 19(7), 2018](https://doi.org/10.1177/1527002517696957). Comparison of de-vig methods and their assumptions, including heavy-favorite bias concerns.
- David Huggins, Robert Bailey, and I. Esra Buyuktahtakin Guardiola, [“Converting NFL Point Spreads into Probabilities,” *INFORMS Transactions on Education* 21(1), 2020](https://doi.org/10.1287/ited.2019.0230ca). NFL spread-to-probability modeling and the failure of unbounded linear conversion at large spreads.
- Greg Szalkowski and Michael L. Nelson, [“The Performance of Betting Lines for Predicting the Outcome of NFL Games,” 2012](https://arxiv.org/abs/1211.4000). Historical NFL spread, line movement, and straight-up probability analysis. Parameters are old and should be re-estimated, not copied as current truth.
- Jeff Decary et al., [“The Madness of Multiple Entries in March Madness,” 2024](https://arxiv.org/abs/2407.13438). Adjacent multi-entry, top-heavy-pool optimization research; useful for simulation, dynamic programming, input sensitivity, and joint-portfolio reasoning, but not survivor-specific.

### Practitioner strategy sources

- [SurvivorGrid, “NFL Survivor Pool Strategy 101”](https://www.survivorgrid.com/strategy). Clear synthesis of win probability, pick percentage, future value, current-week EV, and multi-entry tradeoffs. Commercial practitioner source, not an independent trial.
- [Subvertadown, “Survivor Pool Strategy”](https://subvertadown.com/article/survivor-pool-strategy) (updated July 11, 2026). Useful expected-longevity formulation and sequence explanation. It intentionally optimizes longevity rather than the opponent-aware prize objective, so use it as a benchmark.
- [PoolGenius, “The Holy Trinity of Survivor Pick Strategy Data”](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/holy-trinity-survivor-pick-strategy-data/) (May 14, 2026). Framework for win odds, popularity, and future value.
- [PoolGenius, “What Is Expected Value”](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/expected-value-survivor-pool-picks/) (May 5, 2026). Worked conditional-EV examples and own-pick effects.
- [PoolGenius, “The Right Way to Think About Saving Teams”](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/future-value-survivor-pool-picks/) (May 14, 2026). Pool-duration and uncertainty-weighted future value.
- [PoolGenius, “Are You Playing the Right Survivor Strategy for Your Pool Size?”](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/why-pool-size-should-influence-nfl-survivor-picks/) (May 26, 2026). Dynamic pool size, expected duration, and endgame implications.
- [PoolGenius, “The Case for Playing Multiple NFL Survivor Entries”](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/playing-multiple-entries-strategy/) (May 8, 2026). Controlled portfolio diversification and diminishing returns. Numerical examples are illustrative and should not become fixed rules.

### Project source

- [Last Survivor NFL Pool Rules](../source/context/NFL%20Survivor%20Pool%20rules.md). Searchable transcription of the original DOCX and the authority for project-specific contest constraints. Ambiguous or qualified wording must remain qualified until verified against the live contest.
