# Gate 1 Owner Playtest — Forest Arsenal

This is a short hands-on check for Greg’s current Forest Arsenal alpha. It is
not final-balance certification. Dying before the boss is useful feedback if the
pressure, enemies, or build choices explain why it happened.

## Start the local build

From the project root:

```bash
cd apps/web-toy
npm run dev
```

Open the local address Vite prints in the terminal. Select **Start run** to
begin; the normal manual build waits at tick 0 until that choice. Use the normal
page for playtesting. ?autopilot=1, ?stress=1, and ?fullrun=1 are engineering
aids, not the recommended way to judge the game.

The Start/next-run screen is the only player-facing place for Essence and
**Starting Vitality**. After a terminal run, **Continue to upgrades** returns
there. Starting Vitality should not remain in the active combat HUD.

If the repository has GitHub Pages enabled with **Settings → Pages → Build and
deployment → Source: GitHub Actions**, a green **Publish web-toy preview** run
from **main** can provide a shared build. Use the deployment link in **Actions**
or **Settings → Pages** to find its assigned URL.

## Controls

- Move with **WASD** or the **arrow keys** on desktop.
- On touch devices, drag in the lower-left virtual joystick.
- Greg attacks automatically; movement is the combat input.
- At an upgrade choice, use the mouse, **1**, **2**, or **3**, or **Tab** then
  **Enter**.
- Press **Esc** to pause/resume on desktop. Use the visible pause control for
  mouse or touch play.
- Sound effects are optional and off by default. If you enable them, note which
  cues feel useful, missing, distracting, or too quiet.

The forest clearing is intended to make position and incoming threats legible.
The live HUD should show only immediate context. To read your build, pause; do
not expect a persistent panel or repeated text at the top of the screen.

## What the run should do

Normal mode is an **8:00** run with no overtime:

| Time | Phase |
| --- | --- |
| 0:00–1:00 | Opening |
| 1:00–3:00 | Pressure |
| 3:00–5:00 | Adaptation |
| 5:00–6:30 | Mutation |
| 6:30–8:00 | Boss |

The boss warning starts at **6:10** and **The Final Threat** arrives at **6:30**.
Elite requests are at **2:00**, **3:40**, **4:30**, **5:15**, **5:45**, and
**6:05**, each after a five-second warning.

Greg begins with Auto-Fire and can choose up to four of six additional attack
families:

- **Porcupine Quills** — targeted quill bursts.
- **Puffer Pouch** — gather, then Adapted push control.
- **Electric Eel Coil** — instant strike on the nearest threat, then chains to
  nearby unhit foes (1 at Bud, 3 at Adapted).
- **Firefly Colony** — orbiting fireflies that zap enemies when they make contact.
- **Mantis Scythes** — an auto-aimed narrow scythe sweep; Adapted widens and strengthens it.
- **Gecko Pads** — after Greg travels 150 units, creates a damaging pad at his
  feet; Adapted pads recur after 110 units. The pads damage but do not slow.

Adapted Quills + Pouch can become **Thornstorm Mantle**. Adapted Coil + Colony
can become **Thunderbug Dynamo**, which telegraphs a larger chain discharge.
A Mythic keeps both of its ingredient slots:
the loadout remains a five-active-attack build, not six. Adapted Mantis Scythes
+ Adapted Gecko Pads can become **Razorstep Chimera**, which leaves stronger
scythe pads every 90 units of movement.

The neutral pool contains Swift Paws, XP Magnet, Sturdy Hide, Sharpened
Instinct, Rapid Instinct, and Growth. A run can choose five distinct neutral
passives, then rank selected ones further. Sharpened and Rapid should clearly
read as upgrades to every attack.

## Focused playtest

1. **First glance.** Before starting, can you explain the loop: move, survive,
   collect XP, choose upgrades, beat the boss before 8:00? Is the
   Essence/Starting Vitality section clearly a next-run decision?
2. **Movement and space.** Move and reverse in every direction. Does screen-up
   match Up? Does the forest clearing make your position and escape routes
   clearer than the old dark grid without making pickups or projectiles harder
   to see?
3. **HUD and clutter.** During combat, can you read health, XP, time, phase,
   and the immediate goal? Is the lack of repeated “what just fired” text a
   relief, or do you miss important information?
4. **Attack choices.** Pick at least two different attacks if offered. Can you
   tell what Quills, Puffer, Coil, orbiting Firefly, Mantis Scythes, and Gecko Pads are
   meant to do from their cards and their first use? Does Mantis visibly sweep
   toward its target without implying damage behind Greg? Does Gecko Pads clearly
   read as damaging movement trail rather than a slow? Circle tightly around a
   durable enemy: does pad damage feel strong without turning into a runaway
   stationary kill zone? Which feels most satisfying, weak, or confusing?
5. **Build limits.** Pause after taking upgrades. Can you find the active attack
   count and neutral passive count? Does starter + four acquired attacks make
   sense? If you see a Mythic, is it clear why it retains two slots?
6. **Neutral choices.** Take a neutral upgrade. Is its benefit understandable?
   If you take Sharpened Instinct or Rapid Instinct, does “every attack” make
   the decision feel worthwhile and believable?
7. **Pressure.** Do enemies enter from outside the screen and become more
   demanding from Opening through Mutation? Is there still a safe place to
   stand still? If you die, was the cause readable?
8. **Enemy behavior.** Do runners’ weave, Spitters’ shots, and elite projectile
   patterns create movement decisions rather than invisible or unavoidable
   damage? Do elite warnings and large XP drops feel meaningful?
9. **Boss/end flow.** If you reach 6:10–8:00, does the warning, entrance, boss
   health bar, and deadline make the win condition clear? At terminal, does
   **Continue to upgrades** return to the correct prep screen?
10. **Sound, if enabled.** Which moments need clearer feedback? Please call out
    attacks, hits, pickups, upgrade selection, the boss, and terminal results
    separately rather than only saying “sound is missing.”

## Optional accelerated boss/run-flow check

Open the local URL with:

```
?autopilot=1&stress=1&fullrun=1
```

This deterministically picks the first available upgrade and runs until a
terminal outcome no later than the **8:00** boundary. It is useful for checking
the boss bar and terminal-to-prep flow, but it does not validate normal
difficulty or replace a hands-on run.

## What to report

Short answers are enough:

- One exciting moment and one frustrating moment.
- Movement: smooth, delayed, backwards, or confusing, with an example.
- Forest readability: too dark, too busy, helpful, or still hard to navigate.
- Attack clarity: which attack or Mythic was hard to understand, and why.
- Build decisions: did five active / five passive slots feel clear and
  interesting, or did a card feel like a trap?
- Pressure: when did the run become exciting, unfair, boring, or safely
  stationary?
- Enemy behavior: runner, Spitter, elite, or boss behavior that felt especially
  good or bad.
- UI: whether the live HUD was sufficient and whether the pause panel was easy
  to find and understand.
- Sound: specific missing, unclear, loud, or useful events, if enabled.
- End flow: whether Essence, Starting Vitality, and the next-run prep screen
  made sense.

## Current boundary

Forest Arsenal is an early alpha with a compact first attack catalog. Final art,
audio, enemy variety, larger attack pools, difficulty modes, physical-touch
testing, low-end-device testing, and external human playtesting remain open.
