# AnimalSurvivor V1 Release Plan and Production Handoff

**Status:** Gate 0 implementation complete; evidence remains open — not a release claim
**Prepared:** 2026-07-12
**Authoritative workspace:** `/Users/adammuncie/GameDev/AnimalSurvivor`
**Current milestone:** Gate 1 — Forest Arsenal playable alpha
**Release model:** Web-first, zero-cash, AI-native hobby production

## Purpose

This document is the standalone execution plan for taking AnimalSurvivor from
its current deterministic playable alpha to a polished Version 1 release.

It deliberately prioritizes a cohesive, readable, visually distinctive game
over raw content count. The product promise is:

> Build an adorable animal into an absurd combat chimera: every meaningful
> power visibly changes its body, every evolution changes its silhouette, and
> every run ends with a hero worth saving and sharing.

Read this file alongside:

- `docs/status/current.md` — current playable contract and latest status;
- `AnimalSurvivor-HANDOFF.md` — technical constraints and historical context;
- `docs/gate0/visual-grammar.md` — approved visual rules;
- `assets/ASSET_LEDGER.md` — asset provenance requirements;
- `docs/playtests/gate1-owner-playtest.md` — current human test procedure.

## 1. Current reality

AnimalSurvivor has a strong technical foundation, but it is not yet release
content.

### What exists

- A renderer-independent, deterministic fixed-tick simulation with seeded RNG,
  pools, replay recording, content fingerprints, and canonical state hashes.
- A PlayCanvas/Vite browser client with GPU-instanced swarm rendering,
  keyboard/touch input, responsive UI, and renderer-only state projection.
- Three selectable founding heroes: Greg the fox, Benny the bull, and Gracie
  the alpaca.
- An 8:00 normal Forest Arsenal alpha with a boss at 6:30, automatic attacks,
  XP, level-up choices, pause, terminal Essence settlement, and a local prep
  screen.
- Twelve launch attack families: Porcupine Quills, Puffer Pouch, Electric Eel
  Coil, Firefly Colony, Mantis Scythes, Gecko Pads, Owl Pinions, Bat Ears, Crab
  Pincers, Armadillo Greaves, Skunk Brush, and Monarch Brood.
- Six launch Mythics: Thornstorm Mantle, Thunderbug Dynamo, Razorstep Chimera,
  Midnight Radar, Meteor Mauler, and Royal Stinkcloud.
- Eight base enemy archetypes: walker, runner, brute, Spitter, Charger, Denial,
  Flanker, and Support, plus elite/boss presentation roles.
- A validated Saltwind Ruins second-biome director definition with distinct
  wave grammar, replay-bound biome selection, and a dedicated arena palette.
- Last review snapshot: 718 automated tests passed across simulation, trait
  runtime, run director, and browser packages, plus typecheck, lint, and build.

### What is still prototype-grade

- Only the Quaternius Fox glTF is an audited runtime hero asset. Benny and
  Gracie are procedural primitive models.
- Attachment meshes, enemies, forest dressing, boss form, most VFX, and audio
  are prototype primitives or procedural feedback, not final content.
- The Final Threat now owns a deterministic charge/lunge and radial-volley
  encounter with renderer telegraphs; Saltwind presents the named Sandglass
  Sovereign identity through its HUD and notices. Final authored models, audio,
  and second-biome environment dressing remain unfinished.
- No human evidence validates the complete 8-minute curve, visual readability,
  mixed builds, meta loop, touch hardware, low-end devices, or context recovery.
- The local profile now has version-five migration, corrupt-save recovery,
  export/import/reset, a bounded Field Guide archive, discovered Mythic recipe
  persistence, the first Forest-to-Saltwind biome unlock, and a deterministic
  final-form portrait/evolution-tree projection, and Mythic-earned presentation
  palettes that carry into arena presentation. Three authored Field Guide
  final-form portrait tiles are now bundled with provenance hashes, and the
  archive now presents a six-card Habitat Atlas derived from victories and
  Mythic forms; broader horizontal unlocks remain unfinished.
- The browser prep screen now persists presentation-only accessibility settings
  and a reduced render-quality tier; device certification and measured
  performance targets remain open.
