# Current Project Status

**Updated:** 2026-07-16 — V1.2 playtest-response pass and universal Wild Splice fusion implementation added; visual-panel flash gate passes
**Active milestone:** V1.2 tempo, power-feedback, boss, and music playtest candidate; owner playtest evidence next
**Project state:** Playtestable deterministic V1.2 candidate with a compressed six-minute normal run, versioned apex tuning, truthful upgrade impact feedback, and longer phase-score programs; no human-balance claim yet
**Budget model:** AI subscription usage; no additional cash

The external blind Claude swarm package has been reconciled in
[`docs/verification/claude-swarm-reconciliation.md`](../verification/claude-swarm-reconciliation.md).
Its standalone prototypes remain reference-only; no speculative content was
merged from them.

## V1.2 playtest-response — implemented 2026-07-15

The first external playtest reported that runs were too easy and long, the
opening felt slow, upgrades did not feel consequential, the apex was too easy,
and the music repeated too quickly. This pass changes the real deterministic
content rather than adding a presentation-only difficulty claim.

- Normal mode is **6:00** with no overtime: Opening 0:00–0:45, Pressure
  0:45–2:15, Adaptation 2:15–3:45, Mutation 3:45–4:45, and Boss 4:45–6:00.
  The apex warning begins at 4:25; warned elite requests are 1:10, 2:25, 3:15,
  3:55, 4:15, and 4:35.
- The Final Threat now carries a versioned, fingerprinted `forest-final-threat-v3`
  profile rather than an adapter-only multiplier. Its 56x HP, movement, charge,
  and volley values are simulation/replay-bound. The deterministic strong-build
  regression reaches a 48.48-second boss TTK; a stationary clean baseline ends
  at the deadline with 27.60% boss HP remaining. These are engineering targets,
  not human difficulty certification.
- Upgrade offers, pause cards, and post-pick confirmation now show the actual
  rank transition and label Direct damage, Crowd control, Targeting, Defense,
  or Economy / utility truthfully. The deterministic Upgrade Impact Lab covers
  65 rank transitions: 30 direct-damage comparisons produce positive
  authoritative health deltas and 35 utility rows report their real stat lane.
- The procedural score now runs a twelve-variation, bar-aligned phrase program
  per music state. The fastest boss state takes about 57.6 seconds before its
  exact program repeats; audio remains opt-in and presentation-only.
- The bright Fox Swipe/Rush Rake illustration now uses a renderer-only
  flash-safe cadence and reduced card heat. The exact rendered VFX audit passes
  at or below 3 luminance swings per second against its 3-swing limit; combat simulation,
  damage, and ordinary hit feedback remain unchanged.

The owner playtest route and report template are in
[`docs/playtests/v1-2-tempo-power-boss-audio.md`](../playtests/v1-2-tempo-power-boss-audio.md).

The deterministic simulation is the production package `packages/sim`. Release
verification and the web toy resolve the simulation through that package path.

## Agent Harness v1 — implemented 2026-07-15

The repository now carries a local, dependency-free operating harness for
bounded AI-assisted work. It extends existing verification rather than adding a
runtime service, paid model API, autonomous merge, or a second gameplay
authority.

- [`AGENTS.md`](../../AGENTS.md) is the canonical task, ownership, validation,
  and handoff guide. [`CLAUDE.md`](../../CLAUDE.md) is a compact compatible
  entry point; [`REVIEW.md`](../../REVIEW.md) defines evidence-based review.
- `npm run verify:changed -- --files <repo-relative-paths> --dry-run` routes a
  change to conservative package gates. It supports a Git-base route and JSON
  handoffs, but mixed, unknown, root-tooling, and lockfile diffs recommend the
  full `npm run verify:release` gate rather than silently under-testing.
- `npm run verify:agent-contracts` checks the harness documents and stable
  deterministic-package import boundaries. `npm run test:agent-harness` runs
  12 deterministic routing/fixture checks. The normal GitHub verification
  workflow now runs both checks in a dedicated Agent Harness job.
- `npm --prefix apps/web-toy run verify:agent-smoke` builds and loopback-serves
  the artifact, proves a visible seeded WebGL Start/Pause/Resume flow, and
  reports a bounded terminal route as JSON. The terminal lane uses only the
  existing hidden diagnostics renderer toggle after the visible proof and
  labels that acceleration as non-player-visible; it is not visual or player
  evidence.

