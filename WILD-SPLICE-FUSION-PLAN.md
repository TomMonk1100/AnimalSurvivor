# WILD SPLICE — Universal Attack Fusion Plan

> **NEW SYSTEM PATCH DETECTED.**
> *"Attention, contestant. The Fusion Chamber no longer checks the recipe book. Bring us any two Mastered attacks and we will staple them together with science, glitter, and a waiver you already signed. Results are permanent, spectacular, and legally distinct from each other every single time. The management is thrilled. The management is always thrilled."*
> — The Announcer, patch notes, Season 2

**Status:** Implemented locally; final verification and evidence are recorded in
[`docs/release/wild-splice-fusion-production-record.md`](docs/release/wild-splice-fusion-production-record.md).
**Scope:** Replace "6 fixed evolution recipes" with "any two Master attacks fuse into a unique Chimera variant, every time"
**Repo:** `AnimalSurvivor` monorepo (`packages/trait-runtime`, `packages/sim`, `apps/web-toy`)

> **Implementation reconciliation.** Sections 2 and 10 preserve the original
> research baseline and execution plan. The implemented source and production
> record are authoritative for current behavior. In particular, the final
> loadout is a starter plus four acquired slots (five active cards), the Chimera
> Lab lives at the browser integration boundary, and the optional Field Guide
> collection/achievement work remains explicitly out of scope.

---

## 1. TL;DR

Today, fusion only works for 6 hand-authored pairs (out of 66 possible). You must draft the exact partner attack, Master both, and you always get the same result. This plan makes **all 66 pairs fusable**, and makes every fusion produce a **rolled variant**: a deterministic Pair Base (what the combo fundamentally is) plus a **Temperament** (a rarity-weighted mutation) plus a **Stat Lean**. Same pair, different run → different beast. All of it stays inside the existing 13-command vocabulary, the seeded-RNG determinism contract, and a hard DPS budget so nothing silently breaks the game.

- 66 Pair Bases (6 existing recipes survive as buffed "Perfect Pairs")
- 16 Temperaments across 5 rarity tiers (rarity = wackiness, **not** raw power)
- ~4,000+ mechanically distinct outcomes; visually distinct via duotone palette blends + grafted VFX
- Power budget formula + an automated "Chimera Lab" balance harness built on the existing `attack-damage-lab`
- Full autonomous implementation plan in §10, written for single-run execution

---

## 2. Pre-implementation baseline (research digest)

### 2.1 The attack roster (12 traits)

Defined in `packages/trait-runtime/src/content/catalog.ts` + `forest-core.ts`. Each trait has body sockets, tags, and Bud/Adapted behaviors; ranks 3–5 are derived in `rank-progression.ts` (rank 5 "Master": cadence ×0.64, damage ×1.78, reach ×1.36, duration ×1.26, count +3, jumps +3 capped at 7, pierce +3).

| Trait | Socket(s) | VFX family | Delivery |
|---|---|---|---|
| Porcupine Quills | back | physical (amber) | aimed piercing volley |
| Puffer Pouch | head | venom (moss) | gather/knockback pulse |
| Electric Eel Coil | tail | storm (cyan) | chain lightning |
| Firefly Colony | bodyOrbit | storm (cyan) | orbiting contact ring |
| Mantis Scythes | leftShoulder | physical (amber) | auto-aim melee arc |
| Gecko Pads | rightShoulder | venom (moss) | movement-trail damage zones |
| Owl Pinions | both shoulders | storm (cyan) | spread projectile volley |
| Bat Ears | head | arcane (violet) | cluster marking (utility) |
| Crab Pincers | both shoulders | physical (amber) | area crush |
| Armadillo Greaves | back | earth (ochre) | radial knockback (utility) |
| Skunk Brush | tail | venom (moss) | lingering damage cloud |
| Monarch Brood | bodyOrbit | physical (amber) | outer guardian orbiters |

### 2.2 The fusion system as-built

- `evolution-resolver.ts` formerly offered a fusion only when **both** ingredients of an authored recipe reached rank 5. Player explicitly chose "Fuse now"; the two traits were disabled (visuals retained), sockets transferred, and the evolution occupied **1 logical slot** (out of the former `maxActiveTraits: 3`).
- Only 6 recipes exist: Thornstorm Mantle (Quills+Pouch), Thunderbug Dynamo (Eel+Firefly), Razorstep Chimera (Mantis+Gecko), Midnight Radar (Owl+Bat), Meteor Mauler (Crab+Armadillo), Royal Stinkcloud (Skunk+Monarch).
- **The pain point, confirmed:** with 3 slots and 12 traits, a player who drafts any non-partner pair has zero fusion path. 60 of 66 pairs are dead ends. That's the "waiting for the two perfect ones" problem.

### 2.3 The machinery we get to reuse (this is the good news)

