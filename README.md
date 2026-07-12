# Animal Survivor

Animal Survivor is a web-first, low-poly 3D animal bullet-heaven game in active
Gate 1 development. The current playable alpha stars Greg the fox in the
**Forest Arsenal**: a deterministic survival run with automatic attacks,
level-up choices, evolving animal traits, enemy pressure, a boss, and
between-run Essence progression.

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
- Move with **WASD** or the **arrow keys**. On touch devices, drag in the
  lower-left virtual joystick.
- Greg attacks automatically; movement and positioning are the combat input.
- When a level-up pauses the run, choose a card with the mouse, **1**, **2**,
  or **3**, or ordinary **Tab** + **Enter** navigation.
- Press **Esc** on desktop, or use the visible Pause control, to pause and
  resume. The pause panel is the home for your current attacks and passive
  upgrades; combat itself deliberately stays free of repeating build text.

The arena is a readable forest clearing. Its trees, ground treatment, and
landmarks are presentation-only: they make movement and threat direction easier
to read without changing deterministic gameplay.

## Eight-minute normal run

Normal mode has a hard **8:00** boundary and no hidden overtime. Survive and
defeat **The Final Threat** before that boundary to win.

| Time | Phase | What changes |
| --- | --- | --- |
| 0:00–1:00 | Opening | A readable first wave of off-screen approaches. |
| 1:00–3:00 | Pressure | Faster waves, runners, and ranged threats begin. |
| 3:00–5:00 | Adaptation | Density and mixed threats rise. |
| 5:00–6:30 | Mutation | The most sustained pre-boss pressure. |
| 6:30–8:00 | Boss | **The Final Threat** enters; end the run before 8:00. |

Elite requests arrive at **2:00**, **3:40**, **4:30**, **5:15**, **5:45**, and
**6:05**. Each gets a five-second warning. The boss warning starts at **6:10**.
Ordinary threats approach from outside the camera rather than spawning within
attack range. Runners weave, Spitters and elites use ranged pressure, and elite
kills award a noticeably larger XP pickup.

## Forest Arsenal loadout

Greg always begins with **Auto-Fire**, the first of five active-attack slots.
He can choose up to four of five additional attack families, for a five-attack
build.

| Attack | Role |
| --- | --- |
| **Greg’s Auto-Fire** | Starter fire at the nearest enemy. |
| **Porcupine Quills** | Automatic targeted quill bursts. |
| **Puffer Pouch** | Pulls nearby enemies; its Adapted form pushes them back. |
| **Electric Eel Coil** | Fires charged bolts at the nearest enemy. |
| **Firefly Colony** | Releases sparks in every direction. |
| **Mantis Scythes** | Sweeps nearby enemies with a short-range damaging pulse. |

Each animal attack can be improved from Bud to Adapted. **Mantis Scythes** is
currently a standalone attack with no Mythic evolution yet. Two pairs can
become Mythics:

- **Thornstorm Mantle** — Adapted Quills + Adapted Pouch: telegraph, gather,
  then a radial quill storm.
- **Thunderbug Dynamo** — Adapted Coil + Adapted Colony: charge, then a radial
  lightning storm.

An evolution keeps both of its ingredient attack slots. A Mythic makes a more
powerful combined attack; it never creates a free sixth weapon slot.

There is no player-visible level cap. Alongside attacks, level-ups offer neutral
passives: **Swift Paws**, **XP Magnet**, **Sturdy Hide**, **Sharpened Instinct**,
**Rapid Instinct**, and **Growth**. A build can claim five distinct neutral
passives. Chosen passives can still gain ranks; a sixth untouched passive cannot
replace one of those choices. **Sharpened Instinct** increases damage for every
attack, and **Rapid Instinct** reduces cooldown for every attack. When no finite
upgrade remains, **Essence Cache** is the repeatable fallback.

## Between runs

At victory or defeat, the outcome settles earned **Essence** once and returns
to the prep screen. Spend Essence there on **Starting Vitality**; it affects the
next fresh run only and does not clutter the active HUD.

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
