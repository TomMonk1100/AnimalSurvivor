# Enemy content manifest

The run director emits stable archetype IDs, while the renderer-free simulation
owns numeric pools and the browser owns pooled visual batches. Their bridge is
the data-defined manifest at
`packages/sim/src/run-enemy-content.ts`.

| Authored ID | Simulation archetype | Behavior | Reward | Visual role | Spawn profile |
| --- | ---: | --- | --- | --- | --- |
| `enemy:fodder` | 0 | approach | standard | regular | arc × 4 |
| `enemy:runner` | 1 | weave | standard | regular | lane × 3 |
| `enemy:brute` | 2 | brute | standard | regular | ring × 1 |
| `enemy:spitter` | 3 | ranged | standard | ranged | arc × 1 |
| `enemy:charger` | 4 | charger | standard | charger | lane × 1 |
| `enemy:denial` | 5 | denial | standard | denial | cluster × 1 |
| `enemy:flanker` | 6 | flanker | standard | flanker | arc × 2 |
| `enemy:support` | 7 | support | standard | support | cluster × 1 |
| `enemy:elite` | 2 | elite | elite | elite | arc × 1 |
| `enemy:boss` | 2 | boss | boss | boss | ring × 1 |

The adapter looks up this table by ID, applies only the authored elite/boss
reward multiplier overlay, and preserves the deterministic placement algorithm.
Unknown IDs are counted as unsupported content rather than silently falling
back to a different enemy. The manifest is validated in the adapter test suite;
any future archetype must add its complete behavior, reward, visual, and spawn
record before it can be emitted by a run.