Validation on 2026-07-16: harness fixtures passed 12/12; the contract check
covered 116 deterministic source/test files; focused browser-smoke tests passed
5/5; the full browser smoke reached victory at tick 26,353 with matching build
identity, no console errors/page errors/request failures, and closed its
browser/server. The root release command passed its supply-chain, package,
asset, content, artifact, served-build, and 180-second VFX flash gates. The
flash audit reached, but did not exceed, its maximum of three luminance
reversals in any one-second cell window; the compact technical record is
[`docs/vfx/captures/final-review.md`](../vfx/captures/final-review.md). This
does not establish a human visual or accessibility approval.

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
- **Full attack-family coverage:** the renderer routes every current player
  trait and Mythic command through an explicit animated VFX recipe: Puffer,
  Gecko/Razorstep, Skunk/Royal Stinkcloud, Mantis, Crab, Armadillo, Meteor,
  Quills, Owl, Thornstorm, Thunderbug/Eel, Firefly, Monarch, Bat, and Midnight.
  Persistent Gecko, Razorstep, Skunk, and Royal zones now use alpha-cut
  animated cards instead of raw colored planes. The remaining legacy geometry
  is a quiet contact/area footprint, never the primary visual read. Founding
  instincts route as well: Rush Rake uses the Fox combo art, Brace Bloom the
  earth-wave language, and Scout the cyan radar pulse.
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
  batches. Six repaired transparent 768px VFX sheets carry transform-animated
  selected-frame bodies, while compact eight-frame coherent erosion atlases
  cover long-lived smoke, pads, and shield dissolves; reduced quality removes
  halos and travel trails before core rewards, warnings, or hit markers.
  Simulation state, replay hashes, input, and combat outcomes remain untouched.

The precise sheet provenance and cleanup are recorded in
[`docs/release/v1-1-visual-overhaul-prompts.md`](../release/v1-1-visual-overhaul-prompts.md).
Automated gates establish deterministic safety and bounded renderer behavior;
a fresh owner pass is still the authority for whether the visual contrast feels
right on the intended display.

### Final visual-panel technical gate — current evidence captured

The older panel statement was based on a capture that predates the integrated
P2/P3/P6 renderer work and whose flash audit failed. It is superseded for the
technical flash-safety gate by the current normal-speed 180-second capture:
the 8 × 8 luminance audit passed at no more than three reversals per second in
every cell. The compact result is recorded in
[`docs/vfx/captures/final-review.md`](../vfx/captures/final-review.md).
Independent visual review, reduced-motion/accessibility evaluation, and owner
human playtesting remain open and are not implied by this automated result.

### Six delivered pillars

1. **Distinct hero combat identities.** Greg opens with a forward **Fox Swipe**
   melee arc; Benny sends a sequenced line of **Trample** earth waves; Gracie
   fires a **Spit Volley** that grows into a fan. Each resolves authoritatively,
   has a dedicated visible effect, and is replay/hash-bound through run-loadout
   version 4.
2. **Five-rank attacks and Wild Splice.** Attack traits and starter mastery
   cards rank from 1 to 5. Rank 5 is **MASTER**. Any two enabled Master attack
   traits can receive an explicit, free Wild Splice offer: all 66 canonical
   pairs are legal. The six former authored recipes remain signature
   **Perfect Pairs**; the six all-utility pairs become **Support Chimeras**,
   with one Support Chimera allowed per run. A splice turns two logical attack
   slots into one and therefore frees a slot, while retaining both parents'
   attachment footprint and adding the Chimera seam. Chimeras are terminal in
   this version: they cannot rank further or re-fuse. The expanded acquired
   capacity permits a ceiling of three terminal Chimeras in one run.
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
- **Mastery and Wild Splice read:** rank a starter Mastery to 5 and confirm its
  Master payoff: Greg double-swipes, Benny gains a wilder Trample/aftershock,
  and Gracie gains the final spit fan. Rank any two enabled attack traits to
  Master and confirm the explicit Wild Splice preview replaces two logical
  attack slots with one, keeps both parent attachments visible, and cannot be
  ranked or fused again. Compare a normal Wild Splice with a labelled Perfect
  Pair; if a run reaches an all-utility pair, confirm its Support label and
  that a second Support Chimera is not offered. In a late build, confirm the
  freed slots allow up to three terminal Chimeras without exceeding five active
  cards.
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
- Wild Splice is player-chosen rather than automatic: it allows any two enabled
  Master attacks, but the resulting terminal Chimera cannot re-fuse and one
  run cannot hold more than one Support Chimera.
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
- a six-minute normal run: Opening (0:00–0:45), Pressure (0:45–2:15),
  Adaptation (2:15–3:45), Mutation (3:45–4:45), and Boss (4:45–6:00);
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
- five active-attack cards: the selected animal's distinct starter attack plus
  up to four acquired choices from a 12-family launch pool;
- three authored five-rank starter masteries: Greg's Pouncer's Precision,
  Benny's Trample Mastery, and Gracie's Spit Spiral; each reaches MASTER at
  rank five while keeping its distinct melee, ground-wave, or projectile identity;
