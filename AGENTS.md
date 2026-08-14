# Repository guidance for agents

Before changing pool rules, recommendation logic, candidate metrics, portfolio-plan metrics, or strategy copy, read these sources in order:

1. `source/context/NFL Survivor Pool rules.md` for the project-specific contest rules.
2. `docs/PRODUCT_BRIEF.md` for the product objective and scope.
3. `docs/SURVIVOR_POOL_STRATEGY_RESEARCH.md` for strategy mathematics, evidence boundaries, optimizer design, and validation requirements.

Repository-specific decision rules:

- Local contest rules override generic survivor advice. Preserve uncertainty where the source rules are qualified or incomplete.
- Optimize whole portfolio plans for the stated contest objective. Do not optimize entries independently and then combine them.
- Never use an ambiguous label such as `survival` without defining the event: at least one entry survives, all entries survive, expected entries alive, or terminal win/share.
- Treat the current prototype's candidate data, plan percentages, confidence display, and team names as illustrative until they are calculated from time-stamped sources.
- Never invent odds, probabilities, popularity, results, opponent histories, pick confirmations, or Splash behavior. Store source and observed-at time for external inputs.
- Keep heuristic scores separate from calibrated probabilities and simulated event frequencies.
- Simulate each NFL game outcome once per scenario and apply it to every joint and opponent entry so shared outcomes remain correlated.
- Model Weeks 17 and 18 as configurable two-pick weeks from the beginning of the season. Both required teams must win under the preserved rules.
- Recommendations need a rationale, major assumptions, a safer alternative, a leverage alternative, and a robustness/confidence explanation.
- Treat the platform as a decision advisor: when required dependencies are provided, calculate the recommendation and its tradeoffs; do not silently substitute illustrative values or make the partners reconstruct the math.
- Partners may disagree with or override any recommendation. Preserve the recommendation, override, final picks, reason, and result as separate audit records so disagreement remains learnable evidence.
- Splash remains the official record. Do not add automatic submission without a separate supported and authorized integration decision.

Run `npm run docs:check` after research or context-document changes. Run `npm test` after changes that can affect the application or build.
