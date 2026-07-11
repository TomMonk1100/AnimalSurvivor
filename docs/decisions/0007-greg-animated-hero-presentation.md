# ADR 0007: Greg Animated Hero Presentation

**Status:** Accepted for Gate 1  
**Date:** 2026-07-10

## Decision

Replace the browser toy's cyan player sphere with the audited Quaternius fox
glTF as Greg's first playable presentation. Keep the sphere as an asynchronous
load/error fallback. Animation, attachment, and model state remain renderer-only
projections of immutable simulation snapshots.

Greg uses authored `Idle`, `Walk`, `Attack`, two hit reactions, and `Death`
tracks through a fixed-tick animation reducer. Six stable gameplay sockets map
to audited skeleton bones with a hero-root fallback. The first live attachments
are Porcupine Quills on `back` and Puffer Pouch on `head`; they are coded Bud
prototypes that prove upgrades can remain physically attached while the rig
animates.

The repository-level glTF remains the single source asset. Vite fingerprints it
for production and explicitly allows the repository root during local serving.
A soft shadowless light rig makes authored materials readable beside the
unlit, hardware-instanced swarm.

## Evidence

- 99 automated browser tests pass across 16 files; the headless suite passes 115.
- Strict type-check, zero-warning lint, and production build pass.
- Production emits the audited 3.163 MB `Fox.gltf` as a fingerprinted asset.
- Live 390 × 844 browser run: 60 FPS, p95 18.7 ms, no dropped sim time, and no
  console warnings/errors on the tested M4.
- Greg loads in place of the fallback, follows/faces movement, transitions among
  authored animation states, and carries both head and back attachments.
- Simulation determinism is unchanged: the presentation consumes snapshots and
  never writes gameplay state or RNG.

## Consequences

- Animated-rig and live attachment feasibility are proven for Gate 1.
- Greg currently uses prototype socket geometry, not final character art.
- The hero adds roughly ten draw calls because the source glTF and each coded
  attachment part are ordinary mesh instances. Swarms remain three instanced
  draws; hero batching/mesh merging is deferred until profiling warrants it.
- The 3.16 MB model and roughly 491 KB gzip initial JS make load-time/code
  splitting a future web-release task, not a blocker for this serious hobby
  prototype.
- Work may proceed to Greg's Rush Rake instinct and the deterministic
  Porcupine/Puffer/Thornstorm runtime integration.
