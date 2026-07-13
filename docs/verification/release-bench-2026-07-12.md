# Diagnostic Release Benchmarks — 2026-07-12

These are repeatable Node diagnostics, not universal browser or device gates.
They run from `/Users/adammuncie/GameDev/AnimalSurvivor` on Node v24.11.1,
Darwin arm64, Apple M4. The root `npm run verify:release` command reruns the
three benchmark commands after their package lint gates.

Per-tick timing samples intentionally are not recorded here: JIT warmup, GC,
and host scheduling make them vary across equivalent clean runs. The commands
print their full timing distributions at verification time; this versioned
evidence records the fixed workloads and deterministic hashes instead. A
device performance budget remains future work, not a V1 release claim.

## Simulation package

- Command: `cd packages/sim && npm run bench`
- Warmup/measured ticks: 2,000 / 10,000
- Live enemies at measurement end: 1,000
- Final hash: `cf2f87c1c20e6c79`

## Trait runtime

- Command: `cd packages/trait-runtime && npm run bench`
- Ticks: 18,000
- Commands emitted: 1,308
- Buffer overflow: 0
- Final hash: `2e64f2e1884178b9`

## Run director

- Command: `cd packages/run-director && npm run bench`
- Full-run workload: 28,800 ticks
- Full-run outcome: defeat at the normal deadline
- Full-run final hash: `657c4042`
- Determinism check: two independent runs produced `ed753067`

The browser renderer still requires the named desktop/mobile device matrix and
human context-loss/touch evidence from the V1 plan.
