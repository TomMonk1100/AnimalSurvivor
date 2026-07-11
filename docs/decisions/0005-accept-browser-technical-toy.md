# ADR 0005: Accept the Browser Technical Toy with Renderer Debt

**Status:** Accepted for Gate 1 only  
**Date:** 2026-07-10

Renderer-debt consequences below were subsequently resolved by
[`ADR 0006`](0006-gpu-instanced-swarm-renderer.md).

## Decision

Adopt `apps/web-toy/` as the Gate 1 browser integration shell after independent
review, dependency hardening, code corrections, and live WebGL QA. It proves the
fixed-tick simulation/renderer boundary, keyboard and pointer input plumbing,
generation-safe view reuse, deterministic stress harness, and responsive shell.

The accepted copy derives from external commit
`b21fbaa` but contains acceptance revisions and is not a byte-for-byte mirror.

## Acceptance revisions

- Upgraded vulnerable Vite, Vitest, and Happy DOM locks; current audit is clean.
- Corrected multi-tick catch-up interpolation to retain adjacent tick snapshots.
- Normalized keyboard diagonals before producing canonical `TickInput`.
- Fixed a shell-quoting bug in the stress command.
- Replaced the false zero draw-call diagnostic with measured per-render counts.
- Added rolling p95/p99 frame-time display and an accelerated stress mode that
  auto-pauses exactly at tick 18,000.
- Fixed mobile HUD/control overlap and made the touch zone visible.

## Consequences

- Gate 1 may proceed to Greg's fox rig and socket integration without rebuilding
  the browser shell.
- The renderer is not a production swarm renderer. It measured 1,038 draw calls
  at 1,000 enemies because shared materials do not batch geometry.
- Hardware instancing is mandatory before low-end-device or production
  performance claims.
- The roughly 488 KB gzip initial JS bundle must be revisited before public web
  distribution.
- This decision does not pass Gate 2; real human playtesting remains mandatory.

## Evidence

See [`../verification/web-toy-audit.md`](../verification/web-toy-audit.md).
