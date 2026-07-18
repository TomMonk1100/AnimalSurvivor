# WP-C integration notes — player-attack cohesion

## Required scene call

`TraitCommandPresentation.update` now accepts two optional primitive arguments
after the existing event list: `heroX` and `heroY`. They drive only the small,
tick-derived player-origin cast cue; they never write simulation state or alter
the command's target-side effect.

In `apps/web-toy/src/render/playcanvas-scene.ts`, the render function already
computes `playerWorldX` and `playerWorldY` immediately before its current
`traitCommandPresentation.update(...)` call. Keep the existing event filter and
pass those primitives as the final arguments:

```ts
traitCommandPresentation.update(
  curr.tick,
  traitCommandEventsWithoutThreatTelegraphs(presentationEvents),
  playerWorldX,
  playerWorldY,
);
```

Do not create an object for this position: the primitive API keeps the normal
render loop allocation-free. No new scene material, batch, contract, or
simulation wiring is required.

## Expected result

- Every explicit player trait command that produces a world effect gets a
  family-hued, eight-tick-or-shorter cue at Scout's live rendered position.
- Existing defense-only cues and hostile danger commands remain excluded.
- Existing two-argument callers remain compatible until this call is wired.
