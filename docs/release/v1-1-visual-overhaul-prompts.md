# V1.1 Visual Overhaul Asset Record

## Animated Wildguard VFX sheets

The visual overhaul uses six 768×768 8-bit RGBA source sheets, each arranged
as a 4×4 grid, plus four source-preserving eight-frame dissolve sheets in
128px atlas cells, one
compact transparent impact-core texture, and one compact normal-blend ground
contact texture. The source grids provide the authored body choices; because
their cells are related illustrations rather than a true flipbook, runtime
selects the clearest body frame and animates it with deterministic transforms.
The dissolve sheets are different: each is one approved source cell eroded
through a fixed noise field, so their cells form a coherent temporal sequence.
The renderer binds the un-tinted illustrated art as the primary effect. These
textures do not participate in simulation state, replay hashes, damage,
pickup collection, or RNG.

| Runtime file | Source | Final SHA-256 | Runtime size | Contents |
| --- | --- | --- | --- | --- |
| `assets/ui/vfx/wildguard-signature-frames-v3.png` | Clean committed `HEAD:assets/ui/vfx/wildguard-signature-frames-v2.png` object `e8f557b3ba24cd0238846a530c88e3582b783f55`, rebuilt cell-by-cell | `bbc5240ee1ca7ba6ef421fd8f83f66195de18a78c5dbdc5fc42168dcefd6fcd8` | 768×768 RGBA, 580,910 bytes | Active Fox Swipe, normal/critical/player impacts, shield recharge, and the legacy Saltwind earth telegraph. Each 192px cell is uniformly inset behind a 4px alpha-zero gutter; RGB is cell-locally bled only where alpha is zero, and resampled alpha is preserved byte-for-byte. |
| `assets/ui/vfx/wildguard-signature-bodies-v1.png` | Built-in OpenAI image generation on flat chroma green, `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`, then `make-signature-bodies-v1.mjs` with deterministic normal-blend Benny leading-crest/trailing-fissure marks; source SHA-256 `1e910fe7a29df827ba6115ae7c275d483649138880efe989ee63f60bd7093ad9` (one reviewed Benny ridge crop) / `7751cd087644f918806ea777490adecc5f0e076e83964d6b9c632f83456cdebb` (Gracie) | `6a7f825b1280fb4b4bc2181d697771185a9edec150271f2c313826a88c103161` | 512×512 RGBA, 141,241 bytes | Dedicated P2 hero bodies: one laterally broad earth ridge per already-authoritative Benny Trample event, with a high-value directional leading crest and grounded trailing fissure, and a compact forward-oriented Gracie head-tail spit on the snapshot-driven projectile. Stable cells and terminal copies preserve the padded 4×4 UV contract while retaining the strict 19 MB runtime payload. |
| `assets/ui/vfx/wildguard-world-frames-v2.png` | `exec-73ab216b-dec0-4bf3-a082-a6ff9640e17a.png` | `9c9c6fc3dec8343f97886127c1018a074fea9435ca1a995f8a0dc9d97420a42d` | 768×768 RGBA, 705,999 bytes | XP idle/collection, hostile thorn, fluffy shield, Bomb, Magnet, Food, and master XP; literal alpha bleed, v2 Gaussian feather, HSV edge-key repair, lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-fields-frames-v3.png` | `exec-82c42a26-0fb8-4a42-9992-97031bdfaedf.png` | `d8422484e2a0ebd5e94a218835b4230c927617837fb93db6d29b5ae5f061d7dc` | 768×768 RGBA, 443,915 bytes | Puffer Pulse, Gecko/Razorstep pads, Skunk Brush, and Royal Stinkcloud; literal alpha bleed, HSV edge-key repair, lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-melee-frames-v3.png` | `exec-1a8b8a70-299e-4010-86e1-ee505fcc3fc1.png` | `b405823bff23e9812306d364cbb7934bb1cff9614fe5b553ae50b5bb839434fc` | 768×768 RGBA, 455,507 bytes | Mantis Scythes, Crab Pincers, Armadillo Greaves, and Meteor Mauler; literal alpha bleed, HSV edge-key repair, lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-projectile-frames-v3.png` | `exec-44be7a61-c89c-4598-aceb-4606de2d5ca8.png` | `f935fcc74f726822eaec01bbd5464d7735d1490a001f01324b17ab34d2cfbfce` | 768×768 RGBA, 416,758 bytes | Porcupine Quills, Owl Pinions, Thornstorm Mantle, and Thunderbug Dynamo; literal alpha bleed, HSV edge-key repair, lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-aura-frames-v3.png` | `exec-cbe0eee1-eb17-44dc-95e9-e9f958ea4170.png` | `f763bba7e691dc728cb90f8304ef2c2804c8ea4429107bedd78cd5f7360186b8` | 768×768 RGBA, 257,305 bytes | Firefly Colony, Monarch Brood, Bat Ears, and Midnight Radar; literal alpha bleed, HSV edge-key repair, lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-impact-core-v1.png` | Deterministic compact radial bake, `make-impact-core-v1.mjs` | `30c60d6cbbcf4188408168e657246c926069f877e9f991343b06a36fdc1e0705` | 384×384 RGBA, 28,806 bytes | Compact non-star universal white-hot contact core used only for the bounded 2–4 tick additive flash. |
| `assets/ui/vfx/wildguard-signature-debris-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, then `make-signature-debris-v1.mjs`; input SHA-256 `061324124772e934f576b68c0657a51e662675c5dd7d176b4c13dec4dafc638e` / `2e1b5677439fe1d2c6df6babcd7f483e90c908b2be2ecf64c58dd1008bb0128f` | `28b0184ceb1acd5d14b6110e50795d10f1193b5d40f72d81206caefea32f17e9` | 512×128 RGBA, 38,740 bytes | Dedicated 4×1 family-routed debris: ivory shard, earth rock, venom droplet, neutral chip. It is normal blend and never shares the additive core silhouette. |
| `assets/ui/vfx/wildguard-gecko-dissolve-frames-v1.png` | Deterministic fixed-FBM 8-frame erosion bake from `wildguard-fields-frames-v3.png` cell `(1, 1)` | `f24da00a59d3000d7f68b47abddcefd542ae5c26dc63b17a85f432b5148965a7` | 512×512 RGBA, 113,498 bytes | Eight coherent Gecko/Razorstep pad dissolve frames in 128px cells; unused cells repeat terminal art for the 4×4 UV contract; lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-skunk-dissolve-frames-v1.png` | Deterministic fixed-FBM 8-frame erosion bake from `wildguard-fields-frames-v3.png` cell `(2, 2)` | `e8cd577d483aab348cf38194bc72fa6d058572480fc3dfd01ee4324c032a24b2` | 512×512 RGBA, 122,212 bytes | Eight coherent Skunk Brush cloud dissolve frames in 128px cells; unused cells repeat terminal art for the 4×4 UV contract; lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-royal-stink-dissolve-frames-v1.png` | Deterministic fixed-FBM 8-frame erosion bake from `wildguard-fields-frames-v3.png` cell `(2, 3)` | `14a23cfd5f97217a3ed086ef9cca0a53305bf27a30944c7c6735bc0ed6f3c941` | 512×512 RGBA, 165,198 bytes | Eight coherent Royal Stinkcloud dissolve frames in 128px cells; unused cells repeat terminal art for the 4×4 UV contract; lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-fluffy-shield-dissolve-frames-v1.png` | Deterministic fixed-FBM 8-frame erosion bake from `wildguard-world-frames-v2.png` cell `(1, 2)` | `c2f369955c0b2d096fcf72beba9dc7fd3075101963e1e9fa3ef3f15daa255adb` | 512×512 RGBA, 143,926 bytes | Eight coherent Fluffy Shield dissolve frames in 128px cells; unused cells repeat terminal art for the 4×4 UV contract; lossless adaptive PNG filtering |
| `assets/ui/vfx/wildguard-ground-contact-v1.png` | Deterministic unpremultiplied-RGBA broken elliptical footprint/crack bake | `813209b6eaa0d2515d2e4ea99d96d060b0e0011fd34314a463d725f239a679cc` | 256×128 RGBA, 8,437 bytes | Normal-blend warm terrain anchor; raw verifier requires a visible high-alpha source rim while the scene material opacity stays capped at 0.25. |

The combined VFX payload is checked by `verify:assets` against the complete
runtime cap. The asset verifier caps each
sheet independently and keeps the full authored runtime payload below 19 MB.

### P3 signature-atlas correction

The generated/working-tree `wildguard-signature-frames-v2.png` is a
**quarantined historical artifact**, not a runtime input. P3 found nonzero
alpha at its cell boundaries and cross-cell contamination risk, so no static
or live acceptance may cite it as a clean texture pass. The active v3 atlas is
re-derived from the clean committed v2 Git object named in the table, with a
transparent four-pixel gutter around every 192px cell. It preserves the
intended fox, earth, and mint/magenta spit colors—there is no global hue
replacement—and never alters alpha after the single cell-local resample.

`apps/web-toy/scripts/make-signature-v3.mjs` reproduces the output without
touching the quarantined file. Its exact source hash, output SHA-256,
per-cell visible bounds, zero-gutter-violation result, and forest-background
inspection are recorded in
`docs/vfx/captures/p3-signature-v3/report.json`. The runtime atlas and raw PNG
verifier now point only at v3.

### Generation requests

Both sources were generated on 2026-07-13 with Built-in OpenAI image
generation, no reference image, as a precise 4×4 grid on a flat chroma-magenta
background (`#ff00ff` requested). The prompts required isolated, high-polish
storybook low-poly VFX with no text, UI, characters, border, grid lines, or
shadowed background.

