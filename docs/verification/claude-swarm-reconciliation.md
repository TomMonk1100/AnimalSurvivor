# Claude Swarm Reconciliation

**Updated:** 2026-07-12
**Source package:** `/Users/adammuncie/AnimalClaude/swarm-package/`
**Status:** reconciled for owner-side execution; no speculative prototype merged

## Decision summary

The Claude swarm package is useful as a research and decision map, but it was
created without repository, GitHub, browser, or player access. Its standalone
code is therefore reference material, not live implementation. The package's
highest-confidence conclusion agrees with the current project boundary:

> Human evidence on the compact 8:00 / 6:30 loop is more valuable than adding
> breadth before readability and pressure are understood.

The current repository has since expanded from the package's Greg-only snapshot
to three founding heroes. The authoritative implementation state is now:

- Greg, Benny, and Gracie are selectable before a run.
- Hero identity is persisted, included in the version-2 run-start fingerprint,
  and validated by cross-hero replay tests.
- Benny and Gracie use procedural low-poly prototype silhouettes with shared
  visible attachment sockets and renderer-only identity markers.
- All three share the current six-family attack catalog intentionally.
- Normal remains eight minutes, with The Final Threat entering at 6:30 and no
  hidden overtime.

## Reconciliation table

| Swarm recommendation | Owner-side decision | Current evidence or action |
| --- | --- | --- |
| Run a focused Gate 1 human playtest | Adopt immediately | [`gate1-owner-playtest.md`](../playtests/gate1-owner-playtest.md) now covers all three heroes and the current run contract. |
| Capture structured observations | Adopt immediately | [`gate1-data-sheet.csv`](../playtests/gate1-data-sheet.csv) adds a hero column and the swarm's core behavioral fields. |
| Prioritize attack/body readability | Adopt as a bounded implementation target | Hero cards, stat lines, character lines, attachment projection, procedural silhouettes, and identity rings are present; human confirmation is still open. |
| Add deterministic CI guards | Mostly already present; strengthen only at real boundaries | Existing package tests cover canonical hashes, fingerprints, replay round-trips, target tie-breaks, pool safety, pause parity, and forbidden randomness. New hero catalog alignment and cross-hero replay tests protect the roster expansion. |
| Ship the six `safe_now` neutral upgrades | Defer | The package's validator and example values were not designed against the live catalog. Do not merge them until the human playtest produces a GO and each card has a live simulation contract. |
| Add one new enemy or rebalance with the balance lab | Defer until evidence | The balance and enemy files remain standalone examples; current pressure should be judged first. |
| Import final art, modes, Luck, Hardcore Endless, or release work | Defer | These remain explicitly gated on human evidence, device testing, and new deterministic contracts. |
| Enforce asset provenance and bundle/device checks | Adopt as QA work, not feature scope | The existing asset ledger remains authoritative; production build succeeds, but low-end and context-loss behavior still require hardware evidence. |

## Standalone package verification

The runnable Claude artifacts were executed from their own packet directories on
2026-07-12:

- balance lab: 18 passing tests;
- content validator: 16 passing tests;
- enemy prototypes: 21 passing tests;
- meta validator: 18 passing tests;
- determinism reference check: 19 passing tests.

Total: **92 standalone tests passing**. These results validate the package's
internal examples only; they are not AnimalSurvivor integration evidence.

## Next evidence gate

Run the owner playtest with at least two heroes, preferably one Benny opening and
one Gracie opening in addition to Greg. Record whether each starting tradeoff is
felt, whether the selected animal stays identifiable during combat, and whether
the shared attachment catalog remains readable across silhouettes.

The next implementation decision follows the result:

- **GO:** choose one narrow, truthful post-playtest step, such as a live neutral
  upgrade backed by the real simulation contract.
- **ITERATE:** fix the specific comprehension, pressure, or readability issue
  and repeat the focused test.
- **STOP:** rethink the compact loop if players cannot understand movement,
  XP, upgrades, or the body-as-loadout hook.

Do not treat this document, the swarm synthesis, or automated tests as a human
playtest result.
