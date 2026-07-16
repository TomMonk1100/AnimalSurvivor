# Gate 1 Owner Playtest — Forest Arsenal and Founding Heroes

This is a short hands-on check for the current Forest Arsenal alpha and its
Greg/Benny/Gracie founding roster. It is not final-balance certification. Dying
before the boss is useful feedback if the pressure, enemies, or build choices
explain why it happened.

## Start the local build

From the project root:

```bash
cd apps/web-toy
npm run dev
```

Open the local address Vite prints in the terminal. Select a founding animal,
then choose **Start run**; the normal manual build waits at tick 0 until that
choice. Use the normal page for playtesting. `?hero=greg`, `?hero=benny`, and
`?hero=gracie` select a hero for repeatable comparison. `?autopilot=1`,
`?stress=1`, and `?fullrun=1` are engineering aids, not the recommended way to
judge the game.

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
- The selected animal attacks automatically; movement is the combat input.
- At an upgrade choice, use the mouse, **1**, **2**, or **3**, or **Tab** then
  **Enter**.
- Press **Esc** to pause/resume on desktop. Use the visible pause control for
  mouse or touch play.
- Sound effects are optional and off by default. If you enable them, note which
  cues feel useful, missing, distracting, or too quiet.

The forest clearing and the selected hero’s identity ring are intended to make
position and incoming threats legible. The selected hero's starting HP, speed,
pickup radius, and attack cadence are part of the run identity.
The live HUD should show only immediate context. To read your build, pause; do
not expect a persistent panel or repeated text at the top of the screen.

## What the run should do

Normal mode is a **6:00** run with no overtime:

| Time | Phase |
| --- | --- |
| 0:00–0:45 | Opening |
| 0:45–2:15 | Pressure |
| 2:15–3:45 | Adaptation |
| 3:45–4:45 | Mutation |
| 4:45–6:00 | Boss |

The boss warning starts at **4:25** and **The Final Threat** arrives at **4:45**.
Elite requests are at **1:10**, **2:25**, **3:15**, **3:55**, **4:15**, and
**4:35**, each after a five-second warning.

Every founding animal begins with a distinct starter attack and can choose up
to three of six additional attack families:

- **Porcupine Quills** — forward piercing volleys; Adapted adds wider coverage and deeper penetration.
- **Puffer Pouch** — gather, then Adapted push control.
- **Electric Eel Coil** — instant strike on the nearest threat, then chains to
  nearby unhit foes (1 at Bud, 3 at Adapted).
- **Firefly Colony** — orbiting fireflies that zap enemies when they make contact.
- **Mantis Scythes** — an auto-aimed narrow scythe sweep; Adapted widens and strengthens it.
- **Gecko Pads** — after the selected animal travels 150 units, leaves a
  damaging pad behind the moving animal; Adapted pads recur after 110 units.
  The pads damage but do not slow.
- **Skunk Brush** — places a damaging stink cloud on an enemy cluster ahead;
  Adapted makes the cloud larger and stronger.

Adapted Quills + Pouch can become **Thornstorm Mantle**. Adapted Coil + Colony
can become **Thunderbug Dynamo**, which telegraphs a larger chain discharge.
A Mythic keeps both of its ingredient slots:
the loadout remains a four-active-attack build, not five. Adapted Mantis Scythes
+ Adapted Gecko Pads can become **Razorstep Chimera**, which leaves stronger
scythe pads behind the moving animal every 90 units of movement. Adapted Skunk
Brush + Adapted Monarch Brood can become **Royal Stinkcloud**, which places a
larger monarch-crowned stink cloud on an enemy cluster ahead.

The neutral pool contains Swift Paws, XP Magnet, Sturdy Hide, Sharpened
Instinct, Rapid Instinct, and Growth. A run can choose five distinct neutral
passives, then rank selected ones further. Sharpened and Rapid should clearly
read as upgrades to every attack.

## Focused playtest

1. **Roster comparison.** Before starting, inspect all three cards. Can you
   explain each animal's silhouette and stat tradeoff? Run at least one short
   opening with two different heroes, ideally the slower Benny and wider-pickup
   Gracie, and record whether the differences are felt rather than merely read.
2. **First glance.** Before starting, can you explain the loop: move, survive,
   collect XP, choose upgrades, beat the boss before 6:00? Is the
   Essence/Starting Vitality section clearly a next-run decision?
3. **Movement and space.** Move and reverse in every direction. Does screen-up
   match Up? Does the forest clearing make your position and escape routes
   clearer than the old dark grid without making pickups or projectiles harder
   to see?
4. **HUD and clutter.** During combat, can you read health, XP, time, phase,
   and the immediate goal? Is the lack of repeated “what just fired” text a
   relief, or do you miss important information?
5. **Attack choices.** Pick at least two different attacks if offered. Can you
   tell what Quills, Puffer, Coil, orbiting Firefly, Mantis Scythes, and Gecko Pads are
   meant to do from their cards and their first use? Does Mantis visibly sweep
   toward its target without implying damage behind the selected animal? Does Gecko Pads clearly
   leave its damaging trail behind the moving animal rather than directly under it or imply a slow?
   If you choose Skunk Brush or Royal Stinkcloud, does its cloud land on an enemy cluster ahead,
   distinct from the selected animal's position? Circle tightly around a
   durable enemy: does pad damage feel strong without turning into a runaway
   stationary kill zone? Which feels most satisfying, weak, or confusing?
6. **Build limits.** Pause after taking upgrades. Can you find the active attack
   count and neutral passive count? Does starter + three acquired attacks make
   sense? If you see a Mythic, is it clear why it retains two slots?
7. **Neutral choices.** Take a neutral upgrade. Is its benefit understandable?
   If you take Sharpened Instinct or Rapid Instinct, does “every attack” make
   the decision feel worthwhile and believable?
8. **Pressure.** Do enemies enter from outside the screen and become more
   demanding from Opening through Mutation? Is there still a safe place to
   stand still? If you die, was the cause readable?
9. **Enemy behavior.** Do runners’ weave, Spitters’ shots, and elite projectile
   patterns create movement decisions rather than invisible or unavoidable
   damage? Do elite warnings and large XP drops feel meaningful?
10. **Boss/end flow.** If you reach 4:25–6:00, does the warning, entrance, boss
   health bar, and deadline make the win condition clear? At terminal, does
   **Continue to upgrades** return to the correct prep screen?
11. **Sound, if enabled.** Which moments need clearer feedback? Please call out
    attacks, hits, pickups, upgrade selection, the boss, and terminal results
    separately rather than only saying “sound is missing.”

## Optional accelerated boss/run-flow check

Open the local URL with:

```
?autopilot=1&stress=1&fullrun=1
```

This deterministically picks the first available upgrade and runs until a
terminal outcome no later than the **6:00** boundary. It is useful for checking
the boss bar and terminal-to-prep flow, but it does not validate normal
difficulty or replace a hands-on run.

## What to report

Short answers are enough:

- One exciting moment and one frustrating moment.
- Movement: smooth, delayed, backwards, or confusing, with an example.
- Hero comparison: which animal felt best to control, and did its stat tradeoff
  match the card? Could you still identify the selected animal during combat?
- Forest readability: too dark, too busy, helpful, or still hard to navigate.
- Attack clarity: which attack or Mythic was hard to understand, and why.
- Build decisions: did four active / five passive slots feel clear and
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
Hero-specific attack catalogs and automatic instincts are also deferred; this
pass validates the three shared-catalog starting profiles first.
