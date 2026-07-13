# Current Project Status

**Updated:** 2026-07-13 — V1.1 visual-overhaul handoff added
**Active milestone:** V1.1 feature-complete visual-overhaul candidate; owner playtest and balance evidence next
**Project state:** Playtestable V1.1 candidate with deterministic implementation coverage and a renderer-only combat-language overhaul; fresh human retest remains open
**Budget model:** AI subscription usage; no additional cash

The external blind Claude swarm package has been reconciled in
[`docs/verification/claude-swarm-reconciliation.md`](../verification/claude-swarm-reconciliation.md).
Its standalone prototypes remain reference-only; no speculative content was
merged from them.

The deterministic simulation is the production package `packages/sim`. Release
verification and the web toy resolve the simulation through that package path.

## V1.1 implementation handoff

This section is the authoritative V1.1 handoff. It supersedes older references
below to three-rank starter mastery, six neutral cards, or placeholder starter
projectiles. It records implemented behavior, not a claim that balance, final
art, device QA, or human playtesting is complete.

### Visual-overhaul addendum — 2026-07-13

The renderer now has one intentional **Wildguard combat language**, built as a
presentation-only layer over the deterministic simulation rather than a new
particle engine or combat system.

- **Hero power:** attack commands use staged cast, travel, impact, and
  aftermath layers. Greg's claw/rake, Benny's earth fronts, and Gracie's
  comet-spit are materially different silhouettes; rank/count/strength scale
  the same read instead of flooding the screen with unrelated effects.
- **Rewards:** XP is a tiered mint-and-gold reward field with deterministic
  bob/pulse/spin, distinct high-value prisms, and bounded comet choreography
  on collection. Bomb, Magnet, and Food retain unique silhouettes with their
  own celebration language.
- **Danger:** hostile shots now have bright coral cores and directional tails;
  charger lanes, nearby contact rings, and elite/boss auras make danger visible
  before or at contact. Boss/director warnings reuse the same high-contrast
  danger lane rather than blending into the forest palette.
- **Hits:** authoritative combat events drive persistent ivory normal sparks,
  white-gold critical bursts, and coral player-danger flashes in addition to
  the optional white/yellow damage numbers.
- **Cost boundary:** all high-volume layers are fixed-capacity GPU-instanced
  batches. Two transparent 768px four-frame VFX sheets carry the primary
  signature, reward, threat, and impact art; reduced quality removes halos and
  travel trails before core rewards, warnings, or hit markers. Simulation
  state, replay hashes, input, and combat outcomes remain untouched.

The precise sheet provenance and cleanup are recorded in
[`docs/release/v1-1-visual-overhaul-prompts.md`](../release/v1-1-visual-overhaul-prompts.md).
Automated gates establish deterministic safety and bounded renderer behavior;
a fresh owner pass is still the authority for whether the visual contrast feels
right on the intended display.

### Six delivered pillars

1. **Distinct hero combat identities.** Greg opens with a forward **Fox Swipe**
   melee arc; Benny sends a sequenced line of **Trample** earth waves; Gracie
   fires a **Spit Volley** that grows into a fan. Each resolves authoritatively,
   has a dedicated visible effect, and is replay/hash-bound through run-loadout
   version 4.
2. **Five-rank attacks and free Master fusions.** Attack traits and starter
   mastery cards rank from 1 to 5. Rank 5 is **MASTER**. When two compatible
   Master attack traits match an authored recipe, the player takes an explicit,
   free fusion that consumes one logical attack slot while retaining the fused
   visual attachment footprint.
3. **Crit and hero defenses.** All heroes start at 5% crit chance; **Keen Eye**
   adds 3% per rank. Greg has dodge and **Clever Footwork**, Benny has baseline
   armor and **Thick Skin**, and Gracie's **Fluffy Shield** absorbs damage before
   health and recharges after its delay. Dodge, armor, shield, healing, and crit
   are authoritative combat rules, not UI-only labels. **Mote Draw** is the
   rankable passive that expands XP collection and attraction; it is distinct
   from the map-wide Magnet world pickup.
