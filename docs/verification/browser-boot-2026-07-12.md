# Automated browser boot evidence — 2026-07-12

The exact production `dist/` artifact was served locally and opened in the
Codex in-app browser at:

```text
http://127.0.0.1:4173/?hero=greg&seed=1234
```

Observed signals:

- document/app booted without browser console warnings or errors;
- the intro exposed build identity
  `0.1.0+c2c56a14f039.2b20bd83.5e81a607`;
- all three founding hero portrait images were present in the visible hero
  choice cards;
- Accessibility, palette, Credits & notices, and Field Guide controls were
  present in the intro surface;
- the served artifact had already passed the static 404, asset, Saltwind-route,
  build-identity, and boss/hero portrait checks.
- the prep dialog owns initial focus on **Start run**; the dialog and app root
  are not inert, while the game surface is inert until launch;
- the source-level visibility/modal slice was reloaded in the same automated
  browser session and reported zero warning/error logs;
- the current artifact was checked at 390 × 844 portrait and 844 × 390
  landscape viewports: the prep card remained scrollable, focus revealed the
  launch control inside the card, and the control stayed within the visible
  viewport after focus restoration;
- an exact accessible-name click on **Start run** hid the prep surface, moved
  focus to `game-surface`, released its inert state, and produced zero warning
  or error logs.

This record is automated browser boot/accessibility evidence only, not a human
playtest, balance result, physical-device certification, or hosted deployment
check.
