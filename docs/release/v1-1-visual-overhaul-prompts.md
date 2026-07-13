# V1.1 Visual Overhaul Asset Record

## Animated Wildguard VFX sheets

The visual overhaul uses six 768×768 8-bit RGBA sheets, each arranged as a
4×4 grid. The authored motion rows advance deterministically from presentation
ticks, while the final rows hold distinct outcome/reward marks; the runtime
binds the un-tinted illustrated art as the primary effect. The sheets do not
participate in simulation state,
replay hashes, damage, pickup collection, or RNG.

| Runtime file | Source | Final SHA-256 | Runtime size | Contents |
| --- | --- | --- | --- | --- |
| `assets/ui/vfx/wildguard-signature-frames-v2.png` | `exec-5bbf37b3-5f48-4f9d-afd2-9f2ae8d4a4ed.png` | `94f3edc4a590b741d538ac383830d2ee379e7ecabb9dc687b917ceaa44f8cdd2` | 768×768 RGBA, 565,056 bytes | Fox Swipe, Benny Trample, Gracie Spit, normal/critical/player impacts, and shield recharge |
| `assets/ui/vfx/wildguard-world-frames-v2.png` | `exec-73ab216b-dec0-4bf3-a082-a6ff9640e17a.png` | `633e69d99dba94e25ed0371299a7675313ca54f9f3131c5993e26d7a9ca040ce` | 768×768 RGBA, 503,315 bytes | XP idle/collection, hostile thorn, fluffy shield, Bomb, Magnet, Food, and master XP |
| `assets/ui/vfx/wildguard-fields-frames-v3.png` | `exec-82c42a26-0fb8-4a42-9992-97031bdfaedf.png` | `b60f315a2c19a94e80e5552580debb85c9290cc7f8e0ae4d22a9231314399876` | 768×768 RGBA, 392,527 bytes | Puffer Pulse, Gecko/Razorstep pads, Skunk Brush, and Royal Stinkcloud |
| `assets/ui/vfx/wildguard-melee-frames-v3.png` | `exec-1a8b8a70-299e-4010-86e1-ee505fcc3fc1.png` | `edf083bee7ef1c5589ae2c3657e586f1c596e16b52de96bdf6dd07c36002e573` | 768×768 RGBA, 413,257 bytes | Mantis Scythes, Crab Pincers, Armadillo Greaves, and Meteor Mauler |
| `assets/ui/vfx/wildguard-projectile-frames-v3.png` | `exec-44be7a61-c89c-4598-aceb-4606de2d5ca8.png` | `e8a6648d54f46cf77db8ba7e0389f16a69abbd34fc510c30e3cbd7cdefa26071` | 768×768 RGBA, 363,225 bytes | Porcupine Quills, Owl Pinions, Thornstorm Mantle, and Thunderbug Dynamo |
| `assets/ui/vfx/wildguard-aura-frames-v3.png` | `exec-cbe0eee1-eb17-44dc-95e9-e9f958ea4170.png` | `e9073694299888af94d056cfac1d30bbc8024a2861e30ef3dad5456ae93ca757` | 768×768 RGBA, 218,977 bytes | Firefly Colony, Monarch Brood, Bat Ears, and Midnight Radar |

The combined VFX payload is 2,456,357 bytes. The asset verifier caps each
sheet independently and keeps the full authored runtime payload below 19 MB.

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

The four V3 sheets close the remaining player-attack routes with a distinct
four-beat visual recipe per family: windup/cast, travel or expansion, actual
contact, then dissipation. The field source used the previously generated VFX
board as a visual-language reference; the other three used the immediately
preceding generated family sheet as a style reference. None used gameplay
screenshots, characters, UI, or a copied game asset.

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
and Midnight Radar use four-loop orbit, flutter, sonar, and radar sequences.
They remain deliberately lower-volume than damage attacks so marks and
contacts stay readable in a crowded swarm.

### Alpha cleanup and finalization

Each source image was first non-destructively reduced to 768px with `sips`.
A border-connected flood cleanup then removed only key-colored pixels that
were connected to the outside of each image, followed by a soft-matte,
transparent-threshold 12 / opaque-threshold 220, and despill pass. The V3
family sheets used `remove_chroma_key.py --auto-key border --soft-matte
--transparent-threshold 12 --opaque-threshold 220 --despill`; the older V2
sheets used the equivalent border-connected cleanup record above.

That connected-border rule is deliberate: a conventional global chroma-key
would erase legitimate mint and magenta details inside the artwork. The final
assets therefore keep their intended colored effects while remaining transparent
outside the illustrated silhouettes.

At runtime, the material bank uses native white RGB and normal alpha blending;
it does not globally tint or additively recolor the sheets. Exact enemy-danger
telegraphs and resolved chain links remain procedural for precision, while the
four-frame sheets carry the primary player signature, trait, reward, threat,
and impact language. Legacy player geometry is kept as a deliberately quiet
contact/area footprint rather than a competing second attack effect.
