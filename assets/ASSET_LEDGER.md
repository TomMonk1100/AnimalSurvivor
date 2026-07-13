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
| partially incorporated | [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) | Quaternius | CC0 1.0 | 12 animated animals; FBX, OBJ, Blend, glTF; official Drive folder | 2026-07-09 | Per-file hashes below | Only license, preview, and Fox glTF downloaded for audit |
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
| `vendor/quaternius/ultimate_animated_animals/Fox.gltf` | `1z-CWoUC2vJxrqgGFTYlMaywpE1ooV-bA` | `2f36e3c9c75ecddda85c5f9944e98ee1e88e7c679a546534aff1cea8ecde64c7` | Original self-contained glTF, preserved unchanged |
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
gameplay decisions. The exact prompt set is checked in at
`docs/release/field-guide-portrait-prompts.md`, and the generated source files
remain versioned with the workspace.

| File | Tool | Date | Reference images | SHA-256 | Intended use |
| --- | --- | --- | --- | --- | --- |
| `ui/field-guide/greg-final-form-v1.png` | Built-in OpenAI image generation | 2026-07-12 | None | `7dd8fbfb9c5433db001c39b3f226f3eff1f9128344172433c5a2016c1136f4e0` | Greg Field Guide final-form portrait |
| `ui/field-guide/benny-final-form-v1.png` | Built-in OpenAI image generation | 2026-07-12 | None | `c4b90103dd5d2caaf032695498a90f6254525184be2f4f294bda916c649589f4` | Benny Field Guide final-form portrait |
| `ui/field-guide/gracie-final-form-v1.png` | Built-in OpenAI image generation | 2026-07-12 | None | `8085cba7f491f3cece5c38ab9a1b5cfa1d33a0cfa63d0b40b42fcbf4cf74ea25` | Gracie Field Guide final-form portrait |

These boss portraits use the exact prompts in `docs/release/boss-portrait-prompts.md`.

| File | Tool | Date | Reference images | SHA-256 | Intended use |
| --- | --- | --- | --- | --- | --- |
| `ui/bosses/final-threat-v1.png` | Built-in OpenAI image generation | 2026-07-12 | None | `efc9234bf5b4017e0030fcaa1189b234515ecaf993a764cc92fb5fef7c5dfd00` | Forest boss-health portrait |
| `ui/bosses/sandglass-sovereign-v1.png` | Built-in OpenAI image generation | 2026-07-12 | None | `b0452263c602bdbdc1df75050ea20755f320ddea8c3fa4cf9bd78f16c757b699` | Saltwind boss-health portrait |

The playable Wildguard start screen uses a generated illustration with the
exact prompt recorded in `docs/release/wildguard-keyart-prompt.md`. Its source
PNG was non-destructively compressed to JPEG for the browser asset budget. The
Forest clearing ground and Bramblehog gameplay sprite use the exact prompts
and transformations recorded in `docs/release/v1-visual-art-prompts.md`.

| File | Tool | Date | Reference images | SHA-256 | Intended use |
| --- | --- | --- | --- | --- | --- |
| `ui/keyart/storybook-wildguard-forest-v1.jpg` | Built-in OpenAI image generation, JPEG compression | 2026-07-12 | None | `80e4efcbc9f2b07773cc7555991190ee4ef40ac096900853be2c97146801c18c` | Storybook Wildguard start-screen key art |
| `ui/terrain/storybook-glade-ground-v1.jpg` | Built-in OpenAI image generation, JPEG compression | 2026-07-12 | None | `2cb3cc6943196f3136981280a424ea43ec1a4877fa067055b86a964e22c566d1` | Tiled-feeling full-arena Forest clearing ground plate |
| `ui/heroes/benny-bastion-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup | 2026-07-12 | None | `adc3d4e27f49fdf9802abbf74f013e59fc63316930bbeeadd941195348e9224c` | Transparent Benny the Bastion playable-hero sprite; source `exec-5740c719-1edc-4c9e-be60-7bddbab00199.png` |
| `ui/heroes/gracie-surveyor-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup | 2026-07-12 | None | `c6a4532a6a720616e3804dd8b9de55a09ec3cdfad3ac7bcd448945308c3cd370` | Transparent Gracie the Surveyor playable-hero sprite; source `exec-1612d45a-3615-49c6-94a6-5b94c0d6bfc2.png` |
| `ui/enemies/bramblehog-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup | 2026-07-12 | None | `70b1cad8e56107345dbaa100a60eccaa930a5dd1ca92379e1fc37206ef3f5d71` | Transparent Bramblehog swarm-enemy sprite |
| `ui/enemies/thornwing-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup | 2026-07-12 | None | `1613017699e230ee6af600e8ca05de60579040ff52fc79f5d2b95305a6be0133` | Transparent Thornwing skitter runner-enemy sprite; source `exec-3017b2fa-f91d-4720-854c-8461bddff706.png` |
| `ui/enemies/rootback-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup | 2026-07-12 | None | `f4ca503943579d3e01081ab4af36c046be2af9c790d3623de1ca5a4747b1e7f0` | Transparent Rootback colossus brute-enemy sprite; source `exec-45a83ab6-2b49-4e05-a47b-d0c60c62a328.png` |
| `ui/enemies/hollowhart-warden-v1.png` | Built-in OpenAI image generation, chroma-key alpha cleanup | 2026-07-12 | None | `df391827764ba1ae6e0ae5294195c57d6bfb0321e4a632c37982da324ceb6954` | Transparent Hollowhart Warden Forest boss sprite; source `exec-9b1b1a0f-3d23-4711-a9c5-a84070223505.png` |

### Generated enemy sprite source audit

All four generated enemy sources used the built-in image-generation tool's
flat `#ff00ff` chroma background and were processed with
`remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill`. The full prompts, source hashes, output
dimensions, and runtime hashes are recorded in
`docs/release/v1-visual-art-prompts.md`.

### Generated playable-hero sprite source audit

Both generated playable-hero sources used the built-in image-generation tool's
flat `#ff00ff` chroma background and the same
`remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill` cleanup. The full prompts, source hashes,
output dimensions, and runtime hashes are recorded in
`docs/release/v1-visual-art-prompts.md`.