- **Command vocabulary** (`contracts.ts`): 13 command kinds (`spawnProjectileBurst`, `radialProjectileBurst`, `orbitingDamage`, `areaGather`, `areaKnockback`, `applyAreaDamage`, `spawnZone`, `markTargets`, `chainDamage`, `meleeArc`, `grantShield`, `telegraph`, `playTraitCue`), 6 targeting policies including `marked` and `rearThreat`, and a `multiPhase` behavior kind that already sequences telegraph → gather → burst (Thornstorm proves it). **Every chimera in this plan is a composition of these existing commands — the combat executor needs zero new mechanics for v1.**
- **Hard executor bounds** (`packages/sim/src/trait-command-executor.ts`): chain jumps ≤ 7, orbiting count ≤ 16, pierce ≤ 255, all values Float32-safe. These are the ceilings the budget solver must respect.
- **Determinism stack:** seeded RNG everywhere, replay records fusion picks as `fusion:<id>` strings (`simulation.ts` ~line 1841), per-tick state hashes, golden-replay corpus + stress-parity tests in `apps/web-toy/test/`.
- **Balance harness:** `attack-damage-lab.ts` — a deterministic 20-second proof lab that measures real DPS per attack against training targets. We extend this instead of balancing by vibes.
- **Visual law** (`apps/web-toy/src/render/attack-vfx-palette.ts`): 6 family colors (physical/earth/venom/arcane/storm/fire) with saturation/opacity caps, reserved danger-coral and reward-mint lanes, and gold reserved for critical impacts. Chimera visuals must obey this law — duotones, not new neon.
- **A tasty balance finding:** derived rank-5 Masters now out-damage the authored Mythics (e.g., Master Eel ≈ 14.24 dmg × up to 8 chain hits / 35 ticks vs Thunderbug Dynamo's 12 × 7 / 70 ticks). The authored six need a buff pass anyway — this plan folds that in via the shared budget formula.

### 2.4 Genre precedent (why "any two + variant roll" is the right call)

Fixed-recipe evolutions (Vampire Survivors style) reward wiki knowledge, not experimentation. Recent survivors-likes are moving to free-form combination: Grind Survivors infuses stacks of weapons into higher-rarity variants that inherit randomized affixes, and games like Genome Guardian and Margoq's Lair build entire identities on freely combining weapon parts into emergent results. The lesson from all of them: keep the *identity* of a combo deterministic (players learn what Quills+Eel *is*), keep the *flavor* rolled (players stay curious). That's exactly the Pair Base + Temperament split below.

---

## 3. Core design: the Wild Splice

**Rule 1 — Any two Masters fuse.** When any two owned, non-disabled attacks both reach rank 5, a fusion offer appears (same free, explicit "Fuse now / Later" flow as today, same 2-slots-become-1 economy).

**Rule 2 — The outcome has three layers:**

```
CHIMERA = PAIR BASE (deterministic, authored identity — §5 table)
        × TEMPERAMENT (rarity-weighted mutation roll — §6 table)
        × STAT LEAN (small rolled bias: cadence↔damage↔reach — §7.4)
```

**Rule 3 — Unique every time, stable within a run.** The variant is rolled from a pure function of `(runSeed, traitA, traitB, fusionReadyCount)` — no RNG stream consumption. Same run: the offer card can preview the exact chimera you'll get (and the preview never flickers between level-ups). Next run: same pair, different Temperament and Lean. Replays and golden hashes stay deterministic.

**Rule 4 — The six authored recipes survive as ★ Perfect Pairs.** If your pair matches an authored recipe, you get its signature multiPhase behavior with a +20% budget premium (vs +10% for wild splices) and its authored name — plus a Temperament roll on top. Recipe knowledge stays rewarded; it just stops being mandatory.

**Rule 5 — Chimeras don't re-fuse (v1).** No chimera-of-chimera. (Reserved as a v2 "Apex Splice" hook, §11.)

### 3.1 How a splice is assembled

Each trait contributes one of two roles, decided by an authored **chassis priority** (higher number = more "delivery-shaped"):

```
mantis 90 > quills 85 > owl 80 > eel 75 > skunk 70 > gecko 65 >
crab 60 > firefly 55 > monarch 50 > puffer 40 > armadillo 35 > bat 30
```

- The **Chassis** (higher priority) provides the skeleton: behavior kind, cadence, targeting, and primary VFX family.
- The **Donor** (lower priority) grafts its signature **Gimmick** onto that skeleton (table below), and contributes the accent color of the duotone.

| Donor | Gimmick graft (expressed in existing commands) |
|---|---|
| Porcupine Quills | **Pierce** — host projectiles gain +3 pierce and quill skin; non-projectile hosts append a 3-quill `spawnProjectileBurst` follow-up |
| Puffer Pouch | **Undertow** — prepend `telegraph` + `areaGather` phase (radius ≈ 0.8× host reach) so the payload lands on a bunched crowd |
| Electric Eel Coil | **Arc** — append `chainDamage` follow-up (≈ 0.35× host damage, 3–5 jumps) from the last victim |
| Firefly Colony | **Satellite** — add a refreshed `orbitingDamage` ring (4–6 motes at ≈ 0.3× host damage) styled after the host payload |
| Mantis Scythes | **Razor** — append a `meleeArc` sweep (≈ 0.5× host damage, arc 2.0) each cycle; the chimera literally grows blades |
| Gecko Pads | **Residue** — emissions leave `spawnZone` pads at the impact point (or a movement trail for self-centered hosts) |
| Owl Pinions | **Fan** — host `count` ×2 with +0.35 spread where count applies; otherwise adds a 4-feather volley phase |
| Bat Ears | **Lock-On** — prepend `markTargets` (densestCluster) and switch host targeting to `marked` |
| Crab Pincers | **Impact** — each payload lands an `applyAreaDamage` crunch (≈ 0.6× host damage, radius ~60) at the point of contact |
| Armadillo Greaves | **Recoil** — append `areaKnockback` (radius ≈ 0.9× host reach) after the payload |
| Skunk Brush | **Miasma** — the payload lingers: `spawnZone` stink at the last struck point (≈ 0.25× host damage per 15 ticks) |
| Monarch Brood | **Escort** — adds 2 slow wide-orbit guardians (`orbitingDamage`) carrying ≈ 0.4× host damage on contact |

Composition is a pure function → a synthesized `BehaviorDefinition` (usually `multiPhase`), which is then passed through the **existing catalog validators** and the **budget solver** (§7). Nothing dynamic ever mutates the authored catalog, so `catalogFingerprint` is untouched.

### 3.2 Utility pairs don't fizzle

Bat Ears, Puffer Pouch, Armadillo Greaves, and Monarch Brood are low/zero-DPS utilities. Rules:

- **Dealer + utility:** target DPS = dealer's Master DPS × 1.25, and the utility graft lands at 1.5× normal graft strength. You traded raw stats for control — the control should feel outrageous.
- **Utility + utility** (6 pairs: PB, PA, PN, BA, BN, AN): becomes a **Support Chimera** — control strength ×1.8, plus a modest damage rider (target = 0.6× the catalog's mean Master DPS) so it still clears trash. These get the flashiest visuals in the game as compensation. The Announcer treats them like luxury items.

---

## 4. Names and the Announcer voice

Every chimera's display name is assembled deterministically:

```
[TEMPERAMENT EPITHET] + [PAIR BASE NAME] + (rarity tag)
e.g.  "TWITCHY QUILLNADO (Common)"  ·  "SHOW-OFF CIRCUIT BREAKER (Mythic)"
```

Tone target: *Dungeon Crawler Carl*'s system announcer — an over-caffeinated game-show AI that is delighted by everything, especially your poor decisions. **House rules: no gore, no crude humor, no cursing.** The comedy comes from bureaucratic enthusiasm, dramatic overstatement, and treating absurd wildlife weaponry as fine consumer products.

Announcement template on fuse (new toast, §9.5):

> **FUSION COMPLETE.**
> **[NAME]** has joined your body's growing committee of opinions.
> *[one rolled flavor line]*

Sample flavor lines (authored pool, rolled by the same variant seed):

- "Two attacks entered the chamber. One attack left. Math has been notified."
- "This model comes with a lifetime warranty. Estimates of that lifetime vary."
- "It is fully house-trained. It is not, however, house-broken. Different thing."
- "Please do not taunt the new attachment. It remembers."
- "Handcrafted by unlicensed science. No refunds, no exchanges, no regrets."
- "The committee reviewed your loadout and screamed with joy. Mostly joy."
- "Contains absolutely zero onions. We checked twice." *(quality assurance is thorough)*
- "Spicy. Dangerously, deliciously spicy. The jalapeño of fusions."
- "Some assembly was required. We did the assembly. You do the stomping."
- "Legally, this is still one attack. Physically, it is a situation."

Achievements (clean DCC energy):

| Achievement | Trigger |
|---|---|
| **Fusion Cuisine** | Perform your first Wild Splice |
| **No Substitutions** | Fuse a ★ Perfect Pair |
| **The Committee** | Field 3 chimeras in one run |
| **Menu Roulette** | Fuse the same pair in two different runs and get different Temperaments |
| **Gremlin Chemistry** | Fuse a Support Chimera (two utilities) |
| **Apex Curiosity** | Own every Temperament rarity at least once (lifetime) |
| **It Followed Me Home** | Fuse a Mythic-Temperament chimera |
| **Certified Pre-Owned** | Fuse using the meta-shop Reckless Splice discount (§11) |

---

## 5. The full outcome space — all 66 Pair Bases

Legend: ★ = existing authored Perfect Pair (kept, buffed to budget). Chassis is listed first in "What it does." Colors follow the duotone law (§8): primary = chassis family, accent = donor family, saturation-capped per `attack-vfx-palette.ts`. Where both parents share a family, the duotone becomes a two-shade gradient of that family plus a heavier shape read (§8.2).

### 5.1 Porcupine Quills pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Quills + Pouch | ★ **Thornstorm Mantle** | Authored: telegraph → gather → 360° quill storm | Violet inhale ring collapsing into an amber needle nova |
| Quills + Eel | **Static Acupuncture** | Quill volley; every quill that connects sparks a 3-jump chain off the victim | Amber quills stitched together mid-air by thin cyan filaments; hit enemies briefly light up like circuit nodes |
| Quills + Firefly | **Glowneedle Halo** | Quill volley plus a refreshed orbit ring of needle-shaped motes at 0.3× damage | Amber volley; the orbit ring is tiny glowing quills that leave soft cyan trails |
| Quills + Mantis | **Quillotine Sweep** | Mantis-chassis melee arc; each sweep flings a piercing 3-quill fan from the blade tip | Ivory scythe arc that "sheds" amber needles at its apex, like a brush flicking paint |
| Quills + Gecko | **Caltrop Confetti** | Quill volley; each quill plants a sticky damage pad where it lands | Amber streaks ending in moss-green burr pads that pulse when stepped on |
| Quills + Owl | **Quillnado** | Quill volley with count ×2 and wide spread — a rolling wall of needles | A layered amber-and-cyan feather-quill fan so dense it reads as weather |
| Quills + Bat | **Homing Pincushion** | Marks the densest cluster, then volleys retarget the marked prey | Violet sonar rings blossom on the crowd; amber quills curve unnaturally toward them |
| Quills + Crab | **Jackhammer Quills** | Quill volley; each hit detonates a small area crunch | Amber quills with ivory shockwave rings popping at every impact like bubble wrap |
| Quills + Armadillo | **Porcupine Mosh Pit** | Quill volley, then a radial shove that bounces the survivors away | Amber volley followed by an ochre dust ring rippling outward |
| Quills + Skunk | **Eau de Ouch** | Quill volley; impacts leave small lingering stink puffs | Amber quills trailing wobbly moss-green scent lines, tiny clouds where they land |
| Quills + Monarch | **Monarch Lancers** | Quill volley plus two wide-orbit guardian butterflies carrying lance-quills | Ivory wings with a single oversized amber quill couched like a jousting lance |

### 5.2 Puffer Pouch pairs (the Undertow suite)

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Pouch + Eel | **Riptide Circuit** | Inhale pulls the crowd together, then a chain discharge rips through the bunch | A moss-green whirlpool shimmer that snaps into a single branching cyan bolt |
| Pouch + Firefly | **Lantern Whirlpool** | Orbit ring plus a periodic pull that drags enemies *into* the ring | Cyan motes orbiting a slow moss spiral; enemies visibly slide into the light |
| Pouch + Mantis | **Salad Spinner Supreme** | Gather phase, then one enormous double-width scythe sweep through the pile | Moss vortex collapsing into a gleaming ivory arc; leaves get shredded off nearby foliage for effect |
| Pouch + Gecko | **Flypaper Fiesta** | Trail pads that actively pull nearby enemies onto themselves | Moss pads with darker green swirl-lines; enemies do a slow, indignant slide |
| Pouch + Owl | **Feathered Undertow** | Inhale, then a point-blank feather shotgun into the clump | Moss shimmer pull, answered by a cyan feather burst with visible wind streaks |
| Pouch + Bat | ✦ **The Polite Kidnapping** | Support Chimera: marks a far cluster, drags it toward you, small pop + shield tick | Violet rings appear at range, then a moss tractor-shimmer escorts the victims over |
| Pouch + Crab | **Compactor Hug** | Gather, then an oversized crush on the compacted crowd | Moss vortex, then a slow ivory ring slam with a satisfying flatten-frame |
| Pouch + Armadillo | ✦ **The Bouncy Castle** | Support Chimera: rhythmic inhale-exhale — pull in, blast out, small shield each cycle | Alternating moss and ochre concentric rings, like the arena is breathing |
| Pouch + Skunk | **Aromatherapy Trap** | A stink cloud that inhales victims into its own center | A two-tone green spiral cloud; enemies orbit the drain before succumbing |
| Pouch + Monarch | ✦ **Butterfly Net** | Support Chimera: guardian ring plus a pull that drags foes into the orbit lane | Ivory wings tracing a circle; a moss net-swirl funnels enemies onto the flight path |

### 5.3 Electric Eel Coil pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Eel + Firefly | ★ **Thunderbug Dynamo** | Authored: telegraphed wide chain discharge | Storm-cyan telegraph ring, then a branching mega-bolt |
| Eel + Mantis | **Lightning Scissors** | Mantis-chassis sweep; the last enemy struck emits a 4-jump chain | Ivory arc whose trailing edge frays into cyan filaments that leap away |
| Eel + Gecko | **Static Stepping Stones** | Chain strike leaves an electrified pad at every hop point | A cyan bolt hopscotching across the field, leaving humming moss-glow tiles |
| Eel + Owl | **Thunderbird Volley** | Feather volley; each feather that hits sparks a 2-jump mini-chain | All-storm shading: deep cyan feathers with pale crackle halos on impact |
| Eel + Bat | **Lightning Rodeo** | Marks the densest cluster; the chain leaps marked-first, then nearest | Violet lasso rings on the herd, then one cyan bolt threading them in order |
| Eel + Crab | **Circuit Breaker** | Chain strike whose final victim erupts in an area crunch | A cyan bolt line that terminates in an ivory shatter-ring — the "fuse blowing" |
| Eel + Armadillo | **Repulsor Coil** | Discharge, then a radial shove flings the singed crowd outward | Cyan crackle nova with an ochre dust ring expanding behind it |
| Eel + Skunk | **Ozone Funk** | Chain strike leaves stinky ozone clouds at each hop | Cyan bolts with moss haze puffs hanging in the air like bad cologne |
| Eel + Monarch | **Tesla Butterflies** | Two guardians orbit wide; arcs jump guardian → prey → guardian | Ivory wings strung with delicate cyan filaments — a flying power line |

### 5.4 Firefly Colony pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Firefly + Mantis | **Firefly Fencing** | Mantis-chassis sweep plus an orbit ring of blade-shaped motes at 0.3× damage | Ivory arcs with a rotating ring of cyan sparks that flare each time the scythe passes through them |
| Firefly + Gecko | **Nightlight Minefield** | Gecko-chassis trail pads, each with a firefly mote hovering above it | Moss pads glowing under soft cyan lanterns — cozy, until something steps on one |
| Firefly + Owl | **Constellation Cannon** | Owl-chassis feather volley plus a refreshed orbit ring | Cyan feathers streaking through a slow ring of star-like motes; misses look like shooting stars |
| Firefly + Bat | **Paparazzi Swarm** | Marks the densest cluster; motes flash-mob outward at the marked prey in a burst | Violet rings on the crowd, then a stampede of cyan camera-flash pops converging on them |
| Firefly + Crab | **Crab Rave Lightshow** | Crab-chassis area crush plus an orbit ring pulsing to the crunch cadence | Ivory slam rings synced with cyan motes that strobe on every impact — the arena becomes a dance floor |
| Firefly + Armadillo | **Bug Zapper Bouncer** | Orbit ring plus a periodic radial shove that ejects gate-crashers | Cyan motes with an ochre "velvet rope" dust ring pulsing outward |
| Firefly + Skunk | **Lava Lamp of Regret** | Skunk-chassis lingering cloud with glowing motes drifting inside it | A moss-green cloud lit from within by lazy cyan blobs; hypnotic and deeply unwise to enter |
| Firefly + Monarch | **Pocket Solar System** | Double orbit: fast inner firefly ring, slow outer guardian ring | Concentric rings — cyan sparks inside, ivory wings outside — orbiting like planets with opinions |

### 5.5 Mantis Scythes pairs (the blade suite — Mantis is always chassis)

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Mantis + Gecko | ★ **Razorstep Chimera** | Authored: stronger sweeps; movement leaves scythe pads | Ivory arcs with moss blade-pads blooming in your footprints |
| Mantis + Owl | **Razor Fan Dance** | Sweep, then a 4-feather fan volley flung from the follow-through | An ivory arc that unfurls into cyan feather-blades at the end of each swing |
| Mantis + Bat | **The Scheduled Haircut** | Marks the densest cluster; sweeps auto-aim into the marked crowd | Violet appointment-rings appear, then the scythes arrive precisely on time |
| Mantis + Crab | **Nutcracker Suite** | Every sweep ends in an area crunch at the point of deepest contact | Ivory arc with a percussive white shatter-ring on the final frame; faint musical sting |
| Mantis + Armadillo | **Personal Space Enforcer** | Sweep, then a radial shove that resets the crowd to a respectful distance | Ivory arc with an ochre ripple that pushes everything back a full body-length |
| Mantis + Skunk | **Compost Cyclone** | Sweeps leave a curved stink wake along the blade path | Ivory arcs trailing moss-green vapor ribbons that hang like calligraphy |
| Mantis + Monarch | **Royal Fencing Club** | Sweep plus two wide guardians that "parry" (contact damage) between swings | Ivory arcs while two crowned butterflies perform tiny formal lunges |

### 5.6 Gecko Pads pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Gecko + Owl | **Tar & Feathers** | Owl-chassis volley; each feather plants a sticky pad where it lands | Cyan feathers thunking down into moss puddles — a carpet-bombing of glue |
| Gecko + Bat | **Ambush Welcome Mats** | Marks the densest cluster; pads spawn directly beneath the marked prey | Violet rings, then moss doormats materialize under enemy feet, reading (in tiny print) "OH NO" |
| Gecko + Crab | **Landmine Lily Pads** | Trail pads that periodically detonate a crunch pulse | Moss pads that bulge and pop with ivory shatter-rings on their damage tick |
| Gecko + Armadillo | **Trampoline Traps** | Trail pads paired with a shove pulse that bounces enemies off them | Moss pads with ochre spring-coil glyphs; enemies visibly boing away |
| Gecko + Skunk | **The Unwelcome Carpet** | Movement weaves a continuous linked stink-and-stick carpet behind you | A two-tone green runner rug of overlapping pads and haze unrolling in your wake |
| Gecko + Monarch | **Flowerbed Minefield** | Trail pads plus guardians that flutter above the newest pads | Moss pads sprouting tiny flowers; ivory butterflies tend the garden; the garden bites |

### 5.7 Owl Pinions pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Owl + Bat | ★ **Midnight Radar** | Authored: wide cluster marking; attacks hunt the marked | Violet sonar sweep with cyan feather glints riding the wave |
| Owl + Crab | **Feather Flak** | Feather volley; each hit detonates a small area crunch | Cyan feathers bursting into ivory puff-rings — anti-air fire, but for ground rodents |
| Owl + Armadillo | **Gale-Force Manners** | Feather volley, then a radial shove gusting the crowd back | Cyan feather stream with an ochre wind-ring; loose leaves everywhere |
| Owl + Skunk | **Fowl Odor** | Feather volley; impacts leave small stink puffs | Cyan feathers with wobbling moss stink-lines rising off every landing site |
| Owl + Monarch | **Air Traffic Control** | Volley plus two guardians orbiting in escort formation | Cyan feathers streaking past ivory wings holding perfect lane discipline |

### 5.8 Bat Ears pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Bat + Crab | **Precision Pinch** | Marks the densest cluster; the crush lands exactly on the marked crowd | Violet target rings, then one ivory crunch centered with insulting accuracy |
| Bat + Armadillo | ✦ **Restraining Order** | Support Chimera: marks the herd and auto-shoves anything that flanks behind you (`rearThreat`) | Violet rings ahead, sudden ochre ripples behind — paperwork served in all directions |
| Bat + Skunk | **Certified Stink Mail** | Marks the densest cluster; stink clouds spawn directly on the marked prey | Violet delivery-rings, then moss clouds materialize on the recipients. Signature required |
| Bat + Monarch | ✦ **Butterfly Bounty Hunters** | Support Chimera: guardians orbit wide and surge at marked prey for bonus contact hits | Ivory wings with violet wanted-poster rings; the butterflies dive like tiny professionals |

### 5.9 Crab Pincers pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Crab + Armadillo | ★ **Meteor Mauler** | Authored: heavy close-range impact crushes the nearest crowd | Ember-orange impact ring with ochre debris |
| Crab + Skunk | **Swamp Thump** | Skunk-chassis cloud with a periodic internal crunch at its center | A moss bog-cloud that visibly *thumps* — ivory ring, ripple, repeat |
| Crab + Monarch | **Piñata Patrol** | Crush plus guardians carrying mini-crunch pops on contact | Ivory slam rings while butterflies drift past popping enemies like party favors |

### 5.10 Armadillo Greaves pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Armadillo + Skunk | **The No-Fly Zone** | Skunk-chassis cloud that periodically shoves intruders back out of itself | A moss cloud with an ochre bouncer-ring that ejects anyone who gets comfortable |
| Armadillo + Monarch | ✦ **Velvet Rope Security** | Support Chimera: guardian ring plus rhythmic shove pulses off the orbit lane | Ivory wings trailing an ochre rope-of-dust circle; enemies bounce off an invisible guest list |

### 5.11 Skunk Brush pairs

| Pair | Name | What it does | What it looks like |
|---|---|---|---|
| Skunk + Monarch | ★ **Royal Stinkcloud** | Authored: monarch-crowned hazard field surrounds you | Moss clouds with tiny ivory crowns drifting on top |

**Count check:** 11+10+9+8+7+6+5+4+3+2+1 = **66 pairs** — 6 ★ Perfect Pairs, 6 ✦ Support Chimeras, 54 standard Wild Splices.

---

## 6. Temperaments — the "unique every time" layer

One Temperament is rolled per fusion (plus one Stat Lean, §7.4). Temperaments are **shape** changes; the budget solver (§7.3) renormalizes damage afterward, so rarity buys personality and a small envelope bump — never a hidden power spike.

Rarity odds: **Common 45% · Uncommon 30% · Rare 17% · Epic 6.5% · Mythic 1.5%** (uniform within a tier).

| Temperament | Rarity | Shape change | Visual tell | Announcer aside |
|---|---|---|---|---|
| **Steady** | Common | No shape change; clean +5% output | Calm, even pulse on the splice seam | "It does exactly what it says. Suspicious, frankly." |
| **Twitchy** | Common | Cadence ×0.80 (faster), per-hit damage down | Jittery idle sparks; effects stutter-start eagerly | "It has had nine espressos. It is not sorry." |
| **Hearty** | Common | Per-hit damage up, cadence ×1.18 (slower) | Thicker, chunkier projectiles and rings | "Big-boned. Built different. Swings like a vending machine." |
| **Long-Arm** | Common | Reach/radius ×1.25, density down | Stretched trails, elongated shapes | "Personal space is other people's problem now." |
| **Compact** | Common | Reach ×0.80, per-hit damage up | Dense, concentrated glow; smaller but brighter | "We shrank it in the wash. It's furious and efficient." |
| **Echo** | Uncommon | Each emission repeats 6 ticks later at 45% power | A translucent ghost-cast trails every real cast | "Comes with a free understudy. The understudy is trying its best." |
| **Magnet-Hearted** | Uncommon | Adds a mini `areaGather` before the payload | A soft inhale shimmer before each cast | "Clingy. Enemies find this out too late." |
| **Skittish** | Uncommon | Adds an `areaKnockback` puff after the payload | A nervous dust ring after every cast | "It would prefer if everyone just... backed up. Thanks." |
| **Gilded** | Uncommon | Straight +10% output, no downside | Gold-flecked shimmer along the seam (flecks only — full gold stays reserved for crits) | "The luxury trim package. Heated seats not included." |
| **Doubled-Down** | Rare | Emission count ×2, per-hit damage sharply down | Twin-mirrored emissions, perfectly symmetrical | "Two of everything. The accountant fainted." |
| **Bulwark** | Rare | Every 4th cycle also `grantShield`s the hero | An amber shell shimmer snaps on at the fourth beat | "It worries about you. Aggressively." |
| **Seismic** | Rare | Each cast also plants a short-lived damage zone at the cast origin | Cracked-earth glow spreading from your feet | "Terms and conditions now apply to the floor." |
| **Prismatic** | Epic | Every 3rd cast fires the full graft suite at once | The duotone slowly rotates hues (saturation-capped); the 3rd cast blooms all accents together | "It contains multitudes. The multitudes take turns. Mostly." |
| **Colossus** | Epic | Reach ×1.5 and per-hit damage up, cadence ×1.5 (slow) | Oversized effects plus a rate-limited camera nudge on cast | "We fed it. We may have overfed it." |
| **Apex Whisper** | Mythic | BOTH parents act as chassis — full behavior of each, plus the graft, damage renormalized | A double-helix braid where the seam would be; both parent auras run simultaneously | "The committee has merged with the other committee. Pray for the minutes-taker." |
| **Show-Off** | Mythic | Every cast telegraphs first, then lands ×1.6 damage | A spotlight telegraph ring; impact frames use the reserved critical gold | "It will not stop posing. The posing is load-bearing." |

**Stat Lean (rolled alongside, 5 options):** Balanced · Swift (faster, lighter hits) · Heavy (slower, harder hits) · Reaching (wider, sparser) · Dense (more emissions, shorter reach). Leans are ±10–15% shape biases, also renormalized by the solver. Temperament × Lean × 66 pairs ≈ **5,280 mechanically distinct chimeras** before counting the flavor-line roll.

---

## 7. Power scaling — balanced but ultra cool

### 7.1 The anchor: measured Master DPS, not vibes

`packages/sim/src/attack-damage-lab.ts` already measures real damage per attack in a deterministic 20-second dense-target lab. Phase 0 extends its script profiles to **rank-5 Master** versions of all 12 traits (using the exact `rank-progression.ts` multipliers) and emits a `MASTER_DPS` constant table. Every budget below consumes lab numbers, because theoretical saturated math lies (Master Quills "in theory" hits 8 quills × 6 pierce-hits each; the lab tells us what actually connects).

### 7.2 Target DPS per chimera class

```
dealers(A,B):        T = (max(dpsA, dpsB) + 0.5 · min(dpsA, dpsB)) × 1.10
★ Perfect Pair:      same, × 1.20 instead of × 1.10   (recipe knowledge premium)
dealer + utility:    T = dpsDealer × 1.25              (graft strength × 1.5)
✦ utility + utility: T = 0.6 × mean(MASTER_DPS)        (control strength × 1.8)
```

Why these shapes: fusing must beat keeping the stronger parent alone (else never fuse), must stay below the *sum* of both parents (you also freed a slot, which is worth a whole new attack), and Perfect Pairs keep a visible edge so the authored content stays aspirational. This formula also fixes today's inversion where derived rank-5 Masters out-damage authored Mythics — the six ★ behaviors get renormalized up to their ×1.20 budget in Phase 4.

### 7.3 The budget solver (deterministic, pure)

1. Compose the chimera `BehaviorDefinition` (chassis skeleton + donor graft + temperament shape + lean bias).
2. Run a closed-form estimator `E(behavior)` (damage × expected hits × emissions ÷ period; zones as amount/interval × expected occupancy). The estimator is calibrated per command kind against lab measurements of the 12 parents: `calibration = labDPS_parent / E(parent)`.
3. Scale all damage-like fields (`damage`, `amount`) by one scalar `k` so `E(chimera) × calibration ≈ T × rarityEnvelope`, where rarityEnvelope = 1.00 / 1.02 / 1.05 / 1.08 / 1.12 (Common → Mythic).
4. Clamp to **hard executor bounds** — these are law: chain `jumps ≤ 7`, `orbitingDamage count ≤ 16` *summed across host ring + Satellite graft + Escort graft*, `pierce ≤ 255`, all values Float32-safe, `multiPhase ≤ 4 phases`, ≤ 3 commands per cycle (command-buffer overflow drops writes; we stay far under capacity).
5. Round using the same `rounded()` 3-decimal law as `rank-progression.ts` so results are byte-stable across runtimes.

### 7.4 Verification: the Chimera Lab

Implemented at `apps/web-toy/src/diagnostics/chimera-lab.ts`, deliberately at
the browser integration boundary so it proves a real `TraitRuntime` through the
production `Simulation` port without a renderer dependency:

- **PR gate:** all 66 pairs at Steady/Balanced measure authoritative DPS within
  ±25% of `T`; Support Chimeras must also observe a real utility effect.
- **Property gate (cheap, exhaustive):** all 66 × 16 × 5 = 5,280 compositions
  run through the synthesis/validator and hard-bound checks without a
  simulation loop.
- **Lab v2 attribution:** a deterministic world Bomb can legitimately occur
  after a trait kill, but its resolved `world-bomb` hit events are subtracted
  exactly from the measured total. The Lab therefore retains the production
  simulation and RNG path while crediting only the Chimera under test.
- A scheduled all-variant runtime sweep and `CHIMERA_BUDGET_MODE=propose`
  proposal mode were not added to this v1 implementation; they remain possible
  automation follow-up rather than claimed behavior.

### 7.5 Economy and degeneracy guards

- Slot math: starter + up to four acquired logical attack slots = five active
  cards. A fusion turns two acquired attacks into one terminal Chimera,
  freeing capacity; sequential acquisition permits up to three terminal
  Chimeras without exceeding four acquired slots.
- Chimeras cannot re-fuse (v1) and cannot rank up further; they're terminal.
- The offer director is untouched: it still prioritizes finishing partners *of owned Masters* — with universal fusion, that bucket now simply means "your other owned attacks," which is exactly the right nudge.
- Support Chimeras cap at 1 per run (a second all-utility fusion offer is suppressed) so a run can't stack 3 control chimeras and stall the sim with zero DPS.

---

## 8. Visual system — how 5,280 variants stay readable

### 8.1 The duotone law

Chimeras never invent colors. Primary = chassis family (body/core of every effect), accent = donor family (edges, trails, secondary particles), both drawn from `PROCEDURAL_UNDERPAINT_COLORS` with the existing saturation multiplier (0.65) and opacity caps (0.35 underlay / 0.45 accent). Thirteen duotones actually occur across the 60 wild pairs:

| Blend | Working name | Read |
|---|---|---|
| physical + physical | Polished Ivory | Amber core, bone-white edge highlights |
| physical + venom | Amber Absinthe | Amber body, moss drip accents |
| physical + storm | Brass Lightning | Amber body, cyan filament accents |
| physical + arcane | Candlelit Ritual | Amber body, violet ring accents |
| physical + earth | Quarry Dust | Amber body, ochre debris flecks |
| venom + venom | Double Venom | Moss→chartreuse gradient, heavier drip shapes |
| venom + storm | Electric Absinthe | Moss body, cyan crackle edges |
| venom + arcane | Witch's Terrarium | Moss body, violet glow rims |
| venom + earth | Bog Iron | Moss body, ochre sediment swirl |
| storm + storm | Deep Current | Slate-cyan gradient, pale crackle cores |
| storm + arcane | Twilight Static | Cyan body, violet afterimages |
| storm + earth | Dust Storm | Cyan body, ochre grit ring |
| arcane + earth | Buried Sigil | Violet body, ochre rune-cracks (Bat+Armadillo only — make it count) |

Fire stays reserved for Meteor Mauler's authored art; danger-coral and reward-mint lanes are untouched; full-saturation gold appears **only** on Show-Off impact frames (it's critical-impact art by definition).

### 8.2 Same-family pairs

When both parents share a family (e.g., Eel+Owl, both storm), the duotone becomes a two-shade gradient of that family and the **silhouette does the differentiating**: chunkier outlines, doubled edge strokes, and the donor's shape motif (feather, bolt, drip, wing) stamped into particles.

### 8.3 The body tells the story

- Both parents' socket attachments are **already retained** after fusion (the resolver keeps disabled ingredients' visual footprint) — so a chimera hero visibly wears both animals. Free win.
- New: a **splice seam** — a thin braided aura arc connecting the two attachment clusters across the body, drawn in the duotone. This is the one new attachment asset class (`chimera-seam`, tinted procedurally — one mesh/sprite, 13 tints, not 60 assets).
- Temperament adds one accent particle behavior on the seam (jitter sparks for Twitchy, ghost trail for Echo, gold flecks for Gilded, double-helix braid for Apex Whisper, etc. — the "Visual tell" column in §6).
- visualKey scheme: `chimera:<a>+<b>:mythic` (parents in canonical catalog order), with the temperament carried in renderer state, not the key — so the attachment atlas stays finite.

