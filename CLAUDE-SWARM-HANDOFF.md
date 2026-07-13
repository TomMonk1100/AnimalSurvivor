# Animal Survivor — Blind Claude Swarm Handoff

**Prepared:** 2026-07-12
**Purpose:** independent research, design, planning, and standalone prototype work
**Audience:** a Claude swarm with no access to this repository, its filesystem, or GitHub

## 1. Mission

Produce a decision-ready research and planning package for **Animal Survivor**.
The package must help the repository-owning agent decide what to playtest, what
to fix, what to research further, what to build next, and what to deliberately
defer.

This is a blind assignment. The swarm cannot inspect, run, edit, or merge the
project. It must work only from this brief and public research sources. It must
not pretend to have inspected source code, GitHub, browser output, or a player
session.

The desired result is more than a list of ideas. Return complete, standalone
artifacts that a later integration agent can evaluate and selectively adapt:

- current-contract reconciliation;
- public research with direct citations;
- human-playtest and Gate 2 evidence planning;
- deterministic balance and encounter models;
- truthful future content contracts;
- art, asset, audio, and attachment production planning;
- web performance, device, and release planning;
- replay/determinism integration risks;
- a ranked, owner-ready backlog and go/no-go recommendation.

Do not optimize for the number of proposed features. Optimize for evidence,
clarity, low cost, truthful player-facing behavior, and a small number of high-
confidence next actions.

## 2. Access boundary and source discipline

The swarm has:

- no access to the local project;
- no access to the owner's filesystem;
- no access to GitHub, branches, issues, pull requests, or CI;
- no ability to run the current game or its tests;
- no authority to claim that any artifact was integrated or approved.

Public web research is allowed and encouraged where a question is time-sensitive
or externally verifiable. Every externally sourced factual claim must include a
direct URL and the date accessed. Prefer primary sources: official engine docs,
official platform documentation, official licenses, original research, and
first-party game or portal documentation. Distinguish clearly between:

- **Observed snapshot:** supplied by this brief about the current project;
- **Sourced fact:** supported by a public citation;
- **Design recommendation:** the swarm's judgment;
- **Example starting value:** a tunable number invented for a model;
- **Formula:** a rule that can be implemented or tested;
- **Open question:** something that requires a human playtest or owner decision.

Never turn an example number into a claim about the live game. Never state that
a proposed formula reproduces the current game unless the owner later supplies
the evidence.

## 3. Current project snapshot supplied to the swarm

This section is the only project state the swarm may treat as current. It is a
snapshot, not permission to infer unseen APIs.

### Product

Animal Survivor is a web-first, low-poly 3D animal bullet-heaven / survivor-
like game. The current playable slice is **Forest Arsenal**, starring Greg, a
fox. Combat is movement-led: the player moves, collects XP, chooses upgrades,
and attacks happen automatically. The intended long-term hook is that the
animal's body becomes its loadout: meaningful upgrades appear as visible
attachments, evolve from Bud to Adapted to Mythic, and should remain readable
at gameplay scale.

The project is a serious zero-cash hobby production built primarily by AI
agents. Prefer CC0 or clearly licensed assets, procedural tools, and AI-generated
concept references. Do not create a plan that assumes paid art, paid backend
services, analytics infrastructure, or a large human team.

### Current normal run contract

The current normal mode is **8:00**, not 12:00. It runs at 60 fixed simulation
ticks per second, so its normal boundary is 28,800 ticks.

| Time | Phase | Current intent |
| --- | --- | --- |
| 0:00–1:00 | Opening | readable first approach waves |
| 1:00–3:00 | Pressure | faster waves, runners, and ranged pressure |
| 3:00–5:00 | Adaptation | rising density and mixed threats |
| 5:00–6:30 | Mutation | sustained pre-boss pressure |
| 6:30–8:00 | Boss | The Final Threat must be defeated before the boundary |

