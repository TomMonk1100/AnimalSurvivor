# Animal Survivor

Animal Survivor is a web-first, low-poly 3D animal bullet-heaven game in active
Gate 1 development. The current playable alpha offers Greg the fox, Benny the
bull, and Gracie the alpaca in the **Forest Arsenal**: a deterministic survival
run with automatic attacks, level-up choices, evolving animal traits, enemy
pressure, a boss, and between-run Essence progression. Each founding animal has
an authored starting profile and a distinct low-poly silhouette.

It is an early playtest build, not a finished game. Feedback on clarity,
movement, attacks, pacing, and pressure is especially useful.

## Play locally

From the repository root:

```bash
cd apps/web-toy
npm ci
npm run dev
```

Open the local Vite address printed in the terminal, normally
`http://localhost:5173`.

- Select **Start run** to begin. Manual runs wait at tick 0 so the intro can be
  read first.
- Choose Greg, Benny, or Gracie on the prep card. The selection is saved locally
  and becomes part of the deterministic run identity.
- Move with **WASD**, the **arrow keys**, a standard gamepad's **left stick/D-pad**, or
  hold-drag on the arena with a mouse. On touch devices, drag in the lower-left virtual
  joystick.
- The selected animal attacks automatically; movement and positioning are the
  combat input.
- When a level-up pauses the run, choose a card with the mouse, **1**, **2**,
  or **3**, or ordinary **Tab** + **Enter** navigation.
- Press **Esc** on desktop, or use the visible Pause control, to pause and
  resume. The pause panel is the home for your current attacks and passive
  upgrades; combat itself deliberately stays free of repeating build text.

The arena is a readable forest clearing. Its trees, ground treatment, and
landmarks are presentation-only: they make movement and threat direction easier
to read without changing deterministic gameplay.

## Six-minute normal run

Normal mode has a hard **6:00** boundary and no hidden overtime. Survive and
defeat **The Final Threat** before that boundary to win.

| Time | Phase | What changes |
| --- | --- | --- |
| 0:00–0:45 | Opening | A readable first wave of off-screen approaches. |
| 0:45–2:15 | Pressure | Faster waves, runners, and ranged threats begin. |
| 2:15–3:45 | Adaptation | Density and mixed threats rise. |
| 3:45–4:45 | Mutation | The most sustained pre-boss pressure. |
| 4:45–6:00 | Boss | **The Final Threat** enters; end the run before 6:00. |

Elite requests arrive at **1:10**, **2:25**, **3:15**, **3:55**, **4:15**, and
**4:35**. Each gets a five-second warning. The boss warning starts at **4:25**.
Ordinary threats approach from outside the camera rather than spawning within
attack range. Runners weave, Spitters and elites use ranged pressure, and elite
kills award a noticeably larger XP pickup.

## Forest Arsenal loadout

Every founding animal begins with a distinct starter attack. The selected
animal can choose up to four of twelve additional attack families, for five
active cards total. Greg fires a precise nearest-target shot, Benny fires a
slower two-bolt Brace Burst, and Gracie fires a fast highest-health Keen Dart.

| Attack | Role |
| --- | --- |
| **Greg’s Auto-Fire** | Precise starter fire at the nearest enemy; movement charges a three-wave Rush Rake. |
| **Benny’s Brace Burst** | Heavy two-bolt starter spread. |
| **Gracie’s Keen Dart** | Fast starter dart aimed at the highest-health threat. |
| **Porcupine Quills** | Automatic targeted quill bursts. |
| **Puffer Pouch** | Pulls nearby enemies; its Adapted form pushes them back. |
| **Electric Eel Coil** | Fires charged bolts at the nearest enemy. |
| **Firefly Colony** | Releases sparks in every direction. |
| **Mantis Scythes** | Sweeps nearby enemies with a short-range damaging pulse. |
| **Gecko Pads** | After Greg travels 150 units, creates a damaging pad at his feet; Adapted pads recur after 110 units. Pads deal damage and do not slow enemies. |
| **Owl Pinions** | Fires a feather spread at the nearest threat. |
| **Bat Ears** | Sonar-marks a nearby enemy cluster; every automatic attack prioritizes marked prey. |
| **Crab Pincers** | Crushes a compact area around the selected animal. |
| **Armadillo Greaves** | Shoves nearby threats away from the selected animal. |
| **Skunk Brush** | Leaves a damaging stink cloud that punishes pursuit. |
| **Monarch Brood** | Summons orbiting butterflies that sting nearby enemies on contact. |

