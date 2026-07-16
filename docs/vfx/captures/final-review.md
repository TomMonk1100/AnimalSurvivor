# Final visual-panel technical review

**Date:** 2026-07-16
**Scope:** automated final release VFX/flash-safety evidence for the current
Wildguard renderer. This is technical browser evidence only; it is not final
art approval, accessibility sign-off, reduced-motion approval, or a human
playtest result.

## Result

`npm run verify:release` passed in full. Its final visual gate ran:

```text
npm --prefix apps/web-toy run verify:vfx-flash
```

The gate used a normal-speed deterministic Greg run at
`?autopilot=1&hero=greg&seed=3`, selected upgrades through the actual DOM,
and captured a ten-second clip at 180 simulation seconds from the production
preview build.

| Check | Observed result |
| --- | --- |
| Browser path | Headless Chromium with SwiftShader; no fallback reason recorded |
| Combat frame | WebGL2 active, intro hidden, renderer banner `none` |
| Audit window | 180 simulation seconds; 249 decoded frames at 24.9 fps |
| Luminance audit | 8 × 8 linear-relative-luminance grid; reversal amplitude > 0.10 |
| Limit | At most 3 reversals in any rolling second per cell |
| Worst result | Cell row 6, column 6: 3 reversals; no failing cells |
| Gate result | **Pass** |

The local machine-readable report SHA-256 is
`82ee6b826e5313641ed58880b502cc4e567f07d57cb942da6bc5ef2b42ae94fd`.
Its per-clip audit SHA-256 is
`e1d141c1b30e8addd6aa64dd831f173f27980bae68b04eba96f307ce232394fb`.
The source capture is retained locally at
`docs/vfx/captures/capture-2026-07-16T12-20-37-979Z/` for traceability.
The generated video, still, contact-sheet, and timestamped rerun directory are
intentionally omitted from Git so this record remains the single reviewable
release artifact rather than a collection of bulky accidental reruns.

## Evidence boundary

This gate establishes that the rendered automated route stayed within the
declared luminance-reversal limit in this controlled environment. It does not
establish subjective visual quality, comfort on a player display, accessibility
compliance, device coverage, gameplay balance, or player enjoyment. Those
remain separate owner/human evidence.