### 8.4 Effect materials

Graft commands carry chimera-specific tags (`chimera-arc`, `chimera-residue`, `chimera-escort`…) that map into `EFFECT_MATERIAL_PALETTE_FAMILY` via a `chimera:` prefix resolver returning the pair duotone instead of a single family. Unknown/legacy paths keep today's physical fallback — nothing can render "unstyled danger coral" by accident.

### 8.5 Readability governors

All existing governors apply unchanged: illustrated-VFX intensity governor, Master rank profile caps (scale ≤ 1.2×), rate-limited camera shake (Colossus and ★ fusions only), and XP/impact density governors. A chimera is louder than a Master, but it obeys the same ceilings — "ultra cool" comes from *composition*, not from breaking the art direction.

---

## 9. UI & copy plan

- **Fusion offer cards** (pause/level-up flow, unchanged mechanics): now show the rolled preview — name, rarity chip, temperament, and a two-line procedural description assembled from chassis verb + donor clause (new `apps/web-toy/src/presentation/chimera-copy.ts`; the 6 ★ pairs keep their hand-written copy). The preview is stable for the whole run (§3, Rule 3) — no slot-machine anxiety at the card.
- **Card detail line** always states the trade plainly, budget-honest: *"Fuses 2 Master attacks into 1 slot. Free. Permanent. Enthusiastic."*
- **Announcer toast** on fuse (new `fusion-announcer.ts`, follows the director-notices presentation pattern): the §4 template with a seeded flavor line.
- **Active attacks panel** (`active-attacks.ts`): chimera rows show a braid icon plus both parent names beneath the chimera name.
- **Field Guide hook (optional, Phase 4):** discovered chimeras log to the profile for collection pressure — 66 entries, blind-box energy. The Announcer refers to it as "the catalog you are legally required to enjoy."

