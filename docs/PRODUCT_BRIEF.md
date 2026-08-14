# Product Brief: Survivor Pool Strategizer

## Goal

Make the platform a decision advisor for two partners managing separately owned survivor-pool entries as one strategic portfolio. When the partners provide the required dependencies, the platform should perform the portfolio math, recommend a plan, explain the tradeoffs and uncertainty, and guide the partners through final manual submission. Any winnings are split between the partners outside the tool.

Success is not measured by whether every entry survives each week. The primary objective is maximizing the probability that at least one jointly managed entry wins or shares the final prize. The platform should calculate this from the supplied pool state, entries, schedules, probabilities, popularity, rules, and other declared inputs; it must not ask the partners to infer the strategy from raw data or rely on hidden assumptions.

Expected prize share is a secondary financial objective and should be reported separately. The recommendation engine must not silently blend probability of any prize, expected payout, current-week survival, and expected entries alive into one unexplained score.

## Why a Collaborative Web App

A private, mobile-friendly web app is the best fit because both partners need the same current information while making time-sensitive weekly decisions. It avoids conflicting spreadsheets, supports shared notes and confirmations, and remains usable from a phone near the pick deadline.

The first version does not require a native mobile app or automated wagering/pick submission.

### Advisor operating model

The partners are responsible for supplying or confirming the decision inputs. The platform is responsible for validating them, identifying missing or stale dependencies, calculating whole-portfolio recommendations, and explaining the result in plain language.

The advisor must support this loop:

1. Collect or import the current pool state, all relevant entries, team-use histories, schedule, market inputs, popularity assumptions, deadlines, and rule configuration.
2. Validate completeness, legality, freshness, and unresolved rule assumptions.
3. Calculate the recommended portfolio and at least a safer and leverage alternative.
4. Show the exact metrics, assumptions, uncertainty, and likely failure modes behind each plan.
5. Let either partner accept, edit, or override any recommendation.
6. Preserve the recommendation, override or edit, final picks, partner rationale, Splash confirmation, and eventual result as separate records.

An override is a valid human decision, not an application error. It must never be overwritten by the recommendation engine, and it must remain available for retrospective learning.

## Users and Ownership

- Exactly two collaborating partners initially.
- Each pool entry has one recorded owner.
- Strategy is coordinated across all entries regardless of ownership.
- Entry ownership and the partners' winnings agreement are recorded for clarity but do not change the recommendation logic.

## Core Decision Model

Recommendations should consider the entries collectively rather than recommending the same apparent favorite everywhere.

For each entry and candidate team, the tool should account for:

- Estimated probability the team wins this week.
- Teams already used by that entry.
- Future value of preserving strong teams for later weeks.
- Correlation created by using the same team across multiple entries.
- Strategic diversification where the expected benefit justifies the added weekly risk.
- Expected popularity of each pick in the full pool, when that information is available.
- Pool stage, number of surviving entries, and the special two-pick requirement in Weeks 17 and 18.

The output should explain the tradeoff behind each recommendation. A recommendation without its assumptions and rationale is incomplete.

The technical methods, evidence boundaries, metric definitions, and optimizer roadmap are maintained in [SURVIVOR_POOL_STRATEGY_RESEARCH.md](SURVIVOR_POOL_STRATEGY_RESEARCH.md). That guide is required context for changes to recommendation logic.

### Required Plan Metrics

Portfolio plans should distinguish:

- Probability at least one jointly managed entry survives the current week.
- Probability all currently live jointly managed entries survive the current week.
- Expected number and distribution of jointly managed entries alive next week.
- Probability at least one jointly managed entry wins or shares the pool.
- Expected joint fraction of the prize pool, when the payout and settlement rules are known.
- Concentration risk from a single NFL game outcome.
- Entry-specific future-team scarcity cost.
- Recommendation robustness, input freshness, and material unresolved assumptions.

The label `survival` by itself is not acceptable because it does not identify the measured event.

## First Usable Version

### Shared Pool Setup

- Pool name, season, rules, pick deadline, and contest link.
- Partner names and winnings-split note.
- Current pool size and surviving-entry count, editable as the season progresses.
- Starting pool entry count, current live-entry count, jointly managed entry count, and our share of the live field.
- A dependency checklist showing which required inputs are present, stale, estimated, illustrative, or unresolved.

### Entry Management

- Entry name and owner.
- Alive, eliminated, or inactive status.
- Team-use history by week.
- Current-week pick status.

### Weekly Decision Board