4. **Readable combat feedback.** Authoritative combat events drive hit markers,
   shield/dodge/heal feedback, and white normal versus yellow critical damage
   numbers. **Accessibility → Damage numbers** is on by default and only changes
   presentation; it never changes a run hash, rewards, or outcomes.
5. **World power pickups.** Sparse, bounded **Bomb**, **Magnet**, and **Food**
   drops are independent of the XP-mote pool. Bomb clears normal enemies,
   Magnet collects all live XP motes, and Food restores health without overheal.
6. **Movement that reads as locomotion.** Greg keeps authored locomotion/action
   clips with bounded visual turns. Benny and Gracie use snapshot-driven
   procedural stride, lift, sway, squash/stretch, and lean rather than a fake
   rigged slide. All movement presentation remains read-only relative to fixed
   simulation movement and replay.

### Owner playtest checklist

Run `apps/web-toy` locally, start a manual run, and compare the three founders
with a fixed seed such as `?hero=greg&seed=1234` (then `benny` and `gracie`).

- **Starter read:** Greg should damage close threats with a wide swipe and no
  starter projectile; Benny should create successive forward earth fronts, not
  bolts; Gracie should begin with one visible spit glob.
- **Mastery read:** rank a starter Mastery to 5 and confirm its Master payoff:
  Greg double-swipes, Benny gains a wilder Trample/aftershock, and Gracie gains
  the final spit fan. Rank two compatible attack traits to Master and confirm
  the free fusion prompt replaces two logical attack slots with one.
- **Survival/crit read:** check that normal hit numbers are white and crits are
  yellow. Take hits with each hero: Greg can dodge, Benny's armor reduces the
  health loss, and Gracie's shield is spent before health then recovers. Choose
  **Keen Eye**, **Clever Footwork**, **Thick Skin**, and **Fluffier Shield** to
  confirm their cards visibly change the expected stat path.
- **Pickup read:** collect each world token. Magnet should immediately consume
  every live XP mote on the map; Food restores 25% of maximum health (capped at
  max); Bomb clears every live non-boss enemy. Choose **Mote Draw** separately:
  nearby motes should travel in rather than instantly collecting the whole map.
- **Motion/readability:** move, stop, circle, and reverse. The animal should
  visibly stride and turn rather than slide, while attacks and hit feedback
  remain readable without altering movement or aiming rules.

### Intentional Bomb boss rule

A Bomb is deliberately **not** a boss delete. It kills live normal enemies but
deals up to 20% of a boss's maximum HP as one non-critical hit and always leaves
the boss at least 1 HP. Boss deaths produce a Magnet rather than a random
special token. This protects the boss encounter from a trivial one-pickup skip
while preserving Bomb as a meaningful late-fight tool.

### Verification and local play path

Use the root release gate before declaring a build ready:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor
npm run verify:release
```

For an implementation pass, run the package gates most likely to catch V1.1
regressions:

```bash
cd packages/trait-runtime && npm run typecheck && npm test && npm run lint
cd ../sim && npm run typecheck && npm test && npm run lint
cd ../../apps/web-toy && npm run typecheck && npm test && npm run lint && npm run build
```

For human playtesting:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm run dev
```

Open `http://localhost:5173/?hero=greg&seed=1234`; replace `greg` with `benny`
or `gracie` for a controlled comparison. `?autopilot=1&stress=1&fullrun=1` is
an engineering flow check, not a substitute for a human playtest.

### Known scope limits

- Balance values, power-pickup cadence, boss tuning, and player-facing clarity
  still need owner evidence; automated tests do not establish fun or fairness.
- Fusions exist only for compatible authored recipes and require an explicit
  player choice; there is no arbitrary two-card combination or automatic fuse.
- Damage numbers and locomotion are intentionally presentation-only. They must
  never become a second source of combat truth or modify deterministic state.
- Benny and Gracie's movement is purposeful procedural presentation over
  authored cutout art, not a final skeletal-animation production pass.
