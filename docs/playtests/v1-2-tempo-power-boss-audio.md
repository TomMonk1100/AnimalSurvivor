# V1.2 Owner Playtest — Tempo, Power, Boss, and Music

This guide evaluates the V1.2 response to the first external feedback:
normal runs were too easy and long, movement/pressure felt slow, upgrades were
hard to feel, the final monster was too easy, and the music loop was too short.

Automated reports prove that the tuning is deterministic. They do **not** prove
that it is fair or fun; record a real hands-on response for every run below.

## Start a controlled run

From the repository root:

```bash
cd apps/web-toy
npm run dev
```

Open `http://localhost:5173/?hero=greg&seed=1234`. Use the normal page and
press **Start run**. Do not use `autopilot`, `stress`, or `fullrun` as a
difficulty verdict; those routes are engineering checks only.

Run two separate profiles:

1. **Fresh profile.** In the Field Guide, choose **Reset save**, then select
   Greg and use the fixed seed above. This separates normal-run tuning from
   permanent shop power.
2. **Earned profile.** Restore or retain a real progressed save. Before the
   run, note the permanent ranks shown on the prep screen, especially Might,
   Growth, Haste, Armor, Precision, Ferocity, and Evasion.

Repeat with Benny and Gracie after the Greg pass. Use the same seed for one
comparison; a second seed is useful only after the first result is recorded.

## Candidate acceptance targets

These are tuning hypotheses, not a claim that every player should match them
exactly.

| Moment or measure | Target |
| --- | --- |
| Normal-mode boundary | 6:00, with no hidden overtime |
| Boss warning / entrance | 4:25 warning, 4:45 entrance |
| Boss runway | 75 seconds |
| First meaningful need to move | 0:15–0:25 |
| First level-up choice | 0:25–0:40 |
| Safe stationary play | Should be gone by about 1:00–1:15 |
| Strong coherent build boss TTK | About 0:45–1:05, not an instant delete |
| Competent neutral-meta win rate | Roughly 35–55% across a small sample |
| Persistent music state | No obvious exact phrase loop within about 45 seconds |

## What to check during one run

1. **Opening and movement.** At what moment did standing still stop feeling
   safe? Did movement feel slow because Greg is slow, because enemies take too
   long to arrive, or because attacks lack cadence? Record the specific cause.
2. **Pressure.** Does danger increase in readable steps instead of suddenly
   becoming cluttered or unfair? Are enemy approach, runner pressure, and
   elite warnings enough to create movement decisions?
3. **Upgrade impact.** Pick at least one direct-damage card and one
   control/defense/economy card. Does the offer state the rank transition and
   intended effect? Does the immediate confirmation match what happens in the
   world? Utility cards must not be judged by damage numbers alone.
4. **Power curve.** Are you already deleting every threat before the first
   meaningful choice? If so, record the hero, permanent ranks, chosen cards,
   and timestamp. If a card feels weak, say whether its issue is damage,
   control, survivability, targeting, or explanation.
5. **Boss.** Does the warning prepare you? Does the final monster reach the
   player, force dodges, and remain readable? Record boss arrival HP, outcome,
   and approximate time from entrance to death or deadline. A longer health
   bar alone is not a success.
6. **Music.** Enable sound. Listen for the first minute and through a phase
   transition. Is the score varied enough to avoid a short repeating loop? Do
   phase changes feel like a musical escalation without a click or abrupt reset?

## Short report template

```text
Build / browser:
Hero / seed / biome:
Profile: fresh or earned (list meaningful permanent ranks):
Outcome / end time:
First danger / first level / first time stationary play felt unsafe:
Best upgrade and why:
Weak or confusing upgrade and why:
Boss arrival / boss TTK or deadline:
Too easy, fair, or unfair — where exactly:
Music repeat or transition note:
One exciting moment / one frustrating moment:
```

For technical follow-up, add `&debug=1` and use the upgrade proof panel. That
panel verifies simulation effects; the normal manual run remains the source of
truth for whether the pacing feels good.
