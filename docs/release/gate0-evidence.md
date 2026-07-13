# Release Gate 0 Evidence

This document records the evidence needed to exit the trustworthy-build gate.
It is intentionally separate from the V1 plan so a future release can attach a
specific artifact and deployment without rewriting the production plan.

## Build identity contract

Every verified web artifact publishes `build-info.json`, `asset-manifest.json`,
and `dist-manifest.json` at its root. The build identity contains:

- semantic version and immutable `buildId`;
- source commit SHA and clean/dirty source state;
- build timestamp;
- deterministic gameplay content fingerprint for the simulation, trait runtime,
  and run director sources;
- SHA-256 hash of the source asset manifest;
- intended deployment base URL.

The same `buildId` is present in the document title, the build meta tag, and the
prep-screen build label. `dist-manifest.json` hashes every generated file except
itself, because a manifest cannot contain its own non-recursive hash.

## Local artifact check

For the complete repository verification sequence, run from the authoritative
workspace root after installing each package's lockfile dependencies:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor
npm run verify:release
```

The final `verify:served` sub-step binds a temporary localhost port; restricted
sandbox sessions may need the equivalent approved local-server permission.

Run from the authoritative workspace:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm run typecheck
npm run lint
npm test -- --run
npm run verify:assets
npm run build
npm run verify:artifact
npm run verify:served
cat dist/build-info.json
cat dist/dist-manifest.json
```

`verify:served` starts a temporary local HTTP server over the exact `dist`
directory and checks the title, build identity, manifest records, entry bundle,
Saltwind query, UI markers, and a missing-asset 404. This is an automated served
artifact smoke gate; it does not replace the human browser evidence below.

For a local QA session, record the exact server details before opening the
browser:

```bash
cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy
npm run preview -- --host 127.0.0.1 --port 4173
```

Record:

| Field | Value |
| --- | --- |
| server PID | |
| URL and port | |
| expected build ID | |
| commit SHA | |
| content fingerprint | |
| asset-manifest hash | |
| browser/session type | |
| console errors | |
| shutdown command/action | stop the preview process |

The browser smoke pass must confirm the served page title, meta build ID,
`build-info.json`, prep-screen label, app boot, and absence of unexpected
console errors. A generic localhost page is not evidence of the game build.

## CI artifact flow

The `Publish web-toy preview` workflow installs and verifies all four package
roots before the web build. It then builds the web toy exactly once, hashes and
validates that `dist`, preserves an artifact named with the source commit,
and uploads the same output directory to Pages. The deploy job consumes the
Pages artifact and does not rebuild it.

The Pages project URL must be enabled by the owner through **Settings → Pages →
Build and deployment → Source: GitHub Actions**. The assigned URL comes from
the green deployment or the Pages settings; it is not hardcoded here.

The release-candidate checklist, rollback procedure, support path, and known
issues are maintained in [`release-candidate-checklist.md`](release-candidate-checklist.md),
[`rollback-runbook.md`](rollback-runbook.md),
[`support-and-triage.md`](support-and-triage.md), and
[`known-issues.md`](known-issues.md).

## Human evidence still required for Gate 0 exit

Automated artifact checks do not prove the hosted browser or player hook. Attach
the following to the release candidate:

- a fresh/private browser smoke record against the exact hosted artifact;
- the matching `build-info.json` and `dist-manifest.json`;
- the deployed URL and post-deploy title/build-ID/console check;
- at least 12 observed Gate 1 sessions in
  [`gate1-data-sheet.csv`](../playtests/gate1-data-sheet.csv), using the
  procedure in [`gate1-owner-playtest.md`](../playtests/gate1-owner-playtest.md);
- the owner’s proceed/revise decision before content expansion.

Until those records exist, the implementation is Gate 0-ready but the project
must not claim that Gate 0 or V1 release evidence is complete.