The boss entrance is at 6:30 / tick 23,400. Its warning begins at 6:10.
Elite requests are currently authored at 2:00, 3:40, 4:30, 5:15, 5:45, and
6:05, each with a five-second warning. Normal mode has no hidden overtime.

Ordinary formations are intended to approach from outside the camera. Runners
weave before directly seeking Greg. Spitters and elites create ranged pressure.
Elites award a larger XP pickup. Exact balance values are implementation facts
that the swarm must not recreate from memory; use example values in any
standalone model and label them as such.

### Current build and content contract

Greg begins with **Auto-Fire**, which occupies one of five active-attack slots.
He may acquire up to four of these six current attack families:

1. Porcupine Quills — forward piercing volleys;
2. Puffer Pouch — gather / push control;
3. Electric Eel Coil — nearest-target chain lightning;
4. Firefly Colony — orbiting contact damage;
5. Mantis Scythes — auto-aimed directional melee sweep;
6. Gecko Pads — movement-triggered damaging pads that do not slow enemies.

Current Mythic pairings are:

- Thornstorm Mantle = Adapted Quills + Adapted Pouch;
- Thunderbug Dynamo = Adapted Coil + Adapted Firefly Colony;
- Razorstep Chimera = Adapted Mantis Scythes + Adapted Gecko Pads.

A Mythic consumes and retains both ingredient slots. It does not create a free
sixth active weapon. Every current attack has Bud and Adapted forms. The
current neutral candidates are Swift Paws, XP Magnet, Sturdy Hide, Sharpened
Instinct, Rapid Instinct, and Growth. A run can claim five distinct neutral
passive families and continue ranking selected families; Essence Cache is the
repeatable fallback after finite choices are exhausted.

The first local meta loop settles Essence at the end of a run. Starting
Vitality is a capped next-run purchase and is intentionally not an active-run
HUD system. This is a first pass, not a finished economy or cloud save.

### Current architecture supplied as a boundary map

The implementation is divided into these conceptual layers:

- deterministic, renderer-independent fixed-tick simulation;
- deterministic trait/evolution runtime with sockets, offers, stages, Mythics,
  commands, visual state, serialization, and hashes;
- deterministic run director that emits encounter intents and terminal outcomes;
- PlayCanvas/Vite browser presentation with interpolation, input, HUD, audio,
  instanced swarm rendering, Greg's glTF hero, and attachment projection.

The simulation is authoritative. Rendering may read snapshots and presentation
cues, but must not own gameplay time, RNG, combat outcomes, upgrade authority,
or replay state. Gameplay schema changes must be versioned and fingerprinted.
Pause must not advance simulation or create catch-up time. Deterministic code
must not depend on wall-clock time, DOM, renderer objects, network state, or
ambient randomness.

Greg currently uses an audited Quaternius fox glTF and stable attachment socket
families. The visible attachment system now covers the six current attack
families and the three current Mythics with primitive prototype geometry. It is
not final art.

### Current verification snapshot

The local owner review immediately before this brief recorded:

- headless simulation: **226 tests passed**;
- trait runtime: **73 tests passed**;
- run director: **71 tests passed**;
- web toy: **232 tests passed**;
- total: **602 tests passed**;
- typecheck, lint, and production build passed for all four package roots;
- branch snapshot: `codex/gate1-playtest-polish` at commit `c2c56a1`;
- working tree clean at review time.

These are supplied facts from the owner-side review, not work performed by the
Claude swarm. Do not claim to have rerun them.

The latest local browser build reported approximately 2.11 MB minified main
JavaScript, 542.7 kB gzip, and a 3.16 MB Fox glTF asset, plus PlayCanvas
worker-externalization warnings. These are observed development-build numbers,
not release thresholds or proof of low-end support.

### Evidence gaps

The most important missing evidence is human evidence:

- no fresh complete human playtest of the current eight-minute normal run;
- no human confirmation that the six attacks and three Mythics are clear;
- no balance evidence for mixed upgrades, elite pressure, ranged shots, boss
  health, or the terminal-to-prep profile flow;
