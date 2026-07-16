# AnimalSurvivor Agent Harness v1 — Frozen Contract

**Status:** implementation contract for the Agent Harness v1 swarm

This document freezes the shared decisions for the harness implementation. It
is deliberately small so agents can work independently without redefining its
meaning. The durable handbook will link here after integration.

## Goal

Make routine, AI-assisted changes easier to scope, verify, review, and hand
off locally. The harness must improve engineering evidence without adding a
runtime service, paid API, backend, or autonomous merge/deploy behavior.

## Non-negotiable project boundaries

1. `packages/sim` is the production deterministic simulation. It must remain
   renderer- and browser-independent.
2. Presentation in `apps/web-toy` reads authoritative simulation snapshots and
   events. Presentation state must not become a second gameplay authority.
3. Any gameplay/content compatibility change needs deterministic test and
   replay/hash evidence appropriate to its scope.
4. Asset, VFX, content, and served-build validation remains part of release
   evidence; `npm run verify:release` remains the final local release gate.
5. Automated evidence never constitutes a human playtest, balance verdict, or
   final visual approval.
6. Existing gates are reused before new rules are invented. New guards must be
   deterministic, local, dependency-light, and protected by fixtures or tests.

## Deliverables

1. A repo-root agent handbook and review protocol:
   - `AGENTS.md` is the canonical instruction source.
   - `CLAUDE.md` is a concise compatible entry point pointing at the canonical
     handbook instead of duplicating policy.
   - `REVIEW.md` defines evidence-based review expectations.
   - `docs/automation/` records routing, task-packet, and handoff guidance.
2. Local DevX commands:
   - `npm run verify:changed -- [options]` plans and, by default, executes the
     conservative gate set implied by a changed-file list.
   - `npm run verify:agent-contracts` checks only stable architectural and
     automation invariants.
   - Both commands support a documented dry-run/fixture path and do not write
     source files, alter Git state, or access the network.
3. A browser-flow smoke command under `apps/web-toy` which uses the existing
   Playwright dependency. It must exercise a real built/served app and report
   boot/start, one player-flow interaction, and terminal/full-run evidence.
4. CI wiring for the safe local harness checks, without making a hosted browser
   or human-playtest claim.

## Routing contract for `verify:changed`

The first version is intentionally conservative:

| Changed path class | Required local gates |
| --- | --- |
| `packages/sim/**` | sim typecheck, lint, test |
| `packages/trait-runtime/**` | trait-runtime typecheck, lint, test |
| `packages/run-director/**` | run-director typecheck, lint, test |
| `apps/web-toy/src/**` or `apps/web-toy/test/**` | web-toy typecheck, lint, test, build |
| `apps/web-toy/assets/**`, `assets/**`, or VFX scripts | web-toy typecheck, lint, test, asset and VFX texture checks, build, artifact check |
| release/asset/content verification scripts | applicable web-toy gates plus release artifact checks |
| `.github/**`, root `scripts/**`, any `package.json`, or lockfiles | agent-contract check plus `npm run verify:release` recommendation |
| docs-only changes | no package command; report that documentation review is required |
| cross-package or unknown paths | `npm run verify:release` recommendation |

The command may accept an explicit file list for deterministic fixture tests and
may accept a Git base ref for developer convenience. It must never silently
under-test a mixed or unknown diff.

## Agent boundaries for this implementation

| Workstream | Exclusive write boundary |
| --- | --- |
| Handbook | `AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `docs/automation/agent-workflow.md`, `docs/automation/change-gates.md` |
| DevX | root `package.json`, `scripts/verify-changed.mjs`, `scripts/verify-agent-contracts.mjs`, `scripts/test-agent-harness.mjs` |
| Browser QA | `apps/web-toy/package.json`, `apps/web-toy/scripts/verify-agent-smoke.mjs`, `apps/web-toy/test/agent-smoke.test.ts` and any new browser-smoke-only helpers |
| Integration lead | `.github/workflows/verify.yml`, `docs/status/current.md`, this contract, and conflict resolution only |

No workstream may change package gameplay, balance, renderer behavior, shared
contracts, dependencies, lockfiles, or unrelated documentation.

## Acceptance evidence

- The agent-harness script tests demonstrate routing for each table row and a
  mixed/unknown diff cannot select a smaller gate set than intended.
- Contract checks pass on the current repository and fail in targeted temporary
  fixtures without changing repository source.
- The browser smoke command produces truthful machine-readable output and
  passes locally when the required browser runtime is available; an unavailable
  local browser must fail with a clear setup error rather than a false pass.
- Existing package tests and the root release verifier remain green after
  integration.

## Explicit exclusions

- No paid model/API integration or runtime AI feature.
- No autonomous commit, push, merge, issue creation, or deployment.
- No claim that a browser smoke test establishes fun, accessibility compliance,
  balance, device certification, or final art approval.
