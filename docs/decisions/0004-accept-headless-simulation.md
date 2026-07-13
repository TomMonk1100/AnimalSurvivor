# ADR 0004: Accept the Headless Simulation Spike with Revisions

**Status:** Accepted for Gate 1  
**Date:** 2026-07-10

## Decision

Adopt `packages/sim/` as the renderer-independent starting point for the
Gate 1 technical toy. Preserve its fixed-tick TypeScript architecture, seeded
RNG, typed-array pools, generation IDs, enemy spatial grid, targeting policies,
wave director, replay recorder, and canonical state hash.

The imported swarm commit was independently audited and revised before
acceptance. The accepted copy is not a byte-for-byte mirror of external commit
`8838735520891e7f36724bc0566cd2c719f025e8`.

## Required acceptance revisions

- Replays carry an exact gameplay-config fingerprint as well as a schema
  version, preventing a replay from silently running against changed balance.
- Direct movement input is canonicalized before recording and simulation.
- Replay parsing rejects non-finite numbers.
- Config, clock, pool, grid, and packed-ID limits fail fast.
- State hashes cover the config identity, all public player fields, and last
  movement direction used by targeting.
- A separate saturated-projectile benchmark complements the original
  1,000-enemy benchmark.

## Consequences

- Gate 1 renderer work may integrate against this package rather than rebuilding
  simulation primitives.
- Simulation success does not greenlight rendering performance. The browser toy
  still needs its own frame-time, draw-call, memory, and low-end-device gate.
- Replay hashes are supported only within a tested JS runtime/architecture until
  cross-engine determinism is explicitly proven or transcendental math is made
  engine-independent.
- Piercing projectiles must gain per-projectile hit memory before their behavior
  is treated as production combat semantics.

## Evidence

See [`../verification/headless-sim-audit.md`](../verification/headless-sim-audit.md).
