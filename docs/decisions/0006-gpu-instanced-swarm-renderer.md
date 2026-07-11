# ADR 0006: GPU-Instanced Swarm Renderer

**Status:** Accepted for Gate 1  
**Date:** 2026-07-10

## Decision

Replace one-entity-per-creature rendering with one hardware-instanced PlayCanvas
batch for each repeated category: enemies, projectiles, and pickups. Keep the
unique player as a normal entity so Greg can later replace it with an animated
model.

Each category consumes an allocation-stable `InstancedTransformStore`. It writes
column-major model matrices from adjacent render snapshots, checks complete
generation-packed IDs before interpolation, and snaps fresh/reused slots to
current state. The GPU layer owns a dynamic PlayCanvas instance vertex buffer
and one mesh instance per category.

## Evidence

- 64 automated tests pass across 10 files.
- Type-check, zero-warning lint, and production build pass.
- Live 390 × 844 browser fixture: 1,000 enemies, 500 projectiles, 200 pickups.
- Four measured draw calls: player plus three populated category batches.
- 60 FPS, rolling frame-time p95 17.6 ms and p99 17.7 ms on the tested M4.
- Browser and headless control both end tick 18,000 at hash
  `9e436ff6bc30d8a5`; no dropped simulation time or console errors.

## Consequences

- The draw-call blocker from ADR 0005 is resolved for the technical toy.
- Aggregate batch culling is disabled to prevent incorrect pop-in. Spatially
  chunked batches remain an optional low-end optimization.
- Full retained matrix buffers are uploaded for populated categories each frame;
  dirty-range updates may be added only if profiling shows a bottleneck.
- Production source maps are disabled, reducing generated `dist` from roughly
  6.4 MiB to 1.83 MiB. The first-load JS remains roughly 488 KB gzip because
  PlayCanvas `Application` reaches its parser/worker graph.
- Work may proceed to Greg's animated hero and attachment sockets.