- no physical touch-hardware validation;
- no low-end-device or forced WebGL context-loss validation;
- no broad external playtest cohort;
- Gate 0's ten external human concept interviews remain incomplete.

Automated determinism, replay, type, lint, and build checks are valuable but do
not substitute for these observations.

### Known documentation hazards

Several older documents are historical and conflict with the current snapshot.
The swarm must explicitly account for this rather than silently blending them:

- older handoffs and the existing Opus brief describe a 12-minute run with a
  10:00 boss; the current Forest Arsenal contract is 8:00 with a 6:30 boss;
- older documents describe only two current attack paths; the current supplied
  snapshot has six attack families and three Mythics;
- older text says chain, melee, and zone commands are unsupported; the current
  supplied snapshot includes Coil chain lightning, Mantis melee, and Gecko
  movement pads as real current content;
- some package README and ADR text still describes earlier integration stages,
  test counts, or unintegrated lifecycle boundaries;
- the existing `OPUS-BLIND-SWARM-BRIEF.md` is useful as historical inspiration
  but is superseded by this brief.

The swarm's first packet must produce a contradiction matrix and a proposed
source-of-truth policy. Do not recommend new gameplay based on a stale 12-minute
contract.

## 4. Swarm operating model

Run the work packets independently and in parallel where possible. Each packet
must have one clear owner, a narrow output set, and no dependency on hidden
repository details. A synthesis agent should reconcile conflicts only after the
independent packets are complete.

For every packet, return:

1. a short decision summary;
2. complete contents of every requested artifact in a separate Markdown code
   fence, with the filename as the heading;
3. research citations or a statement that no external research was needed;
4. test commands and expected output for any code artifact;
5. assumptions, unresolved questions, and limitations;
6. an integration note explaining how an owner-side agent should evaluate it;
7. an explicit statement that it was not run against Animal Survivor.

Standalone code requirements:

- target Node 20+ TypeScript or plain TypeScript that can be compiled without
  third-party runtime packages;
- use only Node built-ins and `node:assert/strict` / `node:test` for tests;
- use integer ticks and deterministic inputs;
- no DOM, renderer, PlayCanvas, network, timers, wall-clock, or ambient random;
- include complete runnable files, not pseudocode or partial snippets;
- validate inputs and reject malformed data;
- label all invented values as example starting values or formulas;
- include at least ten meaningful assertions for substantial models;
- do not present standalone prototypes as production patches.

Research requirements:

- cite direct URLs beside claims;
- include access dates;
- keep quotes short and prefer paraphrase;
- separate evidence from interpretation;
- note when a source is marketing material rather than independent evidence;
- flag claims that need live owner validation.

## 5. Work packets

### Packet 0 — Contract reconciliation and documentation truth set

**Priority:** highest.
**Goal:** stop future agents from planning against stale 12-minute or pre-six-
attack material.

Produce:

- `CONTRACT-RECONCILIATION.md`;
- `CURRENT-SOURCE-OF-TRUTH.md`;
- `DOCUMENTATION-CLEANUP-PLAN.md`;
- a compact table of every contradiction found within this supplied brief,
  including current contract, stale statement, consequence, and required owner-
  side verification.

The reconciliation must establish:

- 8:00 normal mode and 6:30 boss as the current planning baseline;
- six current attack families, five active slots, five distinct neutral families;
- current Mythic slot semantics;
- authoritative simulation / trait / director / browser boundaries;
- what is verified by automation versus what still requires humans;
- which claims are not safe to infer without source access.

Do not invent file paths beyond the names in this brief. Where a stale document
would require an owner-side edit, describe the edit rather than pretending it
was made.

**Acceptance:** a new agent can read this packet alone and avoid the known
12-minute, two-attack, and unsupported-command traps.

### Packet A — Human playtest, research, and Gate 2 evidence plan

**Goal:** turn the current evidence gap into a small, rigorous, affordable test.

