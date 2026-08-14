# Survivor Pool Strategizer

A private collaborative decision tool for two partners managing their own entries in an NFL survivor pool. The partners coordinate picks across all of their entries, attempt to keep at least one entry alive through the season, and split any winnings.

The product source of truth is [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md). Original pool rules and their searchable transcription are preserved in [source/context](source/context). Strategy mathematics, research evidence, optimizer design, and validation requirements are maintained in [docs/SURVIVOR_POOL_STRATEGY_RESEARCH.md](docs/SURVIVOR_POOL_STRATEGY_RESEARCH.md).

Future agents should begin with [AGENTS.md](AGENTS.md), which defines the reading order and the safeguards for recommendation work.

## Product Direction

The product is a decision advisor and guide, not merely a shared worksheet. Partners provide the pool rules, complete entry histories, current pool state, schedules, probabilities, popularity inputs, and other required dependencies. The platform performs the portfolio math, explains the recommendation and alternatives, and identifies any missing or stale dependency.

The tool should support decisions without taking control away from the partners. It should not submit picks to Splash automatically. Partners can accept, edit, or override recommendations; the app records the recommendation and final decision separately, while Splash remains the official contest record.

## Strategy Standard

The primary recommendation target is the probability that at least one jointly managed entry wins or shares the pool. The tool should also expose expected prize share, current-week ruin risk, expected entries alive, and future-team scarcity as separate metrics. It must not present illustrative or heuristic scores as calculated probabilities.
