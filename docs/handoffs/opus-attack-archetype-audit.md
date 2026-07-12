# Opus Swarm Brief: Survivor Attack Archetype Audit

## Mission

Research the attack families that make *Vampire Survivors* and comparable
survivor-likes feel meaningfully different, then return an implementation-ready
combat design audit for **AnimalSurvivor**. This is a research and design task:
do not need repository or GitHub access, and do not write code.

The immediate playtest problem is clear: several attacks read as variations of
Greg's basic aimed projectile. **Electric Eel Coil has now been converted** to
a reliable, low-damage lightning strike that never misses its acquired target
and chains to more targets as it upgrades. Audit that choice, then focus the
report on the remaining overlap and the smallest next set of distinct families.

## Product context

- Game: a readable, eight-minute survivor-like starring Greg, a small forest
  animal hero.
- Each run has Greg's starter auto-fire plus up to **four** selected attacks.
  A build therefore has a maximum of **five active attack slots**. It can also
  choose passive/neutral upgrades.
- Current attack candidates are: Porcupine Quills, Puffer Pouch, Electric Eel
  Coil, Firefly Colony, Mantis Scythes, and Gecko Pads. A player cannot take
  all six at once.
- Two Adapted attacks can merge into a Mythic while retaining both occupied
  slots: Quills + Pouch = Thornstorm Mantle; Coil + Colony = Thunderbug Dynamo;
  Mantis + Gecko = Razorstep Chimera.
- Gameplay simulation is fixed-tick and deterministic. Every attack must have
  explicit target rules, bounded work, reproducible tie-breaking, and a clear
  renderer-facing visual cue. Avoid vague/random-only designs.
- We are in early alpha. We want a small, coherent first arsenal, not twenty
  half-built weapons.

## Current implemented attack behaviors

| Attack | Current behavior | Intended role today |
| --- | --- | --- |
| Starter Auto-Fire | aimed physical projectile at a nearby enemy | reliable basic ranged damage |
| Porcupine Quills | aimed fan of 5/9 physical projectiles | defensive forward cone / crowd pressure |
| Puffer Pouch | gather pulse at Bud; knockback pulse at Adapted | positioning and crowd control |
| Electric Eel Coil | instant nearest-target strike; Bud chains once, Adapted chains three times | guaranteed strike / chain damage |
| Firefly Colony | 6/10 radial physical sparks | all-direction escape pressure |
| Mantis Scythes | instant nearest-target directional scythe arc | proximity risk/reward / front-sector cleave |
| Gecko Pads | damaging zones deposited only after player movement | kiting / route control |
| Thunderbug Dynamo | telegraph then an eight-target chain discharge | Coil + Firefly Mythic payoff |

### Current Coil implementation to audit

- Initial acquisition: nearest live enemy within the standard 350-unit combat
  range; no projectile is spawned.
- Bud: 4 damage, one extra unique hop, 120-unit hop radius, every 80 ticks.
- Adapted: 5 damage, three extra unique hops, 150-unit hop radius, every 52
  ticks.
- Thunderbug: 18-tick telegraph, then 9 damage across up to eight distinct
  targets with a 185-unit hop radius.
- Chain order is deterministic: closest valid target from the previous victim,
  with entity-ID tie breaking. A target cannot repeat in a cast.

## Questions to answer

1. Build a compact taxonomy of the major survivor-like attack archetypes. Use
   *Vampire Survivors* as the anchor, but describe mechanics rather than merely
   listing weapon names. Include, where relevant: aimed/volley projectile,
   piercing line, ricochet, radial burst, orbit/defense, aura, persistent zone,
   bombard/ground targeting, guaranteed strike/chain lightning, directional
   wave, companion/summon, control, screen clear, and any important omission.
2. Map every current AnimalSurvivor attack above to that taxonomy. Identify
   true duplicates, only superficial overlap, and why each attack should feel
   different during the first ten seconds after it is acquired.
3. Propose the smallest **shippable alpha** taxonomy: which 8–10 archetypes
   should eventually be represented, which of our current six already cover
   them, and which 2–4 should be built next. Split recommendations into
   **build now**, **next after that**, and **later / avoid for now**.
4. Review and refine the Electric Eel Coil spec. It must include:
   - target policy and acquisition range;
   - a never-miss, instantaneous hit (not a travelling projectile), which is
     already implemented in the current build;
   - low per-target damage;
   - Bud, Adapted, and Mythic-friendly progression where later stages chain to
     more *distinct* targets;
   - bounce range, maximum hits, no duplicate target hits, what happens with
     fewer targets, and deterministic tie-breaking;
   - what neutral upgrades should affect it (damage, attack speed, area/range,
     luck, etc.) and what should not;
   - a legible visual and sound cue that is not just another glowing bullet.
5. Suggest a one-line card description and one-line pause-panel description
   for each proposed core attack so players understand the trigger and result
   without a tutorial wall.
6. Identify common failure modes: guaranteed lightning that deletes bosses too
   quickly, chain rules that feel random, overlong screen effects, or attack
   families that are distinct on paper but identical in play.

## Required deliverable format

Return a single Markdown report with these sections, in this order:

1. **Executive recommendation** (max 250 words)
2. **Source-backed archetype taxonomy** (table)
3. **Current arsenal map and overlap diagnosis** (table)
4. **Electric Eel Coil: exact behavior specification** (table plus concise
   pseudocode, no engine-specific code)
5. **Prioritized first-arsenal roadmap** (Now / Next / Later)
6. **Card-copy suggestions**
7. **Risks and balance guardrails**
8. **Sources** — direct links for factual claims. Prefer official game pages,
   developer material, or well-maintained reference documentation. Clearly
   label design inference versus sourced fact.

## Quality bar

- Be decisive. Give concrete values/ranges when they help implementation.
- Do not assume homing projectiles are the same as a reliable strike.
- Do not recommend copying a large weapon list one-for-one. Explain the player
  decision each archetype creates in a five-slot build.
- Treat a visible visual identity and an audible identity as part of each
  attack's mechanics, not optional polish.
- The report must stand alone: a developer who never saw this conversation
  should be able to turn it into a backlog and a deterministic implementation
  spec.
