# Browser Technical Toy Acceptance Audit

**Audited:** 2026-07-10  
**Source:** external commit `b21fbaa`  
**Accepted location:** `apps/web-toy/`

## Outcome

Accept with revisions as a Gate 1 technical toy. Simulation/render separation
and browser determinism are validated. Rendering is adequate on the tested M4,
but the one-view/one-draw architecture is explicit technical debt.

## Boundary and supply check

- Source commit added 30 files under `apps/web-toy/` only.
- Imported source and metadata while excluding nested Git state, `node_modules`,
  and generated `dist`.
- Runtime dependency: PlayCanvas 2.20.6 (MIT).
- Development tools were updated to Vite 8.1.4, Vitest 4.1.10, and Happy DOM
  20.10.6 after the supplied lock reported six advisories, including two
  critical development-tool findings.
- Updated installation reports zero known vulnerabilities.

## Reproduced gates after revisions

| Gate | Result |
|---|---:|
| `npm ci` | passed |
| `npm run typecheck` | passed |
| `npm run lint` | passed, zero warnings |
| `npm test` | 53 passed, 0 failed across 8 files |
| `npm run build` | passed |

Production output was approximately 1.91 MB minified / 488 KB gzip. Vite warns
that the chunk exceeds 500 KB and externalizes PlayCanvas worker-only
`node:worker_threads` references. The tested primitive scene produced no browser
console warnings or errors.

## Live browser evidence

Environment: Codex in-app browser, Apple M4 host, 390 × 844 viewport, accelerated
five-minute deterministic stress harness.

| Signal at auto-pause | Result |
|---|---:|
| Simulation tick | 18,000 |
| Browser final hash | `1e4715bcc24cc0ee` |
| Headless-control hash | `1e4715bcc24cc0ee` |
| Live/high-water enemies | 1,000 / 1,000 |
| Draw calls | 1,038 |
| FPS | 60.0 |
| Rolling frame p95 | 16.8 ms |
| Rolling frame p99 | 17.0 ms |
| Dropped accumulated sim time | 0 seconds |
| Console warnings/errors | none |
| Horizontal overflow | none; 390 px scroll/client width |

Pause held tick 5,005 and hash `ad065ef86fdd859e` unchanged across observations.
Resume continued stepping. Renderer-off continued simulation while reporting
zero draws; renderer-on restored the scene.

## Findings fixed during acceptance

1. Catch-up rotated interpolation buffers once per rendered frame instead of
   once per simulation tick, so multi-tick frames interpolated across a several-
   tick jump.
2. Keyboard diagonals had magnitude square-root-of-two despite the canonical
   input contract requiring magnitude at most one.
3. The `npm run stress` URL was not shell-quoted, so `&` broke the command.
4. Manual `app.render()` bypassed PlayCanvas's normal stats-update cycle, making
   the HUD claim zero draw calls while objects were visibly rendered.
5. The locked test/dev stack carried current security advisories.
6. The 390 px layout placed unwrapped HUD text underneath the controls.
7. Stress mode did not accelerate or stop on the canonical comparison tick.

## Known limitations and required follow-up

- Pooled entities sharing materials still cost roughly one draw per visible
  primitive. Implement hardware instancing before claiming low-end support.
- The initial bundle is large for a web game; investigate slimmer PlayCanvas
  imports and code splitting after GLB requirements are known.
- GLB/Draco parsing is not exercised; recheck Vite's worker externalization when
  Greg's asset is introduced.
- Physical touch hardware and forced WebGL context loss were not manually tested.
- The default simulation produced only five projectile views at high water;
  browser rendering with 500 simultaneous projectiles still needs a dedicated
  fixture after instancing.
- The current visuals are diagnostic primitives, not game art.

## Instancing follow-up completed

ADR 0006 replaces the original one-view/one-draw renderer. The accepted live
fixture now submits 1,000 enemies, 500 projectiles, and 200 pickups in four total
draw calls while preserving the tick-18,000 hash `1e4715bcc24cc0ee`. Automated
coverage increased to 64 tests across 10 files. On the same 390 × 844 M4 test
surface, the saturated instanced run held 60 FPS with rolling p95 17.6 ms and
p99 17.7 ms and no console errors.