- A checked-in golden replay corpus now covers all three founding heroes in
  Forest Arsenal and Saltwind Ruins with exact terminal-hash expectations.
- Saltwind now has deterministic ruin landmarks in addition to its distinct
  floor palette and encounter grammar; authored biome props remain open.
- The prep screen exposes a current credits/notices panel backed by the audited
  provenance ledger; the complete current third-party notice and local-storage
  disclosure are checked in, while final repository licensing and legal review
  remain release-candidate work.
- Archived Field Guide entries can copy a stable issue report containing build
  ID, run ID, hero, biome, seed, outcome, duration, kills, and build name.
- The working tree is actively in progress and is not a frozen release
  baseline.

### Planning conclusion

The project should be treated as a robust Gate 1 alpha with the 12/6 launch
content and local-save foundation active. V1 work now proceeds through hero
instincts, enemy/boss roles, final asset production, and the second biome while
preserving the deterministic body-as-loadout contract.

All three hero-instinct slices are now active: Greg's movement/near-miss charge
feeds a replay-safe three-wave Rush Rake burst; Benny's contact charge produces
Brace Bloom space; and Gracie's Scout marks forward threats. Each has
authoritative state, replay/hash coverage, and a dedicated presentation cue.

## 2. Recommended V1 contract

| Area | V1 commitment |
| --- | --- |
| Platform | Web-first static release and itch.io. Steam, iOS, multiplayer, cloud saves, live service, and monetization are out of scope. |
| Heroes | Greg, Benny, and Gracie only. Each has final art, animation, visual profile, automatic instinct, starter attack, and mastery. |
| Biomes | Two tactically distinct biomes with two bespoke multi-phase apex bosses. |
| Builds | 12 base trait families and six Mythics at launch. Increase only if the asset/content pipeline proves fast, deterministic, and readable. |
| Enemies | Eight clear combat roles, biome variants, elites, and bosses. |
| Runs | Keep the current 8-minute normal contract during validation. Set final standard duration from evidence; do not force a longer run by padding health or density. |
| Progression | Field Guide, saved final forms, build history, horizontal unlocks, local save migration/export/import/reset. |
| Quality | Final art, VFX, audio, accessibility, device certification, release engineering, and asset provenance. |

The historical 24-base-trait / 18-Mythic aspiration is a post-launch ceiling,
not a launch requirement. A successful V1 is complete and polished with
meaningful build variety, not merely broad.

### Explicitly out of scope for V1

- A fourth hero;
- Luck, rarity, rerolls, chests, or drop systems;
- Endless, Hardcore, selectable difficulty modes, or co-op;
- Mobile-native/iOS packaging;
- cloud saves or online services;
- battle passes, gacha, ads during play, or multiple currencies.

Each of these changes needs its own truthful gameplay, deterministic,
presentation, and playtest contract after normal mode is proven.

## 3. Non-negotiable architecture and production rules

1. **Simulation is authoritative.** Renderer, DOM, audio, storage, and network
   code may read snapshots or presentation events but may not decide gameplay,
   timing, RNG, combat, rewards, or upgrade results.
2. **Every gameplay feature crosses the whole contract.** New content requires:
   content definition, authoritative state, replay/hash/schema handling,
   snapshot data, visual state, VFX/SFX, player copy, tests, and human evidence.
3. **Keep deterministic packages pure.** No wall-clock time, DOM, renderer
   objects, ambient randomness, or network dependency in deterministic code.
4. **Protect visual readability.** Every legal final build must preserve face
   direction, at least two species cues, ground contact, hurt feedback, and no
   more than three major outer-silhouette changes.
5. **Use art to clarify, not decorate.** Friendly effects, enemy danger,
   pickups, telegraphs, and UI must remain visually distinct under late-run
   density.
6. **Do not ship generic asset-pack identity.** CC0 sources are valid inputs,
   not finished visual identity. Palette, materials, kitbashing, animation
   personality, and gameplay-scale review must make the final result cohesive.
7. **Every imported production asset is traceable.** Preserve source, license,
   source URL, hash, modification history, runtime path, and asset budget in
   `assets/ASSET_LEDGER.md`.
8. **Do not claim a gate without evidence.** Automated tests do not substitute
   for player clarity, fun, retention, touch-device, or low-end-device evidence.

