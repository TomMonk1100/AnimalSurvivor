# Wild Splice browser QA record

**Scope:** local technical browser inspection of the live Wild Splice offer and
resolution path. This is engineering evidence only; it is not a balance
approval, final-art approval, accessibility sign-off, or owner playtest.

## Setup

The local `apps/web-toy` dev build was opened with `debug=1`, `autopilot=1`,
and one of the debug-only `fusionQa` scenarios. Each scenario creates its two
rank-five parents through the normal `TraitRuntime` API, leaves the resulting
fusion unresolved, and then uses the app's ordinary card and resolution path.
The fixture is unavailable without `debug=1`; it does not alter normal-run
content, simulation authority, or the stored fusion result.

| Scenario | Local route | Observed result |
| --- | --- | --- |
| Wild | `http://localhost:5175/?debug=1&autopilot=1&fusionQa=wild` | The Static Acupuncture Wild Splice offer identified Porcupine Quills and Electric Eel Coil. Resolving it produced one fused row beside the starter in the paused **2/5** active build, with a braid naming both parents. |
| Perfect Pair | `http://localhost:5175/?debug=1&autopilot=1&fusionQa=perfect` | The Gilded Thornstorm Mantle offer identified Porcupine Quills + Puffer Pouch as a Perfect Pair. After resolution, the live arena showed the thorn-ring/seam treatment around Scout; the paused build retained **GILDED Thornstorm Mantle (Uncommon) — Perfect Pair · 1 slot · 1 logical slot** and its parent braid. |
| Support | `http://localhost:5175/?debug=1&autopilot=1&fusionQa=support` | The Steady The Polite Kidnapping offer identified Puffer Pouch + Bat Ears as a Support Chimera. After resolution, the live arena showed the retained attachment/seam treatment; the paused build retained **STEADY The Polite Kidnapping (Common) — Support Chimera · 1 slot · 1 logical slot**, its chassis/donor description, and its parent braid. |

## Notes and evidence boundary

- The three fixtures exercised the real offer card, `fuseEvolution` action,
  fused visual projection, and active-attacks build row. The card copy and
  saved preview matched the named pair kind in each scenario.
- The Perfect and Support captures were inspected at normal browser scale after
  the proof panel was collapsed, making the retained parent attachments and
  duotone/seam presentation visible in the arena. The completion state was
  emitted on resolution; deterministic Announcer copy is separately covered by
  `test/fusion-announcer.test.ts`.
- This short local inspection did not make a player judgment about power,
  fairness, reduced-motion/flash comfort, touch behavior, low-end WebGL, or
  final visual quality. Those require a separately recorded human playtest.
