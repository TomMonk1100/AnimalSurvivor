# Credits and Notices

This is the current player-facing provenance record for the verified web toy.
It is intentionally limited to assets and dependencies that are actually in the
current build.

## Runtime and original content

- AnimalSurvivor code, simulation content, procedural heroes, procedural
  attachments, UI copy, and presentation glue: original project work.
- Scout's playable-hero sprite, Field Guide portrait, and start-screen key art:
  AI-assisted original project artwork generated with the built-in OpenAI
  image-generation tool on 2026-07-15 from an owner-provided Scout photo
  reference. The photo is a private task attachment and is not copied into the
  repository or runtime. The non-verbatim generation brief and exact hashes are in
  [`scout-presentation-provenance.md`](scout-presentation-provenance.md) and
  [`assets/ASSET_LEDGER.md`](../../assets/ASSET_LEDGER.md).
- Field Guide final-form portraits for Benny and Gracie: AI-assisted original
  project artwork generated with the built-in OpenAI image-generation tool on
  2026-07-12 without reference images. Their source files and hashes are
  recorded in [`assets/ASSET_LEDGER.md`](../../assets/ASSET_LEDGER.md).
- Forest clearing terrain; Benny and Gracie playable-hero sprites; and the
  Bramblehog, Thornwing, Rootback, and Hollowhart Warden swarm/boss sprites:
  AI-assisted original project artwork generated with the built-in OpenAI
  image-generation tool on 2026-07-12 without reference images. The exact
  prompts, JPEG compression, and chroma-key transparency cleanup are recorded
  in
  [`v1-visual-art-prompts.md`](v1-visual-art-prompts.md).
- The Field Guide portraits and playable hero sprites do not claim final rigged
  hero models or animation assets.
- AI-assisted concept boards in `assets/` are design references only and are not
  runtime models or textures.

## Included third-party asset

- **Forest glade props:** Quaternius, from the
  [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html).
  The curated trees, rocks, flower bush, and compact local textures are
  incorporated under the **CC0 1.0 Public Domain Dedication**. The official
  download source, archive hash, individual runtime hashes, and texture
  derivative record are in [`assets/ASSET_LEDGER.md`](../../assets/ASSET_LEDGER.md).

## Historical audit material (not shipped)

- **Fox glTF:** Quaternius, from the Ultimate Animated Animal Pack,
  [official pack page](https://quaternius.com/packs/ultimateanimatedanimals.html).
  It is retained with its CC0 1.0 license for audit only; Scout presentation
  art replaced it as the current hero asset. It is not loaded or included in
  the current web runtime payload. Its source and license hashes remain in
  [`assets/ASSET_LEDGER.md`](../../assets/ASSET_LEDGER.md).
- **Fox title key art:** Original project AI-assisted illustration retained for
  audit only. Scout title art is the current start-screen asset; the former Fox
  illustration is not loaded or included in the current web runtime payload.

## Runtime dependency

- **PlayCanvas Engine 2.20.6:** MIT License. The package license text is
  shipped by the dependency and the dependency is recorded in the project
  package lock/install metadata.

This notice is not a substitute for the final release license, third-party
notice bundle, or legal review. The current complete notice record is in
[`third-party-notices.md`](third-party-notices.md), and the current storage
behavior is documented in [`privacy-and-storage.md`](privacy-and-storage.md).
A repository software license and final legal review remain release-candidate
work.
