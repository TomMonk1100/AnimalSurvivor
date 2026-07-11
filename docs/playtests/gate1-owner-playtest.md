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

The Start/next-run card is also the only player-facing place for the local
Essence and **Starting Vitality** profile. That between-run choice should not
remain visible in the combat HUD. A terminal outcome's **Continue to upgrades**
button returns to this prep surface before a fresh next run is started.

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
- On desktop, press **Esc** to pause or resume a live run. The button remains
  available for touch and mouse play; the centered **Paused** notice should say
  exactly how to resume.
- **Sound effects** are optional and initially **Off**. Enable them from the
  Start run card or later with **Sound: Off/On**. They provide sparse cues for
  stronger start/restart and upgrade confirmations, rate-limited XP pickups,
  player hits, a quiet auto-attack texture, victory, and defeat.
- Until Greg gains the first XP, the player HUD identifies visible green motes
  as XP to collect for levels and upgrade choices.
- The HUD also keeps elapsed run time, the current phase, and the current goal
  visible. Before the boss, the goal is to survive until **The Final Threat**;
  during the boss phase, it is to defeat that threat by the 12:00 normal cap.
- Choose an offered animal adaptation or neutral run upgrade whenever the card
  pauses the run. The first card receives keyboard focus; press **1**, **2**,
  or **3**, or use **Tab** then **Enter**, to select an offer.
- On touch, the lower-left joystick shows a floating thumb while you drag and
  clears it when you release. The persistent Active Adaptations cards stay
  above it in portrait and to its right in landscape. Pause, Restart run, and
  terminal Continue to upgrades controls have 44px-high touch targets.
- A live boss shows a purple **The Final Threat** health bar. At the end of a
  run, the outcome card banks Essence once and **Continue to upgrades** returns
  to the prep screen. If affordable, buy **Starting Vitality** there and verify
  its +10 maximum health applies only to the next fresh run.

## Focused owner playtest

1. On the opening **Start run** card, can you explain the core loop before
   starting? Is the Essence/Starting Vitality section clearly a next-run prep
   choice, and is **Sound effects** clearly optional and initially Off? After
   starting, is the profile absent from active combat while the green-mote XP
   hint makes it clear what to collect?
2. Move in every direction and reverse sharply for 20 seconds. Does screen-up
   match pressing Up? Does Greg's facing resolve the reversal across four
   bounded visual turns without making movement feel less responsive?
3. Take each of the two first animal upgrades at least once, then take at least
   one neutral upgrade and say what its card claims it changes.
   - **Porcupine Quills:** automatic bursts at nearby enemies.
   - **Puffer Pouch:** a pull pulse first, then a push pulse when Adapted.
4. Keep an eye on the **Active Adaptations** panel at lower right. After an
   upgrade card closes, can you still explain what that build does and when it
   triggers?
5. Press **Esc** after choosing upgrades. Does the centered pause panel list
   both your animal and neutral build effects, and make resuming obvious?
6. If offered both Adapted traits, take them to form **Thornstorm Mantle**.
   Does its sequence read as: telegraph, pull enemies in, then radial quills?
7. At an upgrade choice, try keyboard selection: does the first card already
   have focus, do **1**/**2**/**3** match the visible offers, and does
   **Tab** + **Enter** work as expected? On a touch emulation/device, does the
   joystick thumb follow the drag and disappear on release, while the Active
   Adaptations cards avoid the joystick in both portrait and landscape?
8. With **Sound effects** enabled, are the sparse start/restart, pickup,
   upgrade, player-hit, quiet attack, and terminal victory/defeat cues useful
   and quiet enough? Toggle **Sound: On/Off** during the run. If enabling audio
   cannot start, does its nonfatal status message leave play uninterrupted?
9. At any moment, can you say what phase you are in and what ends the run from
   the persistent HUD? Does the tighter camera make Greg, nearby threats, and
   green XP motes readable without making the arena feel cramped?
10. Watch the approach and pressure curve. Do fodder and runners enter from off
    screen rather than appearing just outside weapon range? Does density rise
    through pressure, adaptation, and mutation instead of leaving a safe place
    to stand still at six to seven minutes?
11. At the 3:20 elite beat, then later elite beats if reached, does the larger
    **24-XP** pickup make the elite feel rewarding? Do distant runners' weave
    and elites' range/orbit behavior read as deliberate rather than erratic?
12. When an elite has reached its fighting range, does its orange-red projectile
    visibly prompt movement without feeling unavoidable? It fires first after
    roughly 1.2 seconds in range, then about every 2.5 seconds; report any
    confusing hit, missing visual, or sound/readability problem.
13. End a run or use the accelerated flow check. Does **Continue to upgrades**
    take you to a prep screen with Essence/Starting Vitality rather than
    restarting immediately? Make a purchase if possible, then confirm that it
    applies only after starting the next run.

## Optional accelerated boss/run-flow check

Open the local URL with `?autopilot=1&stress=1&fullrun=1`. This deterministically
chooses the first upgrade and raises the accelerated stress cap to the
12-minute normal boundary, stopping at terminal if it occurs earlier. It is
useful only for inspecting the boss health bar and terminal **Continue to
upgrades** flow if the normal-health run reaches them; it does not validate normal difficulty
or replace the hands-on test above.

## What to report

Short answers are enough:

- Movement: smooth / delayed / backwards / confusing, plus one example.
- Onboarding: did the **Start run** card and first green-mote XP hint explain
  what to do without outside help?
- Run context: could you tell the current phase and whether the goal was to
  survive or defeat **The Final Threat**?
- Upgrade clarity: which card or active effect was unclear?
- Interaction: did keyboard upgrade selection, the joystick thumb, the
  joystick-safe adaptation-card placement, or the 44px Pause/Restart/Continue
  to upgrades controls feel unclear or awkward?
- Sound, if enabled: were the few cues helpful, too quiet, too loud, or too
  frequent? Did switching it on/off or an unavailable-audio message behave
  clearly without interrupting play?
- Combat readability: could you tell why enemies moved, died, or were pushed?
  Did the short attack, pickup, hit, and death rings make normal combat easier
  to follow, or did they become distracting?
- Boss/end flow, if seen: did the boss bar make progress clear, and was
  **Continue to upgrades**, the Essence reward, and the next-run Starting
  Vitality purchase obvious after the outcome?
- Pressure: did threats approach from outside the screen, become overwhelming
  enough later in the run, reward elite kills with a noticeable 24-XP pickup,
  and make runner/elite movement readable?
- Ranged pressure: did the cobalt Spitter's slower orange shots and the elite's
  stronger orange shots force useful repositioning, or did either feel
  invisible, unfair, too weak, or too frequent?
- Prep flow: was Starting Vitality absent from active play and obvious after
  **Continue to upgrades**?
- Screen clutter: was the HUD, adaptation panel, or pause summary helpful or
  distracting?
- One moment that felt exciting and one that felt frustrating.

## Current boundary

This slice is intentionally a prototype. It has deterministic simulation,
actual trait effects, upgrade explanations, and a 12-minute authored run, but
normal difficulty balance, physical-touch testing, low-end-device testing, and
external human playtesting are still open. The normal-plus Spitter is in this
slice; additional player attack families and broader enemy patterns remain
future content.
