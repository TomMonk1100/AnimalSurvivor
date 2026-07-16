# Asset Provenance Ledger

Every third-party asset must be recorded here before it enters a playable build.
The project prefers CC0. “Free to download” is not a license.

## Rules

- Keep the original license file beside imported source assets.
- Record the exact download URL, author, license, download date, and modifications.
- Record a SHA-256 hash after download so the source artifact can be identified.
- Do not import assets marked `candidate`; change them to `incorporated` only
  after inspecting the archive and its included license.
- AI-generated concepts are recorded separately with the tool, date, prompt file,
  and whether any reference image was used.
- No asset may require a paid subscription, runtime API, royalty, or unclear
  attribution under the current zero-cash plan.

## Candidate CC0 sources

| Status | Asset/source | Author | License | Formats/use | Downloaded | SHA-256 | Modifications |
| --- | --- | --- | --- | --- | --- | --- | --- |
| audit-only (not shipped) | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) | Quaternius | CC0 1.0 | 12 animated animals; FBX, OBJ, Blend, glTF; official Drive folder | 2026-07-09 | Per-file hashes below | License, preview, and Fox glTF retained for historical audit; Scout presentation art replaced the Fox runtime asset on 2026-07-15 |
| candidate | [LowPoly Animated Animals](https://quaternius.itch.io/lowpoly-animated-animals) | Quaternius | CC0 1.0 | 6 animated animals; FBX, OBJ, Blend; alternate hero candidates | — | — | — |
| candidate | [Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | Quaternius | CC0 1.0 | 50 animated monsters; enemy prototype candidates | — | — | — |
| candidate | [Ultimate Nature Pack](https://quaternius.com/packs/ultimatenature.html) | Quaternius | CC0 1.0 | 150 low-poly environment models | — | — | — |
| incorporated | [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) ([official free download](https://quaternius.itch.io/stylized-nature-megakit)) | Quaternius | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Curated static forest glTF props and optimized texture derivatives for the Forest clearing | 2026-07-12 | Archive `298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9` | Five glTF containers and four texture derivatives are shipped under `apps/web-toy/public/art/quaternius/glade/`; see the per-file audit below |
| candidate | [Prototype Kit](https://kenney.nl/assets/prototype-kit) | Kenney | CC0 1.0 | 145 prototype models with animation/variations | — | — | — |
| candidate | [Kenney asset library](https://kenney.nl/assets) | Kenney | CC0 on asset pages; verify included file | UI, input prompts, audio, and environment candidates | — | — | — |

## Incorporated audit files

| File | Source file ID | SHA-256 | Notes |
| --- | --- | --- | --- |
| `vendor/quaternius/ultimate_animated_animals/License.txt` | `1F2uy8T2fRpdc6gZ4mnS02_C2E63WvKtn` | `83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c` | Original CC0 1.0 license, preserved unchanged |
| `vendor/quaternius/ultimate_animated_animals/Fox.gltf` | `1z-CWoUC2vJxrqgGFTYlMaywpE1ooV-bA` | `2f36e3c9c75ecddda85c5f9944e98ee1e88e7c679a546534aff1cea8ecde64c7` | Original self-contained glTF, preserved unchanged for historical audit; not imported by the current web runtime after the Scout replacement |
| `vendor/quaternius/ultimate_animated_animals/Preview.jpg` | `1HdDYH9Cq4pnwRZ7LPD0zS0lyYI6m3qQT` | `316a03d52e15a2b0ba4906074ad0c1e4ecd59fb0b92b63f07108bc81138a6d8a` | Publisher preview used only for audit/reference |

## Curated Quaternius forest runtime art

The source archive was downloaded through the publisher's official free
download flow on 2026-07-12:
[`Quaternius_Stylized_Nature_MegaKit.zip`](https://quaternius.itch.io/stylized-nature-megakit),
104,088,529 bytes, SHA-256
`298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9`.
The upstream ZIP contains no separate license-text file; the publisher's
[official pack page](https://quaternius.com/packs/stylizednaturemegakit.html)
declares the pack CC0, with the canonical text at
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Geometry buffers
below are preserved byte-for-byte; the glTF container URIs were rewritten to
the listed compact local textures so the browser never reaches for untracked
source images.

| Runtime file | Archive source | Runtime SHA-256 | Modifications / use |
| --- | --- | --- | --- |
| `apps/web-toy/public/art/quaternius/glade/CommonTree_3.gltf` | `glTF/CommonTree_3.gltf` | `e637d5789c0cb16a51f69cc85f3a5382200303fc098dfc37b9e7dfd3de451480` | Texture URI references rewritten to compact local derivatives; static clearing tree |
| `apps/web-toy/public/art/quaternius/glade/CommonTree_3.bin` | `glTF/CommonTree_3.bin` | `24541f46fd9553e2389aba15575f2697009226e82118ed76868284114fd12b49` | Original binary geometry, unchanged |
| `apps/web-toy/public/art/quaternius/glade/CommonTree_5.gltf` | `glTF/CommonTree_5.gltf` | `15342f6cd79f7128917b1da18fb4eaf6367b82c0ff0e6e20bf111dff06a3b3a5` | Texture URI references rewritten to compact local derivatives; static clearing tree |
| `apps/web-toy/public/art/quaternius/glade/CommonTree_5.bin` | `glTF/CommonTree_5.bin` | `0e617612d50e6bb2ca3c64338383f8938ce9e04d55b548ff11cec7a7b7d8f072` | Original binary geometry, unchanged |
| `apps/web-toy/public/art/quaternius/glade/Rock_Medium_2.gltf` | `glTF/Rock_Medium_2.gltf` | `417be5d6023560ebb5d0681210cca9a55b677e2409252f863b522b5efdc665e1` | Texture URI rewritten to compact local derivative; static clearing rock |
| `apps/web-toy/public/art/quaternius/glade/Rock_Medium_2.bin` | `glTF/Rock_Medium_2.bin` | `76b60bf8349f71abdb0ed462b3223d93c2dcabdfb5754bc132e18b021cc6c805` | Original binary geometry, unchanged |
| `apps/web-toy/public/art/quaternius/glade/Rock_Medium_3.gltf` | `glTF/Rock_Medium_3.gltf` | `371f048acc9c062b95ad0f775d6a4c9e1444d2964593c6bd41c50bf5cf7c5a7e` | Texture URI rewritten to compact local derivative; static clearing rock |
| `apps/web-toy/public/art/quaternius/glade/Rock_Medium_3.bin` | `glTF/Rock_Medium_3.bin` | `63f94bce2d3fb3fe25b2d6c843a828b1bec76855dbaac93fcf5d43582309caad` | Original binary geometry, unchanged |
| `apps/web-toy/public/art/quaternius/glade/Bush_Common_Flowers.gltf` | `glTF/Bush_Common_Flowers.gltf` | `52f2f5719672fee191877f8842454e2c7cfa2297e1fc2669566b43a999aa135a` | Texture URI references rewritten to compact local derivatives; static flower bush |
| `apps/web-toy/public/art/quaternius/glade/Bush_Common_Flowers.bin` | `glTF/Bush_Common_Flowers.bin` | `15f56a013afe0eecaded0eb97fd8f323305af11e1f0f7bb9b68472ec4cdc20d5` | Original binary geometry, unchanged |
| `apps/web-toy/public/art/quaternius/glade/Bark_NormalTree.jpg` | `glTF/Bark_NormalTree.png` | `1f313f704e3cd91a1e19737b689b680ddb21e10226bc3000f0c2de15e478498e` | 512×512 JPEG derivative for tree bark |
| `apps/web-toy/public/art/quaternius/glade/Leaves_NormalTree_C-512.png` | `glTF/Leaves_NormalTree_C.png` | `6a1d3cc76116d6109536c5db16c2d41217ccc6aac76d55e966bae467348433fe` | 512×512 PNG derivative for tree and bush leaves |
| `apps/web-toy/public/art/quaternius/glade/Rocks_Diffuse.jpg` | `glTF/Rocks_Diffuse.png` | `9d5133aecce6e776e8399ac6796e3b71131ccb5263ca229440b5316c508b242b` | 512×512 JPEG derivative for both rock models |
| `apps/web-toy/public/art/quaternius/glade/Flowers-512.png` | `glTF/Flowers.png` | `dcd8ee85f0f91eb934addfb549aeca85997c1c0e0e18c75b7dc96680afe32ccf` | 512×498 PNG derivative for flower-bush petals |

## AI-assisted concepts

Generated concept images are design references, not runtime models. They do not
replace optimization, rigging, license review, or visual QA. Full reproducible
prompts are in `docs/gate0/concept-prompts.md`.

| File | Tool | Date | Reference images | Intended use |
| --- | --- | --- | --- | --- |
| `concepts/gate0-board-a-storybook-wildguard.png` | Built-in OpenAI image generation | 2026-07-09 | None | Art-direction option A and transformation test |
| `concepts/gate0-board-b-moonlit-menagerie.png` | Built-in OpenAI image generation | 2026-07-09 | None | Art-direction option B and transformation test |
| `concepts/gate0-board-c-curious-chimera.png` | Built-in OpenAI image generation | 2026-07-09 | None | Art-direction option C and transformation test |
| `concepts/gate0-gameplay-storyboard.png` | Built-in OpenAI image generation | 2026-07-09 | None | Four-panel gameplay animatic source |
| `concepts/gate0-gameplay-storyboard-stat-only.png` | Built-in OpenAI image edit | 2026-07-10 | `gate0-gameplay-storyboard.png` edit target | Matched stat-only control condition; attacks preserved, body mutations removed |

## Incorporated AI-assisted runtime art

These are authored presentation assets for the local Field Guide archive and
Wildguard runtime. They do not enter simulation state, replay hashes, or
gameplay decisions. The earlier no-reference Field Guide prompts are checked
in at `docs/release/field-guide-portrait-prompts.md`; the Scout replacement
record is in `docs/release/scout-presentation-provenance.md`. The owner-provided
Scout photo is a private task attachment and is neither stored in this
repository nor shipped with the runtime.

| File | Tool | Date | Reference images | SHA-256 | Intended use |
| --- | --- | --- | --- | --- | --- |
| `ui/field-guide/greg-final-form-v1.png` | Built-in OpenAI image generation, lossless adaptive PNG filtering | 2026-07-12 | None | `45192f8d712b0a4de18c88ae09223a77ac009ee18953ac4777c3b696cec7c744` | Historical Greg Field Guide portrait, retained for audit and no longer imported by the current web runtime |
| `ui/field-guide/scout-final-form-v1.png` | Built-in OpenAI image generation; 768×768 RGB runtime PNG export | 2026-07-15 | Owner-provided Scout photo (`IMG_1759.png`, private task attachment; not shipped) | `3de4aafbdf4ef06f457aa654d6f4f1bf7294d2bdfd563748ec327a8bae611d05` | Current Scout Field Guide portrait for the stable `greg` hero id; provenance brief in `docs/release/scout-presentation-provenance.md` |
| `ui/field-guide/benny-final-form-v1.png` | Built-in OpenAI image generation, lossless adaptive PNG filtering | 2026-07-12 | None | `7aa5d6a3040c802c71297a41ee704d570a5ae655d20589e45c770a6cb3a6847e` | Benny Field Guide final-form portrait |
| `ui/field-guide/gracie-final-form-v1.png` | Built-in OpenAI image generation, lossless adaptive PNG filtering | 2026-07-12 | None | `d2f50f73964fdde1ca33f690906053d25b23ca25608574c83feeb2ef4ea5bef5` | Gracie Field Guide final-form portrait |

These boss portraits use the exact prompts in `docs/release/boss-portrait-prompts.md`.

| File | Tool | Date | Reference images | SHA-256 | Intended use |
| --- | --- | --- | --- | --- | --- |
| `ui/bosses/final-threat-v1.png` | Built-in OpenAI image generation, lossless adaptive PNG filtering | 2026-07-12 | None | `bec4ada08a8271e02fab1ee1da6b35f597e1aff5ff05a6f1150962e6a9676333` | Forest boss-health portrait |
| `ui/bosses/sandglass-sovereign-v1.png` | Built-in OpenAI image generation, lossless adaptive PNG filtering | 2026-07-12 | None | `35e8e66739651b4cd17cca56b993c1fa17f3c5cd7ae031dea39492b811d73e9a` | Saltwind boss-health portrait |

The current playable Wildguard start screen uses the Scout replacement title
illustration. It was generated from the owner-provided Scout photo, the former
project title key art, and the Scout gameplay cutout; its non-verbatim brief
and source/runtime hashes are recorded in
`docs/release/scout-presentation-provenance.md`. The former Fox title art and
its exact prompt in `docs/release/wildguard-keyart-prompt.md` are retained for
historical audit only. The Forest clearing ground and Bramblehog gameplay
sprite use the exact prompts and transformations recorded in
`docs/release/v1-visual-art-prompts.md`.

| File | Tool | Date | Reference images | SHA-256 | Intended use |
| --- | --- | --- | --- | --- | --- |
| `ui/keyart/storybook-wildguard-forest-v1.jpg` | Built-in OpenAI image generation, JPEG compression | 2026-07-12 | None | `80e4efcbc9f2b07773cc7555991190ee4ef40ac096900853be2c97146801c18c` | Historical Fox title key art, retained for audit and no longer imported by the current web runtime |
| `ui/keyart/storybook-wildguard-scout-v1.jpg` | Built-in OpenAI image generation from source `tmp/imagegen/scout-keyart-source-v1.png` (`0b60157a3d7f72d85aa7e5a86157183b22494309f6aca9714118309c657e6eba`); JPEG runtime export | 2026-07-15 | Owner-provided Scout photo (`IMG_1759.png`, private task attachment; not shipped); historical project key art and Scout gameplay cutout as project-owned visual references | `5dd0cd5aa13b24467e4cbade2bec9441b8405fda8ebaab3a8e29d856190b42f3` | Current 1672×941 RGB Scout title key art; menu-safe left opening is retained, and the former right-side Fox is replaced by Scout; provenance brief in `docs/release/scout-presentation-provenance.md` |
| `ui/terrain/storybook-glade-ground-v1.jpg` | Built-in OpenAI image generation, JPEG compression | 2026-07-12 | None | `2cb3cc6943196f3136981280a424ea43ec1a4877fa067055b86a964e22c566d1` | Tiled-feeling full-arena Forest clearing ground plate |
| `ui/heroes/scout-pouncer-v1.png` | Built-in OpenAI image generation from source `tmp/imagegen/scout-pouncer-source-v1.png` (`54fe5bd914f8accf967a060c82867904c6d99af9a7a827e0cd33c6af1f336314`); project alpha-matte conversion to RGBA runtime PNG | 2026-07-15 | Owner-provided Scout photo (`IMG_1759.png`, private task attachment; not shipped) | `8b95623f80f42af866133d257d7401dd151e494eaab5f71411d9b89a92f674fb` | Current transparent Scout playable-hero sprite for the stable `greg` hero id; source 1254×1254 RGB, runtime 1254×1254 RGBA; provenance brief in `docs/release/scout-presentation-provenance.md` |
| `ui/heroes/benny-bastion-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, lossless adaptive PNG filtering | 2026-07-12 | None | `e0fd6f3810c8a4a2b11be325fa15d3756725b95311aedc83e51de7208c6b551e` | Transparent Benny the Bastion playable-hero sprite; source `exec-5740c719-1edc-4c9e-be60-7bddbab00199.png` |
| `ui/heroes/gracie-surveyor-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, lossless adaptive PNG filtering | 2026-07-12 | None | `b6a6246b74f8a1127972be66d39c0ecc1b666ec989a3f8d49c1b8858a2d7488a` | Transparent Gracie the Surveyor playable-hero sprite; source `exec-1612d45a-3615-49c6-94a6-5b94c0d6bfc2.png` |
| `ui/enemies/bramblehog-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, lossless adaptive PNG filtering | 2026-07-12 | None | `1fdea8ce0037f24120939cee4791b2625a18becd61268347dd13a4b2aec5ef8d` | Transparent Bramblehog swarm-enemy sprite |
| `ui/enemies/thornwing-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, lossless adaptive PNG filtering | 2026-07-12 | None | `692b8d376d6cea5f24a1c7e0b719141888cd07c3f22472826791ec7df5a9d675` | Transparent Thornwing skitter runner-enemy sprite; source `exec-3017b2fa-f91d-4720-854c-8461bddff706.png` |
| `ui/enemies/rootback-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, lossless adaptive PNG filtering | 2026-07-12 | None | `be7e7ab985ec4c3ad4e7a4583df2fd69a112b3ac045bd54ea0e9e06c6c91ae69` | Transparent Rootback colossus brute-enemy sprite; source `exec-45a83ab6-2b49-4e05-a47b-d0c60c62a328.png` |
| `ui/enemies/hollowhart-warden-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup, lossless adaptive PNG filtering | 2026-07-12 | None | `5a78720e4aa592d8c4a07119745ccf957f3f7a63e3764acc5ce72067abc49eb6` | Transparent Hollowhart Warden Forest boss sprite; source `exec-9b1b1a0f-3d23-4711-a9c5-a84070223505.png` |
| `ui/vfx/wildguard-signature-frames-v2.png` | Historic Built-in OpenAI image-generation derivative and prior repair record | 2026-07-13 | None | `34434abd40ecbad17649969938c6e0e1aec4ac88e286c0f5f9ad09b86f8d2aec` | Quarantined historical record only; it is not imported by the runtime or texture verifier after P3 found its working-tree border-alpha/cross-cell contamination. The active replacement is v3 below. |
| `ui/vfx/wildguard-signature-frames-v3.png` | Clean committed v2 source (`HEAD:assets/ui/vfx/wildguard-signature-frames-v2.png`, blob `e8f557b3ba24cd0238846a530c88e3582b783f55`), uniform 4px per-cell transparent gutter, cell-local RGB-only alpha bleed, lossless RGBA PNG encode | 2026-07-13 | None | `bbc5240ee1ca7ba6ef421fd8f83f66195de18a78c5dbdc5fc42168dcefd6fcd8` | Active 4×4 signature atlas for Fox Swipe, normal/critical/player impacts, shield recharge, and the legacy Saltwind earth telegraph. Every 192px cell retains alpha-zero gutters; P3 source/validation/forest-composite evidence is `docs/vfx/captures/p3-signature-v3/report.json`. |
| `ui/vfx/wildguard-signature-bodies-v1.png` | Built-in OpenAI image generation on a flat chroma-green source, `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`, then reviewed crop/rotation bake with deterministic normal-blend Benny leading-crest and trailing-fissure interior marks, 4px per-cell alpha-zero gutters, RGB-only bleed, lossless RGBA encode; source hashes `1e910fe7a29df827ba6115ae7c275d483649138880efe989ee63f60bd7093ad9` (one Benny ridge) and `7751cd087644f918806ea777490adecc5f0e076e83964d6b9c632f83456cdebb` (Gracie) | 2026-07-14 | None | `6a7f825b1280fb4b4bc2181d697771185a9edec150271f2c313826a88c103161` | Dedicated compact 4×4 P2 player-body atlas (512px): one broad lateral ivory/umber Benny ridge per authoritative Trample event, with a bright directional crest and trailing fissure, and a forward-oriented compact pale Gracie spit head with teal/magenta taper. Runtime samples stable cells while terminal copies preserve the 4×4 UV/gutter contract and the strict 19 MB payload cap. |
| `ui/vfx/wildguard-world-frames-v2.png` | Built-in OpenAI image generation, literal alpha-bleed, v2 Gaussian feather, HSV edge-key repair, and lossless adaptive PNG filtering, 768px derivative | 2026-07-13 | None | `9c9c6fc3dec8343f97886127c1018a074fea9435ca1a995f8a0dc9d97420a42d` | Transparent 4×4 world VFX body choices for XP/rewards, hostile thorn, and shield; source `exec-73ab216b-dec0-4bf3-a082-a6ff9640e17a.png`; prompt and repair record in `docs/release/v1-1-visual-overhaul-prompts.md` |
| `ui/vfx/wildguard-fields-frames-v3.png` | Built-in OpenAI image generation, literal alpha-bleed and HSV edge-key repair, with lossless adaptive PNG filtering, 768px derivative | 2026-07-13 | None | `d8422484e2a0ebd5e94a218835b4230c927617837fb93db6d29b5ae5f061d7dc` | Transparent 4×4 field VFX body choices: Puffer, Gecko/Razorstep, Skunk Brush, and Royal Stinkcloud; source `exec-82c42a26-0fb8-4a42-9992-97031bdfaedf.png`; prompt and repair record in `docs/release/v1-1-visual-overhaul-prompts.md` |
| `ui/vfx/wildguard-melee-frames-v3.png` | Built-in OpenAI image generation, literal alpha-bleed and HSV edge-key repair, with lossless adaptive PNG filtering, 768px derivative | 2026-07-13 | None | `b405823bff23e9812306d364cbb7934bb1cff9614fe5b553ae50b5bb839434fc` | Transparent 4×4 melee/impact VFX body choices: Mantis, Crab, Armadillo, and Meteor; source `exec-1a8b8a70-299e-4010-86e1-ee505fcc3fc1.png`; prompt and repair record in `docs/release/v1-1-visual-overhaul-prompts.md` |
| `ui/vfx/wildguard-projectile-frames-v3.png` | Built-in OpenAI image generation, literal alpha-bleed and HSV edge-key repair, with lossless adaptive PNG filtering, 768px derivative | 2026-07-13 | None | `f935fcc74f726822eaec01bbd5464d7735d1490a001f01324b17ab34d2cfbfce` | Transparent 4×4 projectile VFX body choices: Quills, Owl, Thornstorm, and Thunderbug; source `exec-44be7a61-c89c-4598-aceb-4606de2d5ca8.png`; prompt and repair record in `docs/release/v1-1-visual-overhaul-prompts.md` |
| `ui/vfx/wildguard-aura-frames-v3.png` | Built-in OpenAI image generation, literal alpha-bleed and HSV edge-key repair, with lossless adaptive PNG filtering, 768px derivative | 2026-07-13 | None | `f763bba7e691dc728cb90f8304ef2c2804c8ea4429107bedd78cd5f7360186b8` | Transparent 4×4 aura VFX body choices: Firefly, Monarch, Bat, and Midnight Radar; source `exec-cbe0eee1-eb17-44dc-95e9-e9f958ea4170.png`; prompt and repair record in `docs/release/v1-1-visual-overhaul-prompts.md` |
| `ui/vfx/wildguard-impact-core-v1.png` | Deterministic compact radial contact-core bake (`apps/web-toy/scripts/make-impact-core-v1.mjs`), lossless RGBA encode | 2026-07-13 | None | `30c60d6cbbcf4188408168e657246c926069f877e9f991343b06a36fdc1e0705` | Compact non-star ivory/amber impact point for the bounded two-to-four-tick additive contact layer. Family tint is material-owned; no body or debris path shares this texture. |
| `ui/vfx/wildguard-signature-debris-v1.png` | Built-in OpenAI image-generation source, chroma-key alpha cleanup, deterministic 4×1 crop bake (`apps/web-toy/scripts/make-signature-debris-v1.mjs`), RGB-only bleed, lossless RGBA encode; source hashes `061324124772e934f576b68c0657a51e662675c5dd7d176b4c13dec4dafc638e` and `2e1b5677439fe1d2c6df6babcd7f483e90c908b2be2ecf64c58dd1008bb0128f` | 2026-07-13 | None | `28b0184ceb1acd5d14b6110e50795d10f1193b5d40f72d81206caefea32f17e9` | 4×1 matte physical-fragment atlas: ivory shard, chunky earth rock, teal/magenta venom droplet, and narrow neutral chip. Family UV routing keeps signature debris distinct from the additive core and from one another. |
| `ui/vfx/wildguard-gecko-dissolve-frames-v1.png` | Existing approved Gecko source art, deterministic fixed-FBM 8-frame erosion bake, lossless adaptive PNG filtering, 512px derivative | 2026-07-13 | None | `f24da00a59d3000d7f68b47abddcefd542ae5c26dc63b17a85f432b5148965a7` | Eight coherent RGBA dissolve frames in 128px 4×4 atlas cells, each derived from cell `(1, 1)` of `wildguard-fields-frames-v3.png`; unused cells repeat the terminal frame to preserve the shared 4×4 UV contract. |
| `ui/vfx/wildguard-skunk-dissolve-frames-v1.png` | Existing approved Skunk source art, deterministic fixed-FBM 8-frame erosion bake, lossless adaptive PNG filtering, 512px derivative | 2026-07-13 | None | `e8cd577d483aab348cf38194bc72fa6d058572480fc3dfd01ee4324c032a24b2` | Eight coherent RGBA dissolve frames in 128px 4×4 atlas cells, each derived from cell `(2, 2)` of `wildguard-fields-frames-v3.png`; unused cells repeat the terminal frame to preserve the shared 4×4 UV contract. |
| `ui/vfx/wildguard-royal-stink-dissolve-frames-v1.png` | Existing approved Royal Stink source art, deterministic fixed-FBM 8-frame erosion bake, lossless adaptive PNG filtering, 512px derivative | 2026-07-13 | None | `14a23cfd5f97217a3ed086ef9cca0a53305bf27a30944c7c6735bc0ed6f3c941` | Eight coherent RGBA dissolve frames in 128px 4×4 atlas cells, each derived from cell `(2, 3)` of `wildguard-fields-frames-v3.png`; unused cells repeat the terminal frame to preserve the shared 4×4 UV contract. |
| `ui/vfx/wildguard-fluffy-shield-dissolve-frames-v1.png` | Existing approved Fluffy Shield source art, deterministic fixed-FBM 8-frame erosion bake, lossless adaptive PNG filtering, 512px derivative | 2026-07-13 | None | `c2f369955c0b2d096fcf72beba9dc7fd3075101963e1e9fa3ef3f15daa255adb` | Eight coherent RGBA dissolve frames in 128px 4×4 atlas cells, each derived from cell `(1, 2)` of `wildguard-world-frames-v2.png`; unused cells repeat the terminal frame to preserve the shared 4×4 UV contract. |
| `ui/vfx/wildguard-ground-contact-v1.png` | Deterministic unpremultiplied-RGBA broken elliptical footprint/crack bake (`apps/web-toy/scripts/bake-zone-dissolve.mjs`), lossless adaptive PNG filtering | 2026-07-13 | None | `813209b6eaa0d2515d2e4ea99d96d060b0e0011fd34314a463d725f239a679cc` | Compact 256×128 transparent warm ground-contact footprint for normal-blend impact and signature anchoring. Raw verification requires >=1,000 high-alpha source texels while the scene material remains capped at 0.25 opacity. |

### Generated enemy sprite source audit

All four generated enemy sources used the built-in image-generation tool's
flat `#ff00ff` chroma background and were processed with
`remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill`. The full prompts, source hashes, output
dimensions, and runtime hashes are recorded in
`docs/release/v1-visual-art-prompts.md`.

### Generated playable-hero sprite source audit

Benny and Gracie's generated playable-hero sources used the built-in
image-generation tool's flat `#ff00ff` chroma background and the same
`remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill` cleanup. The full prompts, source hashes,
output dimensions, and runtime hashes are recorded in
`docs/release/v1-visual-art-prompts.md`.

Scout's 1254×1254 source was generated with the built-in image-generation tool
from the owner-provided Scout photo and uses the same flat `#ff00ff` backdrop.
Its source and runtime hashes, non-verbatim generation brief, output formats,
and reference-image boundary are recorded in
`docs/release/scout-presentation-provenance.md`. The personal reference photo
is not a repository or runtime asset.