## 4. Release Gate 0: trustworthy build identity

### Implementation status — 2026-07-12

The repository now has the Gate 0 implementation described below: production
builds emit `build-info.json`, `asset-manifest.json`, and a hashed
`dist-manifest.json`; the document title, build meta tag, and prep-screen label
share the same build ID; and the Pages workflow verifies all package roots
before building one artifact that is both preserved and deployed. The evidence
record and local QA procedure live in
[`docs/release/gate0-evidence.md`](docs/release/gate0-evidence.md).

The gate remains open until a fresh/private browser session and hosted preview
prove that the served artifact matches those files, and the owner completes the
required human playtest evidence.

The workspace now also exposes `npm run verify:release` from the repository
root. It runs the three deterministic package gates, the full browser suite,
the three diagnostic deterministic benchmarks, the asset budget gate, the
production build, the hashed artifact check, and the served-artifact smoke
check in one ordered command.

Before any large production effort, make it impossible to test or deploy the
wrong build.

### Required work

- Freeze the current alpha as an exact reviewed commit before V1 work starts.
- Add a public `build-info.json` and in-game build label containing:
  semantic version, commit SHA, build timestamp, content/replay fingerprint,
  asset-manifest hash, and intended deployment base URL.
- Build once in CI, hash every file in `dist`, preserve the immutable
  artifact, run browser smoke tests against it, then deploy that exact artifact.
- Validate authored runtime assets for dimensions, provenance, and a bounded
  payload before the production build can proceed.
- Make deployment depend on aggregate package verification, not a separately
  rebuilt web-only artifact.
- After deployment, verify the page title, build ID, manifest hash, app boot,
  and console state against the expected commit.
- When a service worker/PWA shell exists, include the build ID in cache keys and
  test for stale-cache recovery.
- For local QA, record server PID, port, expected build ID, and shutdown action.

### Why this is a release blocker

During review, a local preview URL resolved an unrelated page while repository
source identified AnimalSurvivor. Treat a generic localhost URL as untrusted
until the served app proves its identity.

### Gate exit

A fresh/private browser session, CI artifact, deployed preview, and in-game
label all identify the same AnimalSurvivor commit and manifest.

## 5. Human proof before content scale

The current alpha must earn expansion through player evidence.

### First validation pass

Run at least 12 observed sessions across Greg, Benny, and Gracie using:

- `docs/playtests/gate1-owner-playtest.md`;
- `docs/playtests/gate1-data-sheet.csv`.

Record hero chosen, phase reached, build choices, cause of death or victory,
confusion moment, device/input type, clarity of attacks, enemy fairness,
Forest readability, boss understanding, terminal/prep understanding, and one
exciting/frustrating moment.

### External hook test

After the current loop is stable, run 30–50 external sessions using a verified
hosted build. Evaluate:

- first-glance understanding of move, survive, collect, choose, evolve, win;
- whether visible body changes influence upgrade choices;
- whether players can name equipped systems from the final silhouette;
- whether attachments or VFX conceal danger;
- whether a player voluntarily begins another run;
- whether the boss, failure, and progression loop are intelligible.

### Go / revise thresholds

Use these as V1 expansion gates:

- at least 70% tutorial/first-run completion;
- at least 35% immediate second-run rate;
- at least 50% mention transformation or appearance without prompting;
- at least 70% identify three equipped systems from the final silhouette;
- fewer than 10% report that visual attachments make danger unreadable;
- no crash/session-loss issue in more than 1% of observed runs.

If the hook fails after two focused iterations, shrink or pivot rather than
adding currencies, content count, or platform scope.

## 6. Full graphics and visual-overhaul plan

### Art-direction lock

Use **Storybook Wildguard** as the sole visual target. Do not average the
historical direction boards.

The desired transformation arc is:

> cute natural hero -> equipped nature champion -> majestic little disaster

The target is warm, optimistic, low-poly fantasy: faceted but expressive,
highly readable, never photorealistic, gory, or visually noisy.

### Camera, lighting, and visual hierarchy

- Prototype and lock a 45–55 degree orthographic three-quarter camera. Maintain
  intuitive screen-direction movement and hero scale of roughly 8–12% of screen
  height in combat.
