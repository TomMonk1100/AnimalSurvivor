# Scout Presentation Provenance

**Date:** 2026-07-15 (America/Chicago)
**Scope:** Presentation-only replacement of the former Fox visual for the
stable `greg` hero id and the former Fox start-screen title art.

## Reference boundary

The project owner supplied `IMG_1759.png`, a photo reference for their dog
Scout, with the request to replace the Fox. The reference was used only to
guide the generated visual appearance. It is a private task attachment: it is
not copied into this repository, source control, build output, or runtime
requests. No third-party model, texture pack, or runtime image service was
introduced for Scout.

The underlying simulation identity remains `greg`; Scout's art does not change
simulation state, fixed-tick behavior, input, combat, replay data, or canonical
hashes.

## Generated output record

| Record | Path / format | SHA-256 | Intended use |
| --- | --- | --- | --- |
| Preserved gameplay generation source | `tmp/imagegen/scout-pouncer-source-v1.png`; 1254×1254 8-bit RGB PNG | `54fe5bd914f8accf967a060c82867904c6d99af9a7a827e0cd33c6af1f336314` | Local provenance source for the isolated Scout cutout; not a runtime file |
| Runtime gameplay cutout | `assets/ui/heroes/scout-pouncer-v1.png`; 1254×1254 8-bit RGBA PNG; 592,579 bytes | `8b95623f80f42af866133d257d7401dd151e494eaab5f71411d9b89a92f674fb` | Current Scout visual for the stable `greg` hero id |
| Field Guide portrait | `assets/ui/field-guide/scout-final-form-v1.png`; 768×768 8-bit RGB PNG; 833,619 bytes | `3de4aafbdf4ef06f457aa654d6f4f1bf7294d2bdfd563748ec327a8bae611d05` | Current Scout Field Guide portrait for the stable `greg` hero id |
| Preserved title generation source | `tmp/imagegen/scout-keyart-source-v1.png`; 1672×941 8-bit RGB PNG | `0b60157a3d7f72d85aa7e5a86157183b22494309f6aca9714118309c657e6eba` | Local provenance source for the Scout title key art; not a runtime file |
| Runtime title key art | `assets/ui/keyart/storybook-wildguard-scout-v1.jpg`; 1672×941 8-bit RGB JPEG; 436,951 bytes | `5dd0cd5aa13b24467e4cbade2bec9441b8405fda8ebaab3a8e29d856190b42f3` | Current start-screen title art; retains the menu-safe left opening and replaces the right-side Fox with Scout |

The gameplay source was converted into the transparent RGBA runtime cutout.
The Field Guide portrait was generated from the supplied Scout reference and
the gameplay art; its final runtime payload is ledgered by the hash above. The
title key art was generated from the supplied Scout reference, the former
project key art, and the gameplay cutout; its final runtime JPEG is ledgered
above. The private Scout photo is not copied into either generated source or
runtime payload.

## Recorded generation brief (non-verbatim)

The full image-generation prompts were not retained as a standalone artifact.
This concise record preserves the task's intent and constraints without
claiming to reproduce a verbatim prompt.

### Gameplay cutout

- Built-in OpenAI image generation using the supplied Scout reference.
- Caramel/tan short-haired dog, floppy ears, white blaze, muzzle, chest, and
  front paws, plus a teal bandana.
- Low-poly isometric/top-down running or leaping pose on a flat `#ff00ff`
  chroma background; no text.

### Field Guide portrait

- Built-in OpenAI image generation using the supplied Scout reference plus the
  generated gameplay art.
- Low-poly Scout portrait in a moonlit forest, preserving the caramel/tan
  coat, white blaze, muzzle, chest, front paws, and teal bandana.
- No text or logos.

### Start-screen title key art

- Built-in OpenAI image generation using the supplied Scout reference, former
  project title key art, and generated Scout gameplay cutout.
- Retain a menu-safe left opening; replace the right-side Fox with low-poly
  Scout in a forest and retain Scout's teal bandana.
- No text.

## Asset-gate coverage

`npm --prefix apps/web-toy run verify:assets` treats the three Scout runtime
files as required assets. It checks their PNG/JPEG signature, dimensions, color
type or component count, per-file payload cap, SHA-256 ledger row, and the
complete current runtime asset budget. The former Fox glTF, Greg portrait, and
Fox title key art are historical audit files, not current runtime asset-gate
inputs.
