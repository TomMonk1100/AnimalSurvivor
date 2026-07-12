# Progression Roadmap — Forest Arsenal Alpha

## Current playable milestone

Forest Arsenal is the current Greg alpha: an eight-minute, build-making survival
run in which the player moves, auto-attacks, levels without a visible level cap,
chooses attacks and passives, faces rising off-screen pressure, and earns
Essence after an attempt.

The aim is a clear first version of the bullet-heaven decision loop, not a claim
that the catalog, balance, art, or progression are complete. The first owner
playtest confirmed that approach waves, weaving enemies, and ranged pressure
can be exciting; this pass adds a readable forest clearing, a tighter
eight-minute pacing target, and a larger first attack set.

## Per-run build rules

### Active attacks: five slots

Greg begins with **Auto-Fire**, which occupies one active-attack slot. He can
choose up to four of six available trait families:

1. **Porcupine Quills** — targeted 3/5-quill piercing volleys.
2. **Puffer Pouch** — gather, then Adapted knockback control.
3. **Electric Eel Coil** — an instant strike on the nearest threat that chains
   to nearby unhit foes (1 chain at Bud, 3 at Adapted).
4. **Firefly Colony** — two-to-four orbiting fireflies that damage enemies on contact.
5. **Mantis Scythes** — a close-range, auto-aimed directional scythe sweep.
6. **Gecko Pads** — after Greg travels 150 units, create a damaging pad at his
   feet; Adapted pads recur after 110 units. They damage but do not slow.

Each animal attack can progress from Bud to Adapted. The current three Mythics
combine a pair of Adapted attacks:

- **Thornstorm Mantle**: Quills + Pouch; telegraph, gather, then radial quills.
- **Thunderbug Dynamo**: Coil + Colony; telegraph, then release a larger chain
  discharge across nearby enemies.
- **Razorstep Chimera**: Adapted Mantis Scythes + Adapted Gecko Pads; movement
  leaves stronger scythe pads every 90 units.

A Mythic retains both ingredient footprints. It is stronger combined content,
not a loophole that creates a free sixth weapon slot. This makes the current
loadout contract: **starter + up to four acquired attacks = five active slots**.

The long-term target is a broader candidate pool than any single run can carry.
Forest Arsenal establishes the slot, acquisition, evolution, visual, replay,
and presentation rules first; future attacks need the same complete contract
before they appear as real choices.

### Neutral passives: five distinct choices

The current neutral candidates are:

- **Swift Paws** — movement speed.
- **XP Magnet** — larger collection radius and visible XP-mote attraction.
- **Sturdy Hide** — maximum health.
- **Sharpened Instinct** — damage for every attack.
- **Rapid Instinct** — cooldown reduction for every attack.
- **Growth** — XP gained.

A run can claim **five distinct neutral passives**. Once chosen, a passive may
continue to receive rank-up offers until its own rank cap. Once all five
distinct slots are committed, a sixth untouched passive is not a legal choice.
This makes the passive build a commitment rather than a rotating allowance.

There is no player-visible maximum level. If all finite attack and passive
options are exhausted, **Essence Cache** remains a repeatable level-up fallback.

### Build information and meta progression

During combat, the HUD stays focused on immediate play rather than cycling
attack descriptions. The **pause panel** is the durable build reference: it
lists active attacks, their slot cost, and selected neutral ranks.

At the end of a run, earned **Essence** is settled once. The prep screen can
spend it on capped **Starting Vitality**, which applies only to the next fresh
run and is intentionally absent from active combat.

## Eight-minute pressure curve

Normal mode ends at **8:00** with no overtime. The boss arrives at **6:30**;
defeat it by 8:00 to win.

| Time | Phase | Intent |
| --- | --- | --- |
| 0:00–1:00 | Opening | Read movement, XP, and the first approach waves. |
| 1:00–3:00 | Pressure | Introduce faster waves, runners, and Spitters. |
| 3:00–5:00 | Adaptation | Raise density and reward stronger builds. |
| 5:00–6:30 | Mutation | Sustain the most demanding pre-boss pressure. |
| 6:30–8:00 | Boss | Force a decisive final fight. |

Elites are requested at **2:00**, **3:40**, **4:30**, **5:15**, **5:45**, and
**6:05**, each with a five-second warning. The boss warning begins at **6:10**.
Ordinary formations begin beyond the camera boundary so they approach Greg
instead of appearing inside weapon range. Runners weave, Spitters and elites
use ranged pressure, and elites drop larger XP rewards.

The exact cadence, caps, placement, health, and reward values are authored,
deterministic tuning. They are expected to change only in response to focused
playtest evidence, with replay-safe definitions and no same-tick wave burst.

## What is deliberately not shipped

- **Luck** is not a truthful card yet. It needs a real rarity, offer, chest, or
  drop system before it can affect a run.
- Player-selectable harder modes and **Hardcore Endless** are future work.
  Endless should be a chosen mode after the ordinary meta loop and normal
  difficulty are proven, not a hidden extension of normal mode.
- More active attacks, broader enemy patterns, final art, final audio, and
  production-scale meta progression need their own deterministic and playtest
  contracts.

## Next validation sequence

1. Run hands-on Forest Arsenal playtests. Check forest readability, whether the
   eight-minute curve feels urgent, whether off-screen waves read fairly, and
   whether standing still remains unsafe as pressure rises.
2. Check attack clarity: players should understand what each of the six
   candidates does, why a Mythic needs two slots, and where to inspect a build
   without on-screen combat clutter.
3. Tune only evidence-backed pressure and attack values, then repeat
   deterministic replay and browser checks.
4. Expand the attack candidate pool beyond the current six families so future
   runs make more meaningful five-slot choices.
5. After the normal/meta loop is enjoyable, design selectable difficulties and
   Hardcore Endless from explicit authored definitions.