- Use one soft directional key light, ambient fill, a cheap hero blob shadow,
  and no real-time shadows for swarm enemies.
- Use shared flat/lightly faceted materials and a small palette atlas.
- Player power: coral, teal, brass gold, cream, and limited violet highlights.
- Enemy danger: red-orange, high-contrast dark values, sharp triangular forms,
  and distinct motion.
- Pickups: a unique high-value gold/green treatment that cannot be confused with
  projectiles or hazards.
- Avoid expensive depth of field, dense transparency, fur, cloth/physics
  accessories, or post-process spectacle that affects mobile readability.

### Final visual production inventory

| Surface | V1 requirement |
| --- | --- |
| Heroes | Three optimized, rigged, socket-compatible hero GLBs. Each needs idle, locomotion, attack/instinct, hit, defeat, victory, and personality-loop animation. |
| Attachments | Bud, Adapted, and Mythic visual forms; icon; live card preview; VFX; SFX; Field Guide record; all validated at gameplay scale. |
| Enemies | Final low-poly walker, runner, brute, Spitter/ranged, plus four additional combat-role silhouettes. Swarms remain unskinned instanced meshes. |
| Bosses | Two bespoke apex models with entrance, phase transitions, telegraphs, attacks, defeat, and readable health/goal treatment. |
| Environments | One polished Forest Arsenal biome and one distinct second biome, each with readable floor treatment, edge/spawn treatment, landmarks, foliage, boss space, and performance-safe props. |
| VFX | Attacks, Mythics, impacts, pickups, deaths, elite/boss tells, phase transitions, victory/defeat, and accessibility-reduced alternatives. |
| UI | Title/prep, hero selection, live upgrade preview, HUD, pause/build reference, run summary, Field Guide, settings/accessibility, credits/licenses. |
| Audio | Ambient layer, music states, hero/attack/enemy/boss/UI cues, mix controls, silent fallback, and visual equivalents for critical sound information. |

### Hero treatment

- **Greg:** polished and precise; composed locomotion and economical gestures;
  symmetrical early mutations that become impossible but intentional.
- **Benny:** gentle fortress; close-fitting early attachments, broader late-game
  silhouette, defensive animation language, visibly protective space.
- **Gracie:** curated asymmetry; elegant companion/orbit language, matcha/lilac/
  mango accents, stylish rather than chaotic late-game mutations.

Replace Benny and Gracie's procedural primitives before treating the roster as
release-ready.

### Attachment readability rules

- **Bud:** compact, charming, one socket region.
- **Adapted:** larger or animated, clearly demonstrates the behavior.
- **Mythic:** one fused focal form that removes clutter instead of stacking two
  original kits indefinitely.
- One dominant, one supporting, and one accent attachment may change the outer
  silhouette. Minor passives communicate via markings, aura, companions, or
  cadence.
- Build a deterministic screenshot/turntable matrix for every legal
  hero × attachment × stage × Mythic combination and maximum-complexity build.

### Current attack visual language

- Quills: brass/cream back silhouette and clear piercing lanes.
- Puffer: teal inhale/gather signal followed by a clean push pulse.
- Coil: cobalt tail/cuff identity and a cool, bounded chain path.
- Fireflies: individually readable orbitals, never radial projectile clutter.
- Mantis: directional leaf-green sweep with no false hitbox implication.
- Gecko: readable ground decal that never implies a slow unless the mechanic
  actually slows.
- Mythics: a single fused silhouette and one focal effect, not stacked source
  assets.

### Asset pipeline

Build and enforce this path:

1. Licensed source archive;
2. editable Blender/source asset;
3. normalized, named-socket GLB;
4. mesh/material/bone/texture/animation validation;
5. runtime manifest and staged loader;
6. screenshot matrix and performance budget;
7. asset ledger record and release attribution.

Recommended rules:

- Use shared materials, compressed GLBs, low texture resolution where possible,
  and LOD/staged loading for noncritical assets.
- Require source file, license, hash, modification note, and budget before an
  asset enters a playable build.
- Use image generation for concepts, cards, portraits, and mood boards; do not
  treat a generated bitmap as an optimized runtime 3D asset.

## 7. Gameplay and content production plan

### Hero identities

