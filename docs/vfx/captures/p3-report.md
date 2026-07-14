# P3 — corrected texture-pipeline and temporal-coherence report

**Date:** 2026-07-13
**Scope:** Renderer assets and offline tooling only. No simulation behavior was changed.

## Corrected result

The active P3 texture baseline is green for the runtime **v3 signature atlas**,
but this is not visual-phase closure. An earlier report treated the working-tree
`wildguard-signature-frames-v2.png` as clean. That claim is withdrawn: P3 found
nonzero alpha at cell boundaries and cross-cell contamination risk in that
artifact. It is quarantined and is neither imported by the runtime nor covered
by the active signature texture gate.

`wildguard-signature-frames-v3.png` is the active repaired **base signature
board**. It is
rebuilt from clean committed Git object
`HEAD:assets/ui/vfx/wildguard-signature-frames-v2.png`
(`e8f557b3ba24cd0238846a530c88e3582b783f55`), with a transparent four-pixel
gutter inside every 192px cell. The rebuild preserves every alpha byte after
the one cell-local resample and only bleeds RGB through alpha-zero texels.

P2 later added the distinct, active
`wildguard-signature-bodies-v1.png` 512px padded atlas for Benny's earth
ridges and Gracie's head/tail body, plus dedicated compact core, family debris,
and visible normal-blend contact textures. Those assets are recorded in the
asset ledger and their exact hashes are source-pinned by the P2 capture tool;
they do not alter P3's quarantine finding for the historical v2 board.

The exact machine-readable provenance and inspection output is
[p3-signature-v3/report.json](p3-signature-v3/report.json):

- Output SHA-256: `bbc5240ee1ca7ba6ef421fd8f83f66195de18a78c5dbdc5fc42168dcefd6fcd8`
- Output size: 580,910 bytes (768×768 RGBA)
- Per-cell gutter-alpha violations: 0
- Transparent-black matte texels: 0
- Partial-alpha texels: 23,525
- Static forest-background inspection:
  [signature-v3-forest-inspection.png](p3-signature-v3/signature-v3-forest-inspection.png)

The static inspection shows the intended Fox Swipe, Earth body, and Spit Comet
source cells over the actual forest ground. It is source validation only; the
separate P2 event-matched headed capture remains required to prove live motion,
readability, and contact anatomy.

## Reproducible active texture gate

Run from `apps/web-toy`:

```bash
npm run vfx:make-signature-v3
npm run verify:vfx-textures
npm run verify:assets
npm run vfx:make-p3-crops
```

`vfx:make-signature-v3` never writes the quarantined v2 file. It records the
clean Git blob, exact v3 hash, 16 visible bounds, gutter result, RGB-only bleed
policy, and forest composite in `p3-signature-v3/report.json`.

`verify:vfx-textures` raw-decodes PNG bytes rather than accepting a browser
preview. For the active signature atlas, it verifies all 16 individual cells,
their alpha-zero four-pixel perimeter, non-empty in-cell visible bounds, zero
black matte texels, the exact v3 SHA-256, and the matching forest-inspection
artifact. The global hue-residue check remains in force for the other texture
sheets; v3 does not misuse it because Gracie's authored magenta is intentional
inside a safely padded cell.

`verify:assets` checks the active v3 base board and the later P2 body/core/
debris/contact derivatives against `ASSET_LEDGER.md`, including their hashes
and the strict 19 MB complete-runtime budget. The current validated total is
recorded by the final release gate; this report does not substitute for it.

## Remaining coherence work

- `repair-vfx-alpha.mjs` remains the deterministic cleanup route for the
  non-signature legacy sheets.
- `bake-zone-dissolve.mjs` creates the Gecko, Skunk, Royal Stink, and Fluffy
  Shield eight-frame erosion atlases from stable approved source cells. It
  changes only alpha threshold over a fixed seeded field and keeps terminal
  copies in unused cells to preserve the 4×4 UV contract.
- The renderer uses stable best frames plus tick-derived transforms/crossfades
  for illustrated cards; it does not advance unrelated generated grid cells as
  a fake flipbook.

## Crop evidence

The crop helper reads the clean committed source object for its historical side
and active v3 for its current side. These panels are source-level evidence, not
live-combat proof:

- [Fox Swipe source/current panel](p3-crops/fox-swipe-before-after.png)
- [Gracie Spit source/current panel](p3-crops/gracie-spit-before-after.png)
- [Skunk raw-card/coherent-dissolve panel](p3-crops/skunk-dissolve-before-after.png)

## Review boundary

P3 passes only the corrected active texture/source baseline. It does **not**
approve P1/P2/P4/P5 acceptance, substitute for headed normal-speed evidence,
or waive independent judge review. Those gates require the current rendered
proof and are recorded separately.
