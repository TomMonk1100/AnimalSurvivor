# Progression Roadmap — Current Alpha to Playable Loop

## Current alpha milestone

Animal Survivor is now testing a 12-minute, build-making survival loop. Greg
keeps leveling throughout a run, chooses from mixed animal and neutral upgrade
cards, earns persistent Essence after an attempt, and can buy one small
between-run improvement. This is an implemented alpha milestone awaiting
human-balance validation, not a claim that the progression loop is finished.

The current pressure pass responds to the owner finding that Greg could stand
still safely around six to seven minutes. It moves ordinary encounters from a
near-reach trickle to authored approach waves, introduces a time-and-level
density ramp, gives elites a meaningful reward, and adds a normal-plus ranged
threat rather than relying on elite shots alone.

The two-animal Greg slice remains the foundation. We do not expose unsupported
future animal traits merely to inflate card count: every offered trait must have
real deterministic simulation support.

## Per-run progression V1

- The XP curve continues past the authored opening thresholds, so there is no
  player-visible max level during a run.
- A level-up pauses at the tick boundary and presents a mixed set of legal
  animal-adaptation and neutral-upgrade cards. The chooser reserves neutral
  space when animal offers would otherwise fill it, so neutral progression is
  genuinely available rather than a theoretical fallback.
- The six implemented neutral run upgrades are:
  - **Swift Paws** — movement speed;
  - **XP Magnet** — larger collection radius plus visible XP-mote attraction;
  - **Sturdy Hide** — maximum health;
  - **Sharpened Instinct** — base weapon damage;
  - **Rapid Instinct** — base auto-fire cooldown; and
  - **Growth** — XP gained.
- Each neutral card is rank-capped for the run. Once every finite animal and
  neutral choice is exhausted, **Essence Cache** remains a legal repeatable
  fallback and contributes its reward to the terminal Essence settlement.
- The pause panel is the durable build reference: it shows both owned animal
  adaptations and selected neutral-upgrade ranks/effects without repeating
  action text over combat.

## Pressure and normal-mode boundary

- **Normal** is a finite 12:00 run. The boss enters at **10:00**; killing it by
  12:00 wins, while an alive boss at the deadline is a defeat. Normal mode has
  no hidden overtime.
- Ordinary fodder and runners are authored at **38–46 distance units**. The
  current adapter scale makes that **760–920 world units**, outside the current
  camera boundary, so they approach Greg rather than appearing at weapon range.
  Brutes and elites use **800–960** world units. The boss deliberately uses the
  nearer **400–480** range so its 10:00 entrance becomes a fight within seconds
  rather than consuming much of its short response window walking in. At a
  world edge, the adapter deterministically chooses a complete
  in-bounds formation at its authored distance or rejects it; it never clamps a
  far wave beside Greg.
- Base ordinary-wave cadence now tightens by phase: opening **75 ticks**
  (1.25 s), pressure **60** (1.0 s), adaptation **45** (0.75 s), mutation
  **30** (0.5 s), and boss **36** (0.6 s). The matching soft/hard live-enemy
  caps are **10/18**, **18/30**, **30/48**, **46/72**, and **36/56**.
- Level pressure remains bounded and never makes a same-tick burst: at levels
  **4, 6, and 8**, up to three steps add **+1 soft / +2 hard** capacity each and
  subtract **4 ticks** from the active phase cadence. This makes a growing build
  invite more danger while keeping the exact tuning content-owned and replayed.
- There are now six warned, one-shot elite beats: one in pressure at **3:20**,
  two in adaptation at **5:40** and **7:00**, and three in mutation at **8:10**,
  **9:00**, and **9:30**. Each elite maps to the temporary brute prototype with
  5× HP and a **6× XP multiplier**: its base 4-XP drop is therefore **24 XP**
  and uses a visibly larger pickup radius.
- Runners weave at range, then return to direct seeking within 150 world units.
  The cobalt **Spitter** joins pressure, adaptation, and mutation waves as a
  36-HP, 2-XP normal-plus enemy: it holds the same 290 ± 55 skirmish band,
  waits 90 in-range ticks, then fires a 6-damage hostile shot every 180
  in-range ticks. It remains absent from opening and the boss phase.
  Elites hold a 290 ± 55 world-unit skirmish band, orbit or retreat instead of
  simply walking into Greg, and fire orange-red hostile projectiles after a
  72-tick delay **while in firing range**, then every 150 ticks while they
  remain in range. Each shot travels at 260 world units per second, deals 8
  damage, lasts 180 ticks, and respects player invulnerability.