The founding heroes need real automatic instincts, not only different stats and
starter attacks.

| Hero | V1 identity |
| --- | --- |
| Greg | Movement-charged precision/near-miss loop; Rush Rake is now authoritative with replay, visuals, and existing attack audio feedback. |
| Benny | Contact-charged Brace Bloom creates defensive space and a reactive shockwave; the current pulse is authoritative, with final balance/art evidence still open. |
| Gracie | Periodic Scout marks forward threats for priority targeting; persistent mark state and marked targeting are authoritative, with final balance/art evidence still open. |

Each instinct must have deterministic tests, replay parity, snapshot/view state,
telegraph, VFX/SFX, card/pause explanation, and playtest evidence.

### Launch trait pool

The 12-family launch pool is active in the Forest Arsenal catalog. Each family
has deterministic behavior, Bud/Adapted stages, copy, visual keys, and a paired
Mythic where listed; final authored art and player evidence remain V1 work.

| Pair | Base families | Mythic |
| --- | --- | --- |
| 1 | Porcupine Quills + Puffer Pouch | Thornstorm Mantle |
| 2 | Electric Eel Coil + Firefly Colony | Thunderbug Dynamo |
| 3 | Mantis Scythes + Gecko Pads | Razorstep Chimera |
| 4 | Owl Pinions + Bat Ears | Midnight Radar |
| 5 | Crab Pincers + Armadillo Greaves | Meteor Mauler |
| 6 | Skunk Brush + Monarch Brood | Royal Stinkcloud |

### Required scalable systems before broad content

- Replace hard-coded visual-key maps with validated per-hero socket/attachment
  profiles.
- Replace hard-coded director/enemy ID mappings with data-defined archetype,
  behavior, reward, visual, and spawn mappings.
- Mark targeting and damage-zone commands are now authoritative and replay-safe;
  implement remaining authoritative state for guard/shields, statuses, companions,
  boss phases, telegraphs, and special enemy attacks before content relies on
  them.
- Add a content validator that rejects an offer unless its gameplay behavior,
  visual form, copy, audio cue, and supported command kinds all exist.
- Write one trait/enemy production template covering behavior, target rules,
  pools/state, Bud/Adapted/Mythic values, visual stages, audio, UI copy,
  replay/hash migration, tests, and performance budget.

### Enemy and boss progression

Forest Arsenal now has eight clear roles in the deterministic prototype:

1. basic swarmer;
2. weaving runner;
3. armored brute;
4. ranged Spitter;
5. telegraphed charger;
6. area-denial threat;
7. flanker/ambusher;
8. support/commander or other clearly counterable pressure role.

The Final Threat now has authored charge and radial-volley phases, telegraphed
attacks, phase-specific movement decisions, and deterministic replay coverage.
Its final authored presentation and a distinct second-biome apex encounter
remain V1 work.

### Progression and Field Guide

The bounded local Field Guide and save-management slice is now implemented. Finish
the horizontal discovery loop, not a permanent-damage treadmill:

- authored Field Guide final-form portrait, plus the deterministic evolution tree;
- generated build name, seed, hero, run stats, active forms, and ecology note;
- recipe hints and final-form presentation;
- trait, palette, habitat, and challenge unlocks;
- one currency only, with modest accessibility/comfort upgrades kept separate
  from prestige or build variety;
- local save migration, export/import, reset confirmation, and corrupt-save
  recovery (implemented in the current browser slice).

## 8. Phased implementation plan

### Phase A — Freeze truth and prove the hook

**Deliverables**

- V1 product/content bible generated from authoritative runtime data;
- build identity manifest and verified preview flow;
- documentation reconciliation for current 8:00 / 6:30 contract;
- structured owner playtests and external-hook-test plan;
- explicit shipping/deferred/experimental label for every feature.

**Exit**

- Exact baseline commit is known;
- hosted/local build identity is verified;
- player evidence supports proceeding;
- no expansion is being tuned from autoplay alone.

### Phase B — Visual bible and polished vertical slice

**Deliverables**

- final camera, palette, material, typography, UI, VFX, audio, and accessibility
  rules;
- formal Blender-to-GLB asset pipeline and validator;
- Greg final presentation;
- Quills, Puffer, and Thornstorm as complete reference-quality attachment work;
- a final Forest segment, one normal/ranged enemy, upgrade preview, core SFX,
  and initial music layer;
