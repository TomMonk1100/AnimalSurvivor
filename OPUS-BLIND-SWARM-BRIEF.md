# Animal Survivor — Blind Opus Swarm Brief

## Mission

Produce independent, high-value design and coding artifacts for **Animal
Survivor**, a 12-minute survivor-action game. You have **no access to this
repository, its files, GitHub, or its current APIs**. Do not ask for them and do
not pretend you inspected them.

Your work must be useful to a later integration agent without requiring any
changes to an existing codebase today.

## Product snapshot

Treat the following as fixed context, not implementation details you can
inspect:

- The player controls Greg, a fox, in a survival run capped at 12:00.
- A boss enters at 10:00; killing it before 12:00 wins.
- The current alpha has two animal adaptations and a small set of neutral,
  rank-capped run upgrades.
- Current neutral concepts include movement speed, XP magnetism, maximum health,
  base weapon damage, base auto-fire cooldown, and XP gain.
- The game has an early local-currency/progression loop called Essence.
- Higher selectable difficulties and Hardcore Endless are future work.
- **Luck is not an allowed recommendation for immediate implementation** until
  there is a real rarity, chest, or drop system that it changes.

## Non-negotiable rules

1. Do not edit, reference, or assume a repository structure, package name, or
   existing type/API.
2. Do not use GitHub, private sources, or source-code archaeology.
3. Research may use public web sources. Cite each factual claim with a direct
   URL and distinguish sourced facts from your design recommendations.
4. Code must be standalone TypeScript for Node 20, use no third-party packages,
   and include runnable `node:assert/strict` tests.
5. Every numeric value must be labeled either **example starting value** or
   **formula**, never presented as a discovered fact about Animal Survivor.
6. Favor deterministic models: no ambient randomness, wall-clock behavior, DOM,
   renderer, network, or engine dependency in code artifacts.
7. Do not implement Luck, Hardcore Endless, a full difficulty UI, or additional
   animal traits in a fictional codebase. You may design future-facing specs for
   them only where expressly requested below.

## How to work

Run the four work packets below independently and in parallel if you can. If
you have only one execution slot, do them in this order: **A, B, D, C**.

For each packet, return:

- a short decision summary;
- complete file contents in Markdown code fences, using the requested filename;
- test command(s) and their expected output;
- assumptions and limitations; and
- a handoff note explaining how a later integration agent can evaluate the
  artifact without blindly copying it into production.

Do not omit code merely because it is long. Produce complete, runnable files.

---

## Packet A — Deterministic balance lab (highest priority)

Create a standalone TypeScript CLI named `survivor-balance-lab.ts`.

### Goal

Give a game designer a fast way to explore a 12-minute run without needing the
game source. It should make pressure, boss timing, player power, and upgrade
effects discussable with numbers rather than intuition.

### Requirements

- No imports except Node built-ins.
- Accept a JSON configuration file path, or use a documented built-in example.
- Model these inputs:
  - run duration and boss-entry time;
  - wave interval, enemy count, HP, contact damage, and attack cadence;
  - player HP, base DPS, movement/pickup assumptions, and XP curve;
  - rankable upgrades for speed, magnet, max HP, base weapon damage,
    auto-fire cooldown, and XP gain;
  - boss HP and boss damage pressure.
- Print a readable minute-by-minute table including expected level, selected
  ranks, estimated player DPS, expected incoming pressure, boss time-to-kill,
  and a conservative standing-still survival estimate.
- Include level 1, 4, 7, and late-run pressure comparisons.
- Provide clearly marked example formulas and tuning knobs. Do not claim they
  reproduce live gameplay.
- Include at least ten deterministic assertions covering validation, cap timing,
  boss timing, upgrade math, and invalid input.
- Include `survivor-balance-lab.example.json` and a short `BALANCE-LAB.md`.

### Acceptance criteria

An integration agent can run the tool with Node 20, change one number in JSON,
and understand whether it changes early pressure, boss viability, or the
standing-still failure case.

---

## Packet B — Neutral upgrade research and content kit

Create these standalone artifacts:

- `neutral-upgrades-v2.json`
- `validate-neutral-upgrades-v2.ts`
- `NEUTRAL-UPGRADES-RESEARCH.md`

### Goal

Expand future neutral-upgrade options without accidentally proposing fake or
misleading player-facing effects.

### Requirements

- Research public survivor-action games and cite direct sources for factual
  observations. Keep quotations short.