**Signature sheet.** Four evenly spaced animation rows: ivory/gold fox claw
sweep from windup through impact; amber rock-and-earth trample ridge from
ignition through dust; mint-and-magenta spit comet from charge through splash;
and readable normal-hit, critical-hit, player-hit, and shield frames. Art must
be bold, faceted, luminous at the core, and cleanly legible at small scale.

**World sheet.** Four evenly spaced animation rows: mint/gold XP mote and
collection burst; coral hostile thorn warning, flight, and impact; cyan fluffy
shield seed, bubble, crack, and bloom; then Bomb, Magnet, Food, and master-XP
rewards. Art must be bold, faceted, luminous at the core, and cleanly legible
at small scale.

### Secondary family kits

The four V3 sheets close the remaining player-attack routes with four authored
body choices per family. The runtime deliberately chooses one strongest body
frame per archetype and gives it a unique tick-driven transform recipe instead
of treating independent AI illustrations as a flipbook. The field source used
the previously generated VFX board as a visual-language reference; the other
three used the immediately preceding generated family sheet as a style
reference. None used gameplay screenshots, characters, UI, or a copied game
asset.

**Fields.** A cyan Puffer pressure-ring grows into a crystalline burst; a
leaf-green Gecko/Razorstep pad pulses from rune to thorned contact; Skunk
Brush blooms as a soft violet toxic cloud; Royal Stinkcloud is a larger
magenta-and-gold crown cloud. These replace the raw colored zone planes with
alpha-cut illustrated cards, while the simulation continues to own every zone
radius, duration, and hit.

