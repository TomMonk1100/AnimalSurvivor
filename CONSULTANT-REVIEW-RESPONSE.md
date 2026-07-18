# Animal Survivor — Response to External Design Review

**Review assessed:** `CONSULTANT-GAME-REVIEW.md`
**Assessment date:** 2026-07-17
**Project milestone:** V1.2 playtest candidate

Thank you for the detailed review. We compared its findings with the current
simulation, encounter director, progression systems, browser presentation, and
captured playtest evidence.

The central diagnosis is accepted: **Animal Survivor currently delivers player
power more successfully than it delivers pressure.** The engineering foundation,
six-minute structure, hero kits, and Wild Splice system are strong, but the
active run does not consistently force meaningful movement decisions. Until
that changes, improvements to offers, progression, and presentation cannot
fully solve the core engagement problem.

## Findings we agree with

### 1. The threat curve is the highest-priority problem

The current evidence supports the review's conclusion:

- A stationary clean baseline reaches the six-minute deadline alive, with the
  boss still at 27.6% health.
- The project's intended target says safe stationary play should disappear by
  approximately 1:00–1:15.
- The encounter director's opening caps are 12 soft / 20 hard. Adaptation uses
  32 soft / 50 hard.
- Player-level pressure is deliberately modest and capped: it adds at most
  three enemies to the soft cap and six to the hard cap.
- The first XP thresholds are 4, 10, and 18, so early kills can produce several
  upgrade interruptions before the combat rhythm has formed.

This confirms a mismatch between the authored pressure curve and the intended
survivors-game experience. Movement is the player's primary verb; the encounter
must repeatedly create reasons to move, redirect, or carve an escape route.

We also agree that pressure is not merely a question of total enemy count.
Convergence, spawn distance, formation behavior, enemy proximity, and the number
of enemies presenting an immediate threat are at least as important as the live
cap.

### 2. Early upgrades interrupt too often

The reported upgrade timing is consistent with the current XP curve. Multiple
full-screen choices can arrive before the player has enough uninterrupted combat
time to understand or feel the previous choice.

Ranks 3–5 currently improve real gameplay values—including damage, cadence,
reach, count, chains, or pierce—but usually preserve the same underlying attack
behavior and visual family. We agree that milestone ranks should produce more
recognizable mechanical changes, particularly at rank 3 and Master.

### 3. Offers need more identity and agency

The shared trait catalog and seeded priority system can produce the same early
trait offers for every hero when the same seed is used. Hero choice changes the
starter, attributes, defenses, and mastery path, but does not sufficiently alter
the trait decisions presented during a run.

Hero weighting and limited offer agency are worthwhile directions. They should
follow the pressure-and-tempo work so they are evaluated inside a compelling
combat loop.

### 4. Readability still requires human validation

The technical readability overhaul has strong automated and capture evidence,
but that evidence was never intended to establish human approval. The cited
3:00 frame still demonstrates the risk: dark enemies, a dark environment, small
reward motes, and significant activity near the edges of the playable view.

Enemy/ground separation, reward visibility, and hero anchoring should be judged
again after the threat curve changes. A denser encounter may expose readability
problems that are not visible at the current population.

### 5. Card language is too technical

The truthful impact system is valuable, but values such as simulation ticks are
not suitable as the primary player-facing explanation. Cards should lead with
the fantasy and felt result, followed by concise comparative values. Exact
simulation details can remain available as secondary or inspection information.

### 6. Permanent progression needs content milestones

The permanent shop contains eleven stat lines costing 2,855 Essence in total.
Those upgrades are functional, but they primarily increase numbers rather than
change future decisions or unlock new ways to play.

The project already includes Saltwind Ruins, Field Guide progression, habitats,
challenges, palettes, and Chimera discovery. Even so, the review's main point is
accepted: the purchasable progression path needs more content-bearing rewards,
such as attack-pool unlocks, loadout options, heroes, or modes.

### 7. Terminal framing and naming need cleanup

The current time-expiry summary says only that the boss remained alive at 6:00.
Showing remaining boss health would create a clearer near-miss story and a
stronger reason to retry.

The Scout/Greg/Fox/Dog naming collision is also real. Copy such as "Scout's
Scout Swipe" demonstrates that internal identifiers, legacy identity, and the
current player-facing identity have not been reconciled consistently.

## Qualifications and corrections

