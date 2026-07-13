# AnimalSurvivor Rollback Runbook

The web preview workflow builds one artifact, hashes it, uploads that exact
directory, and deploys the same directory. Rollback must preserve that
property: restore a previously retained artifact; do not rebuild from a newer
or dirty checkout while diagnosing a release.

## Before promotion

1. Record the candidate `buildId`, commit SHA, `contentFingerprint`,
   `assetManifestHash`, and `dist-manifest.json`.
2. Retain the uploaded artifact named
   `animal-survivor-web-toy-<commit-sha>`.
3. Keep the previous green artifact and its manifest available until the new
   deployment has passed hosted smoke.

## Roll back

1. Stop promotion of the failing candidate and record its build ID and visible
   failure symptom.
2. Select the previous retained artifact directory without modifying it.
3. Re-publish that directory through the Pages deployment path; never run a
   fresh production build as part of the rollback.
4. Verify the deployed title, `animal-survivor-build-id` meta tag,
   `build-info.json`, `asset-manifest.json`, and `dist-manifest.json` all match
   the retained artifact.
5. Run the hosted browser smoke procedure in
   [`gate0-evidence.md`](gate0-evidence.md), then record the rollback result and
   the candidate's issue report.

## Local artifact inspection

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
cat dist/build-info.json
cat dist/dist-manifest.json
npm run verify:served
```

The local served check validates artifact identity and file presence; it does
not prove the hosted Pages deployment or player-facing balance.
