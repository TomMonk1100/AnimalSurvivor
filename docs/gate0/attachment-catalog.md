# Gate 0 Attachment Catalog

## Design contract

- Every trait is useful before evolution.
- Each Mythic requires both paired traits at Adapted stage, keeps both sockets
  occupied, and replaces their separate behavior loops with one combined loop.
- Attacks automatically choose the nearest enemy, densest cluster, high-health
  target, or marked target. Movement can charge or orient an attack, but the
  player never aims or presses an attack button.
- A finished hero carries no more than one dominant, one supporting, and one
  accent silhouette change. Companions, markings, and floor effects communicate
  the rest of the build.
- Each Mythic uses a shared color/material bridge between its two body parts so
  the recipe reads as one creature rather than two props.

## 1. Porcupine Quills

- **Socket:** Back
- **Bud:** Five short rounded quills in a tidy dorsal fan.
- **Adapted:** Nine swept-back quills with pulsing tips.
- **Mythic:** Hollow breathing quills unfold into a flower-like storm mantle.
- **Automatic behavior:** Every 2.2 seconds, fire into the densest nearby sector;
  very close enemies trigger a wider defensive burst.
- **Tags:** `projectile`, `burst`, `radial`, `back`, `defense`
- **Pair:** Puffer Pouch → **Thornstorm Mantle**
- **Readability:** Cap the visible set at nine. Friendly quills use one saturated
  color and thin trails; never cover the face or feet.

## 2. Puffer Pouch

- **Socket:** Head/Throat
- **Bud:** Small soft throat pouch below the jaw.
- **Adapted:** Ribbed twin cheek pouches that inflate in sequence.
- **Mythic:** Armored bellows with glowing veins connected to the back quills.
- **Automatic behavior:** Every 4 seconds, telegraph a 0.45-second inhale that
  gathers fodder, then exhale a low-damage knockback pulse.
- **Tags:** `pulse`, `gather`, `knockback`, `head`, `setup`
- **Pair:** Porcupine Quills → **Thornstorm Mantle**
- **Readability:** Inflation is the tell. Pouches stay below the eyes; the pull is
  a thin friendly circle, not a full-screen distortion.

## 3. Electric Eel Coil

- **Socket:** Tail
- **Bud:** Smooth striped cuff around the tail tip.
- **Adapted:** Longer finned coil with sparks and a filling charge band.
- **Mythic:** Bifurcated living cable-tail with conductor nodes.
- **Automatic behavior:** Gain one charge per distance moved, up to three; spend
  charges on chain lightning from the closest enemy, favoring rear threats.
- **Tags:** `shock`, `chain`, `movement`, `rear`, `charge`
- **Pair:** Firefly Colony → **Thunderbug Dynamo**
- **Readability:** The tail displays charge without the HUD. Lightning has a hard
  jump limit and never becomes a persistent screen web.

## 4. Firefly Colony

- **Socket:** Aura/Companion
- **Bud:** Two round fireflies orbit above shoulder height.
- **Adapted:** Four bugs in a stable ring, briefly spotlighting targets.
- **Mythic:** Six conductor bugs with crown-like antennae and short electrical
  links.
- **Automatic behavior:** Independently mark nearby enemies, then make short
  damage dives while prioritizing unmarked targets.
- **Tags:** `companion`, `orbit`, `mark`, `shock`, `support`
- **Pair:** Electric Eel Coil → **Thunderbug Dynamo**
- **Readability:** Orbit above the ground plane and move unlike bullets.

## 5. Mantis Scythes

- **Socket:** Forelimbs
- **Bud:** Small curved blade guards on both forelimbs.
- **Adapted:** Long paired scythes, one bright and one dark, attacking in alternation.
- **Mythic:** Translucent saw-limbs with one strange extra folding joint.
- **Automatic behavior:** Alternate left/right cleaves at the nearest target in
  the forward hemisphere; execute low-health enemies.
- **Tags:** `melee`, `cleave`, `forward`, `execute`, `forelimb`
- **Pair:** Gecko Pads → **Razorstep Chimera**
- **Readability:** Blades extend sideways/backward, never across the face. Narrow
  arcs vanish quickly.

## 6. Gecko Pads

- **Socket:** Hindlimbs
- **Bud:** Bright circular toe discs.
- **Adapted:** Wider webbed pads that leave glossy footprints.
- **Mythic:** Luminous membrane feet connected to sticky patches by thin strands.
- **Automatic behavior:** Drop a slowing damage patch after each distance
  threshold; while stationary, create one on a slower fallback timer.
- **Tags:** `trail`, `slow`, `movement`, `control`, `hindlimb`
- **Pair:** Mantis Scythes → **Razorstep Chimera**
- **Readability:** Maximum five live mint hexagonal footprints with obvious fade
  timers; never resemble red enemy hazards.

## 7. Owl Pinions

- **Socket:** Back
- **Bud:** Two compact folded shoulder-feather fans.
- **Adapted:** Broad half-wings with bright eye spots.
- **Mythic:** Dark crescent wings with rotating eye patterns and radar vanes.
- **Automatic behavior:** Every 2.8 seconds, release three slow homing feathers
  toward high-health enemies.
- **Tags:** `projectile`, `homing`, `elite`, `back`, `precision`
- **Pair:** Bat Ears → **Midnight Radar**
- **Readability:** Wings remain half-folded during movement. Friendly feathers are
  broad leaf shapes, not small enemy-bullet dots.

## 8. Bat Ears