Produce:

- `GATE1-HUMAN-PLAYTEST-PLAN.md`;
- `GATE2-EVIDENCE-PLAN.md`;
- `PLAYER-QUESTIONNAIRE.md`;
- `PLAYTEST-DATA-SHEET.csv` or a Markdown-equivalent schema;
- `RESEARCH-ON-SURVIVOR-UX.md` with public citations.

The plan must cover:

- first-glance comprehension of move / survive / collect / choose / win;
- early movement and XP collection;
- readability of Quills, Puffer, Coil, Firefly, Mantis, and Gecko;
- Bud, Adapted, and Mythic comprehension;
- five active slots and five neutral-family commitment;
- phase pressure from Opening through Boss;
- runners, ranged pressure, elites, boss warning, boss bar, and deadline;
- pause-panel build inspection and terminal Essence / Starting Vitality flow;
- sound on/off feedback without treating sound as required for validity;
- desktop keyboard, narrow viewport, touch hardware, and low-end browser runs;
- what to observe without leading the participant;
- exact timestamps, failure modes, confusion moments, and quotes;
- sample size as an explicit recommendation, not a fake statistical guarantee;
- go / iterate / stop criteria that are behavioral and player-centered.

Design the study so that a single owner can run an inexpensive first pass. A
larger external cohort can be a later phase. Do not say Gate 2 passed merely
because the plan exists.

### Packet B — Deterministic current-run balance lab

**Goal:** give the owner a way to discuss pressure and build viability with
transparent formulas while acknowledging that the model is not the simulation.

Produce these standalone artifacts:

- `survivor-balance-lab.ts`;
- `survivor-balance-lab.test.ts`;
- `survivor-balance-lab.example.json`;
- `BALANCE-LAB.md`.

The lab must use the current 8:00 / 6:30 contract as its example. It should
model, as configurable inputs:

- phase boundaries and boss-entry time;
- wave interval, enemy count, HP, contact damage, and ranged pressure;
- player HP, movement assumptions, pickup assumptions, and XP curve;
- generic damage and cooldown effects for current attack roles;
- neutral effects for speed, magnet, max HP, damage, cooldown, and XP gain;
- boss HP, boss incoming pressure, and time-to-kill;
- conservative standing-still and movement-required failure estimates.

Print a readable phase or minute table with expected level, selected ranks,
estimated DPS, incoming pressure, boss viability, and an explanation of each
formula. Include level 1, early, mid, and late-run comparisons. Include at
least ten deterministic assertions for validation, rank caps, boss timing,
upgrade math, invalid input, and monotonicity.

The model must explicitly say that it does not reproduce live AI behavior,
spawn placement, hitboxes, or replay hashes. Do not tune the current game from
the lab alone. Recommend which model outputs should be checked against human
playtest observations.

### Packet C — Current attack readability and future neutral content

**Goal:** improve choice quality without shipping cards whose text promises
mechanics the current game does not own.

Produce:

- `ATTACK-READABILITY-AND-EVOLUTION-RESEARCH.md`;
- `NEUTRAL-UPGRADES-V2.json`;
- `validate-neutral-upgrades-v2.ts`;
- `validate-neutral-upgrades-v2.test.ts`;
- `NEUTRAL-UPGRADES-V2-RESEARCH.md`;
- `CONTENT-CONTRACT-TEMPLATE.md` for future attacks and Mythics.

The research must cover public survivor-action design patterns, but must not
copy protected text or claim that another game's balance transfers directly.

For neutral upgrades, propose 12–16 candidates with:

- stable id and title;
- exact truthful player-facing copy;
- rank cap and concrete formula or explicit system dependency;
- build role, synergy, risk, and test requirement;
- one of `safe_now`, `needs_system`, or `future_only`.

