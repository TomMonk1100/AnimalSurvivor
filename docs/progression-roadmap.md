# Progression Roadmap — Alpha to Playable Loop

## Product decision

Animal Survivor is a 12-minute, build-making survival game. A player should
keep leveling throughout a run, assemble a mixture of animal adaptations and
universal upgrades, earn a persistent currency after the run, and eventually
unlock deliberately chosen higher-difficulty and endless modes.

The current two-animal Greg slice remains the foundation. We will not expose
unsupported future animal traits merely to increase card count: their gameplay
commands need real simulation support first.

## Build order

### 1. Immediate alpha response

- Keep the active combat view quiet: explain owned upgrades in the persistent
  panel and pause panel, not through repeating action banners.
- Improve early-wave readability and boss entrance/pacing without masking the
  underlying encounter problem.
- Make milestone audio audible and purposeful, but do not add per-projectile
  sound spam.

### 2. Per-run progression V1

Build one deterministic, replay-safe level-up system that can offer:

- existing animal trait cards;
- universal cards: **Swift Paws** (move speed), **XP Magnet** (real pickup
  attraction), **Sturdy Hide** (survivability), and **Sharpened Instinct**
  (base weapon improvement);
- **Essence Cache** as a legal fallback once finite upgrades are exhausted.

Replace the finite XP threshold list with an integer cumulative curve so the
run never shows a player-visible max level. Every selected card and all
universal ranks participate in the canonical simulation hash and replay.

**Luck is explicitly deferred.** It becomes a card only once it changes a
truthful rarity, offer, chest, or drop system.

### 3. Meta progression V1

- Award idempotent **Essence** on terminal runs.
- Persist a versioned local profile outside the simulation.
- Pass a normalized, immutable starting loadout into a run.
- Start with one small capped purchase, such as starting health or starting
  magnet, to prove the between-run improvement loop.

### 4. Modes and difficulty

- **Normal:** ends at the authored 12-minute boundary; the boss must be tuned
  against a conservative expected build.
- **Higher difficulties:** use separate, fingerprinted run definitions rather
  than invisible multipliers.
- **Hardcore Endless:** becomes a later, clearly opt-in mode unlocked after
  normal/meta progression; it has its own ramp and does not reuse accidental
  normal-mode overtime.

## Determinism rules

- Universal offers receive a domain-separated seeded RNG; they never consume
  spawn RNG implicitly.
- Replays record typed card selections and the normalized run-start loadout.
- The XP curve, universal catalog, universal ranks, pickup attraction state,
  and offer state are all versioned/hashable gameplay facts.
- Terminal Essence settlement is app-owned and idempotent, so a replay or page
  refresh cannot duplicate a reward.

## Validation gates

- Unit tests for the curve, ranks, card eligibility, fallback offers, and
  pickup attraction.
- Replay/hash parity with mixed animal and universal choices.
- Browser smoke of an ordinary manual run: no max level, visible magnet pull,
  pause summary, and clear terminal reward.
- Human playtest before balancing difficulty unlocks or Hardcore Endless.
