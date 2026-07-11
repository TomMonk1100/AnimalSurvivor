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
| candidate | [Prototype Kit](https://kenney.nl/assets/prototype-kit) | Kenney | CC0 1.0 | 145 prototype models with animation/variations | — | — | — |
| candidate | [Kenney asset library](https://kenney.nl/assets) | Kenney | CC0 on asset pages; verify included file | UI, input prompts, audio, and environment candidates | — | — | — |

## Incorporated audit files

| File | Source file ID | SHA-256 | Notes |
| --- | --- | --- | --- |
| `vendor/quaternius/ultimate_animated_animals/License.txt` | `1F2uy8T2fRpdc6gZ4mnS02_C2E63WvKtn` | `83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c` | Original CC0 1.0 license, preserved unchanged |
| `vendor/quaternius/ultimate_animated_animals/Fox.gltf` | `1z-CWoUC2vJxrqgGFTYlMaywpE1ooV-bA` | `2f36e3c9c75ecddda85c5f9944e98ee1e88e7c679a546534aff1cea8ecde64c7` | Original self-contained glTF, preserved unchanged |
| `vendor/quaternius/ultimate_animated_animals/Preview.jpg` | `1HdDYH9Cq4pnwRZ7LPD0zS0lyYI6m3qQT` | `316a03d52e15a2b0ba4906074ad0c1e4ecd59fb0b92b63f07108bc81138a6d8a` | Publisher preview used only for audit/reference |

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
