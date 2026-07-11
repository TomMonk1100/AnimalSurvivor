# Gate 0 Asset Audit

**Audit date:** 2026-07-09  
**Canonical provenance record:** [`assets/ASSET_LEDGER.md`](../../assets/ASSET_LEDGER.md)

Publisher pages and formats were checked against primary sources. The hero pack's
license, preview, and fox glTF were also downloaded from Quaternius' official
public Drive folder and inspected locally.

## Decision

Use the **Quaternius fox** as the first hero chassis.

Reasons:

- canonical pack provides glTF plus editable Blend source under CC0;
- compact quadruped silhouette, large ears, visible tail, and readable face;
- natural socket regions at head/ears, shoulders, spine, forelimbs, hindlimbs,
  tail, and aura;
- the same pack contains Shiba Inu, husky, and wolf, creating a possible canine
  attachment family if their skeleton compatibility is later verified;
- visually supports the desired arc from appealing hero to uncanny multi-trait
  chimera.

Backups: Shiba Inu, alpaca, then bull for small-canine, tall-neck, and heavy-body
pipeline tests.

## Local fox inspection

| Property | Verified value |
| --- | --- |
| License | CC0 1.0 Public Domain Dedication in downloaded `License.txt` |
| glTF version | 2.0 |
| File shape | Single self-contained ASCII `.gltf` with embedded buffer |
| File size | 3,163,174 bytes |
| Geometry | 5 indexed primitives, approximately 1,848 triangles total |
| Materials | 5: Main, Black, Eyes, Main_Light, Grey |
| Textures/images | None; material colors only |
| Skins | 1 |
| Joints | 51 |
| Named animation clips | 12 |
| Clips | Attack, Death, Eating, Gallop, Gallop_Jump, Idle, Idle_2, Idle_2_HeadLow, Idle_HitReact1, Idle_HitReact2, Jump_ToIdle, Walk |
| Socket-friendly bones | Head, Neck1–3, Torso/Torso2/Torso3, Back, FrontShoulder L/R, BackShoulder L/R, Tail1–8 |

Assessment: excellent for a single hero. The 51-joint rig is too expensive for
hundreds of swarm units but irrelevant if reserved for the player. Five material
primitives are acceptable for Gate 1; later palette consolidation may reduce
draw calls. The embedded 1.48 MB buffer and lack of textures are friendly to a
prototype but should eventually be converted to optimized GLB.

## Shortlist

| Priority | Asset | License | Advertised formats | Intended use | Hold/risk |
| --- | --- | --- | --- | --- | --- |
| A | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) | CC0 | FBX, OBJ, glTF, Blend | Hero roster; 12 animals, 12+ animations each | Fox verified; other rigs still need per-file inspection |
| A | [Easy Enemy Pack](https://quaternius.com/packs/easyenemy.html) | CC0 | FBX, OBJ, Blend | Five simple prototype enemies | Requires Blender→GLB conversion; exact archive roster pending |
| B | [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | CC0 | Page badge includes glTF; description conflicts | Later enemy candidates | Treat glTF as unverified; do not import 50 unrelated rigs |
| B | [Cute Animated Monsters](https://quaternius.com/packs/cutemonsters.html) | CC0 | Page badge includes glTF; description conflicts | Cute elites/early enemies | May compete visually with heroes; format conflict |
| A | [Ultimate Stylized Nature](https://quaternius.com/packs/ultimatestylizednature.html) | CC0 | FBX, OBJ, glTF, Blend | 63 environment models | Collapse materials; omit unnecessary normal maps |
| B | [Ultimate Nature Pack](https://quaternius.com/packs/ultimatenature.html) | CC0 | FBX, OBJ, Blend | 150-model biome fallback | Requires conversion and palette normalization |
| B | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 | Public page does not state format | 330-file environment fallback | Inspect archive before approval |
| A | [Ultimate RPG Pack](https://quaternius.com/packs/ultimaterpg.html) | CC0 | FBX, OBJ, Blend, PNG renders | Attachment kitbash and temporary card renders | Biologically reinterpret geometry; avoid literal weapons |
| A conditional | [Kenney UI Pack — Adventure](https://www.kenney.nl/assets/ui-pack-adventure) | CC0 | Public page does not state format | Placeholder cards and settings | Verify archive; reskin generic adventure framing |
| A conditional | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 | Public page does not state format | UI clicks/confirms | Verify archive and normalize one sound family |
| A conditional | [Kenney Impact Sounds](https://www.kenney.nl/assets/impact-sounds) | CC0 | Public page does not state format | Combat hits and foley layers | Layer/pitch process to avoid familiar stock identity |
| A temporary | [Fairy Adventure](https://opengameart.org/content/fairy-adventure) | CC0 | OGG, FLAC | Prototype music | One loop cannot express late-run escalation |

Kenney's [official support page](https://kenney.nl/support) confirms assets on its
asset pages are CC0 and attribution is optional, but each downloaded archive must
still be inspected and logged.

## Import requirements

A hero candidate must have:

- explicit permissive license in the downloaded archive;
- Blender or glTF/GLB source, or clean FBX import;
- idle, locomotion, hit, gesture/attack, and faint/death coverage;
- stable head, back, limb, tail, and aura sockets;
- reasonable bone/material count for one player hero;
- a silhouette readable from the orthographic gameplay camera.

## Risks and mitigations

- **Asset-pack identity:** change palette, face treatment, scale, animation timing,
  attachments, and world materials before promotion.
- **Rig incompatibility:** never assume wolf/dog/fox skeletons match; compare joint
  names and inverse bind matrices first.
- **Format claims:** archive contents outrank webpage badges when they disagree.
- **Swarm performance:** enemies use simplified unskinned/vertex-animated or
  sparsely sampled instanced forms; never one 50-bone rig per enemy.
- **License drift:** preserve the original license and hash locally.

## Next controlled downloads

1. Easy Enemy Pack
2. Ultimate Stylized Nature Pack
3. Ultimate RPG Pack
4. Kenney UI Pack — Adventure
5. Kenney Interface and Impact Sounds

Do not download the entire ecosystem at once. Each new archive must earn its place
against bundle size and style coherence.

