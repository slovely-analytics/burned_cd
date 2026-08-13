# Product Brief: Survivor Pool Strategizer

## Goal

Help two partners coordinate their separately owned survivor-pool entries as one strategic portfolio so that at least one entry has the best practical chance of winning the pool. Any winnings are split between the partners outside the tool.

Success is not measured by whether every entry survives each week. The primary objective is maximizing the probability that at least one jointly managed entry wins or shares the final prize.

## Why a Collaborative Web App

A private, mobile-friendly web app is the best fit because both partners need the same current information while making time-sensitive weekly decisions. It avoids conflicting spreadsheets, supports shared notes and confirmations, and remains usable from a phone near the pick deadline.

The first version does not require a native mobile app or automated wagering/pick submission.

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

## First Usable Version

### Shared Pool Setup

- Pool name, season, rules, pick deadline, and contest link.
- Partner names and winnings-split note.
- Current pool size and surviving-entry count, editable as the season progresses.

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
- Candidate portfolio plans showing survival probability, diversification, and future-value tradeoffs.
- A recommended plan plus one or more credible alternatives.
- Partner notes and an explicit final decision.

### Submission Checklist

- Picks grouped by owner so each person knows what to submit.
- Confirmation state for every entry.
- Deadline warning and unresolved-pick warning.
- Clear reminder that Splash, not this tool, is the official record.

### History

- Weekly recommendations, final decisions, results, and surviving entries.
- Audit trail of manual changes to picks and assumptions.

## Rules the Product Must Enforce

- A team cannot be reused by the same entry.
- Ties count as losses.
- Weeks 17 and 18 require two winning picks per surviving entry.
- Picks are due by 1:00 PM Sunday, including later Sunday or Monday selections.
- Thursday games are eligible and therefore may require an earlier practical decision.
- Missing picks and postponed games can trigger Splash defaults; the tool must warn about these cases but must not assume a specific default-selection rule.
- The pool ends with one remaining entry or at the end of the regular season; remaining survivors then split the prize.
- The pool permits up to 25 entries per participant.

## Data and Automation Boundaries

The first version should work with manual data entry so it remains dependable without external integrations. The architecture should leave room for:

- NFL schedules and final scores.
- Market spreads or moneyline-derived win probabilities.
- Pool-wide pick-popularity estimates.
- Splash entry and result imports, if a reliable authorized method becomes available.

External data must display its source and refresh time. The app must never invent missing odds, popularity, results, or pick confirmations.

Automated submission to Splash is out of scope unless a supported, authorized integration is identified later.

## Recommended Decision Workflow

1. Update surviving entries and team-use history.
2. Load or enter the week's schedule, win probabilities, and optional popularity estimates.
3. Generate coordinated portfolio plans.
4. Review the recommended plan and alternatives together.
5. Lock the final picks.
6. Each owner submits their picks on Splash and confirms them in the tool.
7. Record results and roll surviving entries into the next week.

## Measures of Success

- Every live entry has a valid, confirmed pick before its practical deadline.
- No entry is assigned a team it has already used.
- Both partners work from one shared current plan.
- Recommendations expose assumptions and portfolio tradeoffs.
- The tool retains enough history to evaluate strategy quality after the season.
- The joint portfolio remains alive as long as possible, with winning or sharing the prize as the ultimate outcome.

## Explicit Non-Goals for the Initial Version

- Public community features or support for unrelated pools.
- Handling payments or distributing winnings.
- Guaranteed predictions or claims of certainty.
- Replacing Splash as the official contest system.
- Automatically submitting picks with a partner's account credentials.

## Open Product Decisions

These can be resolved during implementation without changing the overall goal:

- The number of entries each partner expects to manage.
- Whether access should use lightweight shared authentication or separate partner accounts.
- Which odds and popularity sources are acceptable.
- Whether recommendations begin with a transparent heuristic or a simulation-based optimizer.

Recommended starting point: separate partner accounts, manual/importable weekly inputs, and a transparent scoring model. Add simulations after the workflow and data quality are proven.

