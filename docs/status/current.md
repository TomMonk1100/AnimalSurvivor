# Current Project Status

**Updated:** 2026-07-11
**Active milestone:** Gate 1 — Forest Arsenal playable alpha
**Project state:** Playtestable, with integration validation in progress
**Budget model:** AI subscription usage; no additional cash

## What is playable now

Greg has a deterministic browser survival loop with:

- keyboard and touch movement, automatic attacks, XP collection, level-up
  choices, pause/resume, and a local prep screen;
- a readable forest-clearing presentation rather than a black grid-only arena;
- an eight-minute normal run: Opening (0:00–1:00), Pressure (1:00–3:00),
  Adaptation (3:00–5:00), Mutation (5:00–6:30), and Boss (6:30–8:00);
- off-screen approach waves, weaving runners, ranged Spitters, ranged elites,
  six warned elite requests, and **The Final Threat**;
- five active-attack footprints: Greg’s starter Auto-Fire plus up to four
  acquired trait families;
- Quills, Puffer, Electric Eel Coil, and Firefly Colony, with the
  **Thornstorm Mantle** and **Thunderbug Dynamo** two-slot Mythics;
- five distinct neutral passive footprints, rank-up continuation for selected
  passives, and **Essence Cache** as the repeatable finite-upgrade fallback;
- pause-only build details, so active play is not covered by repeated move
  descriptions;
- terminal Essence settlement and a prep-only Starting Vitality purchase for a
  future run.

## Forest Arsenal run contract

Normal mode has a hard **8:00** boundary and no overtime. The boss is requested
at **6:30** after a warning at **6:10**. Elite requests occur at **2:00**,
**3:40**, **4:30**, **5:15**, **5:45**, and **6:05**; each gets a five-second
warning.

Active builds cannot exceed the starter plus four acquired traits. A Mythic
retains the two slots used by its ingredients. Neutral builds cannot exceed five
distinct passive families, though a selected passive can continue ranking up.
**Sharpened Instinct** and **Rapid Instinct** now affect every current attack,
not only starter fire.

## What still needs evidence

- A fresh human playtest of the compressed eight-minute curve: is pressure
  urgent, fair, and readable from opening through boss?
- Attack clarity: can a player distinguish Quills, Puffer, Coil, and Firefly;
  understand each Mythic; and find build details naturally in the pause panel?
- Forest readability: does the clearing improve movement and threat awareness
  without hiding pickups, projectiles, or enemy silhouettes?
- Human confirmation that the verified deterministic/browser integration feels
  as clear and satisfying as its automated coverage: slots, evolutions,
  passives, and the eight-minute terminal boundary all have focused tests.
- Physical touch hardware, low-end devices, forced WebGL context recovery,
  polished combat audio, authored final assets, and broader external playtests.

## Next milestones

1. Conduct focused owner playtests using
   [the Gate 1 guide](../playtests/gate1-owner-playtest.md), then tune only
   values supported by that feedback.
2. Expand from the first four acquired attacks to a wider candidate pool, so
   five-slot builds make increasingly meaningful choices rather than merely
   filling every available family.
3. Design a truthful Luck system and future difficulty definitions only after
   the normal run and early meta loop are enjoyable.
4. Add selectable harder modes and Hardcore Endless as explicit later choices,
   never as hidden normal-mode overtime.

## Deliberately deferred

Luck, rerolls, chests, rare drops, larger meta-progression trees, broader enemy
families, a complete roster of animal heroes, final audio/art, selectable
difficulties, and Hardcore Endless are not represented as shipped features.

Historical acceptance records, ADRs, and verification artifacts remain in their
dedicated documentation; this page describes the current playable target and
the evidence still needed.
