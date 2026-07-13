# V1 combat, motion, and audio verification

## Player test

From the project root:

```sh
cd apps/web-toy
npm run dev
```

Open the local address Vite prints. For the developer proof panel, append
`?debug=1` to the URL. The panel runs separate deterministic simulations; it
does not alter the live run.

## Deterministic attack proof

`runAttackDamageLabReport()` exercises every launch entry in an isolated
20-second (1,200 tick) weak-target field and measures real health removed,
kills, and hits. The debug panel presents its totals directly.

- 34 isolated cases total: 4 starter/instincts, 24 trait stages, 6 Mythics.
- 27 direct-damage cases: all confirmed.
- 7 utility cases: all confirmed through real mark/displacement state changes.
- Firefly Colony: Bud 232 damage; Adapted 320 damage.
- Monarch Brood: Bud 80 damage; Adapted 243 damage.
- Bat Ears is intentional target-marking utility, not direct damage; its rows
  report utility confirmation rather than a misleading zero-damage failure.

## Fox balance result

Rush Rake was previously able to complete a three-wave, nine-projectile burst
after roughly 0.1 seconds of walking. It now charges over 150 world units
(about 1.25 seconds at Greg's base speed), spaces the waves 12 ticks apart,
and uses lower per-quill damage. The isolated 20-second lab reads:

- Greg Auto-Fire: 600 damage / 30 DPS.
- Greg Rush Rake: 1,046 damage / 52.3 DPS in a dense worst-case target field.

The goal is a readable movement combo with a worthwhile coverage reward, not a
continuous screen-clearing stream.

## Visual and sound checklist

- Move each founding hero: their body should have a clear gait/bob rather than
  sliding while auto-fire is active.
- Pick Firefly Colony or Monarch Brood near enemies: companions remain visible,
  and a contact flash/link appears only on a real hit.
- Pick Bat Ears: look for the distinct sonar/mark read and priority targets.
- Enable sound: music should be melodic and phase-aware rather than a sustained
  hum; Firefly contacts, Monarch stings, and other weapons should have distinct
  rate-limited cues.