- quality-tier prototype and screenshot matrix.

**Exit**

- Art readability is approved in dense combat;
- asset budgets and device performance hold;
- the vertical slice proves that one asset can flow from source through release
  checks without manual reinvention.

### Phase C — Hero and visible-loadout production

**Deliverables**

- final Benny and Gracie rigs and animations;
- all current twelve traits and six Mythics as final visual forms across all hero
  socket profiles;
- hero instincts fully integrated into deterministic runtime;
- legal-build screenshot/turntable matrix;
- hero-select, prep, upgrade-preview, HUD, pause, and results UI overhaul.

**Exit**

- Players can identify each hero and its combat identity after a short run;
- maximum legal builds remain readable;
- no fourth hero is needed to validate the product.

### Phase D — Finish Forest Arsenal

**Deliverables**

- twelve base trait families and six Mythics;
- eight enemy roles and a final Forest boss;
- final Forest terrain/props/VFX/audio;
- Field Guide, run summary, saved biome unlocks, remaining horizontal unlocks,
  and save migration/export;
- a complete normal-mode balance pass based on human evidence.

**Exit**

- One biome is a complete, repeatable, release-quality game loop;
- external testers understand builds, pressure, boss objective, and progression;
- all content follows the production contract.

### Phase E — Second biome and beta

**Deliverables**

- second biome with a different tactical rule and visual mood;
- second apex boss;
- enemy variations that change priorities rather than merely recolor;
- remaining release UI/audio/accessibility work;
- closed beta and defect triage.

**Exit**

- A fresh profile has a coherent 8–12 hour horizontal completion path;
- two biomes feel materially different;
- no unresolved P0/P1 defect remains after an external beta round.

### Phase F — Release candidate and launch

**Deliverables**

- root-level release command that runs all package checks;
- golden replay corpus, save migration tests, browser E2E, visual QA, and
  performance/device artifacts;
- release notes, credits, notices, privacy/storage disclosure, support path,
  screenshots, trailer, and rollback runbook;
- tagged, immutable release artifact and post-deploy smoke verification.

**Exit**

- Owner signs a written go/no-go checklist;
- release artifact, deployed build, and build manifest match;
- all required evidence is attached to the release commit.

## 9. Quality, accessibility, and release gates

### Performance

- Desktop Chrome/Firefox: 60 FPS at 750 enemies, 250 player projectiles, and
  150 pickups on an agreed mid-range laptop.
- Mobile Safari/Chrome: 30 FPS at 350 enemies, 100 projectiles, and 75 pickups
  on an agreed mid-tier device.
- Gameplay-start download target under 20 MB; hard ceiling 50 MB.
- Time to interactive under 10 seconds on the agreed connection.
- No steady-combat long task over 100 ms; retain p95/p99 frame data.
- Quality tiers may reduce foliage, VFX, contact detail, DPR, and render scale,
  but must never alter simulation fairness.

### Accessibility

Ship and test:

- keyboard, touch, mouse, and gamepad parity;
- remapping and device-aware prompts;
- reliable keyboard focus and modal behavior;
- browser zoom/text scaling, narrow viewport, portrait/landscape, and safe-area
  coverage;
- reduced flashes, reduced motion, VFX intensity, screen-shake control, and
  high-contrast danger;
- color-safe shape/motion/sound alternatives;
- master/music/SFX controls, silent fallback, and visual equivalents for
  critical audio cues;
- WebGL unsupported and context-recovery states;
- suspend/resume and no duplicate reward/lost-run behavior.

### Test and release engineering

Add to the existing package gates:

| Area | Required V1 addition |
| --- | --- |
| Determinism | Golden replay corpus across heroes, biomes, content fingerprints, boss phases, and save migrations. |
| Browser flow | Artifact-based browser smoke suite for boot, input, upgrades, pause, terminal flow, save/restart, context loss, and console errors. |
| Visual QA | Deterministic screenshot/geometry matrix plus manual gameplay-scale art approval. |
| Performance | Named device/browser matrix and retained benchmark artifacts. |
| Supply chain | Dependency audit policy, SBOM, license scan, action pinning, and secret scan. |
| Deployment | Staging/production promotion, immutable artifacts, post-deploy smoke, and rollback. |