- Current NFL week and deadline.
- Available teams for each entry.
- Manually entered or imported win probabilities and point spreads.
- Optional projected pick popularity.
- Candidate portfolio plans showing explicitly defined survival, terminal win/share, expected prize-share, concentration, and future-value tradeoffs.
- A recommended plan plus one or more credible alternatives.
- A recommendation explanation that names the primary objective, major assumptions, material risks, and why the alternatives rank differently.
- An explicit accept/edit/override action with a required reason when the final picks differ from the recommendation.
- Partner notes and an explicit final decision.

### Submission Checklist

- Picks grouped by owner so each person knows what to submit.
- Confirmation state for every entry.
- Deadline warning and unresolved-pick warning.
- Clear reminder that Splash, not this tool, is the official record.

### History

- Weekly recommendations, final decisions, results, and surviving entries.
- Audit trail of manual changes to picks and assumptions.
- Separate audit records for recommendation, human override, Splash submission confirmation, weekly result, and season outcome.

## Rules the Product Must Enforce

- A team cannot be reused by the same entry.
- Ties count as losses.
- Weeks 17 and 18 require two distinct teams per surviving entry. Whether those teams must come from distinct games remains unresolved until the official contest rule is verified.
- Picks are due by 1:00 PM Sunday, including later Sunday or Monday selections.
- Thursday games are eligible and therefore may require an earlier practical decision.
- Missing picks and postponed games can trigger Splash defaults; the tool must warn about these cases but must not assume a specific default-selection rule.
- The pool ends with one remaining entry or at the end of the regular season; remaining survivors then split the prize.
- The pool permits up to 25 entries per participant.

## Data and Automation Boundaries

The first version may use manual data entry so it remains dependable without external integrations, but manual entry does not mean manual strategy calculation. Once the required inputs are present, the platform should calculate the recommendation and expose its work. The architecture should leave room for:

- NFL schedules and final scores.
- Market spreads or moneyline-derived win probabilities.
- Pool-wide pick-popularity estimates.
- Splash entry and result imports, if a reliable authorized method becomes available.

External data must display its source and refresh time. The app must never invent missing odds, popularity, results, or pick confirmations.

Probabilities must identify their method and version. Heuristic scores must remain visibly distinct from calibrated probabilities or Monte Carlo event frequencies. Popularity estimates must identify whether they are generic public estimates or conditioned on this pool's entry histories.

Automated submission to Splash is out of scope unless a supported, authorized integration is identified later.

The platform may import or assist with data collection, but it must not claim that a recommendation is complete when a required dependency is missing. It should surface a blocked, partial, or illustrative result with the exact gap.

## Recommended Decision Workflow

1. Update surviving entries and team-use history.
2. Load or enter the week's schedule, win probabilities, and optional popularity estimates.
3. Generate coordinated portfolio plans.
4. Review the recommended plan, alternatives, assumptions, and dependency status together.
5. Accept the recommendation or record an explicit edit/override and reason.
6. Lock the final picks.
7. Each owner submits their picks on Splash and confirms them in the tool.
8. Record results and roll surviving entries into the next week.

## Measures of Success

- Every live entry has a valid, confirmed pick before its practical deadline.
- No entry is assigned a team it has already used.
- Both partners work from one shared current plan.
- Recommendations expose assumptions and portfolio tradeoffs.
- Given complete, valid, time-stamped dependencies, the platform calculates a reproducible recommendation without requiring partners to perform the strategy math themselves.
- Partners can disagree safely: every override preserves the original recommendation and records the human decision separately.
- Recommendation metrics name the exact event measured and are reproducible from a saved, time-stamped input snapshot.
- The tool retains enough history to evaluate strategy quality after the season.
- If all jointly managed entries are eliminated, the tool preserves the input snapshot, recommendation, final picks, assumptions, and result for future-season learning.
- The joint portfolio remains alive as long as possible, with winning or sharing the prize as the ultimate outcome.

## Explicit Non-Goals for the Initial Version

- Public community features or support for unrelated pools.
- Handling payments or distributing winnings.
- Guaranteed predictions or claims of certainty.
- Replacing Splash as the official contest system.
- Automatically submitting picks with a partner's account credentials.
- Treating the recommendation as an automatic commitment or preventing a partner from overriding it.

## Open Product Decisions

These can be resolved during implementation without changing the overall goal:

- The number of entries each partner expects to manage.
- Whether access should use lightweight shared authentication or separate partner accounts.
- Which odds and popularity sources are acceptable.
- Which recommendation engine is currently production-valid: transparent heuristic, calibrated simulation, or rolling-horizon optimizer.

Recommended starting point: separate partner accounts, manual/importable weekly inputs, and a transparent component scoring model whose outputs are not labeled as probabilities. Add a joint scenario simulator after the workflow, probability calibration, source provenance, and data quality are proven; then add rolling-horizon and opponent-specific optimization.
