# Privacy and Local Storage Disclosure

AnimalSurvivor's current web toy stores its save profile and presentation
preferences in the browser's local storage. The profile contains Essence,
selected hero and palette, starting vitality, settled run identifiers, Field
Guide entries, discovered recipes, and unlocked biomes. Accessibility settings
and keyboard movement bindings are stored separately. Exported save files are created only when the player
chooses **Export save**.

The current build does not include telemetry, analytics, advertising, account
creation, cloud saves, cookies, or a network gameplay service. The **Copy issue
report** action writes a short run/build diagnostic—including browser/device,
viewport, render quality, and enabled accessibility flags—to the player's
clipboard only after the player activates it; it does not send the report
anywhere and does not save those environment details in the profile.

The terminal result card also offers **Copy replay**. This exports the current
run's deterministic input and upgrade history to the clipboard on demand. The
replay remains in memory for the current run and is not added to the saved
profile automatically.

Clearing site data, using a private browsing session, or resetting the save can
remove local progress. Export a save before clearing storage if the player
wants to preserve it. This disclosure describes the current implementation and
must be reviewed again before adding hosting analytics, accounts, payment, or
other data collection.