Use no more than six `safe_now` candidates. Safe-now mechanics may be limited
to generic effects already represented in the supplied current snapshot:
damage, cooldown, maximum health, movement speed, XP gain, pickup radius,
attraction range, attraction speed, enemy count, or spawn cadence. Put Luck,
rarity, chests, rerolls, revives, shields, status effects, and new projectile
ownership in `needs_system` or `future_only` unless the artifact defines the
missing system honestly.

The validator must reject duplicate ids, empty copy, invalid caps, unknown
statuses, unsupported safe-now mechanics, and malformed formulas. Include Node
tests. The content contract template must require simulation semantics, replay
and hash behavior, presentation state, visual attachment, player-facing copy,
and playtest acceptance before a new attack is eligible for the real catalog.

### Packet D — Enemy counterplay and encounter-behavior prototypes

**Goal:** create pressure that asks the player to move and read threats rather
than merely adding HP and damage.

Produce:

- `enemy-behavior-prototypes.ts`;
- `enemy-behavior-prototypes.test.ts`;
- `ENEMY-COUNTERPLAY-SPEC.md`;
- `ENCOUNTER-BEAT-MATRIX.md`.

Use pure fixed-tick state machines with a small generic intent vocabulary. At
minimum cover:

1. Runner — closes quickly, weaves, commits to a recoverable attack;
2. Ranged Spitter / Zoner — holds a readable range and telegraphs shots;
3. Charger — telegraphs, charges in a straight line, recovers visibly;
4. Tank — slow space pressure with a role distinct from a brute damage sponge;
5. Elite — stronger version with a readable range band and authored shot cadence;
6. Boss — entrance, threat windows, and a kill-before-boundary objective.

The current runner, Spitter, elite, and boss are supplied context, not an API to
copy. Every prototype must state the minimum data an integration agent would
need to map it safely to the actual simulation. Include at least twelve tests
for determinism, telegraph timing, cooldowns, recovery, zero-distance behavior,
target movement, and state transitions. Include counterplay, failure clarity,
and accessibility considerations for every behavior.

Do not recommend a new enemy for immediate implementation unless it has a clear
player decision, warning, counterplay, and a bounded test plan.

### Packet E — Essence meta progression and explicit future modes

**Goal:** make the small local Essence loop fair and understandable while
keeping difficulty and Hardcore Endless future-facing and explicit.

Produce:

- `META-PROGRESSION-V2-SCHEMA.json`;
- `META-PROGRESSION-V2-EXAMPLE.json`;
- `validate-meta-progression-v2.ts`;
- `validate-meta-progression-v2.test.ts`;
- `META-PROGRESSION-AND-MODES.md`;
- `MODE-DEFINITION-CONTRACT.md`.

Design 8–12 permanent upgrade or unlock concepts with capped ranks,
transparent costs, prerequisites, purpose, and anti-grind reasoning. Treat the
current Starting Vitality purchase as a small first slice, not proof that a
finished meta economy exists.

Define a future path from Normal to selectable harder modes and then opt-in
Hardcore Endless. Every mode must have an authored definition, visible rules,
independent content fingerprint, replay compatibility policy, and explicit
reward policy. Do not hide difficulty in an invisible multiplier or extend
Normal mode past its current boundary.

Validators and tests must catch duplicate ids, invalid costs, impossible caps,
prerequisite cycles, unknown references, malformed unlock conditions, hidden
stat multipliers, and mode definitions that silently inherit Normal behavior.
State clearly what cannot ship until a normal run and early meta loop have human
evidence.

### Packet F — Art, attachment, audio, and asset-provenance pipeline

**Goal:** keep the animal-body-as-loadout vision visually coherent under a
zero-cash, AI-assisted production model.

Produce:

- `VISUAL-ATTACHMENT-PIPELINE.md`;
- `ATTACHMENT-READABILITY-QA.md`;
- `ASSET-LICENSE-AND-PROVENANCE-RESEARCH.md`;
- `AUDIO-FEEDBACK-PLAN.md`;
- `ASSET-ACCEPTANCE-CHECKLIST.md`;
- `ART-PRODUCTION-BACKLOG.md`.