---

## 10. Autonomous implementation plan

Written to be executed top-to-bottom in one session with no mid-run questions. All paths relative to repo root `AnimalSurvivor/`. After every phase: run that package's test suite; do not proceed on red. If a step's primary approach fails, apply its listed fallback; never leave a phase half-applied.

### Phase 0 — Measurement scaffolding

1. Add Master-rank script profiles for all 12 traits to `packages/sim/src/attack-damage-lab.ts` (derive numbers with the exact `SCALE_BY_RANK[5]` multipliers from `packages/trait-runtime/src/rank-progression.ts`; jumps/pierce/count adjustments included, chain jumps capped at 7).
2. Add `packages/sim/scripts/generate-master-dps.mjs`: runs the lab, writes `packages/trait-runtime/src/chimera/master-dps.generated.ts` exporting `MASTER_DPS: Record<TraitId, number>` and `MEAN_MASTER_DPS`. Commit the generated file (deterministic seed → stable output). Fallback: if any Master case reports `damage-missing` where damage is expected, abort and fix the profile — do not hand-edit the generated table.
3. Tests: lab report asserts all 8 dealer traits `damage-confirmed`, 4 utility traits (`puffer-pouch`, `bat-ears`, `armadillo-greaves`, plus confirm `monarch-brood` classification by measurement) `utility-confirmed` or `damage-confirmed`.

