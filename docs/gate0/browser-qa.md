# Gate 0 Browser QA

**Date:** 2026-07-10  
**Surface:** Codex in-app browser against a temporary localhost server

## Landing test

- Loaded without browser console warnings or errors.
- Concept image loaded successfully.
- Pitch A appeared selected by default.
- Clicking Pitch B produced the expected headline and `aria-pressed="true"`.
- Clicking the interest button changed its text and disabled it, without sending
  or storing data.
- Desktop layout rendered with clear hierarchy and no visible overlap.
- 390 × 844 responsive check had `scrollWidth === clientWidth` and loaded the
  image, confirming no horizontal overflow.

## Animatic

- Loaded without browser console warnings or errors.
- Reduced-motion fallback exists.
- After reload, computed panel opacities began as `[1, 0, 0, 0]`.
- Four seconds later, computed opacities were `[0, 1, 0, 0]`, confirming the
  15-second sequence advances.
- Storyboard remained readable at the default browser viewport.
- `?condition=stat` loaded the stat-only storyboard with no console warnings or
  errors.
- `?condition=visible` loaded the visible-body storyboard.
- The two conditions use the same animatic timing and presentation code; only the
  storyboard source changes.

## Limitations

- This is a concept mockup, not captured gameplay.
- The interest button is deliberately local-only and produces no analytics.
- Cross-browser QA is unnecessary until the concept passes external testing.