### Legal and player-facing release work

Before public V1:

- choose and add a repository software license;
- complete third-party notices and attribution;
- finish provenance records for art, audio, fonts, UI, and AI-assisted sources;
- perform title/trademark/store-name clearance;
- publish only privacy/terms claims that match real storage, telemetry, cookies,
  and support behavior;
- add in-game issue-report guidance with build ID, browser/device, seed, and
  optional replay export; the current terminal card now provides the
  clipboard-ready deterministic replay text;
- prepare release copy, screenshots, trailer, accessibility/features list,
  changelog, known issues, credits, and support path;
- rehearse rollback from a retained verified artifact.

## 10. Primary risks and controls

| Risk | Control |
| --- | --- |
| Art combinatorics across three heroes | Strict socket contracts, shared materials, per-hero placement profiles, screenshot matrix, and no fourth hero before proof. |
| Generic asset-pack look | Style bible, palette/material normalization, kitbashing, animation personality, and gameplay-scale review. |
| Attachments obscure danger | Silhouette budget, friendly/danger visual language, effect caps, accessibility settings, and late-run readability tests. |
| Low-end/mobile collapse | Instancing, pools, asset budgets, quality tiers, device profiling from the vertical slice onward. |
| Build/provenance drift | Build IDs, immutable manifests/artifacts, deployed smoke checks, cache validation, and rollback. |
| Save/content drift | Versioned migrations, content fingerprints, golden replays, export/import/recovery. |
| Human hook remains unproven | Gate 0/2 sessions, structured observation, explicit proceed/revise/pivot decision. |
| Scope inflation | Web-first boundary, named out-of-scope list, and evidence gates before each expansion. |

## 11. First task packet for the next agent

**Objective:** Establish Release Gate 0 without expanding gameplay content.

**Read first**

1. This document;
2. `docs/status/current.md`;
3. `AnimalSurvivor-HANDOFF.md`;
4. `PROJECT-HANDOFF.md`;
5. `git status --short`.

**Tasks**

1. Preserve existing user work; do not overwrite or broadly reformat the dirty
   worktree.
2. Propose or implement a build identity manifest and in-app version label with
   tests.
3. Ensure build/deployment flow can use one verified immutable artifact.
4. Reconcile player-facing documentation to the current 8:00 / 6:30 contract.
5. Prepare the owner/external playtest run and evidence template.
6. Record exact commands, results, limitations, and next bounded task in a
   handoff note.

**Do not do yet**

- Add a fourth hero;
- add Luck, difficulty modes, Endless, co-op, or arbitrary trait families;
- replace simulation authority with renderer state;
- download or import unaudited asset packs;
- claim that balance, visual readability, or V1 scope has been validated.

## 12. Owner decisions needed

The owner should only need to make a few high-leverage decisions:

1. Approve this V1 scope boundary and web-first release model.
2. Approve the final Storybook Wildguard camera/palette/material test.
3. Select one mascot signature feature from generated concepts.
4. Choose or rename the five favorite Mythics after playable visual prototypes.
5. Make the final release go/no-go decision after evidence is complete.

No owner coding, modeling, audio production, manual asset processing, or
maintenance work is required.

## Current validation commands

~~~bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/spikes/headless-sim
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/packages/trait-runtime
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/packages/run-director
npm test && npm run typecheck && npm run lint

cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm test && npm run typecheck && npm run lint && npm run build
npm run verify:artifact
~~~

## Definition of V1 done

V1 is done only when:

1. The three final heroes, two biomes, launch trait pool, enemy roles, bosses,
   Field Guide, and progression loop are integrated and player-facing.
2. Every gameplay-changing system is deterministic, replay-safe, visually
   represented, documented, tested, and supported by player evidence.
3. Final art/audio/UI replace prototype primitives without hiding danger or
   breaking performance budgets.
4. Accessibility, save recovery, device/context-loss handling, and release
   workflow are proven on the agreed matrix.
5. All assets are licensed and traceable.
6. The deployed artifact proves its identity and matches the tagged release.
7. The owner reviews the final evidence and explicitly chooses to ship.