### Phase 1 — Synthesis core (new `packages/trait-runtime/src/chimera/`)

All modules pure, no ambient RNG, no Date/Math.random. Files:

1. `chimera-ids.ts` — `chimeraPairId(a, b)` → `chimera:<first>+<second>` in catalog order; `parseChimeraId`; guards.
2. `variant-roll.ts` — `rollVariant(runSeed, traitA, traitB, fusionReadyCount)` → `{ temperamentId, leanId, flavorIndex }` via splitmix32 mixing. Pure function; identical inputs → identical variant (offer preview = fused result, replay-safe).
3. `chassis.ts` — the §3.1 priority table; extracts the chassis skeleton (behavior kind, period, targeting, primary emit) from the chassis parent's **rank-5** stage (`rankStageFor(def, 5)`).
4. `gimmicks.ts` — 12 donor graft transforms (§3.1 table), each returning added phases/emits expressed only in existing `CommandKind`s. Zone grafts emit existing tags (`sticky-trail`, `stink-cloud`) in v1.
5. `temperaments.ts` — 16 definitions (§6): shape transform + rarity + epithet + accent key. Weighted pick tables (45/30/17/6.5/1.5).
6. `leans.ts` — 5 stat leans (§6 footer).
7. `budget.ts` — estimator `E()`, per-command calibration from `MASTER_DPS`, target formula (§7.2), scalar solve, hard-bound clamps (jumps ≤ 7; total orbiting count across host+grafts ≤ 16; pierce ≤ 255; phases ≤ 4; Float32 checks; `rounded()` 3-decimal law).
8. `naming.ts` — the 66 pair base names (§5 tables, keyed by canonical pair id), temperament epithets, `displayName(pair, temperament, rarity)`.
9. `synthesize.ts` — `synthesizeChimera(catalog, idA, idB, variant)` → `EvolutionDefinition` (id = chimera pair id, ingredients, occupiedSockets = socket union, visualKey `chimera:<a>+<b>:mythic`, behavior). ★ Perfect Pair detection: if the pair matches an authored `catalog.evolutions` recipe, keep the authored id/behavior/visualKey, then apply temperament shape + ×1.20 budget. Memoize per `(pairId, variant)`.
10. Tests (`packages/trait-runtime/test/chimera/`): property sweep — all 66 pairs × 16 temperaments × 5 leans synthesize, pass `validateCatalog`-level checks on the produced definition, respect every hard bound, and are deep-equal across two independent syntheses (determinism). Support-pair damage rider > 0. Name table covers exactly 66 canonical keys.

