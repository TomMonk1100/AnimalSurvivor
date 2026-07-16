# Progression Roadmap — Forest Arsenal Alpha

## Current playable milestone

Forest Arsenal is the current founding-roster alpha: a six-minute,
build-making survival run in which the player moves, auto-attacks, levels
without a visible level cap, chooses attacks and passives, faces rising
off-screen pressure, and earns Essence after an attempt.

The aim is a clear first version of the bullet-heaven decision loop, not a claim
that the catalog, balance, art, or progression are complete. The first owner
playtest confirmed that approach waves, weaving enemies, and ranged pressure
can be exciting; this pass adds a readable forest clearing, a tighter
six-minute pacing target, and a larger first attack set.

## Per-run build rules

### Active attacks: five cards and Wild Splice

Each founding animal begins with a distinct starter attack and can choose up to
four of 12 available trait families, for five active cards:

1. **Porcupine Quills** — targeted piercing volleys.
2. **Puffer Pouch** — gather and knockback control.
3. **Electric Eel Coil** — nearest-threat strike that chains to nearby unhit foes.
4. **Firefly Colony** — orbiting contact fireflies.
5. **Mantis Scythes** — close-range, auto-aimed directional sweep.
6. **Gecko Pads** — movement-triggered damaging pads that do not slow.
7. **Owl Pinions** — nearest-threat feather spread.
8. **Bat Ears** — cluster marks that direct automatic targeting.
9. **Crab Pincers** — compact area strike.
10. **Armadillo Greaves** — defensive crowd shove.
11. **Skunk Brush** — damaging stink cloud.
12. **Monarch Brood** — orbiting contact butterflies.

Every animal attack progresses from Bud through Adapted to **Master** at rank
five. When any two enabled Master attacks are owned, the player can explicitly
take a free **Wild Splice**. All 66 unordered pairs are legal. The former six
authored recipes remain signature **Perfect Pairs** (Thornstorm Mantle,
Thunderbug Dynamo, Razorstep Chimera, Midnight Radar, Meteor Mauler, and Royal
Stinkcloud). The six all-utility combinations resolve as **Support Chimeras**;
a run may hold one Support Chimera at most.

A Wild Splice turns two logical acquired attacks into one terminal Chimera,
thereby freeing an acquired slot without exceeding the starter-plus-four
contract. Its two parents keep their attachment footprint on the animal and
appear as a braid in build details, but the Chimera cannot gain ranks or
re-fuse in this version. This makes the active-loadout contract:
**starter + up to four acquired logical slots = five active cards**. The splice
economy creates room for a new acquired attack and permits a ceiling of three
terminal Chimeras in one run.

The long-term target is a broader candidate pool than any single run can carry.
Forest Arsenal establishes the slot, acquisition, evolution, visual, replay,
and presentation rules first; future attacks need the same complete contract
before they appear as real choices.

### Neutral passives: five distinct choices

The current neutral candidates are:

- **Swift Paws** — movement speed.
- **XP Magnet** — larger collection radius and visible XP-mote attraction.
- **Sturdy Hide** — maximum health and a current-health restore when selected.
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

## Six-minute pressure curve

Normal mode ends at **6:00** with no overtime. The boss arrives at **4:45**;
defeat it by 6:00 to win.

| Time | Phase | Intent |
| --- | --- | --- |
| 0:00–0:45 | Opening | Read movement, XP, and the first approach waves. |
| 0:45–2:15 | Pressure | Introduce faster waves, runners, and Spitters. |
| 2:15–3:45 | Adaptation | Raise density and reward stronger builds. |
| 3:45–4:45 | Mutation | Sustain the most demanding pre-boss pressure. |
| 4:45–6:00 | Boss | Force a decisive final fight. |

Elites are requested at **1:10**, **2:25**, **3:15**, **3:55**, **4:15**, and
**4:35**, each with a five-second warning. The boss warning begins at **4:25**.
Ordinary formations begin beyond the camera boundary so they approach Greg
instead of appearing inside weapon range. Runners weave, Spitters and elites
use ranged pressure, and elites drop larger XP rewards.

The exact cadence, caps, placement, health, and reward values are authored,
deterministic tuning. They are expected to change only in response to focused
playtest evidence, with replay-safe definitions and no same-tick wave burst.
V1.2 compresses the curve, increases approach pressure, and gives the apex a
versioned boss profile. It still needs a fresh human retest before any balance
conclusion is claimed.

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

1. Run hands-on Forest Arsenal playtests, including the cleanup's early fodder,
   XP, and Adaptation retune. Check forest readability, whether the six-minute
   curve feels urgent, whether off-screen waves read fairly, and whether standing
   still remains unsafe as pressure rises.
2. Check attack clarity: players should understand the 12 candidates, that any
   two enabled Masters can form a Wild Splice, the distinction between Perfect
   Pairs and Support Chimeras, the one-Support cap, the five-card limit and
   three-terminal-Chimera ceiling, and where the freed-slot and parent-braid
   details appear without on-screen combat clutter.
3. Tune only evidence-backed pressure and attack values, then repeat
   deterministic replay and browser checks.
4. Expand the attack candidate pool beyond the current 12 families so future
   runs make more meaningful five-card choices.
5. After the normal/meta loop is enjoyable, design selectable difficulties and
   Hardcore Endless from explicit authored definitions.
