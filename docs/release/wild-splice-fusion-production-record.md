# Wild Splice Fusion Production Record

**Status:** implementation record. This is not a release declaration, a balance
approval, final-art approval, or human-playtest result. Mark a verification item
complete only with its captured command output and any required manual evidence.

**Design source:** [`WILD-SPLICE-FUSION-PLAN.md`](../../WILD-SPLICE-FUSION-PLAN.md)

## Identity and scope

| Field | Record |
| --- | --- |
| Content ID | Wild Splice / synthesized Chimera evolution |
| Target | Greg Forest Arsenal's 12 attack traits |
| Content type | Deterministic, terminal Master fusion; two Masters become one logical attack slot |
| Outcome space | 66 unordered Pair Bases, including 6 authored Perfect Pairs and 6 utility-only Support Chimeras; 16 Temperaments × 5 Stat Leans gives 5,280 composition shapes covered by a dedicated validation sweep |
| Owner boundaries | `packages/trait-runtime` owns eligibility, synthesis, state, scheduling, and hashes; `packages/sim` owns authoritative combat; `apps/web-toy` only presents snapshots and events |
| Source paths | `packages/trait-runtime/src/chimera/`, `evolution-resolver.ts`, `behavior-runtime.ts`, `serialization.ts`, and `state-hash.ts`; `packages/sim/src/attack-damage-lab.ts`; `apps/web-toy/src/diagnostics/chimera-lab.ts`, presentation, render, and Greg attachment paths |
| Asset/provenance | No new externally sourced art asset is claimed here. The current seam, palette, and temperament presentation are code/procedural paths; any later asset addition needs its own ledger/provenance record and asset gate. |
| Intended build | Local release gate passed on 2026-07-16; publication remains subject to the configured hosting account. |

The authored catalog remains immutable. Synthesized definitions are derived at
runtime and do not become catalog entries. The existing six recipe IDs remain
the Perfect Pair identities; other pairs use canonical
`chimera:<first>+<second>` IDs in catalog order.

## Behavior contract

- A fusion is offered only for two owned, enabled rank-5 Masters. It remains an
  explicit, free player choice; it is never auto-resolved.
- Perfect Pairs are listed before wild pairs. A successful fusion disables both
  parents, consumes one logical slot, and retains the parents' socket footprint
  for renderer-facing attachment state. A Chimera cannot fuse again in v1.
- When a pair becomes Master-ready, its preview is recorded from the immutable
  run seed, canonical pair ID, and readiness ordinal. Reopening an offer does
  not consume the offer RNG or reroll its Temperament, Stat Lean, or Announcer
  flavor line.
- Synthesis uses a fixed chassis-priority table, the chassis's rank-5 behavior,
  one donor graft, a Temperament, and a Stat Lean. It composes only the existing
  command vocabulary; the simulation remains the sole authority that resolves
  targeting, hits, damage, control, and rewards.
- Puffer and Bat control grafts are ordered preludes, so their telegraph/control
  commands fire before the payload on the same fixed-tick trigger. Apex Whisper
  retains the donor's full Master scheduler alongside the fused chassis rather
  than reducing it to a synthetic one-command rider.
- Solver and validator limits are part of the contract: at most four phases,
  at most three commands per trigger, chain jumps at most 7, total orbiting
  count at most 16 per trigger, pierce at most 255, and finite rounded numeric
  values. Support Chimeras reserve a real damage rider and utility effect; no
  more than one Support Chimera may be active in a run.
- Eel Arc, Gecko Residue, Crab Impact, and Skunk Miasma declare
  `anchor: 'triggerTarget'`. Within the authoritative command batch, the
  executor selects and retains the triggering payload's target coordinate by
  source ID; follow-up grafts execute at that retained coordinate even if the
  target later leaves the pool. `onCommandOriginResolved` copies that exact
  combat origin to the matching presentation event. This is deterministic
  target-selection anchoring, not a late collision, hit, or renderer callback.

### Power contract

Master DPS anchors are generated from the deterministic authoritative
20-second damage lab. The solver applies the following target shapes before
the explicit, fingerprinted Chimera Lab calibration layer:

| Pair class | Target DPS |
| --- | --- |
| Dealer + dealer | `(max + 0.5 × min) × 1.10` |
| Perfect Pair | `(max + 0.5 × min) × 1.20` |
| Dealer + utility | `dealer × 1.25`, with the utility graft strength increased |
| Support Chimera | `0.6 × mean(MASTER_DPS)`, plus control and a damage rider |

Rarity applies the documented envelope after the shape transform. The
per-pair damage and cadence corrections in `lab-calibration.ts` are deliberate
last-mile measurements against the real TraitRuntime → Simulation lab, not UI
or test-threshold adjustments.

## Player-facing presentation contract

- Fusion cards read the persisted preview and show name, rarity, Temperament,
  procedural description, and the one-slot/free/permanent trade.
- On a successful resolution, the app emits a deterministic Announcer toast
  using the persisted flavor index.
- The active-attacks panel presents a Chimera as one logical slot with a braid
  row and both parent names.
- Chimera command tags resolve to a parent-family duotone. Unknown or legacy
  paths retain the established fallback instead of inventing danger-coral or
  reward-mint effects. Show-Off's gold remains restricted to its impact lane.
