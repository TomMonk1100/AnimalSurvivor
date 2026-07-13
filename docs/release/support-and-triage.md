# Support and Triage Path

The current build has no remote support endpoint. A player can open the Field
Guide, choose **Copy issue report**, and paste the clipboard text into the
owner's selected issue tracker or support channel. The report contains the
build ID, run ID, hero, biome, seed, outcome, duration, build name, and—when
available—browser/device, viewport, render quality, accessibility flags, input
mode, and keyboard bindings.

For triage, first compare the report's build ID with `build-info.json`, then
reproduce with the same hero, biome, seed, and saved build description. Attach
the matching `dist-manifest.json` and browser console output when the issue is
artifact-specific. Do not request or collect a player's local save unless the
player explicitly chooses to export it.

Before public launch, the owner must select and publish the final external
support destination and add it to the store/release copy. Until then, this
document describes the implemented handoff format, not a live support promise.
