# AI-Native Operating Model

**Owner role:** Creative director and final approver  
**Production labor:** AI agents  
**Primary constraint:** Available GPT/Claude usage, not owner hours  
**Cash constraint:** No additional spend

## Core rule

The project must never require the owner to write code, create production art,
edit assets, run build commands, perform QA, or maintain project files.

The owner supplies preferences, names, reactions, and go/no-go decisions. AI
agents perform implementation, documentation, asset processing, testing, and
integration.

## Usage is the budget

Subscription limits can vary and are not assumed to provide API credits. The game
therefore has no runtime AI dependency and no automated workflow that requires a
paid model API.

Agent work is organized into small resumable packets:

- one concrete objective;
- explicit directory ownership;
- fixed acceptance tests;
- no unrelated cleanup;
- a durable handoff file or commit;
- a clear complete, blocked, or next state.

When usage is close to a limit, the agent finishes the current safe checkpoint,
records exact status, and stops before opening a new workstream.

## Durable project memory

The repository—not chat history—is the source of truth.

Every implementation milestone maintains:

```text
docs/status/current.md        current milestone, owners, blockers, next tasks
docs/decisions/               short architecture and product decision records
docs/handoffs/                copy-paste assignments with directory boundaries
docs/verification/            commands, results, performance evidence
```

These files are introduced with Gate 1. Agents must read current status and the
relevant decisions before editing code.

## Agent topology

- One integration agent owns contracts, task boundaries, review, and acceptance.
- Parallel swarms receive non-overlapping directories.
- Coding agents do not make visual or product decisions.
- Creative agents do not change architecture or production code.
- QA agents report reproducible evidence; fixes receive separate ownership.
- No swarm merges itself into the integration branch.

Parallelism is used only when work is genuinely independent. More agents are not
automatically better because duplicated context consumes limited usage.

## Usage-priority order

1. Integrated code that makes the game playable.
2. Automated verification and reproducible bug fixes.
3. Asset-pipeline automation and performance work.
4. High-impact content using existing systems.
5. Documentation required for safe continuation.
6. Concept variants and polish.
7. Optional content breadth.

Do not spend high-capability model usage on formatting, bulk conversion, or
repeated summaries when deterministic local tools can do the job.

## Validation policy

AI agents may perform design critique, automated QA, balance simulations, visual
checks, and adversarial reviews. They cannot honestly substitute for human player
preference or retention data.

Because this is a zero-cash hobby project, Gate 1 may proceed **at risk** without
the ten Gate 0 interviews. The missing interviews remain explicitly unvalidated.
The hard human-validation checkpoint moves to Gate 2, when testers can play a real
ten-minute web build rather than judge concept art.

No report may describe synthetic agent feedback as player testing.

## Owner contributions

The owner is asked for at most four high-leverage creative decisions:

1. **Complete:** choose and name the founding heroes and their personalities.
2. **Complete:** choose the visual direction.
3. **Future:** select one mascot signature feature from AI-generated options.
4. **Future:** choose or rename five Mythic evolutions after playing them.

No drawing, modeling, recording, coding, or test moderation is required from the
owner.

## Milestone handoff

Every milestone records:

- outcome first;
- files changed;
- commands and tests run;
- measured performance where relevant;
- known limitations;
- owner decisions required;
- the next bounded task packet.

If usage ends mid-project, another agent must be able to continue from repository
artifacts without reconstructing decisions from conversation history.

