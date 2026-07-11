# Progression Roadmap — Current Alpha to Playable Loop

## Current alpha milestone

Animal Survivor is now testing a 12-minute, build-making survival loop. Greg
keeps leveling throughout a run, chooses from mixed animal and neutral upgrade
cards, earns persistent Essence after an attempt, and can buy one small
between-run improvement. This is an implemented alpha milestone awaiting
human-balance validation, not a claim that the progression loop is finished.

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
- The current authored level-pressure rule is deliberately bounded and does not
  create a spawn burst: level 4 raises opening caps from 4/8 to 5/10 and
  shortens ordinary waves from 120 to 108 ticks; level 7 raises caps to 6/12
  and cadence to 96 ticks. The same content-owned rule drives later phases.
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
- **Enemy behaviours:** the Runner/Charger/Tank/Zoner state machines are useful
  design references, not drop-in simulation code. A future Runner slice must
  add behavior state, explicit hit timing, snapshot/telegraph data, hashing,
  replay, pause, and slot-reuse coverage before it replaces the current simple
  seek/contact behavior. It follows—not precedes—the normal-mode playtest.
- **Modes:** Hard, Brutal, and Hardcore Endless remain future work. If adopted,
  their identities must derive from canonical authored definitions, and
  Hardcore should require both complete core meta progression and a Brutal
  victory—not just an opaque unlock flag.

## Determinism and replay contract

- The level curve, universal catalog/order/ranks, XP-magnet state, offer queue,
  and bounded level pressure are canonical gameplay facts.
- Replays now record typed `trait`, `universal`, and `essence` selections, plus
  the universal-catalog and normalized run-start-loadout fingerprints.
- The deterministic config version is 4. Older replay records reject rather
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

## Validation gates

- Run all headless, trait-runtime, run-director, and web-toy tests plus
  typecheck, lint, and production build after integrating this alpha milestone.
- Verify replay/hash parity for mixed animal and neutral selections, fallback
  Essence Cache choices, and a nonzero Starting Vitality loadout.
- Browser-smoke a normal run for continuous levels, visible XP attraction,
  pause-build clarity, terminal Essence, and a next-run Vitality effect.
- Run human playtests before tuning player-selectable difficulties, Hardcore
  Endless, Luck, or broader trait content.
