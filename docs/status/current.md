# Current Project Status

**Updated:** 2026-07-12
**Active milestone:** Gate 1 — Forest Arsenal playable alpha
**Project state:** Playtestable V1 cleanup candidate, with combat proof, motion, audio, and local save slices validated; fresh human retest remains open
**Budget model:** AI subscription usage; no additional cash

The external blind Claude swarm package has been reconciled in
[`docs/verification/claude-swarm-reconciliation.md`](../verification/claude-swarm-reconciliation.md).
Its standalone prototypes remain reference-only; no speculative content was
merged from them.

The deterministic simulation is the production package `packages/sim`. Release
verification and the web toy resolve the simulation through that package path.

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
- three authored starter masteries: Greg's Pouncer's Precision, Benny's Brace Bloom,
  and Gracie's Keen Dart; base starter fire is single-target and does not inherit Quills pierce;
- Greg's movement-charged **Rush Rake** instinct: an earned 150-unit movement
  charge feeds a spaced deterministic three-wave projectile burst with
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
