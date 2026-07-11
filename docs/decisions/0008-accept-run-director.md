# ADR 0008: Accept the Deterministic Run Director

**Status:** Accepted with revisions for the Gate 1 Greg vertical slice  
**Date:** 2026-07-10

## Decision

Adopt `packages/run-director/` as the renderer-independent authority for Greg's
12-minute encounter schedule, phase changes, elite beats, boss entrance,
overtime, victory, and defeat. The simulation consumes its pure events through
a structural port; the director never owns entity pools or rendering.

The legacy simulation wave scheduler remains available for isolated benchmarks
and compatibility tests, but is disabled whenever a run director is injected.

## Evidence

- The returned package passed 60 tests and lint before import.
- Review found that public run saves were not bound to the authored definition.
  The imported copy now wraps state with the eight-hex content fingerprint and
  rejects mismatched or legacy raw-state restoration.
- The hardened package passes 61 tests and lint.
- The combined headless integration passed 154 tests before the final replay
  schema assertion was added; its source/type gate passed with Node declaration
  checking skipped because local reads of dependency `.d.ts` files were
  intermittently stalling.
- A concrete 600-tick execution using the real `RunDirector`, real
  `TraitRuntime`, and accepted simulation completed with deterministic state.
- A concrete replay containing a trait selection reproduced the exact final
  hash.

## Integration policy

- Authored `fodder`, `runner`, and `brute` roles map to prototype archetype
  indexes 0, 1, and 2.
- Elite and boss roles temporarily use the brute prototype with health
  multipliers of 5 and 30.
- Formation placement is deterministic arithmetic derived from event tick and
  sequence; it consumes no simulation RNG.
- Boss entity identity, total kills, run content fingerprint, and director state
  hash are canonical simulation state.
- Replay schema version is 3 and includes the run content fingerprint.

## Remaining limits

- Elite/boss-specific visuals and warning presentation are not implemented.
- Spawn tuning and the 12-minute curve require human playtesting.
- The web bundler's PlayCanvas dependency optimizer stalled during this review,
  so the new web wiring still needs a clean live-browser pass.