- **Socket:** Head
- **Bud:** Two small leaf-shaped ear fins.
- **Adapted:** Large ridged ears that pulse outward.
- **Mythic:** Nested triple ear-petals whose ridges light in sequence.
- **Automatic behavior:** Send a rotating sonar sector every 3.5 seconds; scanned
  enemies expose weak points and take increased critical damage.
- **Tags:** `scan`, `mark`, `critical`, `head`, `support`
- **Pair:** Owl Pinions → **Midnight Radar**
- **Readability:** Ears grow upward rather than forward. Sonar is a brief outline;
  weak points use one crisp marker.

## 9. Crab Pincers

- **Socket:** Forelimbs
- **Bud:** Glove-sized rounded pincers.
- **Adapted:** Asymmetric crusher and catcher claws.
- **Mythic:** Cratered stone claws with pulsing seams.
- **Automatic behavior:** Alternate short clamps at the closest enemy. The
  catcher absorbs one hostile projectile on cooldown and stores shell charge.
- **Tags:** `melee`, `block`, `counter`, `forelimb`, `armor`
- **Pair:** Armadillo Greaves → **Meteor Mauler**
- **Readability:** Only the crusher becomes silhouette-dominant. Stored charge is
  one pip rather than a captured projectile left onscreen.

## 10. Armadillo Greaves

- **Socket:** Hindlimbs
- **Bud:** Small overlapping ankle plates.
- **Adapted:** Layered shin armor with rounded heel plates.
- **Mythic:** Meteor-pocked plates fused visually to the pincer seams.
- **Automatic behavior:** After sufficient movement, or a slower stationary
  timer, trigger a ground stomp with knockback and a brief armor window.
- **Tags:** `stomp`, `movement`, `knockback`, `armor`, `hindlimb`
- **Pair:** Crab Pincers → **Meteor Mauler**
- **Readability:** Preserve ground contact. Use one sharp ring and chunky wedges,
  never a dust cloud that hides hazards.

## 11. Skunk Brush

- **Socket:** Tail
- **Bud:** Small striped plume over the tail.
- **Adapted:** Large split plume with a visible puffing nozzle.
- **Mythic:** Strange flower-like multi-lobed sprayer in royal colors.
- **Automatic behavior:** Drop a lingering scent puff by movement distance;
  enemies take damage over time and lose pursuit speed.
- **Tags:** `trail`, `damage-over-time`, `slow`, `tail`, `zone`
- **Pair:** Monarch Brood → **Royal Stinkcloud**
- **Readability:** Maximum four low translucent ground wisps. Keep the plume
  behind the body and below the eyes.

## 12. Monarch Brood

- **Socket:** Aura/Companion
- **Bud:** Two chunky orange-and-black butterflies.
- **Adapted:** Four butterflies with a sparse gold dust ring.
- **Mythic:** A crowned moth and attendants joined by glowing spore threads.
- **Automatic behavior:** One butterfly at a time dusts the densest cluster,
  dealing light damage and briefly confusing weak enemies.
- **Tags:** `companion`, `charm`, `area`, `aura`, `catalyst`
- **Pair:** Skunk Brush → **Royal Stinkcloud**
- **Readability:** Slow flapping distinguishes them from bullets. Confusion uses
  one small spiral rather than recoloring enemies.

## Six Mythic recipes

| Mythic | Recipe | Combined automatic behavior | Visual payoff |
| --- | --- | --- | --- |
| **Thornstorm Mantle** | Porcupine Quills + Puffer Pouch | Inhale gathers fodder and inflates quills; exhale fires a full ring. Three retained quills each block one hit. | Bellows veins feed a breathing quill flower. Cute defense becomes a respiratory weapon. |
| **Thunderbug Dynamo** | Electric Eel Coil + Firefly Colony | Movement charges the tail; bugs mark enemies and become relays. Discharge jumps tail → bugs → marks. | The hero is wired into a living bug crown by short readable filaments. |
| **Razorstep Chimera** | Mantis Scythes + Gecko Pads | Sticky patches tether enemies; alternating scythes send cutting afterimages from patches to tethered targets. | Luminous strands connect webbed feet, patches, and multi-jointed blades. |
| **Midnight Radar** | Owl Pinions + Bat Ears | A full sonar sweep exposes weak points; the next feather volley bends toward them and retargets excess shots. | Ear-petals pulse into crescent radar wings with rotating eye spots. |
| **Meteor Mauler** | Crab Pincers + Armadillo Greaves | Projectile catches charge the next distance-triggered armored stomp, crater, and twin outward claw smash. | Claws and greaves become one cracked stone exoskeleton. |
| **Royal Stinkcloud** | Skunk Brush + Monarch Brood | Scent charms weak enemies; at expiry, monarch dust bursts each cloud into a brief attacking butterfly swarm. | The tail opens like an impossible striped flower while a crowned moth court pollinates it. |

## Three hero roles

### Pouncer

- Fast forward-pressure chassis with lower durability.
- **Automatic instinct — Rush Rake:** movement charges a three-wave claw burst
  into the nearest cluster in the movement-facing hemisphere. Near-misses reduce
  the required distance.
- Best first chassis: Quaternius fox, subject to actual import verification.

### Bastion

- Slow defensive chassis with health and knockback resistance.
- **Automatic instinct — Brace Bloom:** periodically grow a one-hit guard. When
  struck or expired, release a shockwave modified by defensive attachments.
- Needs a stocky chassis and clear back volume.

### Surveyor

- Medium-speed precision/control chassis.
- **Automatic instinct — Keen Orbit:** a neutral scout marks the highest-health
  visible enemy; the first hit on a new mark critically splashes a weaker mark.
- Needs a clean head silhouette and companion orbit space.