Research official sources for CC0, Quaternius, Kenney, image-generation
provenance, and any other proposed asset source. Verify what the license
actually permits; do not write “free” when the license is unclear. Recommend a
ledger entry format including source URL, author, exact license, download date,
hash, modifications, runtime path, and whether the asset is incorporated or
only a candidate.

The attachment pipeline must preserve:

- Greg's readable face, facing, hurt state, and ground contact;
- one dominant, one supporting, and one accent silhouette change at most;
- non-overlapping stable socket placement;
- gameplay-scale readability, not only dressing-room inspection;
- Bud / Adapted / Mythic differentiation without particle clutter;
- renderer-only procedural motion for attachments;
- final-art migration from primitive prototype geometry without rewriting
  gameplay semantics.

The audio plan must remain sparse, opt-in, and non-authoritative. It should
separate start, movement/combat, pickup, hit, upgrade, Mythic, boss, victory,
and defeat feedback, with a low-cost production path and device fallback.

Do not recommend a large asset download or paid service without a bundle,
license, and maintenance rationale.

### Packet G — Browser performance, device validation, and release research

**Goal:** turn known web risks into measured gates before portal or public
release claims are made.

Produce:

- `WEB-RELEASE-RESEARCH.md`;
- `DEVICE-AND-BROWSER-TEST-MATRIX.md`;
- `BUNDLE-REDUCTION-DECISION-MATRIX.md`;
- `WEB-PUBLISHING-CHECKLIST.md`;
- `PERFORMANCE-REGRESSION-PROTOCOL.md`.

Research current official PlayCanvas, Vite, browser, PWA, GitHub Pages, itch.io,
and relevant portal documentation. Cite all changing platform claims. Analyze
the supplied snapshot of roughly 2.11 MB minified JS, 542.7 kB gzip, and 3.16
MB Fox glTF without declaring those values acceptable or unacceptable by
themselves.

The plan must cover:

- first load and repeat load;
- 390px/narrow layouts and touch controls;
- keyboard and pointer accessibility;
- WebGL context loss and recovery;
- low-end CPU/GPU and memory pressure;
- 1,000-enemy / 500-projectile / 200-pickup stress fixtures;
- frame-time p95/p99, dropped simulation time, draw calls, memory, and console
  errors;
- glTF and worker parsing behavior;
- bundle reduction options with risk and expected measurement;
- preview deployment, cache invalidation, and rollback;
- what must be true before an itch.io or portal submission is worth the cost.

Do not suggest hiding warnings by raising thresholds. Do not claim low-end
support without physical-device evidence.

### Packet H — Determinism, replay, and integration-risk audit

**Goal:** provide a source-independent checklist that protects the current
simulation / runtime / director / renderer boundary as content expands.

Produce:

- `DETERMINISM-INTEGRATION-AUDIT.md`;
- `REPLAY-SCHEMA-CHANGE-CHECKLIST.md`;
- `CONTENT-FINGERPRINT-CONTRACT.md`;
- `INTEGRATION-RISK-REGISTER.md`;
- one small standalone `deterministic-contract-check.ts` with tests if useful.

Cover:

- fixed-tick ownership and pause semantics;
- RNG ownership and consumption order;
- canonical state hashes and content fingerprints;
- serialized upgrade selections, run-start loadouts, director state, trait
  state, and terminal outcomes;
- pool-full degradation and deterministic ordering;
- renderer-only interpolation, cues, attachments, audio, and HUD state;
- target-selection tie breaks;
- command stream validation before mutation;
- save migration and incompatibility behavior;
- cross-engine / cross-device replay limitations;
- how a new attack, enemy, passive, mode, or asset changes the contract.

Do not recommend a rewrite based on the architecture summary. Identify risks,
decision tests, and narrow integration seams. Where the actual API is unknown,
say so and provide an abstract contract rather than fictional imports.

### Packet I — Product, genre, and zero-budget release strategy

