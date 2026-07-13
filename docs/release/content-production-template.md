# Trait/enemy production template

Every new gameplay content item must complete this record before it enters a
playable build. The goal is to keep authored behavior, player understanding,
deterministic state, and release provenance in one reviewable packet.

## Identity and scope

- Content ID and display name:
- Owner and target biome/hero:
- Content type: trait / evolution / enemy / elite / boss
- Source files and asset ledger row:
- License/provenance and source hash:
- Intended release/build ID:

## Behavior contract

- Fixed-tick behavior and every timer/cadence:
- Targeting policy and deterministic tie-break:
- Spawn/placement formation, distance, count, and caps:
- Damage, health, reward, XP, and progression values:
- Telegraph lead time, danger window, and player counterplay:
- Pool/state fields required; reset behavior on reuse:

## Progression and presentation

- Trait: Bud / Adapted / Mythic values and socket ownership:
- Enemy: standard / elite / boss reward tier and phase availability:
- Visual key, attachment/batch role, scale, palette, and fallback:
- Player-facing title, effect, cadence, tell, answer, and pause/Field Guide copy:
- Audio cue, silent fallback, and visual equivalent for critical sound information:
- Accessibility impact: motion, flashes, contrast, touch, and reduced-quality behavior:

## Determinism and compatibility

- State fields included in canonical hash:
- Replay record and deserialize/migration behavior:
- Content/catalog fingerprint impact:
- Save/profile migration impact, if any:
- Browser presentation state explicitly excluded from gameplay hash:

## Verification gates

- [ ] Structural catalog/content validator passes.
- [ ] Every executable command has a supported command kind and audio mapping.
- [ ] Visual key and player-facing copy exist.
- [ ] Deterministic unit tests cover timing, targeting, caps, reset, and edge cases.
- [ ] Replay round-trip and independent-run hash parity pass.
- [ ] Browser snapshot/presentation test observes the authored tell and result.
- [ ] Performance benchmark remains within the current pool/draw-call budget.
- [ ] Asset dimensions, SHA-256, source license, and payload budget are recorded.
- [ ] Served-artifact verifier confirms the bundled asset and build identity.
- [ ] Release notes and Field Guide/credits copy are aligned with the shipped behavior.

## Current implementation anchors

- Trait/evolution behavior and structural validation:
  `packages/trait-runtime/src/content/` and `apps/web-toy/src/release/content-validator.ts`
- Run archetype mapping:
  `packages/sim/src/run-enemy-content.ts` and
  `docs/release/enemy-content-manifest.md`
- Deterministic replay/hash coverage:
  `packages/sim/test/` and `apps/web-toy/test/golden-replay-corpus.test.ts`
- Player-facing threat copy:
  `apps/web-toy/src/presentation/enemy-glossary.ts`
- Release gates:
  `npm run verify:release`
