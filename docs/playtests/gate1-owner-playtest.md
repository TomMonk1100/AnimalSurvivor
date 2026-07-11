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
playtest build; the `autopilot`, `stress`, and `fullrun` query options are
engineering checks, not the recommended way to play. The normal UI is compact
and player-facing; `?debug=1` exposes diagnostics and engineering controls. A
normal manual run waits at tick 0 on a **Start run** card; the automated URLs
skip it so their deterministic checks begin immediately.

When browser audio is supported, the **Sound effects** option on that card is
**Off** by default. If you enable it, the in-run **Sound: On/Off** control
remains available; browser audio that cannot start is a nonfatal silent fallback
and must never block the run.

## Open a shared browser preview

If the repository owner has enabled **Settings → Pages → Build and deployment
→ Source: GitHub Actions**, a green `Publish web-toy preview` run from `main`
can provide a hosted build. Open the deployment link in **Actions**, or use
**Settings → Pages**, to find the GitHub-assigned URL. The link is deliberately
not written into this guide; if no deployment is shown, use the local build or
ask the owner to enable Pages first.

## Controls

- Move with **WASD** or the **arrow keys** on desktop.
- On touch devices, use the lower-left virtual joystick.
- Greg attacks automatically; movement is the only required combat control.
- **Sound effects** are optional and initially **Off**. Enable them from the
  Start run card or later with **Sound: Off/On**. They only provide quiet cues
  for start/restart, rate-limited XP pickups, upgrade openings, victory, and
  defeat.
- Until Greg gains the first XP, the player HUD identifies visible green motes
  as XP to collect for levels and upgrade choices.
- Choose one animal adaptation whenever the upgrade card pauses the run. The
  first card receives keyboard focus; press **1**, **2**, or **3**, or use
  **Tab** then **Enter**, to select an offer.
- On touch, the lower-left joystick shows a floating thumb while you drag and
  clears it when you release. The persistent Active Adaptations cards stay
  above it in portrait and to its right in landscape. Pause, Restart run, and
  terminal Play again have 44px-high touch targets.
- A live boss shows a purple **The Final Threat** health bar. At the end of a
  run, use **Play again** on the outcome card to restart the same seed.

## Five-minute test

1. On the opening **Start run** card, can you explain the core loop before
   starting? Is it clear that **Sound effects** are optional and initially Off?
   After starting, does the green-mote XP hint make it clear what to collect?
2. Move in every direction and reverse sharply for 20 seconds. Does screen-up
   match pressing Up? Does Greg's facing resolve the reversal across four
   bounded visual turns without making movement feel less responsive?
3. Take each of the two first upgrades at least once.
   - **Porcupine Quills:** automatic bursts at nearby enemies.
   - **Puffer Pouch:** a pull pulse first, then a push pulse when Adapted.
4. Keep an eye on the **Active Adaptations** panel at lower right. After an
   upgrade card closes, can you still explain what that build does and when it
   triggers?
5. Watch the short callout near the top when Puffer or Thornstorm activates.
   Do "Inhale", "Gather", and "Quill storm" match what you see on screen?
6. If offered both Adapted traits, take them to form **Thornstorm Mantle**.
   Does its sequence read as: telegraph, pull enemies in, then radial quills?
7. At an upgrade choice, try keyboard selection: does the first card already
   have focus, do **1**/**2**/**3** match the visible offers, and does
   **Tab** + **Enter** work as expected? On a touch emulation/device, does the
   joystick thumb follow the drag and disappear on release, while the Active
   Adaptations cards avoid the joystick in both portrait and landscape?
8. With **Sound effects** enabled, are the sparse start/restart, rate-limited
   pickup, upgrade-open, and terminal victory/defeat cues useful and quiet
   enough? Toggle **Sound: On/Off** during the run. If enabling audio cannot
   start, does its nonfatal status message leave play uninterrupted?

## Optional accelerated boss/run-flow check

Open the local URL with `?autopilot=1&stress=1&fullrun=1`. This deterministically
chooses the first upgrade and raises the accelerated stress cap to the
12-minute authored boundary. It is useful only for inspecting the boss health
bar and terminal **Play again** flow if the normal-health run reaches them; it
does not validate normal difficulty or replace the hands-on test above.

## What to report

Short answers are enough:

- Movement: smooth / delayed / backwards / confusing, plus one example.
- Onboarding: did the **Start run** card and first green-mote XP hint explain
  what to do without outside help?
- Upgrade clarity: which card or active effect was unclear?
- Interaction: did keyboard upgrade selection, the joystick thumb, the
  joystick-safe adaptation-card placement, or the 44px Pause/Restart/Play
  again controls feel unclear or awkward?
- Sound, if enabled: were the few cues helpful, too quiet, too loud, or too
  frequent? Did switching it on/off or an unavailable-audio message behave
  clearly without interrupting play?
- Combat readability: could you tell why enemies moved, died, or were pushed?
- Boss/end flow, if seen: did the boss bar make progress clear, and was **Play
  again** obvious after the outcome?
- Screen clutter: was the HUD, adaptation panel, or action callout helpful or
  distracting?
- One moment that felt exciting and one that felt frustrating.

## Current boundary

This slice is intentionally a prototype. It has deterministic simulation,
actual trait effects, upgrade explanations, and a 12-minute authored run, but
normal difficulty balance, physical-touch testing, low-end-device testing, and
external human playtesting are still open.