**Goal:** test whether the current slice has a credible learning and release
path before spending scarce AI or owner time on breadth.

Produce:

- `SURVIVOR-GENRE-AND-PLAYER-EXPECTATIONS.md`;
- `ZERO-BUDGET-RELEASE-OPTIONS.md`;
- `RETENTION-AND-REPLAYABILITY-HYPOTHESES.md`;
- `OWNER-DECISION-MEMO.md`.

Research public first-party or high-quality sources for the relevant genre,
web distribution, portal requirements, and player onboarding. Do not treat
competitor retention numbers or platform marketing claims as universal truths.

Assess:

- whether an eight-minute run is long enough to demonstrate the hook;
- whether visible body mutations are differentiated from ordinary stat cards;
- whether the current build has enough meaningful choices despite six attacks;
- whether local Essence / Starting Vitality supports a fair next-run reason;
- what a shareable browser test should measure before monetization;
- whether itch.io, direct hosting, portal submission, or no public release is
  the best next experiment under the zero-cash constraint;
- what should be postponed until player evidence exists.

End with a small decision tree, not a grand launch plan.

## 6. Final synthesis packet

After the independent packets, produce one final artifact named
`CLAUDE-SWARM-SYNTHESIS.md` containing:

1. a one-page executive summary;
2. a current-truth versus stale-document table;
3. the five highest-confidence findings;
4. a ranked integration backlog with three horizons:
   - **Immediately after the next human playtest**;
   - **Before declaring the next gate ready**;
   - **Later / deliberately deferred**;
5. a risk register with evidence, impact, mitigation, and owner action;
6. a research bibliography with direct URLs and access dates;
7. a manifest of every artifact and its test command;
8. a cross-packet conflict table;
9. five or fewer high-impact owner decisions or creative contributions;
10. a final recommendation: continue, iterate, pause, or stop, with reasons.

The immediate recommendation must begin from the current evidence gap: a
focused human playtest of the eight-minute Greg loop. It may recommend a narrow
implementation after that test, but it must not make more traits, Luck,
selectable difficulty, Hardcore Endless, final art, or portal release the next
step merely because they are interesting.

The synthesis must distinguish:

- safe to research now;
- safe to prototype outside production;
- safe to implement after the next playtest;
- blocked on an owner decision;
- blocked on a new gameplay system;
- deliberately deferred.

## 7. Red lines

The swarm must not:

- claim to have accessed the project, GitHub, CI, or a browser session;
- claim any test, build, benchmark, or playtest was run against Animal Survivor;
- use the stale 12-minute / 10:00 boss contract as the current baseline;
- recommend Luck as an immediate card without a real rarity, offer, chest, or
  drop system;
- add invisible difficulty multipliers or hidden Normal overtime;
- define a player-facing effect the current implementation cannot truthfully
  deliver without labeling the required system;
- turn an AI-generated concept into a game-ready model claim;
- import an asset with unclear license or paid runtime dependency;
- propose analytics, cloud saves, ads, or monetization as prerequisites for the
  next validation step;
- treat autoplay, synthetic balance, or passing unit tests as human evidence;
- use precise invented numbers without labeling them as examples or formulas;
- generate fictional repository paths, APIs, imports, or merge instructions;
- return only a high-level summary when a packet requests complete artifacts.

## 8. Definition of done for the blind swarm

The swarm is finished when a repository-owning integration agent can answer,
without rereading the prior conversation:

1. What is actually current in the supplied snapshot?
2. Which documents or assumptions are stale?
3. What is the next human test, and exactly what should it measure?
4. Which tuning questions can be modeled, and which require players?
5. Which new content is truthful now, and which needs a new system?
6. What are the top determinism, visual-readability, device, and licensing
   risks?
7. What should be implemented next, by what acceptance criteria, and what must
   not be touched yet?

Return independent artifacts plus the final synthesis. Do not return a claim of
integration. The owner-side agent will decide what to bring into the project.