- This does not close broader final-art, audio, touch-device, low-end-WebGL,
  accessibility, hosted-artifact, or external-playtest work.

## Release Gate 0 implementation

The web build now emits a public build identity manifest, source asset manifest,
and hashed `dist-manifest.json`. The document title, build meta tag, and
prep-screen label expose the same build ID. The Pages workflow verifies the
simulation, trait runtime, run director, and web toy before building
one artifact, then preserves and deploys that exact output. See
[`docs/release/gate0-evidence.md`](../release/gate0-evidence.md) for the local
artifact and hosted-browser evidence procedure. Hosted identity and human
playtest evidence are still open; this is not a Gate 0 or V1 release claim.

## What is playable now

The founding roster has a deterministic browser survival loop with:

- keyboard, mouse click-drag, gamepad, and touch movement, automatic attacks,
  XP collection, level-up choices, pause/resume, and a local prep screen;
- a prep-screen choice of Greg the fox, Benny the bull, or Gracie the alpaca;
  the selected hero's starting profile is replay-bound and persisted locally;
  the authored Field Guide portraits also appear in the founding-hero choice
  cards with a text/silhouette fallback if an image cannot load;
- authored Benny and Gracie cutout silhouettes alongside Greg's audited fox
  glTF, with all three receiving authoritative visible attachment projection,
  a renderer-only identity marker, and readable locomotion/action motion;
- a readable forest-clearing presentation rather than a black grid-only arena;
- a replay-bound **Saltwind Ruins** second-biome foundation unlocked by a Forest
  victory, with earlier flanker/support pressure and a dedicated renderer
  palette, placement seed, and deterministic ruin-landmark dressing; a fresh
  profile remains Forest-only and Forest Arsenal is the default;
- an eight-minute normal run: Opening (0:00–1:00), Pressure (1:00–3:00),
  Adaptation (3:00–5:00), Mutation (5:00–6:30), and Boss (6:30–8:00);
- off-screen approach waves, weaving runners, deterministic wind-up Chargers,
  spacing Denial threats, lateral Flankers, healing Support threats, ranged
  Spitters and elites, six warned elite requests, and a biome-specific apex;
- Forest's apex is **The Final Threat**. Saltwind's named apex is **The Sandglass
  Sovereign**. Both use deterministic charge/lunge, spacing recovery, and
  radial hostile-volley state with replay/hash coverage and charge/volley
  telegraphs; Saltwind uses its distinct sandstorm cue and offset six-shot
  volley variant. The HUD, boss bar, and director notices carry the selected
  biome identity, while the boss bar now carries distinct authored Forest and
  Saltwind portrait tiles and the browser audio layer gives boss warning and
  arrival events distinct rate-safe cues;
- four active-attack slots: the selected animal's distinct starter attack plus up to three acquired
  choices from a 12-family launch pool;
- three authored five-rank starter masteries: Greg's Pouncer's Precision,
  Benny's Trample Mastery, and Gracie's Spit Spiral; each reaches MASTER at
  rank five while keeping its distinct melee, ground-wave, or projectile identity;
- Greg's movement-charged **Rush Rake** instinct: an earned 150-unit movement
  charge feeds a spaced deterministic three-wave melee rake with
  replay/hash coverage, rather than firing continuously while walking;
- Benny's contact-charged **Brace Bloom** shockwave and Gracie's periodic **Scout**
  marks are authoritative, replay-safe, and rendered with dedicated cues;
- **Quills** (a piercing forward volley), Puffer, **Electric Eel Coil** (an instant nearest-target strike that
  chains to nearby unhit foes), **Firefly Colony** (orbiting contact fireflies), **Mantis Scythes**
  (an auto-aimed directional scythe sweep), **Gecko Pads** (damaging pads after movement), **Bat Ears**
  (sonar marks that every automatic attack prioritizes), and **Monarch Brood** (orbiting contact butterflies),
  plus **Owl Pinions**, **Crab Pincers**, **Armadillo Greaves**, and **Skunk Brush**. Their paired two-slot Mythics are **Thornstorm Mantle**, **Thunderbug Dynamo**,
  **Razorstep Chimera**, **Midnight Radar**, **Meteor Mauler**, and **Royal Stinkcloud**;