The recommendations are useful design hypotheses, but several should not be
treated as implementation-ready numeric specifications.

### Enemy counts need measured tuning

The suggested 3–4x increase and targets of 150–250 enemies are reasonable
experiments, not yet validated goals. An allocation cap of 1,200 and a stress
renderer for large populations do not by themselves prove that full combat,
projectiles, VFX, visual clarity, and low-end performance will remain acceptable
at those densities.

The metadata for the cited 3:00 Gracie capture records 29 live enemies. The
smaller number described in the review appears to be the number that were
visually apparent in the frame. This distinction is important: it suggests that
placement, convergence, and threat visibility must be tuned alongside raw
density.

We intend to use experiential targets rather than commit immediately to one
population number:

- A player who remains stationary after the opening should be defeated within
  a bounded and repeatable window.
- Ordinary play should require frequent directional decisions.
- A strong upgrade should create temporary relief before pressure rebuilds.
- Each phase should increase the number and diversity of immediate threats.
- Threat growth must remain readable and performant on the target hardware.

### Some existing content was understated

The game currently has eight ordinary enemy roles, distinct elite behavior,
Saltwind Ruins, a second named apex foundation, challenges, habitats, Field
Guide progression, and a broad Chimera discovery system. The review is still
correct that enemy novelty and content-bearing meta rewards need expansion, but
the current foundation is broader than a single boss plus HP-scaled reskins.

### Effort estimates are optimistic

Reroll and banish affect deterministic state, replay recording, serialization,
offer rules, interface behavior, and regression coverage. They remain good
ideas, but are not necessarily small changes within this architecture.

Similarly, content unlocks require versioned profile migration, offer-pool
rules, player-facing explanation, replay compatibility decisions, and complete
content validation. They should be treated as a deliberate progression packet,
not a quick shop revision.

### The playtest sample identifies risk, not population certainty

One experienced reviewer and one principal seed provide valuable qualitative
evidence. That evidence is sufficient to prioritize a problem, but it cannot by
itself establish representative retention, win rate, or universal player
sentiment. Those questions require additional fresh-player sessions after the
first corrective pass.

## Revised implementation order

We agree with the review's overall priorities, with one important adjustment:
threat density and XP cadence must be tuned together. Increasing kills without
changing XP would make the upgrade-interruption problem worse.

1. **Co-tune threat, convergence, and XP cadence.** Make the first three minutes
   require meaningful movement while moving the first upgrade into the intended
   0:25–0:40 window.
2. **Add deterministic pressure evidence.** Record stationary-death timing,
   first-level timing, live-enemy counts, proximity counts, and phase-by-phase
   pressure.
3. **Validate directed formations.** Test ring closures, lanes, pincers, and
   other deterministic pushes before relying entirely on larger caps.
4. **Run fresh manual sessions.** Test all three heroes across multiple seeds and
   collect human observations separately from automated evidence.
5. **Revalidate readability at the new density.** Prioritize enemy/ground
   separation, XP-mote visibility, hero anchoring, and damage/critical feedback.
6. **Improve comprehension and first impressions.** Rewrite card impact copy,
   reconcile naming, simplify the intro surface, and show boss health remaining
   on a timed defeat.
7. **Add offer identity and agency.** Evaluate hero-weighted pools, rerolls,
   banishes, and seed-sharing presentation.
8. **Build content-bearing meta progression.** Add unlocks only after the core
   six-minute run consistently produces tension, power spikes, and relief.

## Proposed next acceptance target

The next gameplay packet should aim to make the following statement true:

> During the first three minutes, the player must repeatedly reposition or
> carve an escape route; standing still after the opening is predictably fatal;
> the first upgrade arrives between approximately 0:25 and 0:40; and each pick
> has enough uninterrupted combat time to produce a visible, understandable
> change.

Automated checks should prove deterministic behavior, timing, replay safety,
and performance. They should not be presented as proof that the result is fun.
After the packet passes its engineering gates, the deciding evidence should be
fresh human playtests using multiple heroes and seeds.

## Closing assessment

The review is directionally strong and its most important conclusion is
accepted. The project does not primarily need more systems at this moment; it
needs the existing combat systems to generate a stronger emotional curve:

**dread → power spike → relief → greater dread.**

The immediate focus will therefore be encounter pressure, convergence, and
upgrade tempo. Offer variety, meta progression, and broader content will be
more valuable once that core loop is consistently engaging.