- This is a first balance pass, not evidence that the enemy curve or boss HP is
  correct for a fully developed build.

## Meta progression V1

- Terminal **Essence** is calculated app-side and credited once per stable run
  id, including any earned **Essence Cache** rewards.
- A versioned local browser profile stores Essence and the first permanent
  purchase, **Starting Vitality**.
- Starting Vitality is deliberately small and capped: three ranks, each adding
  +10 starting maximum health to the next run. Browser persistence is never
  read directly by deterministic gameplay; it is normalized into the run-start
  loadout before a run begins.
- The profile is deliberately a **between-run prep surface**: it appears on the
  Start/next-run dialog, not in the active combat HUD. Terminal **Continue to
  upgrades** returns to that prep screen, where a purchase can be made before a
  fresh deterministic run is constructed.

## Reviewed Opus swarm packet — 2026-07-11

An independently produced, blind-swarm packet was audited against this alpha.
Its four supplied standalone test suites pass locally, but it is reference
material rather than merged game code. The current six-card neutral catalog,
Starting Vitality values, and normal-mode contract remain canonical.

- **Keep now:** truthful mechanic gating, capped anti-grind meta progression,
  visible authored difficulty modifiers, and deterministic/fingerprinted
  gameplay definitions are good constraints for later work.
- **Do not merge yet:** Long Reach and Swift Pull duplicate the two parts of
  current **XP Magnet**; Sparse Hunt and Long Breath need player-specific
  director pressure hooks; Reckless Edge needs signed max-health handling and
  deterministic clamp tests. Crit, mitigation, regeneration, dodge, Essence
  scaling, Luck, rerolls, revive, and shields remain blocked on their named
  systems.
- **Balance lab:** the supplied CLI is a useful future design-tool foundation,
  but its numbers are examples and several formulas must be adapted to live
  data. After a human normal-mode run, port it outside gameplay packages and
  calibrate it from the real config, universal catalog, director pressure, and
  boss adapter values.
- **Enemy behaviours:** the current narrow slice gives runners deterministic
  range-weave behavior, elites skirmish range and hostile projectiles, and the
  normal-plus Spitter its own authored definition, cobalt visual identity,
  hashed cooldown state, replay coverage, and pause/slot-reuse tests. The
  imported Runner/Charger/Tank/Zoner state machines remain design references,
  not drop-in simulation code.
- **Modes:** Hard, Brutal, and Hardcore Endless remain future work. If adopted,
  their identities must derive from canonical authored definitions, and
  Hardcore should require both complete core meta progression and a Brutal
  victory—not just an opaque unlock flag.

## Determinism and replay contract

- The level curve, universal catalog/order/ranks, XP-magnet state, offer queue,
  and bounded level pressure are canonical gameplay facts.
- Replays now record typed `trait`, `universal`, and `essence` selections, plus
  the universal-catalog and normalized run-start-loadout fingerprints.
- The deterministic config version is 6. Older replay records reject rather
  than silently replay against different progression content.
- Terminal profile settlement remains outside the simulation and is idempotent,
  so a replay, outcome rerender, or page refresh cannot duplicate Essence.

## Explicitly deferred

- **Luck** is not an implemented card. It needs a truthful rarity, offer,
  chest, or drop system before it can be offered.
- Player-selectable higher difficulties and **Hardcore Endless** are not shipped.
  They require separately fingerprinted authored definitions and explicit player
  choice after the normal/meta loop is proven.
- More animal traits remain deferred until their persistent gameplay state,
  commands, visuals, and balance are implemented. The current Greg catalog is
  intentionally small rather than misleading.
- Additional player attack families are intentionally deferred. The shipped
  Spitter is the first normal-plus ranged pressure test, not a substitute for
  broader enemy families or player-attack content.

## Validation gates

- Run all headless, trait-runtime, run-director, and web-toy tests plus
  typecheck, lint, and production build after integrating this alpha milestone.
- Verify replay/hash parity for mixed animal and neutral selections, fallback
  Essence Cache choices, and a nonzero Starting Vitality loadout.
- Browser-smoke the prep surface: Starting Vitality must be absent during active
  play, terminal **Continue to upgrades** must reveal it, and a purchase must
  affect only the freshly started next run.
- Run a focused human pressure test: verify that normal waves enter from outside
  the screen, density rises across phases and levels, the 24-XP elite reward is
  legible, and runner/Spitter/elite projectile behavior creates movement
  decisions without unreadable hits.
- Run human playtests before tuning player-selectable difficulties, Hardcore
  Endless, Luck, broader enemy families, or player attacks.
