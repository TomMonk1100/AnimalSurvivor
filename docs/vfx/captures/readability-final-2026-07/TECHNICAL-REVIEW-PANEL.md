# Visual Readability Overhaul — Technical Review Panel

**Date:** 2026-07-16 local time
**Verdict:** **3 / 3 technical reviewers approve the S1–S12 engineering evidence.**

This is a deliberately independent technical review record: each reviewer
inspected the rubric, underlying reports, and relevant compositor stills from a
different concern area. It is not a panel of humans and it does not turn the
technical verdict into human visual approval.

| Reviewer lane | Reviewed scope | Verdict | Material conclusion |
| --- | --- | --- | --- |
| Composition/readability | S1, S2, S9 | **APPROVE** | The ivory anchor remains distinct in normal headed evidence; nearby enemy bodies/contact shadows separate from the quieter ground; no-input idle frames keep the sampled hero unobscured without a visually active combat/defense overlay. |
| Combat/danger | S3–S8 | **APPROVE** | The in-range ranged inhale links to a real hostile shot 27 ticks later; coral projectile lifecycle is readable; the new near-camera charger lifecycle closes S5; all damaging player treatments have source/phase provenance. S6 remains a bounded technical claim only. |
| Evidence integrity | S1–S12 provenance and final gates | **APPROVE** | Focused Thornstorm and charger reports pass; the charger matches all 26 current source hashes; target-level rows are not misrepresented as aggregate passes; checked links resolve; `git diff --check` passes. |

## Corrective review trail

The panel did not approve the first draft of this evidence packet unchanged.
It required and received the following corrections:

1. The family-capture chooser was fixed so a second real upgrade modal cannot
   freeze a normal run after the primary match.
2. The ranged proof now requires a real in-range enemy with `attackCharge >=
   0.85`, followed by an authentic source-3 shot frame.
3. The Mantis proof requires a resolved melee arc, not a generic or unresolved
   snapshot.
4. Thornstorm was recaptured against the final renderer source set rather than
   relying on an aggregate-false gallery report.
5. Charger evidence now rejects snapshots farther than 180 world units from
   the player; the passing capture is at 159.73 and contains visible
   windup/read/release stills.
6. Idle wording now truthfully says **no-input**, rather than asserting that
   live enemies or combat events were absent.

## Evidence used

- [S1–S12 rubric and command record](RUBRIC.md)
- [Damaging-source lifecycle closure](ATTACK-FAMILY-CLOSURE.md)
- [Near-camera charger report](../readability-final-2026-07-charger-closure-r4/report.json)
- [Final-source Thornstorm report](../readability-final-2026-07-thornstorm-closure-r2/report.json)

## Human decision remains open

These reviewers certify that the implemented renderer changes and supplied
technical evidence meet the plan's engineering acceptance conditions. They do
**not** certify that people can find the hero, react to shots, recognize every
attack, or prefer the warning hierarchy on real displays.

The new human visual-standard condition remains: three independent, uncoached
people must complete the unfilled
[owner checklist](../../../playtests/visual-readability-owner-checklist.md).
Until then, status is **technical visual evidence passed; human visual approval
pending**.
