# Visual Readability — Human Review Checklist

This is the human-evidence companion to the automated capture packet. It is
intentionally not pre-filled: an AI capture or technical review cannot sign it
on a person's behalf.

## Standard and agreement rule

Use three independent reviewers who have not been coached on the expected
answer. The overhaul meets the human visual standard only when all three mark
every required observation as pass, give overall readability at least 4/5, and
record no unresolved safety or clarity issue. A single failure is evidence for
another bounded correction, not a reason to average it away.

## Start a controlled run

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm run dev
```

Open [the controlled Scout run](http://localhost:5173/?hero=greg&seed=1234).
Repeat the short motion check with `hero=benny` and `hero=gracie`. Use normal
play; `autopilot`, `stress`, and diagnostics are engineering tools, not human
playtest evidence.

## Five-minute route

1. At 0:10, 1:00, and 3:00, find Scout without following the cursor. The ivory
   double-ring anchor should make her location immediate without reading as an
   attack area.
2. Between 0:20 and 1:00, move, stop, reverse, and circle. Scout should show a
   visible stride, turn, and calm idle; Benny should feel heavier and Gracie
   quicker, without any hero sliding across the ground.
3. Watch the first ranged Spitter twice. First notice the coral aim cue, then
   the coral projectile and its directional tail/muzzle origin. Decide whether
   the shot was readable before it mattered.
4. At level 8 or above, name each player attack you see and point to its brief
   cast cue at the hero. Confirm the screen never feels like more than roughly
   three competing attack families at once.
5. During dense contact, compare the quiet nearby-contact rings with a real
   projectile, charger lane, or boss telegraph. Incoming danger must clearly
   outrank the ring.
6. From 4:45 onward, observe the Final Threat. Its arena-scale charge/volley
   warning should be readable without a sudden blinding pop or repeated flash.

## Reviewer form

| Reviewer | Date / display | S1 hero found instantly | S2 enemies countable | S3 cue before shot | S4 projectile trackable | S5 charger/boss tell | S6 danger over rings | S7 attacks attributable | S8 palette clear | S9 gait visible | S10 no troubling flash | Overall 1–5 | Notes / exact moment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A |  | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail |  |  |
| B |  | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail |  |  |
| C |  | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail | Pass / Fail |  |  |

## Decision

- Panel agreement: `PASS / NEEDS CORRECTION`
- Any reviewer or criterion that blocked agreement:
- Owner decision and date:

The capture packet can establish deterministic engineering behavior, bounded
performance, and luminance evidence. This completed form is the separate
evidence required for a genuine human visual-approval claim.