### Phase 2 — Runtime + sim integration

1. `contracts.ts` (**frozen file — this is the single, additive contract change; get lead sign-off in the PR description**): `ResolvedEvolution` gains optional `variant?: { seed: number; temperamentId: string; leanId: string }`; `FusionOffer` gains optional `displayName`, `rarity`, `temperamentId`, `pairKind: 'perfect' | 'wild' | 'support'`.
2. `evolution-resolver.ts` — `availableFusions` enumerates every unordered pair of owned, non-disabled, rank-5 traits (Perfect Pairs listed first, then canonical order); attaches the §Phase-1 variant preview; applies the Support-cap rule (§7.5). `fuseEvolution` accepts chimera ids, synthesizes on demand, records `variant` in state, disables parents, transfers sockets (existing logic).
3. `build-state.ts` / `behavior-runtime.ts` / `serialization.ts` / `state-hash.ts` — behavior lookup falls back from authored catalog to the synthesis cache for `chimera:*` ids; `STATE_VERSION` 3 → 4 with migration (v3 evolutions load with `variant: undefined` → authored behavior, zero gameplay change); hash writer includes variant fields.
4. `packages/sim` plumbing — `trait-runtime-port.ts` and `run-upgrade-queue`/simulation surfaces pass the enriched offers through; `simulation.ts` fusion selection already records `fusion:<id>` strings — add a replay test proving `fusion:chimera:<a>+<b>` round-trips.
5. Run-start loadout is **untouched** (no new fields → no loadout fingerprint shift), but serialization/hash changes will shift golden baselines anyway: run `npm run golden:propose` from `apps/web-toy`, confirm the live `driven === control` and reproducibility assertions pass first, then paste the proposed `GOLDEN_HASHES` and `EXPECTED_FIVE_MINUTE_HASH` (per the repo's established rebaseline runbook).
6. Save-safety fallback: if a persisted chimera fails to re-synthesize on load (e.g., future rename), re-enable both parents at Master and drop the evolution — never brick a save. Unit-test this path explicitly.

### Phase 3 — Presentation

1. `apps/web-toy/src/presentation/chimera-copy.ts` — procedural card copy (chassis verb + donor clause + temperament line); tolerant reads like `mastery-fusions.ts` (`readFusionOffers` extended for the new optional fields; missing fields → today's generic copy, so an old sim build still runs).
2. `apps/web-toy/src/presentation/fusion-announcer.ts` — §4 toast + flavor pool indexed by `flavorIndex`; wire into `app.ts` `resolveFusion` success path.
3. `apps/web-toy/src/render/attack-vfx-palette.ts` — `paletteLaneForChimeraSource(sourceId)`: parse parents, return `{ primary, accent }` duotone; unknown → physical fallback (existing law).
4. `trait-command-presentation.ts` + effect-material table — add `chimera-*` tags → duotone materials; splice-seam attachment (`chimera-seam` asset, 13 procedural tints); temperament accent particles keyed by accent key; Show-Off gold restricted to impact frames; Colossus camera nudge through the existing rate-limited `camera-impact-shake`.
5. `active-attacks.ts` — braid icon + parent names row.
6. Browser QA snapshot: fuse one wild pair, one ★ pair, one ✦ support pair in the dev harness; verify toast, seam, duotone, and panel rows. Record results in `docs/playtests/`.

### Phase 4 — Balance pass & polish

1. Run the Chimera Lab PR gate + nightly sweep; apply `CHIMERA_BUDGET_MODE=propose` trims for outliers.
2. Renormalize the six ★ behaviors up to their ×1.20 budget (this is the fix for the current "Masters out-damage Mythics" inversion).
3. Optional-but-cheap: Field Guide chimera log + §4 achievements (profile schema v6 → v7, following the `permanentUpgradeRanks` migration pattern).
4. Update `docs/progression-roadmap.md` and `docs/status/current.md` to reflect the Wild Splice system.

### Phase 5 — Exit criteria (all must pass)

- `packages/trait-runtime`, `packages/sim`, `apps/web-toy` test suites green, including new property sweep, replay round-trip, migration, and save-safety tests.
- Golden corpus + stress parity rebaselined with live determinism assertions green.
- Chimera Lab: 66/66 within envelope; 0 hard-bound violations across 5,280 compositions.
- Manual QA script from Phase 3.6 recorded.
- No changes to: authored trait definitions, `RunStartLoadout`, danger/reward palette lanes, offer-director selection logic.

---

## 11. Reserved for v2 (explicitly out of scope now)

- **Apex Splice:** fuse a chimera with a Master attack (three-parent monsters; needs its own budget tier and probably its own intervention from the Announcer's legal department).
- **Reckless Splice:** meta-shop permanent upgrade (fits the existing `PERMANENT_UPGRADE_CATALOG` pattern) letting rank-4 attacks fuse early with a forced "Feral" penalty temperament — spends Essence, feeds the shop loop.
- **New zone tags** (`ember-wake`, `static-tile`) with their own executor behaviors and palette lanes, replacing the v1 mapping onto `sticky-trail`/`stink-cloud`.
- **Authored multiPhase upgrades** for the most-picked wild pairs (promote fan favorites to signature choreography, data-driven from the Field Guide).

---

## 12. Edge cases & failure handling

| Case | Handling |
|---|---|
| Same pair fused in two runs | Different `runSeed` → different Temperament/Lean/flavor. The point. |
| Same pair, same run, offer re-shown after "Later" | Pure variant function → identical preview every time. No reroll fishing. |
| Replay of a run with chimeras | Selection records already carry full `fusion:<id>` strings; variant re-derives from run state. Round-trip test in Phase 2.4. |
| Old save (STATE_VERSION 3) | Migration maps authored evolutions with `variant: undefined` → behavior byte-identical to today. |
| Persisted chimera fails to re-synthesize | Re-enable both parents at Master, drop the evolution, log a diagnostics note. Never brick a save. |
| Command-buffer pressure | Solver caps phases ≤ 4 and ≤ 3 commands/cycle; buffer overflow policy (drop + count) already tolerated by callers. |
| Orbit stacking (host ring + Satellite + Escort) | Budget clamp: summed `orbitingDamage` count ≤ 16 (executor law). |
| Three support-capable Masters | Support Chimera cap = 1/run; further all-utility pairs are suppressed from offers with a one-line Announcer explanation. |
| Colorblind readability | Every Temperament has a shape/motion tell, not just a hue (§6 visual tells); duotones differ in luminance, not only hue. |
| Long names overflow cards | Display name truncates at the epithet boundary; full name lives in the detail line. |
| `catalogFingerprint` | Unchanged — synthesized definitions never enter the authored catalog. |
| Determinism audit | No `Math.random`, no `Date`; variant = pure function; solver rounding uses the shared 3-decimal law; cross-runtime byte-stability inherited from `rank-progression.ts` conventions. |

---

## 13. Decision log (steelmanned alternatives)

1. **Variant rolled as a pure function of run state** — chosen over consuming `offerRng` (would perturb every subsequent offer stream and widen the golden-hash blast radius) and over fuse-time rolling (would make the offer card a slot machine and desync preview from result).
2. **Fixed chassis-priority table** — chosen over rolling the chassis per fusion. Rolling doubles the identity surface for marginal novelty and makes pairs unlearnable; Temperaments already carry the novelty budget.
3. **Master-rank gate kept** — fusing below rank 5 was rejected for v1: the rank-5 gate anchors the DPS budget, preserves the existing fusion-ready UX, and the meta-shop version (Reckless Splice) is a better home for that power fantasy.
4. **No new command kinds in v1** — every outcome composes from the existing 13. This is the single biggest risk-reducer in the plan: the combat executor, its bounds, and its tests stay untouched.
5. **Generative grafts over 66 hand-authored behaviors** — 12 graft rules + solver is testable and consistent; the hand-authored surface (names, visuals, flavor) is exactly where hand-authoring pays.
6. **Support cap retained** — a zero-DPS triple-control build is a real stall risk against the wave director; one support chimera is a build spice, three is a soft-lock.
7. **Additive-only contract changes** — `contracts.ts` is lead-frozen; everything added is optional-field, so older consumers (and the tolerant app-side readers) keep working.

---

## Sources & references

- Codebase: `packages/trait-runtime/src/` (contracts, catalog, resolver, offer-director, rank-progression, validation, serialization), `packages/sim/src/` (trait-command-executor, attack-damage-lab, zones, simulation, config @ 60 Hz), `apps/web-toy/src/` (app, presentation/*, render/attack-vfx-palette, render/illustrated-vfx-rank-profile)
- Genre precedent: [Grind Survivors weapon-infusion preview — Rogueliker](https://rogueliker.com/grind-survivors-preview/) · [Genome Guardian × Margoq's Lair weapon-combining bundle — Steam](https://store.steampowered.com/bundle/45379/WeaponCombining_Roguelikes__Genome_Guardian_x_Margoqs_Lair/) · [Survivors-like genre overview — Lords of Gaming](https://lordsofgaming.net/2025/12/roguelike-thats-old-news-survivors-like-is-the-new-wave/)
- Tone reference: *Dungeon Crawler Carl* system-announcer register (bureaucratic glee, dramatic overstatement) — content kept family-clean per house rules.

> *"That concludes the patch notes. Go fuse something irresponsible. The committee believes in you. The committee is also taking notes."*