- a developer-only `?debug=1` attack proof panel that runs 34 isolated,
  deterministic 20-second weak-target cases and reports authoritative total
  damage, kills, hits, and verified utility effects. All 27 direct-damage
  cases and all 7 utility-only cases currently pass;
- deterministic mark-target commands now back Bat Ears and Midnight Radar, with visible sonar/weak-point
  feedback and shared automatic targeting; authored stink-cloud damage zones back Skunk Brush and Royal Stinkcloud;
- five distinct neutral passive footprints, rank-up continuation for selected
  passives, and **Essence Cache** as the repeatable finite-upgrade fallback;
- pause-only build details, so active play is not covered by repeated move
  descriptions;
- terminal Essence settlement and a prep-only Starting Vitality purchase for a
  future run.
- terminal runs are archived in a bounded local Field Guide with generated build
  names, seed, hero, outcome, run stats, active forms, and ecology notes; the
  version-five save supports migration, corrupt-save recovery, export, import,
  reset, a complete six-recipe Mythic compendium with ingredient pairs and
  locked/discovered states, persistent discovered-Mythic recipe titles, the
  first horizontal biome unlock, and Mythic-earned presentation palettes that
  tint prep and arena presentation. Each archived build also receives an authored final-form
  portrait tile and an evolution tree with recipe ingredients; the portrait
  files are bundled, hashed, ledgered, and protected by a deterministic glyph
  fallback. The archive also derives a six-card no-currency Habitat Atlas and
  five challenge badges from persisted runs, including roster and biome
  completion.
- prep includes versioned local accessibility controls for reduced motion,
  reduced flashes, high contrast, a reduced render-quality tier, and persistent
  unique keyboard remapping with Arrow Key fallback; these only change
  presentation/input preference and never enter simulation state.
- the interactive input boundary now supports keyboard, touch joystick, mouse
  click-drag steering, and standard gamepad left-stick/D-pad movement with
  deterministic precedence;
  the live controls identify the last selected source with device-aware
  guidance; persistent keyboard remapping and visibility-owned suspend/resume
  keep preferences and page lifecycle presentation-only, while sampled input
  remains replay-bound. Browser zoom remains available and safe-area insets are
  applied to the arena, HUD, touch joystick, and prep dialog; device
  certification is still open.
- sound starts enabled by default from the Start-run gesture (with an immediate
  opt-out),
  and has a presentation-only master, music-bed, and SFX mix
  surface plus a V1 storybook procedural score with opening, pressure,
  adaptation, mutation, boss, victory, and defeat arrangements. Source-aware
  launch trait, instinct, boss-telegraph, and support-warning identities are
  rate-safe and presentation-only; Firefly/Monarch contact cues only fire on
  authoritative orbit-contact hits.
- the browser verification suite includes a six-case golden replay corpus across
  all founding heroes and both authored biomes.
- prep exposes a credits/notices panel for the audited Quaternius Fox,
  PlayCanvas dependency, authored Field Guide portraits, and boss-health
  portraits; the complete
  current notice and local-storage disclosure are checked in under
  `docs/release/`.
- archived runs expose a clipboard-ready issue report with build and replay
  identifiers plus optional browser/device, viewport, quality, and accessibility
  context for release triage; terminal results also offer a deterministic
  replay export. Those environment fields and replay history are never
  persisted automatically.
- deterministic QA shortcuts for `?hero=greg|benny|gracie`, the unlocked
  `?biome=saltwind` path, and `?seed=...`, with
  hero-specific starting HP visible in the HUD and prep summary.
- the run spawn boundary now uses a validated data-defined enemy manifest for
  all ten authored director archetypes, covering simulation index, behavior,
  reward tier, visual role, and spawn profile. Unknown IDs remain explicit
  unsupported content instead of silently falling back to another enemy; see
  [`docs/release/enemy-content-manifest.md`](../release/enemy-content-manifest.md).
