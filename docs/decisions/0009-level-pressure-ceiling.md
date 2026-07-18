# ADR 0009: Expand the Authored Level-Pressure Ceiling

**Status:** Accepted for V1.3 pressure and tempo tuning
**Date:** 2026-07-18

## Context

The run director scales discretionary wave cadence and live-enemy caps through
an authored `LevelPressureConfig`. Its original validation bounds allowed at
most three steps, one additional soft-cap slot per step, and two additional
hard-cap slots per step. Those limits encoded V1.2's deliberately modest
content intent; they were not scheduler or determinism safety properties.

The deterministic V1.3 pressure lab showed that mid- and late-run pressure may
need a broader response to player level. Plan Amendment 1 explicitly separates
this contract decision from the later content tuning so rejected tuning cannot
silently redefine validation policy.

## Decision

Raise the accepted authored ceilings as follows:

| Field | Previous ceiling | New ceiling |
| --- | ---: | ---: |
| `maxSteps` | 3 | 6 |
| `softCapPerStep` | 1 | 3 |
| `hardCapPerStep` | 2 | 5 |

All values remain positive integers. `hardCapPerStep` must remain greater than
or equal to `softCapPerStep`. Definition validation still rejects any rule that
would reduce a phase's discretionary interval below one tick or collapse its
soft/hard-cap gap.

## Consequences

- Authored content may use more level-responsive pressure, but no production
  content changes merely because the validation ceiling changed.
- The spawn scheduler continues to emit at most one discretionary decision per
  tick. Tests exercise the new ceiling through the real cap resolver and spawn
  scheduler and prove deterministic replay of the resulting state hash.
- Content fingerprints already include every level-pressure value, so authored
  uses of the new headroom remain compatibility-visible.
- This decision does not authorize hero-specific defenses, XP acquisition
  changes, a renderer-owned gameplay path, or unbounded density.
