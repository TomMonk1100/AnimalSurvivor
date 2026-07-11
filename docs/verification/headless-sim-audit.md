# Headless Simulation Acceptance Audit

**Audited:** 2026-07-10  
**Source:** external branch `codex/headless-sim`, commit
`8838735520891e7f36724bc0566cd2c719f025e8`  
**Accepted location:** `spikes/headless-sim/`

## Outcome

Accept with revisions for the Gate 1 technical toy. The spike demonstrates that
the renderer-free simulation is deterministic within the tested runtime and has
ample CPU headroom at the requested 1,000-enemy workload. It does not validate
browser rendering.

## Supply and boundary check

- External commit contained 32 files and only the declared spike subtree.
- The external repository was clean apart from an unrelated parent `.DS_Store`.
- Imported only source, tests, benchmark, package metadata, and documentation.
- Excluded the nested `.git`, `node_modules`, and generated `dist` directory.
- Runtime dependencies: zero. Locked development dependencies: TypeScript,
  `@types/node`, and its transitive type package `undici-types`.
- `npm ci` reported zero known vulnerabilities on 2026-07-10.

## Reproduced gates after acceptance revisions

| Gate | Result |
|---|---:|
| `npm test` | 106 passed, 0 failed |
| `npm run typecheck` | passed |
| `npm run lint` | passed; 13 source and 13 test files checked |
| `npm run bench` | passed twice with identical final hash |
| `npm run bench:projectiles` | passed twice with identical final hash |

Local environment: Node v24.11.1, macOS arm64, Apple M4.

## Local benchmark evidence

### Original steady-state enemy workload

10,000 measured ticks after 2,000 warm-up ticks, approximately 1,000 live
enemies:

| Run | Mean | Median | p95 | p99 | Worst | Final hash |
|---|---:|---:|---:|---:|---:|---|
| 1 | 19.96 us | 17.67 us | 41.88 us | 49.83 us | 172.13 us | `6ffd958407f4c06d` |
| 2 | 20.56 us | 18.17 us | 42.42 us | 54.13 us | 167.42 us | `6ffd958407f4c06d` |

The original benchmark reached only 3 simultaneous projectiles, so it is not
projectile-scaling evidence.

### Projectile-saturation complement

The acceptance benchmark prepopulates 250 stationary enemy targets and all 500
projectile slots, warms for 20 ticks, then measures 100 steady-state ticks:

| Run | Mean | p95 | p99 | Projectile high-water | Final hash |
|---|---:|---:|---:|---:|---|
| 1 | 49.47 us | 83.67 us | 94.88 us | 500 / 500 | `028ee874e89716c0` |
| 2 | 51.11 us | 84.08 us | 103.17 us | 500 / 500 | `028ee874e89716c0` |

These are development-machine measurements, not hardware-independent pass
thresholds. Browser integration owns the real frame budget.

## Acceptance findings fixed

1. Replay compatibility previously checked only a manually incremented integer;
   different configs with the same version could silently diverge.
2. Direct movement input could exceed the serialized replay range, allowing a
   round trip to change its direction ratio and final state.
3. Replay JSON could parse exponent overflow as infinity.
4. Invalid clock rates, spatial dimensions, pool capacities, and typed-array
   component ranges were not rejected at construction.
5. The state hash omitted public player radius fields and last movement
   direction, which future targeting policies can consume.
6. The required 500-projectile scaling case was not exercised by the original
   benchmark.

## Known limitations carried forward

- Pierced projectiles may hit the same enemy again on later ticks.
- Only enemies are gridded; pickups use a linear scan.
- XP is diagnostic-counted but lost when the pickup pool is full.
- Player and enemy centers clamp to bounds without accounting for radius.
- Spawn-circle positions clamp at world edges and can bunch there.
- Combat and targeting scratch arrays make the modules non-reentrant.
- Cross-process determinism is verified locally; cross-browser/engine hash
  identity is not yet guaranteed.

## Integration contract

- The renderer reads state and events; it never owns simulation time or RNG.
- Browser input must be reduced to one `TickInput` per fixed simulation tick.
- Do not retain the reused `SimEvents` object across steps without copying.
- Do not step simulations concurrently or reentrantly in the same JS isolate.
- Keep content/config changes fingerprinted; do not bypass `validateConfig`.
- Treat the current weapon as generic test content, not final animal design.
- Fix per-projectile hit memory before shipping any piercing evolution.