- the Field Guide now includes a deterministic threat glossary sourced from
  that manifest, with a readable tell and counter for every current enemy,
  elite, and apex role.
- the reusable trait/enemy production template is checked in at
  [`docs/release/content-production-template.md`](../release/content-production-template.md)
  and points future content at the validator, replay, asset, and served-artifact
  gates already used by the release command.
- the runtime asset gate now parses the audited Fox glTF and rejects malformed
  or externally-referenced buffers, missing skin/mesh structure, and missing
  `Idle`, `Walk`, `Gallop`, `Attack`, or `Death` clips before build output is
  accepted.

## Forest Arsenal run contract

Normal mode has a hard **8:00** boundary and no overtime. The boss is requested
at **6:30** after a warning at **6:10**. Elite requests occur at **2:00**,
**3:40**, **4:30**, **5:15**, **5:45**, and **6:05**; each gets a five-second
warning.

Active builds cannot exceed the starter plus three acquired traits. A Mythic
retains the two slots used by its ingredients. Neutral builds cannot exceed five
distinct passive families, though a selected passive can continue ranking up.
**Sharpened Instinct** and **Rapid Instinct** now affect every current attack,
not only starter fire.

## What still needs evidence

- A fresh human retest of the compressed eight-minute curve. The V1 cleanup
  lowers early fodder formation caps, brings the first XP thresholds forward,
  and softens/slows Adaptation escalation; is pressure now urgent, fair, and
  readable from opening through boss?
- Attack clarity: can a player distinguish Quills, Puffer, Coil, orbiting Firefly,
  Mantis Scythes, and Gecko Pads; understand each Mythic; and find build
  details naturally in the pause panel?
- Forest readability: does the clearing improve movement and threat awareness
  without hiding pickups, projectiles, or enemy silhouettes?
- Human confirmation that the verified deterministic/browser integration feels
  as clear and satisfying as its automated coverage: slots, evolutions,
  passives, and the eight-minute terminal boundary all have focused tests.
- A human comparison of Greg, Benny, and Gracie: do their silhouettes,
  starter attacks, mastery cards, and starting tradeoffs read quickly?
- Physical touch hardware, low-end devices, human-forced WebGL context recovery,
  broader music/asset production, and broader external playtests.

## Next milestones

1. Finish Forest Arsenal's final boss art/audio pass and the Saltwind Ruins
   presentation pass plus distinct apex counterpart behind the same
   deterministic and presentation contracts.
2. Finish the remaining horizontal unlock layers and final authored arena art;
   recipe discovery, the first biome unlock, authored Field Guide portraits,
   the Habitat Atlas, and the first challenge badge layer are now active without
   a second currency.
3. Run the focused owner playtests using
   [the Gate 1 guide](../playtests/gate1-owner-playtest.md) and
   [the structured data sheet](../playtests/gate1-data-sheet.csv) when human
   evidence is available; tune only values supported by that feedback.
4. Design a truthful Luck system and future difficulty definitions only after
   the normal run and early meta loop are enjoyable.
5. Add selectable harder modes and Hardcore Endless as explicit later choices,
   never as hidden normal-mode overtime.

## Deliberately deferred

Luck, rerolls, chests, rare drops, deeper horizontal unlock trees, larger
meta-progression trees, broader enemy families, hero-specific trait catalogs beyond
starter mastery, additional audio/art production, selectable difficulties, and Hardcore Endless are
not represented as shipped features. The bounded Mythic recipe archive and the
Forest-to-Saltwind biome unlock are shipped foundations, not a complete meta loop.
The three founding heroes are selectable now; Benny and Gracie use authored
cutout art with renderer-only motion, while their distinct starter attacks are
authoritative.

Historical acceptance records, ADRs, and verification artifacts remain in their
dedicated documentation; this page describes the current playable target and
the evidence still needed.
