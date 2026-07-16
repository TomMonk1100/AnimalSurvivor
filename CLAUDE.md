# AnimalSurvivor Claude Entry Point

Read [AGENTS.md](AGENTS.md) before planning or editing. It is the canonical
guide; this file intentionally keeps only the hard entry rules.

- Work only in `/Users/adammuncie/GameDev/AnimalSurvivor` and inspect
  `git status --short --branch` before assuming the worktree is clean.
- Read `docs/status/current.md`, the assigned task packet, the relevant ADR,
  and the affected package's instructions before editing. Current status wins
  over historical handoff wording.
- `packages/sim` is renderer- and browser-independent deterministic gameplay.
  Trait runtime and run director are deterministic too. Do not add browser,
  presentation, or nondeterministic state to gameplay authority.
- `apps/web-toy` reads simulation snapshots/events; it must not become a
  second gameplay authority. Presentation preferences and visuals do not alter
  simulation outcomes or replay truth.
- Scope work to assigned paths. Do not perform unrelated cleanup or implicit
  Git-state actions. Escalate any needed cross-boundary edit.
- Select gates through `npm run verify:changed -- ...`; reserve
  `npm run verify:release` for final release evidence or when routing requires
  it. Automation and browser smoke evidence never replace owner playtests or
  final visual approval.

Use the task and handoff formats in
[docs/automation/agent-workflow.md](docs/automation/agent-workflow.md), and
the routing rules in [docs/automation/change-gates.md](docs/automation/change-gates.md).