- Greg's movement-charged **Rush Rake** instinct: an earned 150-unit movement
  charge feeds a spaced deterministic three-wave melee rake with
  replay/hash coverage, rather than firing continuously while walking;
- Benny's contact-charged **Brace Bloom** shockwave and Gracie's periodic **Scout**
  marks are authoritative, replay-safe, and rendered with dedicated cues;
- **Quills** (a piercing forward volley), Puffer, **Electric Eel Coil** (an
  instant nearest-target strike that chains to nearby unhit foes), **Firefly
  Colony** (orbiting contact fireflies), **Mantis Scythes** (an auto-aimed
  directional scythe sweep), **Gecko Pads** (damaging pads after movement),
  **Bat Ears** (sonar marks that every automatic attack prioritizes), and
  **Monarch Brood** (orbiting contact butterflies), plus **Owl Pinions**,
  **Crab Pincers**, **Armadillo Greaves**, and **Skunk Brush**. Any two enabled
  Masters can form one of 66 Wild Splices: the six former named recipes are
  Perfect Pairs, while six utility-only combinations are Support Chimeras and
  the rest are standard Wild Splices. Each splice frees one logical acquired
  slot, retains both parent attachments, and is terminal; only one Support
  Chimera is permitted per run;
- a developer-only `?debug=1` Chimera Lab that runs all 66 deterministic,
  20-second weak-target pair cases, reports authoritative total damage, kills,
  hits, and utility effects, and checks the planned DPS envelope plus the six
  Support-Chimera utility observations;
- deterministic mark-target commands now back Bat Ears and Midnight Radar, with visible sonar/weak-point
  feedback and shared automatic targeting; authored stink-cloud damage zones back Skunk Brush and Royal Stinkcloud;
- five distinct neutral passive footprints, rank-up continuation for selected
  passives, and **Essence Cache** as the repeatable finite-upgrade fallback;
- pause-only build details, so active play is not covered by repeated move
  descriptions;
- terminal Essence settlement and an eleven-card prep-only permanent shop for a
  future run: Vitality (+10 HP per rank), Might, Swiftness, Magnetism, Growth,
  Armor, Haste, Precision, Ferocity, Evasion, and reward-only Fortune.
- terminal runs are archived in a bounded local Field Guide with generated build
  names, seed, hero, outcome, run stats, active forms, and ecology notes; the
  version-six save supports migration, corrupt-save recovery, export, import,
  reset, and a six-card **Perfect Pair** reference with ingredient pairs and
  locked/discovered states. That reference is not a Wild Splice restriction:
  all enabled Master pairs remain eligible in a run, subject only to the
  one-Support-Chimera cap. The profile also preserves
  discovered named-form titles, the first horizontal biome unlock, and
  Mythic-earned presentation palettes that tint prep and arena presentation.
  Each archived build also receives an authored final-form
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

Normal mode has a hard **6:00** boundary and no overtime. The boss is requested
at **4:45** after a warning at **4:25**. Elite requests occur at **1:10**,
**2:25**, **3:15**, **3:55**, **4:15**, and **4:35**; each gets a five-second
warning.

Active builds cannot exceed the starter plus four acquired traits, for five
active cards total. A Wild Splice replaces two enabled Masters with one terminal
Chimera, freeing one logical acquired slot while retaining both parent attachment
footprints. That economy permits up to three terminal Chimeras in a run. All 66
Master pairs are eligible, with six Perfect Pairs, six Support Chimeras, and a
one-Support-Chimera-per-run cap. Neutral builds cannot exceed five distinct
passive families, though a selected passive can continue ranking up.
**Sharpened Instinct** and **Rapid Instinct** now affect every current attack,
not only starter fire.

## What still needs evidence

- A fresh human retest of the V1.2 six-minute curve. Is pressure urgent, fair,
  and readable from opening through boss on both a fresh and an earned profile?
- Attack clarity: can a player distinguish the 12 trait families, understand
  that any two enabled Masters can form a Wild Splice, recognize the Perfect
  Pair and Support Chimera labels, and find the freed-slot/parent-braid details
  naturally in the pause panel?
- Forest readability: does the clearing improve movement and threat awareness
  without hiding pickups, projectiles, or enemy silhouettes?
- Human confirmation that the verified deterministic/browser integration feels
  as clear and satisfying as its automated coverage: slots, evolutions,
  passives, and the six-minute terminal boundary all have focused tests.
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
   [the V1.2 tempo/power/boss/audio guide](../playtests/v1-2-tempo-power-boss-audio.md),
   [the Gate 1 guide](../playtests/gate1-owner-playtest.md), and
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