**Melee and impacts.** Mantis has a jade crescent scythe sequence, Crab a
coral pincer-crush shock, Armadillo a blue-silver rolling shell streak, and
Meteor an amber impact crater. Each is a short non-looping card that carries
its own direction, scale, and fade profile rather than borrowing a generic
disc or spike.

**Projectile and mythic casts.** Quills launch as a narrow gold needle volley,
Owl Pinions as a cobalt feather fan, Thornstorm as a rose-violet radial thorn
burst, and Thunderbug as a cyan electric bolt. The actual simulation-owned
projectiles and resolved chain segments remain the contact truth; the cards
are the compact launch, charge, and result language around them.

**Auras and information attacks.** Firefly Colony, Monarch Brood, Bat Ears,
and Midnight Radar use selected-frame orbit, flutter, sonar, and radar
transforms. They remain deliberately lower-volume than damage attacks so marks
and contacts stay readable in a crowded swarm.

### Alpha cleanup and finalization

Each source image was first non-destructively reduced to 768px with `sips`.
A border-connected flood cleanup then removed only key-colored pixels that
were connected to the outside of each image, followed by a soft-matte,
transparent-threshold 12 / opaque-threshold 220, and despill pass. The V3
family sheets used `remove_chroma_key.py --auto-key border --soft-matte
--transparent-threshold 12 --opaque-threshold 220 --despill`; the remaining
world V2 sheet used the equivalent border-connected cleanup record above. The
legacy signature-board atlas is the separate cell-safe v3 correction described
above, not this legacy global-cleanup path. P2's Benny/Gracie bodies are a
second, purpose-built padded sheet rather than an edit to the historical board.

That connected-border rule is deliberate: a conventional global chroma-key
would erase legitimate mint and magenta details inside the artwork. The final
assets therefore keep their intended colored effects while remaining transparent
outside the illustrated silhouettes.

The generic production repair pass remains reproducible with
`apps/web-toy/scripts/repair-vfx-alpha.mjs --write` for the non-signature
legacy sheets. The repaired historical signature-board source is instead reproducible with
`apps/web-toy/scripts/make-signature-v3.mjs`: it reads the clean committed
object, resamples each source cell once into the 4px-inset destination cell,
then performs a cell-local RGB-only bleed under alpha zero. It does not
feather, globally hue-shift, or mutate alpha after resampling; Gracie's
authored magenta remains intentional source art.
`scripts/verify-vfx-textures.mjs` reads raw PNG bytes (not premultiplied Canvas
output). For v3 it asserts partial alpha, zero black alpha mattes, a
transparent 4px perimeter and visible bounds for every one of the 16 cells,
and the matching SHA-256/per-cell report/forest composite. The other shipped
VFX sheets retain the zero unprotected hue-based chroma-residue gate.

The four long-lived zone and shield sequences are reproducible with
`apps/web-toy/scripts/bake-zone-dissolve.mjs --write`. The script takes one
approved source-art cell per family, applies one fixed seeded FBM field, and
changes only the alpha threshold across its eight live atlas cells. The 4×4
layout retains terminal copies in its unused cells to preserve the shared UV
contract. It neither downloads nor generates unrelated art; runtime uses a
one-tick crossfade at each two-tick transition. The same source script bakes
the compact warm-neutral ground-contact mask for a separately capped
normal-blend material, then literal-alpha-bleeds every derivative before
writing unpremultiplied RGBA PNG bytes.

At runtime, the material bank uses native white RGB and normal alpha blending;
it does not globally tint or additively recolor the sheets. Exact enemy-danger
telegraphs and resolved chain links remain procedural for precision, while the
selected-frame body cards carry the primary player signature, trait, reward,
threat, and impact language. The original impact-core texture is the lone
short additive component of a contact stack; legacy player geometry is kept as
a deliberately quiet contact/area footprint rather than a competing second
attack effect.