- The renderer projects retained parent attachments plus the reusable
  `chimera-seam:mythic` attachment. Temperament metadata supplies the seam's
  presentation cue. These are renderer reads only and never feed combat state
  back into the simulation.

## Determinism, save, replay, and compatibility

- `FusionVariant` (seed, Temperament ID, Stat Lean ID), fusion previews, the
  run seed, and fusion-ready count are serialized and included in the canonical
  runtime state hash.
- The runtime-content fingerprint includes the Wild Splice content version,
  generated Master DPS input, and explicit Lab calibration input. The authored
  catalog fingerprint stays separate because generated definitions are not
  catalog mutations.
- State version 4 accepts version-3 saves. Legacy authored evolutions migrate
  without inventing a variant, retaining their authored behavior. If a persisted
  synthesized evolution cannot be resolved, load recovery restores its two
  Master parents rather than bricking the save.
- Replay selections retain the `fusion:<evolutionId>` form. A dynamic pair's
  persisted/derived variant must reproduce the same command stream and hash;
  golden and parity evidence remains required below.
- No RunStartLoadout or profile-schema change is claimed by this record.

## Automated evidence captured

The following local commands passed on 2026-07-16. They establish engineering
evidence, not a human playtest, balance decision, final-art approval, or
accessibility certification.

| Status | Command / check | Required evidence |
| --- | --- | --- |
| [x] Passed | `npm --prefix packages/trait-runtime run typecheck` | Strict runtime contract compiles. |
| [x] Passed | `npm --prefix packages/trait-runtime test` | Fusion eligibility, deterministic preview, all 5,280 synthesis compositions, command bounds, support rider, serialization/migration/recovery, and scheduling tests pass. |
| [x] Passed | `npm --prefix packages/trait-runtime run lint` | Runtime source hygiene remains clean. |
| [x] Passed | `npm --prefix packages/sim run typecheck && npm --prefix packages/sim test && npm --prefix packages/sim run lint` | Authoritative combat and Master-DPS integration remain green. |
| [x] Passed | `npm --prefix packages/sim run check:master-dps` | Generated Master DPS module exactly matches the deterministic lab generator. |
| [x] Passed | `npm --prefix apps/web-toy test -- --run test/chimera-lab.test.ts` | All 66 Steady/Balanced pairs are measured in the real TraitRuntime → Simulation lab within the ±25% envelope; Support Chimeras observe utility effects. |
| [x] Passed | `npm --prefix apps/web-toy test -- --run test/chimera-copy.test.ts test/fusion-announcer.test.ts test/mastery-fusions.test.ts test/active-attacks.test.ts test/attack-vfx-palette.test.ts test/trait-command-presentation.test.ts test/greg-attachment-sockets.test.ts test/greg-trait-visual-projector.test.ts test/greg-attachment-visuals.test.ts` | Fusion card, toast, braid, palette/tag, and seam projection contracts pass. |
| [x] Passed | `npm --prefix apps/web-toy run typecheck && npm --prefix apps/web-toy test && npm --prefix apps/web-toy run lint && npm --prefix apps/web-toy run build` | Full browser package contract is green. |
| [x] Accepted | `npm --prefix apps/web-toy run golden:propose` followed by review of the proposed baselines | Driven/control reproducibility is green. Accepted five-minute hash: `4ae0cc5f4a67a7a1`; the six accepted corpus hashes are recorded in `test/golden-replay-corpus.test.ts`. |
| [x] Passed | `npm --prefix apps/web-toy run verify:agent-smoke` | Built-artifact Start/Pause/Resume and bounded terminal technical-browser evidence is captured; this is not human or visual approval. |
| [x] Passed | `npm run verify:release` | Final local release gate, including supply-chain, deterministic, content, artifact, served-app, and 180-second VFX flash-safety checks, passed. See [`final-review.md`](../vfx/captures/final-review.md) for the compact visual-gate record. |

## Manual and human evidence still required

The local browser technical inspection is recorded in
[`docs/playtests/wild-splice-browser-qa.md`](../playtests/wild-splice-browser-qa.md).
The following owner/human work remains separate from automated evidence:

1. Fuse one wild pair, one Perfect Pair, and one Support Chimera in a browser
   session. Confirm the preview stays stable after deferring it, fusion costs
   one slot, and both parent attachment silhouettes remain visible.
2. For each of those cases, inspect the card, Announcer toast, active-attacks
   braid row, duotone command effects, seam, and Temperament motion tell at
   normal play distance. Check that the effect remains readable without relying
   only on hue and that no reserved danger/reward lane is used incorrectly.
3. Perform owner playtests for power clarity, control readability, fairness,
   build-choice value, reduced-motion/flash comfort, touch/low-end-WebGL
   behavior, and accessibility. Automated DPS or browser smoke output does not
   establish any of these judgments.
4. Extend the dated browser record only after new observations are actually
   made. This document does not claim a player test or final-art review.

## Open scope and release boundary

- Field Guide collection, Wild Splice achievements, Apex Splice, Reckless
  Splice, and new executor command kinds remain out of scope for this v1 record.
- [`docs/status/current.md`](../status/current.md) remains the authoritative
  project/release status. This record documents implementation and local
  engineering evidence; it is not itself a publication, player-feedback, or
  release-approval claim.
- Any future executor-level impact-position work, asset work, profile work, or
  status/release-note change needs its own scoped task and corresponding gates.
