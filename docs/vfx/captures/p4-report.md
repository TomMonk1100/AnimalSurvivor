# P4 — Palette Law Implementation Report

**Date:** 2026-07-13
**Scope:** Renderer-only procedural attack underpainting. Painted sheets retain their native colour.

## Delivered

- Replaced the per-role neon colour table in `trait-command-presentation.ts` with a shared palette policy in `attack-vfx-palette.ts`.
- Every current effect material now routes to one of six damage families: physical, earth, venom, arcane, storm, or fire. Hostile warnings are the only routes allowed into the coral-danger reservation.
- Mint/reward is represented as a reserved lane but is not assignable to any attack role. Full-saturation gold is documented as critical-impact-only.
- Procedural colours are HSL-desaturated by 35%; body opacity is hard-capped at 0.35 and accent opacity at 0.45, including dynamic mesh-parameter updates.
- Removed the former accent `×1.16 + 0.08` RGB brightening path. Accent geometry now uses the same muted family colour as its body.

## Automated evidence

- `attack-vfx-palette.test.ts`: reservation rules, family mappings, saturation ceiling, and opacity caps.
- `trait-command-presentation.test.ts`: source-aware palette routes for fox, skunk, and boss warning paths.
- Focused Vitest run: **39 passing tests** across palette, trait command, impact, hit-flash, and shake policy suites.
- Focused ESLint run over all P4/P5 changed TypeScript and test files: passed.

## Visual acceptance still required

The P0 capture harness must inspect an ACES-tonemapped normal and dense frame before final close. The expected result is that painted cards lead, legacy procedural geometry sits quietly beneath them, player attacks never resemble hostile coral or reward mint/gold, and enemy warnings remain unambiguous.