- Propose **12–16** upgrades, each with:
  - stable id, title, category, rank cap, and exact player-facing description;
  - a concrete mathematical effect or explicit reason it needs a new system;
  - build role, synergy, balance risk, and testing requirement;
  - one of `safe_now`, `needs_system`, or `future_only`.
- `safe_now` may use only clearly generic mechanics: damage, cooldown, maximum
  health, movement speed, XP gain, pickup radius, attraction range, attraction
  speed, enemy count, and spawn cadence.
- Put Luck, rarity, chests, rerolls, revives, projectiles with new ownership,
  shields, and status effects in `needs_system` or `future_only` unless you
  design the required system explicitly.
- Include no more than six `safe_now` candidates; prioritize distinct choices
  over synonym cards.
- The validator must check unique ids, nonempty copy, positive rank caps,
  recognized status, and reject a `safe_now` card with an unsupported mechanic.
- Include tests using `node:assert/strict`.

### Acceptance criteria

A later designer can choose a few cards from the JSON, know what must be built
for each, and avoid shipping an effect the game cannot truthfully deliver.

---

## Packet C — Future meta-progression and mode specification

Create these standalone artifacts:

- `meta-progression-v2.schema.json`
- `meta-progression-v2.example.json`
- `validate-meta-progression-v2.ts`
- `META-PROGRESSION-AND-MODES.md`

### Goal

Define a fair, understandable future path from a small Essence loop to harder
play without inventing hidden multipliers or a grind wall.

### Requirements

- Design 8–12 permanent upgrades with capped ranks, transparent effects, costs,
  prerequisites, and anti-grind reasoning.
- Keep permanent power modest. Explain why each upgrade supports learning and
  build expression rather than mandatory farming.
- Specify a future unlock path from Normal to clearly selectable higher
  difficulties and then opt-in Hardcore Endless.
- Require separate, authored, fingerprintable mode definitions—not invisible
  multipliers.
- Define Hardcore Endless as a future design only: objective, failure rules,
  ramp constraints, and what must be proven before it ships.
- Include schema validation and at least ten tests for invalid costs, cycles,
  duplicate ids, cap errors, bad unlock conditions, and hidden-multiplier
  rejection.
- Explicitly state that this packet is not UI or production integration code.

### Acceptance criteria

A later integration agent can use this as a product contract, pick a tiny first
slice, and avoid conflating current local Essence with a finished meta economy.

---

## Packet D — Deterministic enemy-behavior prototype pack

Create these standalone artifacts:

- `enemy-behavior-prototypes.ts`
- `enemy-behavior-prototypes.test.ts`
- `ENEMY-BEHAVIOR-PROTOTYPES.md`

### Goal

Explore future enemy variety that creates readable decisions instead of simply
adding damage and HP.

### Required prototypes

1. **Runner** — closes distance quickly but commits to a recoverable attack.
2. **Charger** — telegraphs, charges in a straight line, then recovers.
3. **Tank** — slow pressure with a distinct durability/space-control role.
4. **Zoner** — holds a preferred range and creates a clear positional threat.

### Requirements

- Use pure state machines: `(state, tick, player position, enemy position) ->
  next state + movement/attack intent`.
- Use integer ticks, explicit cooldowns, explicit telegraph windows, and no
  random behavior.
- Do not output engine calls, renderer data, or physics-specific code. Emit a
  small generic intent vocabulary you define in the file.
- Include at least twelve assertions covering determinism, telegraph timing,
  cooldowns, recovery, zero-distance behavior, target movement, and each
  state transition.
- In the Markdown handoff, describe readability goals, counterplay, tuning
  knobs, and the minimum data an eventual game integration must supply.

### Acceptance criteria

An integration agent can compare these pure prototypes with the actual game
contract later and adopt only the ones that fit without importing hidden state.

---

## Final Opus synthesis

After completing all packets, return one final section named
`SWARM-SYNTHESIS.md` containing:

1. A one-page executive summary.
2. A file manifest with every artifact and test command.
3. A ranked integration recommendation:
   - implement next after a human playtest;
   - safe to queue for later;
   - deliberately defer.
4. A cross-packet risk table identifying any duplicated mechanics, unsupported
   dependencies, balance assumptions, or misleading copy.
5. A concise handoff for a repository-owning integration agent.

Do not claim any artifact was merged, run against Animal Survivor, or approved
by a player. The value of this swarm is well-tested independent material and
better decisions—not fake integration progress.
