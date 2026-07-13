# Current Known Issues

These are intentional release-candidate disclosures, not hidden defects:

- Benny and Gracie still use procedural arena bodies rather than final rigged
  hero GLBs.
- Enemy and boss meshes, most attachments, and Saltwind environment props are
  still low-poly/procedural presentation primitives.
- The audio layer is opt-in procedural feedback, not the final authored music,
  foley, and mix.
- Hosted Pages identity and low-end/touch evidence are not yet attached to this
  workspace snapshot; unsupported-WebGL and context-loss state handling now
  have automated renderer gates, and hidden-page suspend/resume now has an
  automated ownership gate, but device/human recovery evidence remains.
- Balance, readability, and replay/retention claims remain unvalidated until
  human sessions are completed.
