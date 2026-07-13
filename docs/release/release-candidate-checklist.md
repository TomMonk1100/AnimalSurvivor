# AnimalSurvivor Release-Candidate Checklist

This checklist distinguishes automated readiness from evidence that still
requires owner or player action. A green automated section is not a V1 ship
decision.

## Automated evidence — green on 2026-07-12

- [x] Headless simulation: 249 tests, typecheck, lint.
- [x] Trait runtime: 73 tests, typecheck, lint.
- [x] Run director: 73 tests, typecheck, lint.
- [x] Web toy: 323 tests, typecheck, lint.
- [x] Authored runtime asset dimensions, SHA-256 ledger rows, and 17 MB payload
      budget pass; the audited Fox glTF and curated CC0 Forest glTF props pass
      their structural, buffer, texture, and source-reference validation.
- [x] Production artifact builds once, hashes ten generated files, and
      exposes build identity in the title, meta tag, and manifest.
- [x] Temporary served-artifact smoke fetches the exact build, all three hero
      and both boss portraits, Saltwind route, UI markers, and missing-asset 404.
- [x] Automated in-app browser boot shows the exact build identity, hero
      portraits, prep controls, responsive modal focus/inert boundaries, a
      successful Start-run transition, and zero console warnings/errors;
      details are in `docs/verification/browser-boot-2026-07-12.md`.
- [x] All four npm lockfiles pass the deterministic integrity/license metadata
      check; final legal and license review remains open.
- [x] Root command `npm run verify:release` passes end to end.
- [x] Diagnostic deterministic benchmarks run from the root release command;
      retained results are in `docs/verification/release-bench-2026-07-12.md`.
- [x] Authored enemy content manifest covers every current director archetype
      with simulation index, behavior, reward, visual role, and spawn profile.
- [x] Field Guide horizontal presentation includes the complete Mythic recipe
      catalog, presentation palettes, and a deterministic six-card Habitat
      Atlas derived from archived runs without adding currency or run state.
- [x] Trait/enemy production template records behavior, target rules, state,
      progression, visual/audio/UI, replay/hash, tests, performance, and asset
      provenance requirements.
- [x] Automated input coverage includes keyboard, touch joystick, mouse
      click-drag, and standard gamepad left-stick/D-pad precedence; physical
      device parity remains an open ship-evidence gate. The live controls also
      identify the last selected input source with device-aware guidance, and
      persistent unique keyboard remapping and visibility-owned suspend/resume
      are covered separately; browser zoom remains available and safe-area
      layout is statically covered.
- [x] Opt-in audio exposes master, music-bed, and SFX mix controls with silent
      fallback, deterministic phase/terminal routing, and source-aware launch
      trait, instinct, boss-telegraph, and support-warning cues; final authored
      audio and device listening evidence remain open.

Latest local artifact identity:

```text
0.1.0+c2c56a14f039.2b20bd83.5e81a607
```

## Open ship gates

- [ ] Fresh/private browser smoke against the hosted Pages artifact.
- [ ] At least 12 structured owner sessions across all three heroes.
- [ ] External hook/retention evidence and a written proceed/revise decision.
- [ ] Final rigged Benny and Gracie hero assets and authored boss/environment
      meshes replace the current procedural arena primitives.
- [ ] Final audio/music mix and device/browser performance matrix are signed.
- [ ] Repository software license, store/title clearance, and final legal review.
- [ ] Owner signs the final go/no-go decision.

Until every open item is checked, the project remains a Gate 1 alpha and must
not claim V1 release completion.
