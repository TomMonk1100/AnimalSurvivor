# Gate 1 Owner Playtest

This is a short feel-and-clarity check for Greg's current vertical slice. It
does not test final balance or complete the human-playtest gate.

## Start the local build

From the project folder, run:

```bash
cd apps/web-toy
npm run dev
```

Open the local address Vite prints in the terminal. The normal page is the
playtest build; the `autopilot` and `stress` query options are engineering
checks, not the recommended way to play.

## Controls

- Move with **WASD** or the **arrow keys** on desktop.
- On touch devices, use the lower-left virtual joystick.
- Greg attacks automatically; movement is the only required combat control.
- Choose one animal adaptation whenever the upgrade card pauses the run.

## Five-minute test

1. Move in every direction for 20 seconds. Does screen-up match pressing Up?
   Does Greg's movement feel smooth enough to understand?
2. Take each of the two first upgrades at least once.
   - **Porcupine Quills:** automatic bursts at nearby enemies.
   - **Puffer Pouch:** a pull pulse first, then a push pulse when Adapted.
3. Keep an eye on the **Active Adaptations** panel at lower right. After an
   upgrade card closes, can you still explain what that build does and when it
   triggers?
4. Watch the short callout near the top when Puffer or Thornstorm activates.
   Do "Inhale", "Gather", and "Quill storm" match what you see on screen?
5. If offered both Adapted traits, take them to form **Thornstorm Mantle**.
   Does its sequence read as: telegraph, pull enemies in, then radial quills?

## What to report

Short answers are enough:

- Movement: smooth / delayed / backwards / confusing, plus one example.
- Upgrade clarity: which card or active effect was unclear?
- Combat readability: could you tell why enemies moved, died, or were pushed?
- Screen clutter: was the HUD, adaptation panel, or action callout helpful or
  distracting?
- One moment that felt exciting and one that felt frustrating.

## Current boundary

This slice is intentionally a prototype. It has deterministic simulation,
actual trait effects, upgrade explanations, and a 12-minute authored run, but
normal difficulty balance, physical-touch testing, low-end-device testing, and
external human playtesting are still open.