Each animal attack can be improved from Bud to Adapted to **Master** at rank
five. Any two enabled Masters can be explicitly fused through **Wild Splice**:
all 66 unordered pairs are available. The six former named recipes remain
signature **Perfect Pairs**:

- **Thornstorm Mantle** — Adapted Quills + Adapted Pouch: telegraph, gather,
  then a radial quill storm.
- **Thunderbug Dynamo** — Adapted Coil + Adapted Colony: charge, then a radial
  lightning storm.
- **Razorstep Chimera** — Adapted Mantis Scythes + Adapted Gecko Pads: movement
  leaves stronger scythe pads every 90 units.
- **Midnight Radar** — Adapted Bat Ears + Adapted Owl Pinions: marks a wide
  threat cluster for the marked hunt.
- **Meteor Mauler** — Adapted Crab Pincers + Adapted Armadillo Greaves: a
  heavy close-range impact crushes the nearest crowd.
- **Royal Stinkcloud** — Adapted Skunk Brush + Adapted Monarch Brood: creates a
  larger monarch-crowned hazard cloud.

The six all-utility pairs become **Support Chimeras**: their control effects
remain meaningful and receive a damage rider, but a run may own only one.
Every Wild Splice is free and voluntary. It turns two logical acquired attacks
into one terminal Chimera, freeing an acquired slot while retaining both parent
attachment footprints; the Chimera cannot rank further or re-fuse. The pause
panel shows its braid and both parent names. This economy permits up to three
terminal Chimeras in one run. Base starter fire does not pierce; Quills and the
selected starter mastery own piercing explicitly.

Greg's movement and near-misses also charge a deterministic three-wave **Rush
Rake** burst. Each starter has a dedicated five-rank mastery path in the run
upgrade pool; mastery strengthens only the selected animal's starter.

There is no player-visible level cap. Alongside attacks, level-ups offer neutral
passives: **Swift Paws**, **XP Magnet**, **Sturdy Hide**, **Sharpened Instinct**,
**Rapid Instinct**, and **Growth**. A build can claim five distinct neutral
passives. Chosen passives can still gain ranks; a sixth untouched passive cannot
replace one of those choices. **Sharpened Instinct** increases damage for every
attack, and **Rapid Instinct** reduces cooldown for every attack. When no finite
upgrade remains, **Essence Cache** is the repeatable fallback.

## Between runs

At victory or defeat, the outcome settles earned **Essence** once and returns
to the prep screen. Spend it in the capped **permanent upgrade shop**: Vitality
(+10 starting HP per rank), Might, Swiftness, Magnetism, Growth, Armor, Haste,
Precision, Ferocity, Evasion, and Fortune. All combat upgrades apply to the
next fresh run only; Fortune increases the next terminal Essence award. The
**Field Guide** archives terminal builds with their seed, hero, forms, run
stats, and ecology note, and the prep screen supports save export, import,
reset, migration, and corrupt-save recovery.

## Hosted playtest

`Publish web-toy preview` deploys the browser build through GitHub Pages for
relevant pushes to `main`. GitHub Pages must first use **Settings → Pages →
Build and deployment → Source: GitHub Actions**. After a green deployment, use
the link in **Actions** or **Settings → Pages** to open the assigned preview
URL.

## Development checks

From `apps/web-toy/`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The deterministic simulation, trait runtime, and run director have focused
checks in their own package READMEs. For a hands-on test, use the
[Gate 1 owner playtest guide](docs/playtests/gate1-owner-playtest.md). Current
milestone status and next work are in [docs/status/current.md](docs/status/current.md).
