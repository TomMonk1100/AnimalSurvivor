# V1.1 Visual Overhaul Asset Record

## Animated Wildguard VFX sheets

The visual overhaul uses two 768×768 8-bit RGBA sheets, each arranged as a
4×4 grid. The authored motion rows advance deterministically from presentation
ticks, while the final rows hold distinct outcome/reward marks; the runtime
binds the un-tinted illustrated art as the primary effect. The sheets do not
participate in simulation state,
replay hashes, damage, pickup collection, or RNG.

| Runtime file | Source | Final SHA-256 | Runtime size | Contents |
| --- | --- | --- | --- | --- |
| `assets/ui/vfx/wildguard-signature-frames-v2.png` | `exec-5bbf37b3-5f48-4f9d-afd2-9f2ae8d4a4ed.png` | `94f3edc4a590b741d538ac383830d2ee379e7ecabb9dc687b917ceaa44f8cdd2` | 768×768 RGBA, 565,056 bytes | Fox Swipe, Benny Trample, Gracie Spit, normal/critical/player impacts, and shield recharge |
| `assets/ui/vfx/wildguard-world-frames-v2.png` | `exec-73ab216b-dec0-4bf3-a082-a6ff9640e17a.png` | `633e69d99dba94e25ed0371299a7675313ca54f9f3131c5993e26d7a9ca040ce` | 768×768 RGBA, 503,315 bytes | XP idle/collection, hostile thorn, fluffy shield, Bomb, Magnet, Food, and master XP |

The combined VFX payload is 1,068,371 bytes. The asset verifier caps the
signature sheet at 600,000 bytes and the world sheet at 550,000 bytes, while
the full authored runtime payload remains bounded below 17 MB.

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

### Alpha cleanup and finalization

The source images were first non-destructively reduced from 1254×1254 to 768px
with `sips -Z 768`. A border-connected flood cleanup then removed only
key-colored pixels that were connected to the outside of each image (tolerance
50), followed by two halo-cleanup passes. The actual sampled border key was
`#e90be0` for the signature source and `#e40ad9` for the world source.

That connected-border rule is deliberate: a conventional global chroma-key
would erase legitimate mint and magenta details inside the artwork. The final
assets therefore keep their intended colored effects while remaining transparent
outside the illustrated silhouettes.

At runtime, the material bank uses native white RGB and normal alpha blending;
it does not globally tint or additively recolor the sheets. Exact combat-area
telegraphs remain procedural for precision, while these four-frame sheets carry
the primary signature, reward, threat, and impact language.
