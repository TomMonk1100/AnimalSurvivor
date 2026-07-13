# Diagnostic Release Benchmarks — 2026-07-12

These are repeatable Node diagnostics, not universal browser or device gates.
They were run from `/Users/adammuncie/GameDev/AnimalSurvivor` on Node
v24.11.1, Darwin arm64, Apple M4. The root `npm run verify:release` command
reruns the three benchmark commands after their package lint gates.

## Headless simulation

- Command: `cd packages/sim && npm run bench`
- Warmup/measured ticks: 2,000 / 10,000
- Live enemies at measurement end: 1,000
- Mean: 49.64 µs/tick
- Median: 47.38 µs/tick
- P95 / P99: 66.83 / 102.67 µs/tick
- Worst: 523.04 µs/tick
- Throughput: 20,120.6 ticks/second
- Final hash: `f02d501d5db9ddd9`

## Trait runtime

- Command: `cd packages/trait-runtime && npm run bench`
- Ticks: 18,000
- Commands emitted: 1,308
- Buffer overflow: 0
- Mean / P95 / P99: 0.000552 / 0.001000 / 0.002833 ms/tick
- Worst: 0.379417 ms/tick
- Final hash: `5530e299f4a43523`

## Run director

- Command: `cd packages/run-director && npm run bench`
- Full 28,800-tick update mean: 0.0004 ms
- Full-run P95 / P99: 0.0007 / 0.0015 ms
- Full-run outcome: defeat at the normal deadline
- Full-run final hash: `bea44e31`
- Determinism check: two independent runs produced `ffe83212`

The browser renderer still requires the named desktop/mobile device matrix and
human context-loss/touch evidence from the V1 plan.
