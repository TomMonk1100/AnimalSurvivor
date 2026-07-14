/* global console, process, window, document, requestAnimationFrame, URL, getComputedStyle, performance, setTimeout */
/**
 * Focused, renderer-facing P2 evidence capture.
 *
 * This intentionally does not create an effect-spawner or mutate simulation
 * state. It starts a real production-preview run, waits for an authoritative
 * trait presentation event already exposed by the app driver, records the
 * supporting compositor video, and captures phase-timed compositor screenshots
 * after rAF has observed the live driver in each review window. Because phase
 * screenshots deliberately hold a rendered state, this WebM is provenance
 * only; it is never used as false exact-tick or continuous-motion evidence.
 * The resulting
 * strips make the signature body,
 * debris, and ground-contact read reviewable without confusing a broad
 * autoplay sheet for proof of a particular effect.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { createCanvas, loadImage } from 'canvas';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webToyRoot = resolve(scriptDirectory, '..');
const workspaceRoot = resolve(webToyRoot, '../..');
const capturesRoot = join(workspaceRoot, 'docs', 'vfx', 'captures');
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const STRIP_FRAME_COUNT = 3;
const DEFAULT_TIMEOUT_SECONDS = 45;
const DEFAULT_MAX_ATTEMPTS = 4;
const FOCUS_WIDTH = 640;
const FOCUS_HEIGHT = 432;
const FOCUS_SCALE = 2;
const POST_EVENT_RECORD_MS = 750;
// `COMBAT_DAMAGE_SOURCE.heroSpit` is intentionally repeated here rather than
// imported into the page probe: the capture page only reads the public driver
// snapshots, whose compact source value is part of that public view contract.
const HERO_SPIT_SOURCE_CODE = 7;

const TARGETS = Object.freeze([
  Object.freeze({
    id: 'greg-fox-swipe',
    hero: 'greg',
    label: 'Greg — Fox Swipe',
    predicate: Object.freeze({
      stream: 'trait',
      kind: 'meleeArc',
      sourceId: 'greg-fox-swipe',
      meleeArcResolved: true,
    }),
    captureMode: 'single-event-lifecycle',
    eventEvidenceRole: 'signature-event',
    // The painted foxSwipe card and its signature composite remain live
    // through age 12 inclusive. The generic underlay ends earlier, but it is
    // not safe to call a frame zero while the authored body still exists.
    visualLifetimeTicks: 12,
    releaseEvidence: Object.freeze({
      phase: 'post-fox-swipe-family-zero-envelope',
      mode: 'post-family-event-envelope-terminal-and-zero',
      familyId: 'illustrated-fox-swipe',
      familyVisualLifetimeTicks: 12,
      inclusiveTerminalTick: true,
      minimumClearTickDelta: 13,
      maximumCaptureTickDelta: 15,
      maximumWaitTicks: 24,
      requiresNoLaterSameSourceOrFamilyEvent: true,
      // These are the only real trait records that route to the same painted
      // foxSwipe body. A later Rush Rake must not be mislabelled as Greg's
      // original basic Swipe simply because it looks related on screen.
      familyPredicate: Object.freeze({
        kind: 'meleeArc',
        sourceIds: Object.freeze(['greg-fox-swipe', 'greg-rush-rake']),
        tags: Object.freeze(['greg-fox-swipe', 'greg-rush-rake']),
        meleeArcResolved: true,
      }),
    }),
    // Fixed target-local crop anchors derived from the deterministic real
    // production route. They only choose post-capture framing; no canvas
    // pixels, renderer state, or gameplay state are read or changed.
    focusAnchor: Object.freeze({ x: 0.5, y: 0.5 }),
    milestoneWindows: Object.freeze([
      Object.freeze({ phase: 'early', minimumTickDelta: 1, maximumTickDelta: 3 }),
      Object.freeze({ phase: 'mid', minimumTickDelta: 4, maximumTickDelta: 6 }),
      Object.freeze({ phase: 'near-terminal', minimumTickDelta: 8, maximumTickDelta: 10 }),
    ]),
  }),
  Object.freeze({
    id: 'benny-earth-wave',
    hero: 'benny',
    label: 'Benny — Trample Earth Wave',
    predicate: Object.freeze({
      stream: 'trait',
      kind: 'telegraph',
      sourceId: 'benny-trample',
      tag: 'benny-trample-wave',
    }),
    captureMode: 'grouped-burst-lifecycle',
    eventEvidenceRole: 'first-ridge-event',
    visualLifetimeTicks: 20,
    // A base Trample's second real ridge is emitted at +7 while the first
    // ridge remains alive for 20 ticks. A +8 image is therefore an overlap,
    // not the first ridge's release. The capture deliberately stops its
    // anatomy frames at +6 and journals the complete burst independently.
    burst: Object.freeze({
      id: 'sequential-trample-ridges',
      minimumWaveCount: 2,
      maximumInterWaveGapTicks: 7,
      visualLifetimeTicks: 20,
      firstRidgeOverlapStartsAtTickDelta: 7,
      screenshotPolicy: 'first-ridge-only-before-next-ridge',
      releaseFrameClaimed: false,
      noOverlapReason: 'The next real ridge begins at +7 while the first ridge remains visible through its 20-tick presentation lifetime.',
    }),
    postBurstReleaseEvidence: Object.freeze({
      phase: 'after-complete-burst-zero-envelope',
      mode: 'post-complete-group-zero-envelope',
      requiresNoIndependentWaveThroughExpiry: true,
      requiresNoActiveSameSourceEnvelope: true,
      // A complete group should become unambiguous quickly. Bound the wait so
      // an endlessly busy run reports an honest absence rather than turning a
      // missing quiet window into a capture timeout/retry loop.
      maximumWaitTicks: 120,
    }),
    // Trample's real forward wave sits above Benny in the live camera. A
    // central crop hid its source body even when the full compositor frame
    // showed it, so retain the hero-adjacent lane in the evidence crop.
    focusAnchor: Object.freeze({ x: 0.48, y: 0.36 }),
    milestoneWindows: Object.freeze([
      Object.freeze({ phase: 'first-ridge-early', minimumTickDelta: 1, maximumTickDelta: 2, requiresNoSequentialOverlap: true }),
      Object.freeze({ phase: 'first-ridge-mid', minimumTickDelta: 3, maximumTickDelta: 4, requiresNoSequentialOverlap: true }),
      Object.freeze({ phase: 'first-ridge-pre-next-ridge', minimumTickDelta: 5, maximumTickDelta: 6, requiresNoSequentialOverlap: true }),
    ]),
  }),
  Object.freeze({
    id: 'gracie-spit',
    hero: 'gracie',
    label: 'Gracie — Spit Comet',
    predicate: Object.freeze({
      stream: 'trait',
      kind: 'telegraph',
      sourceId: 'gracie-spit',
    }),
    captureMode: 'snapshot-projectile-lifecycle',
    // The cast cue only helps us find the actual launch. The rendered attack
    // claim is made exclusively from a locked, live `heroSpit` snapshot item.
    eventEvidenceRole: 'launch-discovery-only',
    telegraphCardClaimed: false,
    visualLifetimeTicks: 90,
    projectile: Object.freeze({
      source: HERO_SPIT_SOURCE_CODE,
      role: 0,
      sourceLabel: 'heroSpit',
      ticksPerSecond: 60,
      lockTimeoutTicks: 12,
      maximumLaunchOriginError: 32,
      minimumHeadingDot: 0.25,
      requiredLiveSnapshot: 'curr',
    }),
    impactEvidence: Object.freeze({
      phase: 'source-correlated-impact-contact',
      sourceId: 'gracie-spit',
      combatKind: 'enemyHit',
      ticksPerSecond: 60,
      maximumWaitTicks: 60,
      maximumCaptureDelayTicks: 1,
      maximumTrajectoryError: 34,
      terminalGraceTicks: 2,
    }),
    focusAnchor: Object.freeze({ x: 0.5, y: 0.5 }),
    milestoneWindows: Object.freeze([
      Object.freeze({ phase: 'launch', minimumTickDelta: 1, maximumTickDelta: 3 }),
      Object.freeze({ phase: 'travel', minimumTickDelta: 4, maximumTickDelta: 6 }),
      Object.freeze({ phase: 'late-travel', minimumTickDelta: 7, maximumTickDelta: 10 }),
    ]),
  }),
]);

class EvidenceError extends Error {}

function fail(message) {
  throw new EvidenceError(`[p2-signature-evidence] ${message}`);
}

function normalizeIteration(value) {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) {
    fail(`iteration must contain only letters, digits, dots, underscores, or hyphens: ${value}`);
  }
  return value;
}

function isoIteration() {
  return `p2-signatures-${new Date().toISOString().replace(/[:.]/gu, '-').replace(/Z$/u, 'Z')}`;
}

function parsePositiveInteger(value, label, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`${label} must be a positive integer: ${value}`);
  return parsed;
}

function parseArgs(argv) {
  const args = {
    baseUrl: null,
    iteration: isoIteration(),
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    port: 5202,
    seed: '3',
    targets: TARGETS.map((target) => target.id),
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--base-url' && value) {
      args.baseUrl = value;
      index++;
    } else if (argument === '--iteration' && value) {
      args.iteration = normalizeIteration(value);
      index++;
    } else if (argument === '--max-attempts' && value) {
      args.maxAttempts = parsePositiveInteger(value, '--max-attempts', DEFAULT_MAX_ATTEMPTS);
      index++;
    } else if (argument === '--port' && value) {
      args.port = parsePositiveInteger(value, '--port', 5202);
      if (args.port > 65535) fail(`--port must be at most 65535: ${value}`);
      index++;
    } else if (argument === '--seed' && value) {
      args.seed = value;
      index++;
    } else if (argument === '--target' && value) {
      const requested = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      if (requested.length === 0) fail('--target needs at least one target id');
      for (const id of requested) {
        if (!TARGETS.some((target) => target.id === id)) {
          fail(`unknown --target ${id}; use ${TARGETS.map((target) => target.id).join(', ')}`);
        }
      }
      args.targets = [...new Set(requested)];
      index++;
    } else if (argument === '--timeout-seconds' && value) {
      args.timeoutSeconds = parsePositiveInteger(value, '--timeout-seconds', DEFAULT_TIMEOUT_SECONDS);
      index++;
    } else if (argument === '--help') {
      console.log(`Usage: node scripts/p2-signature-evidence.mjs [options]

Captures real normal-speed rendered-frame evidence for Greg Fox Swipe, Benny
Earth Wave, and Gracie Spit. Default mode builds a production preview and runs
headed Chromium with hardware WebGL. It never injects or fabricates VFX events;
phase screenshots momentarily pause only the public presentation control after
the already-rendered live driver reaches the requested window.

Greg is reviewed across early, mid, and near-terminal anatomy. A separate
zero-envelope frame is admitted only after the whole illustrated foxSwipe
family has passed its inclusive renderer lifetime and no later same-source or
family-alias event appears; otherwise report.json records it as unavailable.
That final frame does not claim a pixel read.

Benny is reviewed as a grouped two-or-more-ridge Trample lifecycle: its three
anatomy screenshots stop before the next real ridge can overlap the first, and
report.json names the observed burst separately. A post-burst release image is
captured only after the completed selected group has a public zero envelope and
no later independent wave overlaps its expiry; otherwise it is reported as
unavailable rather than mislabeled.

Gracie's cast telegraph is launch discovery only: every anatomy screenshot
requires one exact live public heroSpit snapshot id with x/y/velocity; no
telegraph card is claimed. An optional impact/contact screenshot is admitted
only when a real public gracie-spit enemyHit also agrees with the locked
projectile's public trajectory; absence is reported honestly.

  --iteration <name>        Output directory below docs/vfx/captures/.
  --seed <seed>             Fixed query seed (default: 3).
  --target <ids>            Comma-separated target ids (default: all three).
  --timeout-seconds <n>     Max real seconds to wait for each event (default: 45).
  --max-attempts <n>        Fresh-run retries if a capture cannot complete (default: 4).
  --port <n>                Preview port when no --base-url is given (default: 5202).
  --base-url <url>          Reuse an already-running production preview.

Target ids: ${TARGETS.map((target) => target.id).join(', ')}

Output contains per-target compositor-video frames, true 2x target-local crops,
color and grayscale strips, report.json, and README.md with the exact command.
`);
      process.exit(0);
    } else {
      fail(`unknown or incomplete argument: ${argument}`);
    }
  }
  args.iteration = normalizeIteration(args.iteration);
  return args;
}

function fileBytes(path) {
  return statSync(path).size;
}

function artifactPath(outputDirectory, absolutePath) {
  return relative(outputDirectory, absolutePath).split('\\').join('/');
}

function runningUrl(baseUrl, target, seed) {
  const url = new URL(baseUrl);
  url.searchParams.set('autopilot', '1');
  url.searchParams.set('hero', target.hero);
  url.searchParams.set('seed', seed);
  return url.toString();
}

function sourceRevision() {
  try {
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    return { headSha, dirty: status.trim().length > 0 };
  } catch {
    return { headSha: 'unavailable', dirty: null };
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * P2 evidence is only meaningful when it names the exact painted atlas and
 * router source built into the recorded preview. Git HEAD alone is not enough
 * in a dirty visual pass, so keep both SHA-256 values in the capture report.
 */
function p2VisualAssetProvenance() {
  const signatureAtlas = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-signature-frames-v3.png');
  const signatureBodiesAtlas = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-signature-bodies-v1.png');
  const impactCore = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-impact-core-v1.png');
  const signatureDebris = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-signature-debris-v1.png');
  const groundContact = join(workspaceRoot, 'assets', 'ui', 'vfx', 'wildguard-ground-contact-v1.png');
  const atlasRouter = join(webToyRoot, 'src', 'render', 'wildguard-vfx-atlas.ts');
  const illustratedMotion = join(webToyRoot, 'src', 'render', 'illustrated-vfx-motion.ts');
  const signatureComposite = join(webToyRoot, 'src', 'render', 'signature-vfx-composite-presentation.ts');
  const projectileSignaturePresentation = join(webToyRoot, 'src', 'render', 'projectile-signature-vfx-presentation.ts');
  const sceneIntegration = join(webToyRoot, 'src', 'render', 'playcanvas-scene.ts');
  for (const path of [
    signatureAtlas,
    signatureBodiesAtlas,
    impactCore,
    signatureDebris,
    groundContact,
    atlasRouter,
    illustratedMotion,
    signatureComposite,
    projectileSignaturePresentation,
    sceneIntegration,
  ]) {
    if (!existsSync(path)) fail(`missing active P2 visual source: ${path}`);
  }
  const sourceHash = (path) => ({
    relativePath: relative(workspaceRoot, path).split('\\').join('/'),
    sha256: sha256File(path),
  });
  return {
    signatureAtlas: {
      relativePath: relative(workspaceRoot, signatureAtlas).split('\\').join('/'),
      bytes: fileBytes(signatureAtlas),
      sha256: sha256File(signatureAtlas),
    },
    signatureBodiesAtlas: {
      relativePath: relative(workspaceRoot, signatureBodiesAtlas).split('\\').join('/'),
      bytes: fileBytes(signatureBodiesAtlas),
      sha256: sha256File(signatureBodiesAtlas),
    },
    impactCore: {
      relativePath: relative(workspaceRoot, impactCore).split('\\').join('/'),
      bytes: fileBytes(impactCore),
      sha256: sha256File(impactCore),
    },
    signatureDebris: {
      relativePath: relative(workspaceRoot, signatureDebris).split('\\').join('/'),
      bytes: fileBytes(signatureDebris),
      sha256: sha256File(signatureDebris),
    },
    groundContact: {
      relativePath: relative(workspaceRoot, groundContact).split('\\').join('/'),
      bytes: fileBytes(groundContact),
      sha256: sha256File(groundContact),
    },
    rendererSources: {
      atlasRouter: sourceHash(atlasRouter),
      illustratedMotion: sourceHash(illustratedMotion),
      signatureComposite: sourceHash(signatureComposite),
      projectileSignaturePresentation: sourceHash(projectileSignaturePresentation),
      sceneIntegration: sourceHash(sceneIntegration),
    },
  };
}

async function startProductionPreview(port) {
  const source = {
    ...sourceRevision(),
    visualAssetProvenance: p2VisualAssetProvenance(),
  };
  const buildStartedAt = new Date().toISOString();
  // Run the package's full release build (including TypeScript) rather than
  // Vite alone. This makes a stale dist impossible to mistake for P2 proof.
  await runProcess('npm', ['run', 'build']);
  const buildCompletedAt = new Date().toISOString();
  const server = await preview({
    root: webToyRoot,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port, strictPort: false },
  });
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    fail('Vite preview did not expose a TCP port');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
    mode: 'production-preview',
    build: {
      command: 'npm run build',
      source,
      buildStartedAt,
      buildCompletedAt,
    },
  };
}

async function pageRunState(page) {
  return page.evaluate(() => {
    const handle = window.__webToy;
    const canvas = document.getElementById('game-canvas');
    const intro = document.getElementById('run-intro');
    const banner = document.getElementById('ctx-banner');
    return {
      hasApp: handle !== undefined,
      introHidden: intro?.hidden === true,
      rendererBanner: banner ? getComputedStyle(banner).display : 'missing',
      simTick: handle?.driver.tick ?? -1,
      webgl2: canvas?.getContext('webgl2') !== null,
    };
  });
}

async function ensureRunStarted(page) {
  const running = () => page.waitForFunction(() => {
    const handle = window.__webToy;
    return handle !== undefined && handle.driver.tick > 3 && document.getElementById('run-intro')?.hidden === true;
  }, undefined, { timeout: 15_000 });
  try {
    await running();
    return { scriptedStartFallback: false, state: await pageRunState(page) };
  } catch {
    const start = page.locator('#run-intro:not([hidden]) #run-intro-start');
    if (await start.count() > 0) await start.click({ timeout: 1_000 });
    try {
      await running();
      return { scriptedStartFallback: true, state: await pageRunState(page) };
    } catch (error) {
      const state = await pageRunState(page);
      fail(`game did not reach rendered combat state: ${JSON.stringify(state)}; ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * The app's animation-frame loop is installed before this page-owned probe.
 * It journals the real event wall time and normal rAF driver samples. Once a
 * target event is found, it can momentarily pause the public presentation
 * control on a requested post-event rAF so a headed compositor screenshot can
 * capture an already-rendered exact phase state without encoder-latency lies.
 * It never reads canvas pixels or changes simulation state, commands, inputs,
 * transforms, materials, or textures.
 *
 * Gracie is intentionally stricter than an event-driven proof: the cast event
 * discovers a launch, but every reviewed phase must retain one exact packed
 * `heroSpit` id from the public `driver.curr`/`driver.prev` snapshots. Benny
 * is intentionally different: it journals a sequence of real ground-wave
 * events but captures only first-ridge frames before the next ridge can
 * overlap it.
 */
async function installVideoEventProbe(page, target) {
  await page.evaluate((requested) => {
    const burstConfig = requested.burst ?? null;
    const projectileConfig = requested.projectile ?? null;
    const releaseConfig = requested.releaseEvidence ?? null;
    const postBurstReleaseConfig = requested.postBurstReleaseEvidence ?? null;
    const impactConfig = requested.impactEvidence ?? null;
    const state = {
      status: 'waiting',
      captureMode: requested.captureMode ?? 'single-event-lifecycle',
      eventEvidenceRole: requested.eventEvidenceRole ?? 'signature-event',
      telegraphCardClaimed: requested.telegraphCardClaimed !== false,
      eventTick: null,
      event: null,
      eventPageNowMs: null,
      eventWallEpochMs: null,
      rafSamples: [],
      matchingSourceEvents: [],
      targetFamilyEvents: [],
      releaseEvidenceState: releaseConfig === null ? null : {
        status: 'not-requested',
        familyId: releaseConfig.familyId ?? null,
        familyVisualLifetimeTicks: releaseConfig.familyVisualLifetimeTicks ?? releaseConfig.visualLifetimeTicks ?? null,
        inclusiveTerminalTick: releaseConfig.inclusiveTerminalTick === true,
        contamination: null,
        reason: null,
      },
      milestone: null,
      milestones: [],
      milestonesStarted: false,
      projectileLock: null,
      projectileLockAttempts: [],
      projectileTrajectory: [],
      projectileTerminal: null,
      impactEvidence: impactConfig === null ? null : {
        status: 'not-requested',
        sourceId: impactConfig.sourceId,
        combatKind: impactConfig.combatKind,
        maximumTrajectoryError: impactConfig.maximumTrajectoryError,
        candidates: [],
        accepted: null,
        terminal: null,
        reason: null,
      },
      supplementary: {
        status: 'idle',
        kind: null,
        phase: null,
        evidence: null,
        reason: null,
        captured: null,
        pendingHold: false,
      },
      burstLifecycle: burstConfig === null ? null : {
        id: burstConfig.id,
        lifecycleKind: 'grouped-sequential-trait-events',
        firstRidgeTick: null,
        waveEvents: [],
        observedInterWaveGaps: [],
        independentLaterWaveEvents: [],
        minimumWaveCount: burstConfig.minimumWaveCount,
        maximumInterWaveGapTicks: burstConfig.maximumInterWaveGapTicks,
        visualLifetimeTicks: burstConfig.visualLifetimeTicks,
        firstRidgeOverlapStartsAtTickDelta: burstConfig.firstRidgeOverlapStartsAtTickDelta,
        screenshotPolicy: burstConfig.screenshotPolicy,
        releaseFrameClaimed: burstConfig.releaseFrameClaimed === true,
        noOverlapReason: burstConfig.noOverlapReason,
        status: 'collecting',
        groupClosedAtTick: null,
        // This is only the nominal expiry of the last ridge in the selected
        // group. It is not a global quiet-frame claim: another cast can begin
        // before it, and only a separately revalidated supplementary capture
        // may ever claim a post-group zero-envelope frame.
        nominalLastGroupRidgeExpiryTick: null,
        truePostBurstReleaseFrameClaimed: false,
      },
      error: null,
    };
    let stopped = false;
    let rafSamplingStarted = false;
    const MAX_RAF_SAMPLES = 240;
    const seenBurstEventKeys = new Set();
    const seenMatchingSourceEventKeys = new Set();
    const seenTargetFamilyEventKeys = new Set();
    const seenImpactEventKeys = new Set();

    function finite(value) {
      return typeof value === 'number' && Number.isFinite(value);
    }

    function finiteInteger(value) {
      return Number.isInteger(value);
    }

    function eventSnapshot(event) {
      return {
        kind: event.kind,
        sourceId: event.sourceId,
        tag: event.tag ?? null,
        tick: event.tick,
        amount: event.amount ?? null,
        count: event.count ?? null,
        critical: event.critical ?? null,
        meleeArcResolved: event.meleeArcResolved ?? null,
        originX: event.originX ?? null,
        originY: event.originY ?? null,
        dirX: event.dirX ?? null,
        dirY: event.dirY ?? null,
        radius: event.radius ?? null,
        range: event.range ?? null,
        durationTicks: event.durationTicks ?? null,
      };
    }

    function combatEventSnapshot(event) {
      return {
        kind: event.kind,
        sourceId: event.sourceId,
        tick: event.tick,
        x: event.x,
        y: event.y,
        amount: event.amount ?? null,
        critical: event.critical === true,
        targetId: event.targetId ?? null,
        pickupKind: event.pickupKind ?? null,
      };
    }

    function matchesPredicate(event) {
      if (!event) return false;
      if (event.kind !== requested.predicate.kind) return false;
      if (event.sourceId !== requested.predicate.sourceId) return false;
      if (requested.predicate.tag !== undefined && event.tag !== requested.predicate.tag) return false;
      return requested.predicate.meleeArcResolved === undefined || event.meleeArcResolved === requested.predicate.meleeArcResolved;
    }

    function matchesCurrentEvent(event, driver) {
      return matchesPredicate(event) && event.tick === driver.tick;
    }

    /**
     * Mirrors the renderer's narrow foxSwipe routing without importing
     * renderer state into the capture page. It intentionally accepts only the
     * authored sources/tags that can paint this family of claw body.
     */
    function matchesReleaseFamily(event) {
      const predicate = releaseConfig?.familyPredicate;
      if (predicate === undefined || event === undefined || event === null) return false;
      if (event.kind !== predicate.kind) return false;
      const sourceMatches = predicate.sourceIds?.includes(event.sourceId) === true;
      const tagMatches = predicate.tags?.includes(event.tag) === true;
      if (!sourceMatches && !tagMatches) return false;
      return predicate.meleeArcResolved === undefined || event.meleeArcResolved === predicate.meleeArcResolved;
    }

    function failProbe(message, unpause = false) {
      if (unpause) {
        const handle = window.__webToy;
        if (handle !== undefined) handle.controls.paused = false;
      }
      state.status = 'error';
      state.error = message;
    }

    function sampleRaf() {
      if (stopped) return;
      const driver = window.__webToy?.driver;
      if (driver === undefined) {
        failProbe('public driver disappeared during post-event video sampling');
        return;
      }
      const pageNowMs = performance.now();
      const sample = {
        pageNowMs,
        wallEpochMs: performance.timeOrigin + pageNowMs,
        simTick: driver.tick,
      };
      if (state.rafSamples.length < MAX_RAF_SAMPLES) state.rafSamples.push(sample);
      requestAnimationFrame(sampleRaf);
    }

    function startRafSampling() {
      if (rafSamplingStarted) return;
      rafSamplingStarted = true;
      sampleRaf();
    }

    function publicProjectileSnapshot(snapshotName, snapshot, index) {
      const projectiles = snapshot?.projectiles;
      if (projectiles === undefined) return null;
      const id = projectiles.id[index];
      const x = projectiles.x[index];
      const y = projectiles.y[index];
      const velocityX = projectiles.velocityX[index];
      const velocityY = projectiles.velocityY[index];
      const source = projectiles.source[index];
      const role = projectiles.role[index];
      if (!finiteInteger(id)
        || !finite(x)
        || !finite(y)
        || !finite(velocityX)
        || !finite(velocityY)
        || !finiteInteger(source)
        || !finiteInteger(role)
      ) return null;
      return {
        snapshot: snapshotName,
        snapshotTick: snapshot.tick,
        index,
        id,
        source,
        role,
        x,
        y,
        velocityX,
        velocityY,
        speed: Math.hypot(velocityX, velocityY),
      };
    }

    function candidateForGracieLaunch(driver, event) {
      if (projectileConfig === null) return null;
      const candidates = [];
      for (const snapshotName of ['curr', 'prev']) {
        const snapshot = driver[snapshotName];
        const projectiles = snapshot?.projectiles;
        if (projectiles === undefined) continue;
        for (let index = 0; index < projectiles.count; index++) {
          const candidate = publicProjectileSnapshot(snapshotName, snapshot, index);
          if (candidate === null) continue;
          if (candidate.source !== projectileConfig.source || candidate.role !== projectileConfig.role) continue;
          if (!(candidate.speed > 1e-6)) continue;

          const elapsedTicks = Math.max(0, (candidate.snapshotTick ?? driver.tick) - event.tick);
          const perTickX = candidate.velocityX / projectileConfig.ticksPerSecond;
          const perTickY = candidate.velocityY / projectileConfig.ticksPerSecond;
          const launchX = candidate.x - perTickX * elapsedTicks;
          const launchY = candidate.y - perTickY * elapsedTicks;
          const hasOrigin = finite(event.originX) && finite(event.originY);
          const launchOriginError = hasOrigin
            ? Math.hypot(launchX - event.originX, launchY - event.originY)
            : null;
          if (launchOriginError !== null && launchOriginError > projectileConfig.maximumLaunchOriginError) continue;

          const eventDirectionLength = Math.hypot(event.dirX ?? 0, event.dirY ?? 0);
          const headingDot = eventDirectionLength > 1e-6
            ? (((event.dirX ?? 0) * candidate.velocityX) + ((event.dirY ?? 0) * candidate.velocityY))
              / (eventDirectionLength * candidate.speed)
            : null;
          if (headingDot !== null && headingDot < projectileConfig.minimumHeadingDot) continue;
          const score = (launchOriginError ?? 0)
            + (headingDot === null ? 0 : (1 - headingDot) * 0.25)
            + (snapshotName === 'curr' ? 0 : 0.001);
          candidates.push({
            ...candidate,
            backProjectedLaunchX: launchX,
            backProjectedLaunchY: launchY,
            launchOriginError,
            headingDot,
            selectionScore: score,
          });
        }
      }
      candidates.sort((left, right) => left.selectionScore - right.selectionScore || left.id - right.id);
      return candidates[0] ?? null;
    }

    function lockGracieProjectile(driver) {
      if (state.projectileLock !== null) return true;
      if (state.event === null || projectileConfig === null) return false;
      const candidate = candidateForGracieLaunch(driver, state.event);
      if (candidate === null) {
        if (state.projectileLockAttempts.length < projectileConfig.lockTimeoutTicks + 1) {
          state.projectileLockAttempts.push({
            driverTick: driver.tick,
            status: 'no-matching-live-heroSpit-in-public-curr-or-prev',
          });
        }
        if (state.eventTick !== null && driver.tick - state.eventTick > projectileConfig.lockTimeoutTicks) {
          failProbe(`could not lock a public ${projectileConfig.sourceLabel} projectile within ${String(projectileConfig.lockTimeoutTicks)} ticks of the launch discovery event`);
        }
        return false;
      }
      state.projectileLock = {
        // This is the complete packed EntityId, not a slot. Exact equality
        // continues to reject a reused slot from a later generation.
        id: candidate.id,
        identityContract: 'exact packed EntityId equality; never slot-only matching',
        source: candidate.source,
        sourceLabel: projectileConfig.sourceLabel,
        role: candidate.role,
        lockedFromSnapshot: candidate.snapshot,
        lockSnapshotTick: candidate.snapshotTick,
        phaseAnchorTick: driver.tick,
        lockDriverTick: driver.tick,
        x: candidate.x,
        y: candidate.y,
        velocityX: candidate.velocityX,
        velocityY: candidate.velocityY,
        speed: candidate.speed,
        backProjectedLaunchX: candidate.backProjectedLaunchX,
        backProjectedLaunchY: candidate.backProjectedLaunchY,
        launchOriginError: candidate.launchOriginError,
        headingDot: candidate.headingDot,
        selectionScore: candidate.selectionScore,
      };
      state.projectileLockAttempts.push({
        driverTick: driver.tick,
        status: 'locked',
        id: candidate.id,
        lockedFromSnapshot: candidate.snapshot,
        x: candidate.x,
        y: candidate.y,
        velocityX: candidate.velocityX,
        velocityY: candidate.velocityY,
      });
      return true;
    }

    function liveLockedProjectile(driver) {
      if (state.projectileLock === null || projectileConfig === null) return null;
      // Anatomy frames require the current snapshot specifically. A `prev`
      // match alone is useful for lock discovery but is not accepted as a live
      // rendered-frame claim.
      const snapshot = driver.curr;
      const projectiles = snapshot?.projectiles;
      if (projectiles === undefined) return null;
      for (let index = 0; index < projectiles.count; index++) {
        if (projectiles.id[index] !== state.projectileLock.id) continue;
        const projectile = publicProjectileSnapshot('curr', snapshot, index);
        if (projectile === null) return null;
        if (projectile.source !== projectileConfig.source || projectile.role !== projectileConfig.role) return null;
        if (!(projectile.speed > 1e-6)) return null;
        return {
          ...projectile,
          exactLockedIdMatch: true,
          requiredLiveSnapshot: projectileConfig.requiredLiveSnapshot,
        };
      }
      return null;
    }

    /**
     * Keeps a compact public-snapshot motion trail for the one locked packed
     * projectile. The trail is evidence only: it lets a later combat hit prove
     * spatial continuity with this exact projectile rather than merely sharing
     * the broad `gracie-spit` source label.
     */
    function recordProjectileTrajectory(driver) {
      if (state.projectileLock === null || projectileConfig === null) return null;
      const live = liveLockedProjectile(driver);
      if (live !== null) {
        const latest = state.projectileTrajectory[state.projectileTrajectory.length - 1] ?? null;
        if (latest === null || latest.snapshotTick !== live.snapshotTick || latest.id !== live.id) {
          state.projectileTrajectory.push({
            snapshotTick: live.snapshotTick,
            driverTick: driver.tick,
            id: live.id,
            x: live.x,
            y: live.y,
            velocityX: live.velocityX,
            velocityY: live.velocityY,
            speed: live.speed,
          });
          if (state.projectileTrajectory.length > 120) state.projectileTrajectory.shift();
        }
        return live;
      }
      if (state.projectileTerminal === null) {
        state.projectileTerminal = {
          observedAtDriverTick: driver.tick,
          lockedPackedProjectileId: state.projectileLock.id,
          lastTrajectorySample: state.projectileTrajectory[state.projectileTrajectory.length - 1] ?? null,
        };
        if (state.impactEvidence !== null) state.impactEvidence.terminal = state.projectileTerminal;
      }
      return null;
    }

    function combatEventKey(event) {
      return [
        event.tick,
        event.kind,
        event.sourceId,
        event.targetId ?? '',
        event.x ?? '',
        event.y ?? '',
        event.amount ?? '',
        event.critical === true ? 'critical' : 'normal',
      ].join('|');
    }

    function impactCorrelationFor(event) {
      if (impactConfig === null || state.projectileLock === null) return null;
      if (!finiteInteger(event.tick) || !finite(event.x) || !finite(event.y)) return null;
      let sample = null;
      for (const candidate of state.projectileTrajectory) {
        if (candidate.snapshotTick <= event.tick) sample = candidate;
      }
      if (sample === null) return null;
      const elapsedTicks = Math.max(0, event.tick - sample.snapshotTick);
      const predictedX = sample.x + sample.velocityX / impactConfig.ticksPerSecond * elapsedTicks;
      const predictedY = sample.y + sample.velocityY / impactConfig.ticksPerSecond * elapsedTicks;
      const trajectoryError = Math.hypot(event.x - predictedX, event.y - predictedY);
      return {
        lockedPackedProjectileId: state.projectileLock.id,
        trajectorySnapshot: sample,
        elapsedTicks,
        predictedX,
        predictedY,
        impactX: event.x,
        impactY: event.y,
        trajectoryError,
        maximumTrajectoryError: impactConfig.maximumTrajectoryError,
        accepted: trajectoryError <= impactConfig.maximumTrajectoryError,
      };
    }

    function recordImpactEvent(event) {
      if (impactConfig === null || state.impactEvidence === null || state.projectileLock === null) return;
      if (event.kind !== impactConfig.combatKind || event.sourceId !== impactConfig.sourceId) return;
      if (!finiteInteger(event.tick) || event.tick < state.projectileLock.phaseAnchorTick) return;
      const key = combatEventKey(event);
      if (seenImpactEventKeys.has(key)) return;
      seenImpactEventKeys.add(key);
      const correlation = impactCorrelationFor(event);
      const candidate = {
        event: combatEventSnapshot(event),
        correlation,
        accepted: correlation?.accepted === true,
      };
      state.impactEvidence.candidates.push(candidate);
      if (state.impactEvidence.candidates.length > 48) state.impactEvidence.candidates.shift();
      if (candidate.accepted && state.impactEvidence.accepted === null) {
        state.impactEvidence.accepted = candidate;
        state.impactEvidence.status = 'source-correlated-hit-observed';
      }
    }

    function collectImpactEvents(driver) {
      if (impactConfig === null || state.projectileLock === null) return;
      for (const event of driver.combatPresentationEvents ?? []) recordImpactEvent(event);
    }

    function eventKey(event) {
      return [
        event.tick,
        event.kind,
        event.sourceId,
        event.tag ?? '',
        event.originX ?? '',
        event.originY ?? '',
        event.dirX ?? '',
        event.dirY ?? '',
      ].join('|');
    }

    /** Journals only public records matching this target’s authored source. */
    function recordMatchingSourceEvent(event) {
      if (state.eventTick === null || event.tick < state.eventTick || !matchesPredicate(event)) return;
      const key = eventKey(event);
      if (seenMatchingSourceEventKeys.has(key)) return;
      seenMatchingSourceEventKeys.add(key);
      state.matchingSourceEvents.push(eventSnapshot(event));
      state.matchingSourceEvents.sort((left, right) => left.tick - right.tick);
    }

    function collectMatchingSourceEvents(driver) {
      for (const event of driver.traitPresentationEvents ?? []) recordMatchingSourceEvent(event);
    }

    function recordTargetFamilyEvent(event) {
      if (!matchesReleaseFamily(event)) return;
      const key = eventKey(event);
      if (seenTargetFamilyEventKeys.has(key)) return;
      seenTargetFamilyEventKeys.add(key);
      state.targetFamilyEvents.push(eventSnapshot(event));
      state.targetFamilyEvents.sort((left, right) => left.tick - right.tick);
      if (state.targetFamilyEvents.length > 128) state.targetFamilyEvents.shift();
    }

    function collectTargetFamilyEvents(driver) {
      if (releaseConfig === null) return;
      for (const event of driver.traitPresentationEvents ?? []) recordTargetFamilyEvent(event);
    }

    function targetFamilyEventJournal() {
      return state.targetFamilyEvents.map((event) => ({ ...event }));
    }

    function envelopeLifetimeFor(event) {
      const duration = Number(event.durationTicks);
      if (Number.isFinite(duration) && duration > 0) return Math.floor(duration);
      return releaseConfig?.visualLifetimeTicks ?? burstConfig?.visualLifetimeTicks ?? requested.visualLifetimeTicks;
    }

    /**
     * This is intentionally an event-envelope assertion, not a claim that a
     * canvas pixel is transparent. The screenshot makes the terminal visual
     * reviewable while the public event journal proves that no matching source
     * envelope remains active at its captured tick.
     */
    function activeMatchingSourceEnvelopes(tick) {
      return state.matchingSourceEvents.filter((event) => (
        event.tick <= tick && tick < event.tick + envelopeLifetimeFor(event)
      ));
    }

    function zeroEnvelopeAt(tick) {
      const activeEvents = activeMatchingSourceEnvelopes(tick);
      return {
        assertedAtTick: tick,
        activeMatchingSourceEvents: activeEvents,
        clear: activeEvents.length === 0,
        contract: 'public matching-source event envelopes only; compositor pixels remain reviewer-visible evidence rather than programmatically read data',
      };
    }

    /**
     * A true Greg terminal frame needs the painted foxSwipe family to be gone,
     * not merely the selected source's generic underlay. Illustrated cards are
     * inclusive at their expiry tick, hence `<=` rather than `<` here.
     */
    function activeTargetFamilyEnvelopes(tick) {
      if (releaseConfig === null) return [];
      const lifetime = releaseConfig.familyVisualLifetimeTicks ?? releaseConfig.visualLifetimeTicks;
      return state.targetFamilyEvents.filter((event) => (
        event.tick <= tick && tick <= event.tick + lifetime
      ));
    }

    function gregFamilyZeroEnvelopeAt(tick) {
      const activeFamilyEvents = activeTargetFamilyEnvelopes(tick);
      return {
        assertedAtTick: tick,
        activeTargetFamilyEvents: activeFamilyEvents,
        clear: activeFamilyEvents.length === 0,
        contract: 'public event envelope for every authored trait route that can paint the illustrated foxSwipe family; compositor pixels remain reviewer-visible evidence rather than programmatically read data',
      };
    }

    function recordBurstEvent(event) {
      const lifecycle = state.burstLifecycle;
      if (lifecycle === null || state.eventTick === null || event.tick < state.eventTick) return;
      const key = eventKey(event);
      if (seenBurstEventKeys.has(key)) return;
      seenBurstEventKeys.add(key);
      const snapshot = eventSnapshot(event);
      const lastWave = lifecycle.waveEvents[lifecycle.waveEvents.length - 1] ?? null;
      if (lastWave === null || event.tick - lastWave.tick <= lifecycle.maximumInterWaveGapTicks) {
        lifecycle.waveEvents.push({ ...snapshot, ordinal: lifecycle.waveEvents.length + 1 });
        lifecycle.firstRidgeTick ??= event.tick;
        lifecycle.observedInterWaveGaps = lifecycle.waveEvents.slice(1).map((wave, index) => (
          wave.tick - lifecycle.waveEvents[index].tick
        ));
      } else {
        lifecycle.independentLaterWaveEvents.push(snapshot);
      }
    }

    function collectBurstLifecycle(driver) {
      const lifecycle = state.burstLifecycle;
      if (lifecycle === null || state.eventTick === null) return;
      for (const event of driver.traitPresentationEvents ?? []) {
        if (matchesPredicate(event)) recordBurstEvent(event);
      }
      const lastWave = lifecycle.waveEvents[lifecycle.waveEvents.length - 1] ?? null;
      if (lastWave === null || lifecycle.status !== 'collecting') return;
      // Wait past the last legal same-burst spacing. This lets mastery rank
      // add additional real ridges without a hard-coded wave count, while a
      // later independent cast is recorded separately rather than folded into
      // the reviewed burst.
      if (driver.tick <= lastWave.tick + lifecycle.maximumInterWaveGapTicks) return;
      lifecycle.groupClosedAtTick = driver.tick;
      lifecycle.nominalLastGroupRidgeExpiryTick = lastWave.tick + lifecycle.visualLifetimeTicks + 1;
      if (lifecycle.waveEvents.length < lifecycle.minimumWaveCount) {
        failProbe(`grouped ${String(lifecycle.id)} lifecycle closed with only ${String(lifecycle.waveEvents.length)} real ridge event(s); expected at least ${String(lifecycle.minimumWaveCount)}`);
        return;
      }
      lifecycle.status = 'complete';
      if (state.status === 'awaiting-burst-lifecycle') state.status = 'milestones-complete';
    }

    function markSupplementaryUnavailable(kind, reason, evidence = null) {
      if (state.supplementary.kind !== kind || state.supplementary.status === 'captured' || state.supplementary.status === 'captured-shared-milestone') return;
      state.supplementary.status = 'unavailable';
      state.supplementary.pendingHold = false;
      state.supplementary.phase = kind === 'post-burst-release'
        ? postBurstReleaseConfig?.phase ?? null
        : kind === 'greg-zero-envelope'
          ? releaseConfig?.phase ?? null
          : impactConfig?.phase ?? null;
      state.supplementary.evidence = evidence;
      state.supplementary.reason = reason;
      if (kind === 'impact-contact' && state.impactEvidence !== null) {
        state.impactEvidence.status = 'unavailable';
        state.impactEvidence.reason = reason;
      }
      if (kind === 'greg-zero-envelope' && state.releaseEvidenceState !== null) {
        state.releaseEvidenceState.status = 'unavailable';
        state.releaseEvidenceState.reason = reason;
        state.releaseEvidenceState.contamination = evidence?.contamination ?? state.releaseEvidenceState.contamination;
      }
    }

    function remainingMilestoneCount() {
      return Math.max(0, (requested.milestoneWindows ?? []).length - state.milestones.length);
    }

    function resumeAfterSupplementaryCapture() {
      if (remainingMilestoneCount() > 0) {
        state.status = 'matched';
        armNextMilestone();
        return;
      }
      state.status = state.captureMode === 'grouped-burst-lifecycle' && state.burstLifecycle?.status !== 'complete'
        ? 'awaiting-burst-lifecycle'
        : 'milestones-complete';
    }

    /**
     * Holds only a real, already-observed page state. The validator runs again
     * after two rAFs while presentation is paused, so a capture cannot inherit
     * a stale event-envelope or a later overlapping wave.
     */
    function armSupplementaryPause(kind, phase, evidence, validate) {
      if (state.supplementary.status !== 'waiting' || state.supplementary.kind !== kind) return;
      if (state.supplementary.pendingHold) return;
      if (state.status === 'milestone-ready' || state.status === 'supplementary-ready') return;
      const handle = window.__webToy;
      if (handle === undefined) {
        markSupplementaryUnavailable(kind, 'public app handle disappeared before supplementary evidence could hold a rendered state');
        return;
      }
      state.supplementary.pendingHold = true;
      handle.controls.paused = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const pausedDriver = window.__webToy?.driver;
        if (pausedDriver === undefined) {
          state.supplementary.pendingHold = false;
          failProbe('public driver disappeared while preparing supplementary evidence', true);
          return;
        }
        const checked = validate(pausedDriver);
        if (checked.ok !== true) {
          handle.controls.paused = false;
          markSupplementaryUnavailable(kind, checked.reason ?? 'supplementary evidence lost its public correlation before the compositor frame could be held', checked.evidence ?? evidence);
          return;
        }
        state.supplementary.pendingHold = false;
        state.supplementary.status = 'ready';
        state.supplementary.phase = phase;
        state.supplementary.evidence = checked.evidence ?? evidence;
        state.supplementary.reason = null;
        state.supplementary.captured = {
          heldAtDriverTick: pausedDriver.tick,
          captureContract: 'post-render compositor frame held only after public evidence validation; no simulation, event, input, transform, material, or texture state was changed',
        };
        if (kind === 'impact-contact' && state.impactEvidence !== null) state.impactEvidence.status = 'source-correlated-contact-frame-ready';
        state.status = 'supplementary-ready';
      }));
    }

    function bennyPostBurstReleaseAt(driver) {
      const lifecycle = state.burstLifecycle;
      if (lifecycle === null || lifecycle.status !== 'complete') {
        return { ok: false, reason: 'the selected Trample ridge group has not completed yet' };
      }
      const expiryTick = lifecycle.nominalLastGroupRidgeExpiryTick;
      if (!finiteInteger(expiryTick)) {
        return { ok: false, reason: 'the selected Trample ridge group has no nominal last-ridge expiry tick' };
      }
      const overlappingIndependent = lifecycle.independentLaterWaveEvents.find((event) => event.tick <= expiryTick) ?? null;
      if (overlappingIndependent !== null) {
        return {
          ok: false,
          reason: `independent benny-trample wave at tick ${String(overlappingIndependent.tick)} began on or before selected-group expiry ${String(expiryTick)}; no unambiguous after-complete-burst zero-envelope frame exists`,
          evidence: {
            groupClosedAtTick: lifecycle.groupClosedAtTick,
            nominalLastGroupRidgeExpiryTick: expiryTick,
            independentLaterWave: overlappingIndependent,
          },
        };
      }
      if (driver.tick < expiryTick) {
        return { ok: false, reason: 'the selected Trample group has not reached its nominal last-ridge expiry tick yet' };
      }
      const zeroEnvelope = zeroEnvelopeAt(driver.tick);
      if (zeroEnvelope.clear !== true) {
        return {
          ok: false,
          reason: `matching benny-trample event envelope remains active at tick ${String(driver.tick)} after selected-group expiry ${String(expiryTick)}`,
          evidence: {
            groupClosedAtTick: lifecycle.groupClosedAtTick,
            nominalLastGroupRidgeExpiryTick: expiryTick,
            zeroEnvelope,
          },
        };
      }
      return {
        ok: true,
        evidence: {
          groupClosedAtTick: lifecycle.groupClosedAtTick,
          nominalLastGroupRidgeExpiryTick: expiryTick,
          selectedWaveEvents: lifecycle.waveEvents,
          independentLaterWaveEvents: lifecycle.independentLaterWaveEvents,
          zeroEnvelope,
          contract: 'the selected complete group has expired and no matching benny-trample public event envelope is active; this is not a claim that compositor pixels were programmatically inspected',
        },
      };
    }

    function pollPostBurstRelease(driver) {
      if (postBurstReleaseConfig === null || state.supplementary.kind !== 'post-burst-release' || state.supplementary.status !== 'waiting') return;
      const lifecycle = state.burstLifecycle;
      if (lifecycle === null || lifecycle.status !== 'complete') return;
      const expiryTick = lifecycle.nominalLastGroupRidgeExpiryTick;
      const maxWaitTick = (lifecycle.groupClosedAtTick ?? driver.tick) + postBurstReleaseConfig.maximumWaitTicks;
      const checked = bennyPostBurstReleaseAt(driver);
      if (checked.ok === true) {
        armSupplementaryPause('post-burst-release', postBurstReleaseConfig.phase, checked.evidence, bennyPostBurstReleaseAt);
        return;
      }
      const isTerminalConflict = checked.evidence?.independentLaterWave !== undefined
        || (finiteInteger(expiryTick) && driver.tick >= expiryTick && checked.reason !== 'the selected Trample group has not reached its nominal last-ridge expiry tick yet');
      if (isTerminalConflict || driver.tick > maxWaitTick) {
        markSupplementaryUnavailable(
          'post-burst-release',
          checked.reason ?? `no unambiguous Trample zero-envelope frame appeared by tick ${String(maxWaitTick)}`,
          checked.evidence ?? {
            groupClosedAtTick: lifecycle.groupClosedAtTick,
            nominalLastGroupRidgeExpiryTick: expiryTick,
          },
        );
      }
    }

    function gregFamilyContamination() {
      if (state.eventTick === null || state.event === null) return null;
      return state.targetFamilyEvents.find((event) => (
        event.tick > state.eventTick
        || (event.tick === state.eventTick
          && (event.sourceId !== state.event.sourceId || event.tag !== state.event.tag))
      )) ?? null;
    }

    /**
     * Validates the zero panel against the renderer family, not just the
     * selected source. A later foxSwipe-family event makes the terminal claim
     * permanently ambiguous for this selected cast, so it is unavailable
     * rather than retried or silently attributed to the original event.
     */
    function gregFamilyReleaseAt(driver) {
      if (releaseConfig === null || state.releaseEvidenceState === null || state.eventTick === null || state.event === null) {
        return { ok: false, reason: 'the selected Greg event or family release policy is unavailable' };
      }
      collectTargetFamilyEvents(driver);
      const contamination = gregFamilyContamination();
      if (contamination !== null) {
        return {
          ok: false,
          terminal: true,
          reason: `later or alias foxSwipe-family event at tick ${String(contamination.tick)} (${contamination.sourceId}/${contamination.tag ?? 'no-tag'}) contaminates the selected Greg terminal window`,
          evidence: {
            selectedEvent: state.event,
            contamination,
            targetFamilyEvents: targetFamilyEventJournal(),
          },
          contamination,
        };
      }
      const minimumClearTick = state.eventTick + releaseConfig.minimumClearTickDelta;
      if (driver.tick < minimumClearTick) {
        return {
          ok: false,
          reason: `selected foxSwipe family cannot be clear before tick ${String(minimumClearTick)}`,
        };
      }
      const captureDeadlineTick = state.eventTick + releaseConfig.maximumCaptureTickDelta;
      if (driver.tick > captureDeadlineTick) {
        return {
          ok: false,
          terminal: true,
          reason: `missed the strict foxSwipe-family terminal capture window ${String(minimumClearTick)}–${String(captureDeadlineTick)}; later family contamination cannot be ruled out honestly`,
          evidence: { selectedEvent: state.event, targetFamilyEvents: targetFamilyEventJournal(), minimumClearTick, captureDeadlineTick },
        };
      }
      const zeroEnvelope = gregFamilyZeroEnvelopeAt(driver.tick);
      if (zeroEnvelope.clear !== true) {
        return {
          ok: false,
          reason: `foxSwipe-family public envelope remains active at tick ${String(driver.tick)} after the declared inclusive terminal lifetime`,
          evidence: { selectedEvent: state.event, zeroEnvelope, targetFamilyEvents: targetFamilyEventJournal() },
        };
      }
      return {
        ok: true,
        evidence: {
          selectedEvent: state.event,
          selectedEventTick: state.eventTick,
          minimumClearTick,
          targetFamilyEvents: targetFamilyEventJournal(),
          zeroEnvelope,
          contract: 'no later same-source or illustrated foxSwipe-family event was observed, and every family event envelope is past its inclusive renderer lifetime; this is not a programmatic pixel-read claim',
        },
      };
    }

    function pollGregFamilyRelease(driver) {
      if (releaseConfig === null || state.supplementary.kind !== 'greg-zero-envelope' || state.supplementary.status !== 'waiting') return;
      const checked = gregFamilyReleaseAt(driver);
      if (checked.ok === true) {
        state.releaseEvidenceState.status = 'family-zero-frame-ready';
        armSupplementaryPause('greg-zero-envelope', releaseConfig.phase, checked.evidence, gregFamilyReleaseAt);
        return;
      }
      const maxWaitTick = state.eventTick === null ? null : state.eventTick + releaseConfig.maximumWaitTicks;
      if (checked.terminal === true || (maxWaitTick !== null && driver.tick > maxWaitTick)) {
        markSupplementaryUnavailable(
          'greg-zero-envelope',
          checked.reason ?? `no clean foxSwipe-family zero-envelope frame appeared by tick ${String(maxWaitTick)}`,
          checked.evidence ?? { selectedEvent: state.event, targetFamilyEvents: targetFamilyEventJournal() },
        );
      }
    }

    function gracieImpactAt(driver) {
      if (impactConfig === null || state.impactEvidence === null) {
        return { ok: false, reason: 'Gracie impact evidence is not configured for this target' };
      }
      const accepted = state.impactEvidence.accepted;
      if (accepted === null) return { ok: false, reason: 'no source-and-trajectory-correlated gracie-spit enemyHit has been observed' };
      const age = driver.tick - accepted.event.tick;
      if (age < 0 || age > impactConfig.maximumCaptureDelayTicks) {
        return {
          ok: false,
          reason: `source-correlated gracie-spit enemyHit at tick ${String(accepted.event.tick)} is ${String(age)} tick(s) old; contact capture requires at most ${String(impactConfig.maximumCaptureDelayTicks)}`,
          evidence: { accepted, observedAtDriverTick: driver.tick },
        };
      }
      return {
        ok: true,
        evidence: {
          accepted,
          observedAtDriverTick: driver.tick,
          lockedPackedProjectileId: state.projectileLock?.id ?? null,
          projectileTerminal: state.projectileTerminal,
          contract: 'combat source id, exact locked projectile trajectory, and public hit position must all agree before an impact/contact compositor frame may be claimed',
        },
      };
    }

    function pollImpactContact(driver) {
      if (impactConfig === null || state.supplementary.kind !== 'impact-contact' || state.supplementary.status !== 'waiting') return;
      const checked = gracieImpactAt(driver);
      if (checked.ok === true) {
        // If a required anatomy image is already held at this exact tick, its
        // screenshot can be explicitly reused as the contact frame. Do not
        // interrupt it or advance a tick just to obtain a duplicate image.
        if (state.status !== 'milestone-ready') {
          armSupplementaryPause('impact-contact', impactConfig.phase, checked.evidence, gracieImpactAt);
        }
        return;
      }
      const terminal = state.projectileTerminal;
      if (terminal !== null && driver.tick >= terminal.observedAtDriverTick + impactConfig.terminalGraceTicks) {
        markSupplementaryUnavailable(
          'impact-contact',
          `locked heroSpit became non-live at tick ${String(terminal.observedAtDriverTick)} with no source-and-trajectory-correlated enemyHit`,
          { projectileTerminal: terminal, candidates: state.impactEvidence.candidates },
        );
        return;
      }
      if (state.projectileLock !== null && driver.tick > state.projectileLock.phaseAnchorTick + impactConfig.maximumWaitTicks) {
        markSupplementaryUnavailable(
          'impact-contact',
          `no source-and-trajectory-correlated gracie-spit enemyHit appeared within ${String(impactConfig.maximumWaitTicks)} ticks of the locked projectile launch`,
          { candidates: state.impactEvidence.candidates, projectileTerminal: terminal },
        );
      }
    }

    function pollSupplementary(driver) {
      pollPostBurstRelease(driver);
      pollGregFamilyRelease(driver);
      pollImpactContact(driver);
    }

    function phaseAnchor() {
      if (state.captureMode === 'snapshot-projectile-lifecycle') {
        if (state.projectileLock === null) return null;
        return {
          kind: 'locked-public-projectile',
          tick: state.projectileLock.phaseAnchorTick,
          projectileId: state.projectileLock.id,
        };
      }
      if (state.eventTick === null) return null;
      return { kind: 'matched-trait-event', tick: state.eventTick, projectileId: null };
    }

    function startMilestones() {
      if (state.milestonesStarted || state.status === 'error') return;
      state.milestonesStarted = true;
      state.status = 'matched';
      armNextMilestone();
    }

    function armNextMilestone() {
      const windows = requested.milestoneWindows ?? [];
      const nextIndex = state.milestones.length;
      const phaseWindow = windows[nextIndex];
      if (phaseWindow === undefined) {
        if (state.status !== 'error') {
          state.status = state.captureMode === 'grouped-burst-lifecycle'
            ? 'awaiting-burst-lifecycle'
            : 'milestones-complete';
        }
        return;
      }
      const requestedTickDelta = Math.floor((
        phaseWindow.minimumTickDelta + phaseWindow.maximumTickDelta
      ) * 0.5);
      const waitForMilestone = () => {
        if (stopped || state.status === 'error') return;
        if (state.status !== 'matched') return;
        if (state.supplementary.pendingHold) {
          requestAnimationFrame(waitForMilestone);
          return;
        }
        const handle = window.__webToy;
        const driver = handle?.driver;
        const anchor = phaseAnchor();
        if (handle === undefined || driver === undefined || anchor === null) {
          failProbe('public app handle or capture phase anchor disappeared before phase-timed screenshot');
          return;
        }
        const delta = driver.tick - anchor.tick;
        if (phaseWindow.requiresNoSequentialOverlap === true) {
          const overlapAt = state.burstLifecycle === null || state.burstLifecycle.firstRidgeTick === null
            ? null
            : state.burstLifecycle.firstRidgeTick + state.burstLifecycle.firstRidgeOverlapStartsAtTickDelta;
          if (overlapAt !== null && driver.tick >= overlapAt) {
            failProbe(`${phaseWindow.phase} would overlap a later real Trample ridge at tick ${String(overlapAt)}; no overlap frame may be mislabeled as release`);
            return;
          }
        }
        if (delta > phaseWindow.maximumTickDelta) {
          failProbe(`missed ${phaseWindow.phase} phase window at delta ${String(delta)}`);
          return;
        }
        if (delta < requestedTickDelta) {
          requestAnimationFrame(waitForMilestone);
          return;
        }
        const zeroEnvelopeBeforePause = phaseWindow.requiresZeroEnvelope === true
          ? zeroEnvelopeAt(driver.tick)
          : null;
        if (zeroEnvelopeBeforePause !== null && zeroEnvelopeBeforePause.clear !== true) {
          if (delta < phaseWindow.maximumTickDelta) {
            requestAnimationFrame(waitForMilestone);
            return;
          }
          failProbe(`${phaseWindow.phase} did not reach a public matching-source zero envelope inside its declared phase window`);
          return;
        }
        const projectileBeforePause = state.captureMode === 'snapshot-projectile-lifecycle'
          ? liveLockedProjectile(driver)
          : null;
        if (state.captureMode === 'snapshot-projectile-lifecycle' && projectileBeforePause === null) {
          failProbe(`locked ${projectileConfig?.sourceLabel ?? 'projectile'} id is no longer live in public driver.curr before ${phaseWindow.phase} screenshot`);
          return;
        }
        // This is presentation-only. Holding the app after the requested rAF
        // avoids the 100–200 ms screenshot/encoder delay skipping the visual
        // window while keeping the preceding simulation motion completely
        // normal and deterministic.
        handle.controls.paused = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const pausedDriver = window.__webToy?.driver;
          const pausedTick = pausedDriver?.tick ?? null;
          const pausedAnchor = phaseAnchor();
          const pausedDelta = pausedAnchor === null ? Number.NaN : Number(pausedTick) - pausedAnchor.tick;
          if (!finiteInteger(pausedTick)
            || pausedAnchor === null
            || pausedDelta < phaseWindow.minimumTickDelta
            || pausedDelta > phaseWindow.maximumTickDelta) {
            failProbe(`paused outside ${phaseWindow.phase} phase window at delta ${String(pausedDelta)}`, true);
            return;
          }
          const projectileAtPause = state.captureMode === 'snapshot-projectile-lifecycle'
            ? liveLockedProjectile(pausedDriver)
            : null;
          if (state.captureMode === 'snapshot-projectile-lifecycle' && projectileAtPause === null) {
            failProbe(`locked ${projectileConfig?.sourceLabel ?? 'projectile'} id was not live in public driver.curr at ${phaseWindow.phase} screenshot`, true);
            return;
          }
          const zeroEnvelopeAtPause = phaseWindow.requiresZeroEnvelope === true
            ? zeroEnvelopeAt(pausedTick)
            : null;
          if (zeroEnvelopeAtPause !== null && zeroEnvelopeAtPause.clear !== true) {
            failProbe(`${phaseWindow.phase} lost its public matching-source zero envelope while holding the compositor frame`, true);
            return;
          }
          state.milestone = {
            index: nextIndex,
            phase: phaseWindow.phase,
            tickDeltaWindow: phaseWindow,
            phaseAnchor: pausedAnchor.kind,
            phaseAnchorTick: pausedAnchor.tick,
            phaseAnchorProjectileId: pausedAnchor.projectileId,
            requestedTickDelta,
            pausedAtTick: pausedTick,
            pausedAtDelta: pausedDelta,
            projectileBeforePause,
            projectileAtPause,
            zeroEnvelopeBeforePause,
            zeroEnvelopeAtPause,
          };
          state.status = 'milestone-ready';
        }));
      };
      requestAnimationFrame(waitForMilestone);
    }

    function beginMatchedEvent(event, driver) {
      state.eventTick = event.tick;
      state.event = eventSnapshot(event);
      recordMatchingSourceEvent(event);
      recordTargetFamilyEvent(event);
      const pageNowMs = performance.now();
      state.eventPageNowMs = pageNowMs;
      state.eventWallEpochMs = performance.timeOrigin + pageNowMs;
      startRafSampling();
      if (state.captureMode === 'grouped-burst-lifecycle') recordBurstEvent(event);
      if (state.captureMode === 'snapshot-projectile-lifecycle') {
        state.status = 'awaiting-projectile-lock';
        if (lockGracieProjectile(driver)) startMilestones();
      } else {
        startMilestones();
      }
    }

    function poll() {
      if (stopped || state.status === 'error') return;
      const handle = window.__webToy;
      const driver = handle?.driver;
      if (handle === undefined || driver === undefined) {
        requestAnimationFrame(poll);
        return;
      }
      collectTargetFamilyEvents(driver);
      if (state.status === 'waiting') {
        const event = (driver.traitPresentationEvents ?? []).find((candidate) => matchesCurrentEvent(candidate, driver));
        if (event !== undefined) beginMatchedEvent(event, driver);
      }
      if (state.eventTick !== null) {
        collectMatchingSourceEvents(driver);
        collectBurstLifecycle(driver);
        if (state.status === 'awaiting-projectile-lock' && lockGracieProjectile(driver)) startMilestones();
        if (state.projectileLock !== null) {
          recordProjectileTrajectory(driver);
          collectImpactEvents(driver);
        }
        pollSupplementary(driver);
      }
      if (!stopped && state.status !== 'error') requestAnimationFrame(poll);
    }

    window.__p2SignatureFocus = {
      state,
      completeMilestone(observedAfterScreenshotTick) {
        if (state.status !== 'milestone-ready' || state.milestone === null) return { ok: false, error: 'no milestone is currently held' };
        const handle = window.__webToy;
        const driver = handle?.driver;
        const pausedTick = driver?.tick ?? null;
        const anchor = phaseAnchor();
        if (driver === undefined || !finiteInteger(pausedTick) || anchor === null) {
          failProbe('public driver disappeared while completing phase-timed screenshot', true);
          return { ok: false, error: state.error };
        }
        const projectileAfterScreenshot = state.captureMode === 'snapshot-projectile-lifecycle'
          ? liveLockedProjectile(driver)
          : null;
        if (state.captureMode === 'snapshot-projectile-lifecycle' && projectileAfterScreenshot === null) {
          failProbe(`locked ${projectileConfig?.sourceLabel ?? 'projectile'} id was not live in public driver.curr after screenshot`, true);
          return { ok: false, error: state.error };
        }
        const zeroEnvelopeAfterScreenshot = state.milestone.tickDeltaWindow.requiresZeroEnvelope === true
          ? zeroEnvelopeAt(pausedTick)
          : null;
        if (zeroEnvelopeAfterScreenshot !== null && zeroEnvelopeAfterScreenshot.clear !== true) {
          failProbe(`${state.milestone.phase} lost its public matching-source zero envelope during compositor screenshot`, true);
          return { ok: false, error: state.error };
        }
        const record = {
          ...state.milestone,
          observedAfterScreenshotTick: pausedTick,
          observedAfterScreenshotDelta: pausedTick - anchor.tick,
          callerObservedAfterScreenshotTick: finiteInteger(observedAfterScreenshotTick)
            ? observedAfterScreenshotTick
            : null,
          projectileAfterScreenshot,
          zeroEnvelopeAfterScreenshot,
        };
        let sharedSupplementary = null;
        if (state.supplementary.kind === 'impact-contact' && state.supplementary.status === 'waiting') {
          const impact = gracieImpactAt(driver);
          if (impact.ok === true) {
            sharedSupplementary = {
              kind: 'impact-contact',
              phase: impactConfig?.phase ?? 'source-correlated-impact-contact',
              evidence: {
                ...impact.evidence,
                sharedMilestone: {
                  index: record.index,
                  phase: record.phase,
                  pausedAtTick: record.pausedAtTick,
                  observedAfterScreenshotTick: record.observedAfterScreenshotTick,
                },
              },
              reason: null,
              captureContract: 'the source-correlated contact occurred at the same held public driver tick as a required anatomy compositor screenshot; the one real screenshot is explicitly shared rather than duplicated',
            };
            state.supplementary.status = 'captured-shared-milestone';
            state.supplementary.phase = sharedSupplementary.phase;
            state.supplementary.evidence = sharedSupplementary.evidence;
            state.supplementary.reason = null;
            state.supplementary.captured = {
              sharedMilestoneIndex: record.index,
              sharedMilestonePhase: record.phase,
              heldAtDriverTick: pausedTick,
              observedAfterScreenshotTick: record.observedAfterScreenshotTick,
              captureContract: sharedSupplementary.captureContract,
            };
            if (state.impactEvidence !== null) state.impactEvidence.status = 'source-correlated-contact-captured-shared-milestone';
          }
        }
        state.milestones.push(record);
        state.milestone = null;
        if (handle !== undefined) handle.controls.paused = false;
        state.status = 'matched';
        armNextMilestone();
        return { ok: true, milestone: record, sharedSupplementary };
      },
      requestSupplementary(kind) {
        if (state.supplementary.status !== 'idle') {
          return {
            ok: state.supplementary.kind === kind,
            status: state.supplementary.status,
            error: state.supplementary.kind === kind ? null : 'a different supplementary evidence request is already active',
          };
        }
        const validBenny = kind === 'post-burst-release' && postBurstReleaseConfig !== null;
        const validGreg = kind === 'greg-zero-envelope' && releaseConfig !== null;
        const validGracie = kind === 'impact-contact' && impactConfig !== null;
        if (!validBenny && !validGreg && !validGracie) return { ok: false, error: `unsupported supplementary evidence request: ${String(kind)}` };
        state.supplementary.status = 'waiting';
        state.supplementary.kind = kind;
        state.supplementary.phase = validBenny
          ? postBurstReleaseConfig.phase
          : validGreg
            ? releaseConfig.phase
            : impactConfig.phase;
        state.supplementary.evidence = null;
        state.supplementary.reason = null;
        state.supplementary.captured = null;
        if (validGracie && state.impactEvidence !== null) {
          state.impactEvidence.status = state.impactEvidence.accepted === null
            ? 'waiting-for-source-correlated-hit'
            : 'source-correlated-hit-observed';
          state.impactEvidence.reason = null;
        }
        if (validGreg && state.releaseEvidenceState !== null) {
          state.releaseEvidenceState.status = 'waiting-for-family-zero-envelope';
          state.releaseEvidenceState.reason = null;
          state.releaseEvidenceState.contamination = null;
        }
        const driver = window.__webToy?.driver;
        if (driver !== undefined) pollSupplementary(driver);
        return { ok: true, status: state.supplementary.status, kind, phase: state.supplementary.phase };
      },
      completeSupplementary(observedAfterScreenshotTick) {
        if (state.status !== 'supplementary-ready' || state.supplementary.status !== 'ready') {
          return { ok: false, error: 'no supplementary evidence frame is currently held' };
        }
        const handle = window.__webToy;
        const driver = handle?.driver;
        const pausedTick = driver?.tick ?? null;
        if (driver === undefined || !finiteInteger(pausedTick)) {
          failProbe('public driver disappeared while completing supplementary compositor screenshot', true);
          return { ok: false, error: state.error };
        }
        const record = {
          ...(state.supplementary.captured ?? {}),
          kind: state.supplementary.kind,
          phase: state.supplementary.phase,
          evidence: state.supplementary.evidence,
          observedAfterScreenshotTick: pausedTick,
          callerObservedAfterScreenshotTick: finiteInteger(observedAfterScreenshotTick)
            ? observedAfterScreenshotTick
            : null,
        };
        state.supplementary.status = 'captured';
        state.supplementary.captured = record;
        if (state.supplementary.kind === 'post-burst-release' && state.burstLifecycle !== null) {
          state.burstLifecycle.truePostBurstReleaseFrameClaimed = true;
        }
        if (state.supplementary.kind === 'impact-contact' && state.impactEvidence !== null) {
          state.impactEvidence.status = 'source-correlated-contact-captured';
        }
        if (state.supplementary.kind === 'greg-zero-envelope' && state.releaseEvidenceState !== null) {
          state.releaseEvidenceState.status = 'family-zero-envelope-captured';
        }
        if (handle !== undefined) handle.controls.paused = false;
        resumeAfterSupplementaryCapture();
        return { ok: true, supplementary: record };
      },
      stop() {
        const handle = window.__webToy;
        if (handle !== undefined) handle.controls.paused = false;
        stopped = true;
      },
    };
    requestAnimationFrame(poll);
  }, target);
}

async function focusState(page) {
  return page.evaluate(() => {
    const state = window.__p2SignatureFocus?.state;
    if (state === undefined) return null;
    return JSON.parse(JSON.stringify(state));
  });
}

async function waitForVideoEvent(page, timeoutMs) {
  await page.waitForFunction(() => {
    const status = window.__p2SignatureFocus?.state?.status;
    return status === 'matched' || status === 'milestone-ready' || status === 'milestones-complete' || status === 'error';
  }, undefined, { timeout: timeoutMs });
  const state = await focusState(page);
  if (state === null) fail('focus probe disappeared before it could report a state');
  if (state.status === 'error') fail(`video event probe failed: ${state.error ?? 'unknown page-side error'}`);
  return state;
}

/** Ensures Benny’s report names a complete real ridge group, not a guessed tail. */
async function waitForGroupedBurstLifecycle(page, target, timeoutMs) {
  if (target.captureMode !== 'grouped-burst-lifecycle') return null;
  await page.waitForFunction(() => {
    const state = window.__p2SignatureFocus?.state;
    return state?.status === 'error' || state?.burstLifecycle?.status === 'complete';
  }, undefined, { timeout: timeoutMs });
  const state = await focusState(page);
  if (state === null) fail(`${target.label} grouped-burst probe disappeared before lifecycle closure`);
  if (state.status === 'error') fail(`${target.label} grouped-burst probe failed: ${state.error ?? 'unknown page-side error'}`);
  if (state.burstLifecycle?.status !== 'complete') fail(`${target.label} did not produce a completed grouped-burst lifecycle`);
  return state.burstLifecycle;
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function runProcess(command, args) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectProcess);
    child.on('close', (code) => {
      if (code === 0) {
        resolveProcess({ stderr });
      } else {
        rejectProcess(new Error(`${command} exited ${String(code)}: ${stderr.slice(-4_000)}`));
      }
    });
  });
}

function resolveBundledFfmpeg() {
  const override = process.env.PLAYWRIGHT_FFMPEG_PATH;
  if (override !== undefined && existsSync(override)) return override;
  const browserExecutable = chromium.executablePath();
  let cacheRoot = dirname(browserExecutable);
  while (basename(cacheRoot) !== 'ms-playwright' && dirname(cacheRoot) !== cacheRoot) {
    cacheRoot = dirname(cacheRoot);
  }
  if (basename(cacheRoot) !== 'ms-playwright') {
    fail(`could not locate Playwright cache root from ${browserExecutable}`);
  }
  const binaryName = process.platform === 'darwin'
    ? 'ffmpeg-mac'
    : process.platform === 'win32'
      ? 'ffmpeg-win64.exe'
      : 'ffmpeg-linux';
  for (const entry of readdirSync(cacheRoot)) {
    if (!entry.startsWith('ffmpeg-')) continue;
    const candidate = join(cacheRoot, entry, binaryName);
    if (existsSync(candidate)) return candidate;
  }
  fail(`Playwright bundled ffmpeg is unavailable below ${cacheRoot}; set PLAYWRIGHT_FFMPEG_PATH to an ffmpeg binary`);
}

function parseDurationSeconds(value) {
  const match = /^(\d+):(\d+):(\d+(?:\.\d+)?)$/u.exec(value);
  if (match === null) return null;
  return Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3]);
}

async function inspectCompositorVideo(ffmpegPath, videoPath, recordingDirectory) {
  const timingProbePath = join(recordingDirectory, 'timing-probe.png');
  const { stderr } = await runProcess(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'info',
    '-i', videoPath,
    '-frames:v', '1',
    '-an',
    '-c:v', 'png',
    timingProbePath,
  ]);
  const frameRateMatch = /,\s*(\d+(?:\.\d+)?)\s+fps,/u.exec(stderr);
  const durationMatch = /Duration:\s+(\d+:\d+:\d+(?:\.\d+)?)/u.exec(stderr);
  const frameRate = frameRateMatch === null ? Number.NaN : Number(frameRateMatch[1]);
  const durationSeconds = durationMatch === null ? null : parseDurationSeconds(durationMatch[1]);
  if (!(Number.isFinite(frameRate) && frameRate > 0) || durationSeconds === null || durationSeconds <= 0) {
    fail(`ffmpeg could not read a constant compositor frame rate and duration: ${stderr.slice(-2_000)}`);
  }
  return { frameRate, durationSeconds, timingProbePath };
}

function choosePostEventVideoFrames(videoInfo, firstPostEventRelativeSeconds) {
  // Pick the first encoded frame strictly after the first real rAF sample that
  // advanced beyond the event tick. This avoids treating a zero-envelope event
  // frame as the visible signature body.
  const desiredSeconds = firstPostEventRelativeSeconds;
  const firstSourceIndex = Math.ceil(desiredSeconds * videoInfo.frameRate + Number.EPSILON);
  const lastSourceIndex = firstSourceIndex + STRIP_FRAME_COUNT - 1;
  if (firstSourceIndex < 0 || (lastSourceIndex + 1) / videoInfo.frameRate > videoInfo.durationSeconds + 0.001) {
    fail(`recorded compositor video does not contain three frames after event time ${desiredSeconds.toFixed(3)}s`);
  }
  const selected = Array.from({ length: STRIP_FRAME_COUNT }, (_, offset) => {
    const sourceFrameIndex = firstSourceIndex + offset;
    return { sourceFrameIndex, ptsSeconds: sourceFrameIndex / videoInfo.frameRate };
  });
  return { desiredSeconds, selected };
}

function nearestRafSample(samples, wallEpochMs) {
  let nearest = null;
  for (const sample of samples) {
    const distanceMs = Math.abs(sample.wallEpochMs - wallEpochMs);
    if (nearest === null || distanceMs < nearest.distanceMs) {
      nearest = { ...sample, distanceMs };
    }
  }
  return nearest;
}

/** Maps one encoded compositor frame back to the nearest normal rAF journal entry. */
function timingForSourceFrame(
  videoInfo,
  sourceFrameIndex,
  videoStartNodeEpochMs,
  timingJournal,
  eventTick,
  visualLifetimeTicks,
  enforceVisibleLifetime = true,
) {
  const videoWallEpochMs = videoStartNodeEpochMs + sourceFrameIndex / videoInfo.frameRate * 1_000;
  const nearestSample = nearestRafSample(timingJournal.rafSamples, videoWallEpochMs);
  if (nearestSample === null) fail(`no rAF timing sample maps compositor source frame ${sourceFrameIndex}`);
  const simTickDeltaFromEvent = nearestSample.simTick - eventTick;
  if (enforceVisibleLifetime && (simTickDeltaFromEvent < 1 || simTickDeltaFromEvent > visualLifetimeTicks)) {
    fail(`source frame ${sourceFrameIndex} maps to tick delta ${simTickDeltaFromEvent}, outside visible lifetime 1..${visualLifetimeTicks}`);
  }
  return {
    sourceFrameIndex,
    videoPtsSeconds: sourceFrameIndex / videoInfo.frameRate,
    videoWallEpochMs,
    nearestRafSample: nearestSample,
    simTick: nearestSample.simTick,
    simTickDeltaFromEvent,
  };
}

async function extractSelectedVideoFrames(ffmpegPath, videoPath, targetDirectory, firstSourceIndex, focusAnchor) {
  const lastSourceIndex = firstSourceIndex + STRIP_FRAME_COUNT - 1;
  const temporaryPattern = join(targetDirectory, 'video-extract-%02d.png');
  await runProcess(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', videoPath,
    '-vf', `trim=start_frame=${firstSourceIndex}:end_frame=${lastSourceIndex + 1}`,
    '-an',
    '-c:v', 'png',
    temporaryPattern,
  ]);
  const frames = [];
  for (let offset = 0; offset < STRIP_FRAME_COUNT; offset++) {
    const temporaryPath = join(targetDirectory, `video-extract-${String(offset + 1).padStart(2, '0')}.png`);
    if (!existsSync(temporaryPath)) fail(`ffmpeg did not extract compositor frame ${offset} from source index ${firstSourceIndex + offset}`);
    const fullPath = join(targetDirectory, `full-f${offset}.png`);
    renameSync(temporaryPath, fullPath);
    const cropPath = join(targetDirectory, `focus-2x-f${offset}.png`);
    const grayCropPath = join(targetDirectory, `focus-2x-f${offset}-gray.png`);
    const crop = await createZoomCrop(fullPath, cropPath, false, focusAnchor);
    await createZoomCrop(fullPath, grayCropPath, true, focusAnchor);
    frames.push({ full: fullPath, focus2x: cropPath, focus2xGray: grayCropPath, cropBox: crop });
  }
  return frames;
}

function normalizedAnchor(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function cropBox(width, height, focusAnchor = null) {
  const anchorX = normalizedAnchor(focusAnchor?.x);
  const anchorY = normalizedAnchor(focusAnchor?.y);
  const cropWidth = Math.min(FOCUS_WIDTH, width);
  const cropHeight = Math.min(FOCUS_HEIGHT, height);
  return {
    x: Math.min(width - cropWidth, Math.max(0, Math.floor(width * anchorX - cropWidth * 0.5))),
    y: Math.min(height - cropHeight, Math.max(0, Math.floor(height * anchorY - cropHeight * 0.5))),
    width: cropWidth,
    height: cropHeight,
  };
}

function grayscale(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = Math.round(0.2126 * pixels.data[index] + 0.7152 * pixels.data[index + 1] + 0.0722 * pixels.data[index + 2]);
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
}

async function createZoomCrop(sourcePath, outputPath, grayscaleOutput = false, focusAnchor = null) {
  const image = await loadImage(sourcePath);
  const box = cropBox(image.width, image.height, focusAnchor);
  const canvas = createCanvas(box.width * FOCUS_SCALE, box.height * FOCUS_SCALE);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (grayscaleOutput) grayscale(context, canvas.width, canvas.height);
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
  return box;
}

async function createTickStrip(framePaths, outputPath, labels, grayscaleOutput = false) {
  const frames = await Promise.all(framePaths.map((path) => loadImage(path)));
  const cellWidth = 512;
  const cellHeight = 288;
  const labelHeight = 28;
  const canvas = createCanvas(cellWidth * frames.length, cellHeight + labelHeight);
  const context = canvas.getContext('2d');
  context.fillStyle = '#07110d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  for (let index = 0; index < frames.length; index++) {
    context.drawImage(frames[index], index * cellWidth, labelHeight, cellWidth, cellHeight);
    context.fillStyle = '#f4efd4';
    context.font = '14px sans-serif';
    context.fillText(labels[index] ?? `F+${index}`, index * cellWidth + 12, 19);
  }
  if (grayscaleOutput) grayscale(context, canvas.width, canvas.height);
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

async function createFocusStrip(cropPaths, outputPath, labels, grayscaleOutput = false) {
  const crops = await Promise.all(cropPaths.map((path) => loadImage(path)));
  const cellWidth = 512;
  const cellHeight = 346;
  const labelHeight = 28;
  const canvas = createCanvas(cellWidth * crops.length, cellHeight + labelHeight);
  const context = canvas.getContext('2d');
  context.fillStyle = '#07110d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  for (let index = 0; index < crops.length; index++) {
    context.drawImage(crops[index], index * cellWidth, labelHeight, cellWidth, cellHeight);
    context.fillStyle = '#f4efd4';
    context.font = '14px sans-serif';
    context.fillText(`2x focus · ${labels[index] ?? `F+${index}`}`, index * cellWidth + 12, 19);
  }
  if (grayscaleOutput) grayscale(context, canvas.width, canvas.height);
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

function supplementaryFileStem(phase) {
  return String(phase).replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '') || 'evidence';
}

async function writeSupplementaryStrips(targetDirectory, artifact, label) {
  const tickStrip = join(targetDirectory, `rendered-supplementary-strip-${artifact.fileStem}.png`);
  const tickStripGray = join(targetDirectory, `rendered-supplementary-strip-${artifact.fileStem}-gray.png`);
  const focusStrip = join(targetDirectory, `rendered-supplementary-2x-strip-${artifact.fileStem}.png`);
  const focusStripGray = join(targetDirectory, `rendered-supplementary-2x-strip-${artifact.fileStem}-gray.png`);
  await createTickStrip([artifact.full], tickStrip, [label]);
  await createTickStrip([artifact.full], tickStripGray, [label], true);
  await createFocusStrip([artifact.focus2x], focusStrip, [label]);
  await createFocusStrip([artifact.focus2x], focusStripGray, [label], true);
  return { tick: tickStrip, tickGray: tickStripGray, focus2x: focusStrip, focus2xGray: focusStripGray };
}

/** Captures one page-side held supplementary frame, never a replayed frame. */
async function captureHeldSupplementary(page, targetDirectory, target, phaseState) {
  const held = phaseState.supplementary;
  if (phaseState.status !== 'supplementary-ready' || held?.status !== 'ready') {
    fail(`${target.label} did not hold a supplementary evidence compositor frame`);
  }
  const phase = held.phase ?? 'supplementary-evidence';
  const fileStem = supplementaryFileStem(phase);
  const full = join(targetDirectory, `rendered-supplementary-${fileStem}.png`);
  const observedBeforeCaptureTick = phaseState.supplementary.captured?.heldAtDriverTick ?? null;
  await page.screenshot({ path: full });
  const observedAfterCaptureTick = await page.evaluate(() => window.__webToy?.driver?.tick ?? null);
  if (!Number.isSafeInteger(observedBeforeCaptureTick)
    || !Number.isSafeInteger(observedAfterCaptureTick)
    || observedAfterCaptureTick !== observedBeforeCaptureTick) {
    fail(`${target.label} supplementary compositor screenshot lost its public held driver tick`);
  }
  const focus2x = join(targetDirectory, `rendered-supplementary-2x-${fileStem}.png`);
  const focus2xGray = join(targetDirectory, `rendered-supplementary-2x-${fileStem}-gray.png`);
  const crop = await createZoomCrop(full, focus2x, false, target.focusAnchor);
  await createZoomCrop(full, focus2xGray, true, target.focusAnchor);
  const completion = await page.evaluate((afterTick) => (
    window.__p2SignatureFocus?.completeSupplementary(afterTick) ?? { ok: false, error: 'focus probe disappeared' }
  ), observedAfterCaptureTick);
  if (completion?.ok !== true || completion.supplementary === undefined) {
    fail(`${target.label} could not resume after supplementary ${phase} screenshot: ${completion?.error ?? 'unknown completion error'}`);
  }
  const artifact = {
    status: 'captured',
    kind: held.kind,
    phase,
    evidence: held.evidence,
    reason: null,
    capture: completion.supplementary,
    observedBeforeCaptureTick,
    observedAfterCaptureTick,
    full,
    focus2x,
    focus2xGray,
    cropBox: crop,
    fileStem,
  };
  artifact.strips = await writeSupplementaryStrips(
    targetDirectory,
    artifact,
    `${phase} / held T${String(observedBeforeCaptureTick)}→T${String(observedAfterCaptureTick)}`,
  );
  return artifact;
}

async function requestSupplementary(page, target, kind) {
  const response = await page.evaluate((requestedKind) => (
    window.__p2SignatureFocus?.requestSupplementary(requestedKind) ?? { ok: false, error: 'focus probe disappeared' }
  ), kind);
  if (response?.ok !== true) {
    fail(`${target.label} could not request ${kind} supplementary evidence: ${response?.error ?? 'unknown request error'}`);
  }
  return response;
}

/**
 * Playwright's `recordVideo` stream is buffered by the compositor/encoder, so
 * its PTS cannot truthfully identify the exact simulation tick that painted a
 * frame. For the P2 anatomy gate we therefore take a headed compositor
 * screenshot only after an rAF has observed the requested live tick and has
 * momentarily frozen the public presentation control. The simulation has
 * already advanced normally to that tick; the freeze gives the compositor a
 * stable rendered frame while Playwright encodes the PNG. The before/after
 * samples remain in the evidence packet; they make the timing contract
 * auditable without pretending that a WebM packet is a tick.
 */
async function captureRenderedMilestones(page, targetDirectory, eventTick, target, timeoutMs) {
  const phaseWindows = target.milestoneWindows ?? [];
  const frames = [];
  let supplementaryEvidence = null;
  // Contact evidence begins monitoring before launch/travel screenshots so a
  // naturally early collision can hold its real rendered frame instead of
  // being rediscovered too late after the anatomy pass finishes.
  if (target.impactEvidence !== undefined) await requestSupplementary(page, target, 'impact-contact');
  for (let index = 0; index < phaseWindows.length; index++) {
    const phaseWindow = phaseWindows[index];
    for (;;) {
      await page.waitForFunction((wantedIndex) => {
        const state = window.__p2SignatureFocus?.state;
        return state?.status === 'error'
          || state?.supplementary?.status === 'ready'
          || (state?.status === 'milestone-ready' && state.milestone?.index === wantedIndex);
      }, index, { timeout: timeoutMs });
      const phaseState = await focusState(page);
      if (phaseState === null) fail(`${target.label} phase-timing probe disappeared before screenshot`);
      if (phaseState.status === 'error') fail(`${target.label} phase-timing probe failed: ${phaseState.error ?? 'unknown error'}`);
      if (phaseState.supplementary?.status === 'ready') {
        if (supplementaryEvidence !== null) fail(`${target.label} attempted to hold more than one supplementary evidence frame`);
        supplementaryEvidence = await captureHeldSupplementary(page, targetDirectory, target, phaseState);
        continue;
      }
      const pauseState = phaseState.milestone;
      if (pauseState === null || pauseState.index !== index) {
        fail(`${target.label} did not arm expected ${phaseWindow.phase} screenshot phase`);
      }

      const requestedTickDelta = pauseState.requestedTickDelta;
      const phaseAnchorTick = pauseState.phaseAnchorTick;
      const observedBeforeCaptureTick = pauseState.pausedAtTick;
      const observedBeforeCaptureDelta = Number(observedBeforeCaptureTick) - phaseAnchorTick;
      const observedBeforeCaptureEventDelta = Number(observedBeforeCaptureTick) - eventTick;
      if (
        !Number.isSafeInteger(observedBeforeCaptureTick)
        || !Number.isSafeInteger(phaseAnchorTick)
        || observedBeforeCaptureDelta < phaseWindow.minimumTickDelta
        || observedBeforeCaptureDelta > phaseWindow.maximumTickDelta
      ) {
        fail(
          `${target.label} missed its ${phaseWindow.phase} render window before screenshot: `
          + `observed Δ${String(observedBeforeCaptureDelta)}, expected Δ${phaseWindow.minimumTickDelta}–${phaseWindow.maximumTickDelta}`,
        );
      }
      if (target.captureMode === 'snapshot-projectile-lifecycle') {
        const liveProjectile = pauseState.projectileAtPause;
        if (liveProjectile?.exactLockedIdMatch !== true || liveProjectile?.snapshot !== 'curr') {
          fail(`${target.label} did not retain its exact locked current-snapshot projectile at ${phaseWindow.phase}`);
        }
      }

      const fullPath = join(targetDirectory, `rendered-milestone-f${index}.png`);
      await page.screenshot({ path: fullPath });
      const observedAfterCaptureTick = await page.evaluate(() => window.__webToy?.driver?.tick ?? null);
      const observedAfterCaptureDelta = Number(observedAfterCaptureTick) - phaseAnchorTick;
      const observedAfterCaptureEventDelta = Number(observedAfterCaptureTick) - eventTick;
      if (
        !Number.isSafeInteger(observedAfterCaptureTick)
        || observedAfterCaptureDelta < phaseWindow.minimumTickDelta
        || observedAfterCaptureDelta > phaseWindow.maximumTickDelta
      ) {
        fail(
          `${target.label} missed its ${phaseWindow.phase} render window during screenshot: `
          + `observed Δ${String(observedAfterCaptureDelta)}, expected Δ${phaseWindow.minimumTickDelta}–${phaseWindow.maximumTickDelta}`,
        );
      }

      const focus2x = join(targetDirectory, `rendered-milestone-2x-f${index}.png`);
      const focus2xGray = join(targetDirectory, `rendered-milestone-2x-f${index}-gray.png`);
      const crop = await createZoomCrop(fullPath, focus2x, false, target.focusAnchor);
      await createZoomCrop(fullPath, focus2xGray, true, target.focusAnchor);
      // Keep the presentation hold through file/crop work. Resuming before
      // Node finishes those local writes can skip a short projectile's next
      // exact review window even though the screenshot itself was correct.
      const completion = await page.evaluate((afterTick) => (
        window.__p2SignatureFocus?.completeMilestone(afterTick) ?? { ok: false, error: 'focus probe disappeared' }
      ), observedAfterCaptureTick);
      if (completion?.ok !== true || completion.milestone === undefined) {
        fail(`${target.label} could not resume after ${phaseWindow.phase} screenshot: ${completion?.error ?? 'unknown completion error'}`);
      }
      if (target.captureMode === 'snapshot-projectile-lifecycle') {
        const liveProjectile = completion.milestone.projectileAfterScreenshot;
        if (liveProjectile?.exactLockedIdMatch !== true || liveProjectile?.snapshot !== 'curr') {
          fail(`${target.label} lost its exact locked current-snapshot projectile while capturing ${phaseWindow.phase}`);
        }
      }
      const frame = {
        offset: index,
        phase: phaseWindow.phase,
        tickDeltaWindow: phaseWindow,
        phaseAnchor: pauseState.phaseAnchor,
        phaseAnchorTick,
        phaseAnchorProjectileId: pauseState.phaseAnchorProjectileId ?? null,
        requestedTickDelta,
        observedBeforeCaptureTick,
        observedBeforeCaptureDelta,
        observedBeforeCaptureEventDelta,
        observedAfterCaptureTick,
        observedAfterCaptureDelta,
        observedAfterCaptureEventDelta,
        projectileBeforePause: pauseState.projectileBeforePause ?? null,
        projectileAtPause: pauseState.projectileAtPause ?? null,
        projectileAfterScreenshot: completion.milestone.projectileAfterScreenshot ?? null,
        zeroEnvelopeBeforePause: pauseState.zeroEnvelopeBeforePause ?? null,
        zeroEnvelopeAtPause: pauseState.zeroEnvelopeAtPause ?? null,
        zeroEnvelopeAfterScreenshot: completion.milestone.zeroEnvelopeAfterScreenshot ?? null,
        full: fullPath,
        focus2x,
        focus2xGray,
        cropBox: crop,
      };
      frames.push(frame);
      if (completion.sharedSupplementary !== null && completion.sharedSupplementary !== undefined) {
        if (supplementaryEvidence !== null) fail(`${target.label} attempted to capture multiple supplementary evidence frames`);
        const shared = {
          status: 'captured-shared-milestone',
          ...completion.sharedSupplementary,
          observedBeforeCaptureTick,
          observedAfterCaptureTick,
          full: fullPath,
          focus2x,
          focus2xGray,
          cropBox: crop,
          fileStem: supplementaryFileStem(completion.sharedSupplementary.phase),
        };
        shared.strips = await writeSupplementaryStrips(
          targetDirectory,
          shared,
          `${shared.phase} / shared ${phaseWindow.phase} T${String(observedBeforeCaptureTick)}→T${String(observedAfterCaptureTick)}`,
        );
        supplementaryEvidence = shared;
      }
      break;
    }
  }
  return { frames, supplementaryEvidence };
}

/**
 * A supplementary proof is optional evidence, never a retry condition. It is
 * either a held, source-valid rendered frame or a structured unavailable
 * record that explains why this particular real run did not produce one.
 */
async function captureSupplementaryEvidence(page, targetDirectory, target, kind, timeoutMs, existingEvidence = null) {
  if (existingEvidence !== null) return existingEvidence;
  let state = await focusState(page);
  if (state === null) fail(`${target.label} supplementary evidence probe disappeared before request`);
  if (state.status === 'error') fail(`${target.label} supplementary evidence probe failed: ${state.error ?? 'unknown error'}`);
  if (state.supplementary?.status === 'idle') {
    await requestSupplementary(page, target, kind);
    state = await focusState(page);
    if (state === null) fail(`${target.label} supplementary evidence probe disappeared after request`);
  }
  if (state.supplementary?.kind !== kind) {
    fail(`${target.label} supplementary evidence request returned ${String(state.supplementary?.kind)} instead of ${kind}`);
  }
  if (state.supplementary.status === 'ready') {
    return captureHeldSupplementary(page, targetDirectory, target, state);
  }
  if (state.supplementary.status === 'unavailable') {
    return {
      status: 'unavailable',
      kind,
      phase: state.supplementary.phase,
      evidence: state.supplementary.evidence,
      reason: state.supplementary.reason,
      capture: state.supplementary.captured,
    };
  }
  if (state.supplementary.status === 'captured' || state.supplementary.status === 'captured-shared-milestone') {
    return {
      status: state.supplementary.status,
      kind,
      phase: state.supplementary.phase,
      evidence: state.supplementary.evidence,
      reason: state.supplementary.reason,
      capture: state.supplementary.captured,
      artifactUnavailableReason: 'the page reports a completed supplementary frame but the Node capture handoff did not retain an artifact reference',
    };
  }
  await page.waitForFunction((requestedKind) => {
    const focus = window.__p2SignatureFocus?.state;
    const status = focus?.supplementary?.status;
    return focus?.status === 'error'
      || (focus?.supplementary?.kind === requestedKind && (status === 'ready' || status === 'unavailable' || status === 'captured' || status === 'captured-shared-milestone'));
  }, kind, { timeout: timeoutMs });
  state = await focusState(page);
  if (state === null) fail(`${target.label} supplementary evidence probe disappeared while waiting`);
  if (state.status === 'error') fail(`${target.label} supplementary evidence probe failed: ${state.error ?? 'unknown error'}`);
  if (state.supplementary?.status === 'ready') return captureHeldSupplementary(page, targetDirectory, target, state);
  if (state.supplementary?.status === 'unavailable') {
    return {
      status: 'unavailable',
      kind,
      phase: state.supplementary.phase,
      evidence: state.supplementary.evidence,
      reason: state.supplementary.reason,
      capture: state.supplementary.captured,
    };
  }
  return {
    status: state.supplementary?.status ?? 'unknown',
    kind,
    phase: state.supplementary?.phase ?? null,
    evidence: state.supplementary?.evidence ?? null,
    reason: state.supplementary?.reason ?? null,
    capture: state.supplementary?.captured ?? null,
    artifactUnavailableReason: 'supplementary page state completed without a Node-held screenshot artifact',
  };
}

function reportSupplementaryEvidence(outputDirectory, evidence) {
  if (evidence === null) return null;
  const artifact = (path) => (typeof path === 'string' ? artifactPath(outputDirectory, path) : null);
  const bytes = (path) => (typeof path === 'string' && existsSync(path) ? fileBytes(path) : null);
  return {
    ...evidence,
    full: artifact(evidence.full),
    fullBytes: bytes(evidence.full),
    focus2x: artifact(evidence.focus2x),
    focus2xBytes: bytes(evidence.focus2x),
    focus2xGray: artifact(evidence.focus2xGray),
    focus2xGrayBytes: bytes(evidence.focus2xGray),
    strips: evidence.strips == null
      ? null
      : {
        tick: artifact(evidence.strips.tick),
        tickGray: artifact(evidence.strips.tickGray),
        focus2x: artifact(evidence.strips.focus2x),
        focus2xGray: artifact(evidence.strips.focus2xGray),
      },
  };
}

async function writeRenderedMilestoneStrips(outputDirectory, targetDirectory, target, frames) {
  if (frames.length === 0) return null;
  const labels = frames.map((frame) => (
    `${frame.phase} Δ${frame.tickDeltaWindow.minimumTickDelta}–${frame.tickDeltaWindow.maximumTickDelta}`
    + ` / ${frame.phaseAnchor} Δ${frame.observedBeforeCaptureDelta}→Δ${frame.observedAfterCaptureDelta}`
  ));
  const tickStrip = join(targetDirectory, 'rendered-milestone-strip.png');
  const tickStripGray = join(targetDirectory, 'rendered-milestone-strip-gray.png');
  const focusStrip = join(targetDirectory, 'rendered-milestone-2x-strip.png');
  const focusStripGray = join(targetDirectory, 'rendered-milestone-2x-strip-gray.png');
  await createTickStrip(frames.map((frame) => frame.full), tickStrip, labels);
  await createTickStrip(frames.map((frame) => frame.full), tickStripGray, labels, true);
  await createFocusStrip(frames.map((frame) => frame.focus2x), focusStrip, labels);
  await createFocusStrip(frames.map((frame) => frame.focus2x), focusStripGray, labels, true);
  const scoringContract = target.captureMode === 'grouped-burst-lifecycle'
    ? 'These post-render images are the timing authority for Benny’s named grouped Trample lifecycle. They intentionally prove only first-ridge early, mid, and pre-next-ridge anatomy before the real second ridge begins at +7; no image is labeled or scored as a first-ridge release. A separate after-complete-burst frame is emitted only when the public event journal proves the selected group expired with no same-source envelope and no independently overlapping later wave; otherwise report.json records an explicit unavailable result. Supporting WebM is provenance-only.'
    : target.captureMode === 'snapshot-projectile-lifecycle'
      ? 'These post-render images are the timing authority for Gracie’s projectile anatomy. Every selected frame must contain the exact locked packed heroSpit id in public driver.curr, with its live x/y/velocity journaled before, during, and after screenshot. A separate impact/contact image is admitted only for a public enemyHit whose source and position correlate to that locked trajectory; absence is reported explicitly rather than inferred from projectile disappearance. The telegraph only discovers the launch; no telegraph card is claimed. Supporting WebM is provenance-only.'
      : 'These post-render images are the timing authority for Greg’s early, mid, and near-terminal anatomy review. A separate supplementary zero-envelope frame is admitted only after every authored source that can paint the illustrated foxSwipe family is past its inclusive renderer lifetime and no later same-source or family alias event contaminates the selected cast; otherwise report.json records an explicit unavailable result. Reviewers inspect the compositor frame itself rather than trusting a pixel-read claim. Supporting WebM includes brief phase holds and is provenance-only; it is never used to claim an exact simulation tick or continuous motion.';
  return {
    captureMode: target.captureMode,
    eventEvidenceRole: target.eventEvidenceRole,
    telegraphCardClaimed: target.telegraphCardClaimed !== false,
    phaseWindows: target.milestoneWindows,
    burstLifecyclePolicy: target.burst ?? null,
    releaseEvidencePolicy: target.releaseEvidence ?? null,
    postBurstReleaseEvidencePolicy: target.postBurstReleaseEvidence ?? null,
    projectileLifecyclePolicy: target.projectile ?? null,
    impactEvidencePolicy: target.impactEvidence ?? null,
    captureContract: 'headed Playwright compositor screenshot taken after rAF observed the live driver inside each phase window, then momentarily paused the public presentation control to hold that already-rendered state; before/after driver ticks are recorded with every image.',
    scoringContract,
    frames: frames.map((frame) => ({
      offset: frame.offset,
      phase: frame.phase,
      tickDeltaWindow: frame.tickDeltaWindow,
      phaseAnchor: frame.phaseAnchor,
      phaseAnchorTick: frame.phaseAnchorTick,
      phaseAnchorProjectileId: frame.phaseAnchorProjectileId,
      requestedTickDelta: frame.requestedTickDelta,
      observedBeforeCaptureTick: frame.observedBeforeCaptureTick,
      observedBeforeCaptureDelta: frame.observedBeforeCaptureDelta,
      observedBeforeCaptureEventDelta: frame.observedBeforeCaptureEventDelta,
      observedAfterCaptureTick: frame.observedAfterCaptureTick,
      observedAfterCaptureDelta: frame.observedAfterCaptureDelta,
      observedAfterCaptureEventDelta: frame.observedAfterCaptureEventDelta,
      projectileBeforePause: frame.projectileBeforePause,
      projectileAtPause: frame.projectileAtPause,
      projectileAfterScreenshot: frame.projectileAfterScreenshot,
      zeroEnvelopeBeforePause: frame.zeroEnvelopeBeforePause,
      zeroEnvelopeAtPause: frame.zeroEnvelopeAtPause,
      zeroEnvelopeAfterScreenshot: frame.zeroEnvelopeAfterScreenshot,
      full: artifactPath(outputDirectory, frame.full),
      fullBytes: fileBytes(frame.full),
      focus2x: artifactPath(outputDirectory, frame.focus2x),
      focus2xBytes: fileBytes(frame.focus2x),
      focus2xGray: artifactPath(outputDirectory, frame.focus2xGray),
      focus2xGrayBytes: fileBytes(frame.focus2xGray),
      cropBox: frame.cropBox,
    })),
    strips: {
      tick: artifactPath(outputDirectory, tickStrip),
      tickGray: artifactPath(outputDirectory, tickStripGray),
      focus2x: artifactPath(outputDirectory, focusStrip),
      focus2xGray: artifactPath(outputDirectory, focusStripGray),
    },
  };
}

async function captureTarget(browser, ffmpegPath, baseUrl, outputDirectory, target, args, serverMode) {
  const targetDirectory = join(outputDirectory, target.id);
  mkdirSync(targetDirectory, { recursive: true });
  const timeoutMs = args.timeoutSeconds * 1_000;
  const attemptNotes = [];
  for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
    const browserMessages = [];
    const recordingDirectory = join(targetDirectory, `recording-attempt-${attempt}`);
    mkdirSync(recordingDirectory, { recursive: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: 'dark',
      recordVideo: { dir: recordingDirectory, size: VIEWPORT },
    });
    // Playwright starts page video at page creation, not at browser-context
    // allocation. Anchor immediately before newPage so wall time maps to the
    // recorded compositor timeline without a context-start skew.
    const videoStartNodeEpochMs = Date.now();
    const page = await context.newPage();
    const video = page.video();
    let contextClosed = false;
    try {
      if (video === null) fail('Playwright did not attach compositor video to the capture page');
      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          browserMessages.push({ type: message.type(), text: message.text() });
        }
      });
      page.on('pageerror', (error) => browserMessages.push({ type: 'pageerror', text: error.message }));
      const route = runningUrl(baseUrl, target, args.seed);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const boot = await ensureRunStarted(page);
      await installVideoEventProbe(page, target);
      const matchedState = await waitForVideoEvent(page, timeoutMs);
      if (!Number.isSafeInteger(matchedState.eventTick) || !Number.isFinite(matchedState.eventWallEpochMs)) {
        fail(`video event probe returned invalid event metadata: ${JSON.stringify(matchedState)}`);
      }
      const milestoneCapture = await captureRenderedMilestones(
        page,
        targetDirectory,
        matchedState.eventTick,
        target,
        timeoutMs,
      );
      const renderedMilestoneFrames = milestoneCapture.frames;
      // Benny’s third anatomy frame deliberately ends before the next real
      // ridge. Wait until the real event group closes so report.json can name
      // the actual burst rather than infer a release from an overlap frame.
      const groupedBurstLifecycle = await waitForGroupedBurstLifecycle(page, target, timeoutMs);
      let supplementaryEvidence = milestoneCapture.supplementaryEvidence;
      if (target.releaseEvidence !== undefined) {
        supplementaryEvidence = await captureSupplementaryEvidence(
          page,
          targetDirectory,
          target,
          'greg-zero-envelope',
          timeoutMs,
          supplementaryEvidence,
        );
      } else if (target.postBurstReleaseEvidence !== undefined) {
        supplementaryEvidence = await captureSupplementaryEvidence(
          page,
          targetDirectory,
          target,
          'post-burst-release',
          timeoutMs,
          supplementaryEvidence,
        );
      } else if (target.impactEvidence !== undefined) {
        supplementaryEvidence = await captureSupplementaryEvidence(
          page,
          targetDirectory,
          target,
          'impact-contact',
          timeoutMs,
          supplementaryEvidence,
        );
      }
      // Keep recording through the complete short signature window. The page
      // remains live and unmodified while the compositor records it.
      await sleep(POST_EVENT_RECORD_MS);
      const timingJournal = await focusState(page);
      if (timingJournal === null || timingJournal.status === 'error') {
        fail(`video timing journal failed: ${timingJournal?.error ?? 'journal disappeared'}`);
      }
      if (target.captureMode === 'snapshot-projectile-lifecycle' && timingJournal.projectileLock === null) {
        fail(`${target.label} did not retain a public snapshot projectile lock in its final timing journal`);
      }
      if (target.captureMode === 'grouped-burst-lifecycle' && timingJournal.burstLifecycle?.status !== 'complete') {
        fail(`${target.label} completed screenshots without a complete real grouped-burst journal`);
      }
      const finalState = await pageRunState(page);
      await page.evaluate(() => window.__p2SignatureFocus?.stop()).catch(() => undefined);
      await context.close();
      contextClosed = true;

      const sourceVideoPath = await video.path();
      const compositorVideoPath = join(targetDirectory, 'compositor.webm');
      renameSync(sourceVideoPath, compositorVideoPath);
      const videoInfo = await inspectCompositorVideo(ffmpegPath, compositorVideoPath, recordingDirectory);
      const eventRelativeSeconds = (matchedState.eventWallEpochMs - videoStartNodeEpochMs) / 1_000;
      if (!(eventRelativeSeconds > 0)) {
        fail(`event time ${eventRelativeSeconds.toFixed(3)}s preceded compositor-video recording start`);
      }
      const firstPostEventRafSample = timingJournal.rafSamples.find((sample) => {
        const tickDelta = sample.simTick - matchedState.eventTick;
        return tickDelta >= 1 && tickDelta <= target.visualLifetimeTicks;
      });
      if (firstPostEventRafSample === undefined) {
        fail(`${target.label} did not produce a post-event rAF sample inside visual lifetime 1..${target.visualLifetimeTicks}`);
      }
      const firstPostEventRelativeSeconds = (firstPostEventRafSample.wallEpochMs - videoStartNodeEpochMs) / 1_000;
      const selection = choosePostEventVideoFrames(videoInfo, firstPostEventRelativeSeconds);
      const frameTiming = selection.selected.map((sourceFrame, offset) => ({
        offset,
        ...timingForSourceFrame(
          videoInfo,
          sourceFrame.sourceFrameIndex,
          videoStartNodeEpochMs,
          timingJournal,
          matchedState.eventTick,
          target.visualLifetimeTicks,
        ),
      }));
      console.log(`[p2-signature-evidence] ${target.id} attempt ${attempt} selected compositor frames ${frameTiming.map((frame) => `V${frame.sourceFrameIndex}@${frame.simTick}(Δ${frame.simTickDeltaFromEvent})`).join(', ')}`);

      const imageFrames = await extractSelectedVideoFrames(
        ffmpegPath,
        compositorVideoPath,
        targetDirectory,
        selection.selected[0].sourceFrameIndex,
        target.focusAnchor,
      );
      const frames = frameTiming.map((timing, offset) => ({ ...timing, ...imageFrames[offset] }));
      const fullFrames = frames.map((frame) => frame.full);
      const focusCrops = frames.map((frame) => frame.focus2x);
      const labels = frames.map((frame) => `V${frame.sourceFrameIndex} / ${frame.videoPtsSeconds.toFixed(3)}s / ΔT${frame.simTickDeltaFromEvent}`);
      const tickStrip = join(targetDirectory, 'tick-strip.png');
      const tickStripGray = join(targetDirectory, 'tick-strip-gray.png');
      const focusStrip = join(targetDirectory, 'focus-2x-strip.png');
      const focusStripGray = join(targetDirectory, 'focus-2x-strip-gray.png');
      await createTickStrip(fullFrames, tickStrip, labels);
      await createTickStrip(fullFrames, tickStripGray, labels, true);
      await createFocusStrip(focusCrops, focusStrip, labels);
      await createFocusStrip(focusCrops, focusStripGray, labels, true);
      const milestones = await writeRenderedMilestoneStrips(
        outputDirectory,
        targetDirectory,
        target,
        renderedMilestoneFrames,
      );
      return {
        attempt,
        browserMessages,
        browserMode: 'headed-hardware-recordVideo',
        boot,
        captureRoute: route,
        focusAnchor: target.focusAnchor,
        captureMode: target.captureMode,
        eventEvidenceRole: target.eventEvidenceRole,
        telegraphCardClaimed: target.telegraphCardClaimed !== false,
        finalState,
        captureContract: target.captureMode === 'snapshot-projectile-lifecycle'
          ? 'supporting Playwright compositor video plus post-render screenshots whose anatomy proof is an exact live public heroSpit snapshot id; optional impact/contact evidence requires both a gracie-spit enemyHit and position agreement with that locked projectile trajectory, while an absent correlation is reported honestly; the launch telegraph is discovery-only and no telegraph card is claimed'
          : target.captureMode === 'grouped-burst-lifecycle'
            ? 'supporting Playwright compositor video plus post-render screenshots scoped to Benny’s nonoverlapped first ridge, with a separately journaled complete real ridge group and an optional after-complete-burst zero-envelope frame only when no independent wave overlaps its expiry'
            : 'supporting Playwright compositor video plus post-render compositor screenshots for Greg’s phase-timed early, mid, and near-terminal review, with an optional terminal frame only after the full illustrated foxSwipe family is clear and no later same-source or family-alias event contaminates the selected cast',
        compositorVideo: artifactPath(outputDirectory, compositorVideoPath),
        compositorVideoBytes: fileBytes(compositorVideoPath),
        compositorVideoStartNodeEpochMs: videoStartNodeEpochMs,
        compositorVideoFrameRate: videoInfo.frameRate,
        compositorVideoDurationSeconds: videoInfo.durationSeconds,
        compositorTimingProbe: artifactPath(outputDirectory, videoInfo.timingProbePath),
        matchedEvent: matchedState.event,
        matchedEventTick: matchedState.eventTick,
        matchedEventPageNowMs: matchedState.eventPageNowMs,
        matchedEventWallEpochMs: matchedState.eventWallEpochMs,
        matchedEventRelativeVideoSeconds: eventRelativeSeconds,
        firstPostEventRafSample,
        firstPostEventRelativeVideoSeconds: firstPostEventRelativeSeconds,
        requestedPostEventVideoSeconds: selection.desiredSeconds,
        visualLifetimeTicks: target.visualLifetimeTicks,
        timingJournal: timingJournal.rafSamples,
        matchingSourceEvents: timingJournal.matchingSourceEvents,
        targetFamilyEvents: timingJournal.targetFamilyEvents,
        releaseEvidence: target.releaseEvidence ?? null,
        releaseEvidenceState: timingJournal.releaseEvidenceState,
        projectileLock: timingJournal.projectileLock,
        projectileLockAttempts: timingJournal.projectileLockAttempts,
        projectileTrajectory: timingJournal.projectileTrajectory,
        projectileTerminal: timingJournal.projectileTerminal,
        impactEvidence: timingJournal.impactEvidence,
        projectileAnatomyContract: target.captureMode === 'snapshot-projectile-lifecycle'
          ? {
            source: target.projectile.source,
            sourceLabel: target.projectile.sourceLabel,
            requiredLiveSnapshot: target.projectile.requiredLiveSnapshot,
            identityContract: 'selected anatomy frames must use exact packed EntityId equality, never a reusable pool slot',
            telegraphCardClaimed: false,
          }
          : null,
        groupedBurstLifecycle: timingJournal.burstLifecycle ?? groupedBurstLifecycle,
        postBurstReleaseEvidencePolicy: target.postBurstReleaseEvidence ?? null,
        supplementaryEvidence: reportSupplementaryEvidence(outputDirectory, supplementaryEvidence),
        supplementaryState: timingJournal.supplementary,
        milestones,
        frames: frames.map((frame) => ({
          offset: frame.offset,
          sourceFrameIndex: frame.sourceFrameIndex,
          videoPtsSeconds: frame.videoPtsSeconds,
          videoWallEpochMs: frame.videoWallEpochMs,
          simTick: frame.simTick,
          simTickDeltaFromEvent: frame.simTickDeltaFromEvent,
          nearestRafSample: frame.nearestRafSample,
          full: artifactPath(outputDirectory, frame.full),
          fullBytes: fileBytes(frame.full),
          focus2x: artifactPath(outputDirectory, frame.focus2x),
          focus2xBytes: fileBytes(frame.focus2x),
          focus2xGray: artifactPath(outputDirectory, frame.focus2xGray),
          focus2xGrayBytes: fileBytes(frame.focus2xGray),
          cropBox: frame.cropBox,
        })),
        serverMode,
        strips: {
          tick: artifactPath(outputDirectory, tickStrip),
          tickGray: artifactPath(outputDirectory, tickStripGray),
          focus2x: artifactPath(outputDirectory, focusStrip),
          focus2xGray: artifactPath(outputDirectory, focusStripGray),
        },
      };
    } catch (error) {
      attemptNotes.push({
        attempt,
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
        browserMessages,
      });
    } finally {
      await page.evaluate(() => window.__p2SignatureFocus?.stop()).catch(() => undefined);
      if (!contextClosed) await context.close().catch(() => undefined);
    }
  }
  fail(`${target.label} did not yield ${STRIP_FRAME_COUNT} consecutive compositor-video frames within its visible lifetime after ${args.maxAttempts} attempts: ${JSON.stringify(attemptNotes)}`);
}

function writeReadme(outputDirectory, args, serverMode, selectedTargets) {
  const command = `node scripts/p2-signature-evidence.mjs --iteration ${args.iteration} --seed ${args.seed}`;
  const lines = [
    '# P2 signature renderer evidence',
    '',
    'This directory contains event-matched, normal-speed renderer frames. It is not a synthetic effect preview.',
    '',
    '## Exact command',
    '',
    '```sh',
    'cd /Users/adammuncie/GameDev/AnimalSurvivor/apps/web-toy',
    command,
    '```',
    '',
    `- Server mode: ${serverMode}.`,
    '- Browser: headed Chromium with hardware WebGL2 and Playwright compositor recording.',
    '- Each target uses an isolated Chromium process so a renderer failure cannot contaminate another target.',
    '- Each target discovers a run from a public, authoritative `driver.traitPresentationEvents` record on its own event tick. Event discovery is not automatically a visual-card claim.',
    '- Each target records a fresh Playwright compositor video and takes headed compositor screenshots only after rAF observes the live driver inside its named review window. The capture momentarily pauses the public presentation control after the live tick is reached so the compositor can hold that already-rendered frame; it does not alter simulation state, events, transforms, or textures. Because those holds are recorded, this P2 WebM is provenance-only rather than continuous-motion proof.',
    '- A page-owned rAF probe records only authoritative event/tick timing. It does not capture pixels or mutate the game.',
    '- After the context closes, Playwright bundled ffmpeg extracts three consecutive source-video frames beginning strictly after the first normal-rAF sample whose driver tick advanced beyond the event.',
    '- No driver wrapper, timing override, input/event injection, or renderer-state mutation is used. The documented phase screenshots momentarily pause only the public presentation control after the live phase is rendered.',
    '- The supporting video strip labels record source-video frame index and real PTS. Its nearest-rAF timing is explicitly approximate because compositor encoding is buffered; it is not used as visual-tick or continuous-motion proof.',
    '- `report.json` pins the active signature atlas, dedicated signature-body atlas, impact core, family debris strip, ground-contact texture, and atlas-router/motion/composite/scene source SHA-256 values compiled into this preview.',
    '- Greg uses early, mid, and near-terminal anatomy review. Its optional zero-envelope frame is admitted only when the public journal proves every event that can paint the illustrated foxSwipe family is past its inclusive renderer lifetime and no later same-source or family-alias event contaminated the selected cast; otherwise supplementary evidence is explicitly `unavailable`. It does not make a programmatic canvas-pixel transparency claim.',
    '- Benny uses first-ridge early, first-ridge mid, and first-ridge pre-next-ridge only: its real second ridge begins at +7 while the first can still be visible, so no overlap image is called a first-ridge release. `report.json` records the complete observed grouped burst and explicitly marks `releaseFrameClaimed: false`. It may add `after-complete-burst-zero-envelope` only when the selected group has expired without an independent later wave on or before that expiry; otherwise supplementary evidence is explicitly `unavailable`.',
    '- Gracie’s telegraph is launch discovery only. The reviewer must use the exact locked packed `heroSpit` id in `report.json`; every selected anatomy screenshot records a live `driver.curr` snapshot with its x/y/velocity before, during, and after the screenshot. An optional impact/contact frame is admitted only if a public `gracie-spit` `enemyHit` position agrees with that exact locked projectile trajectory; a missing correlation is reported as unavailable, not inferred from projectile disappearance. No telegraph-card visual is claimed.',
    '- Every signature target also includes `rendered-milestone-*-strip.png` files for truthful named-phase anatomy review. Each image records its requested window plus live driver ticks immediately before and after its compositor screenshot. Window membership alone never earns a pass.',
    '- `focus-2x-*` files are true 2x 640×432 CSS-pixel crops scaled to 1280×864. Each target uses a fixed reported hero/action-local anchor chosen before capture; crops are made only after compositor video closes and never read or alter the live canvas.',
    '',
    '## Targets and predicates',
    '',
    ...selectedTargets.flatMap((target) => {
      const predicate = `\`${target.predicate.kind}\` / \`${target.predicate.sourceId}\`${target.predicate.tag === undefined ? '' : ` / \`${target.predicate.tag}\``}${target.predicate.meleeArcResolved === undefined ? '' : ` / \`meleeArcResolved=${String(target.predicate.meleeArcResolved)}\``}`;
      const review = target.captureMode === 'grouped-burst-lifecycle'
        ? 'Grouped sequential-ridge evidence: first-ridge-only anatomy through Δ6; complete real burst journal required; no first-ridge release frame claimed. Post-group zero-envelope proof is optional and must reject independent-wave overlap.'
        : target.captureMode === 'snapshot-projectile-lifecycle'
          ? 'Public snapshot-projectile evidence: cast telegraph is discovery-only; exact live current-snapshot heroSpit id is required for all anatomy frames; impact/contact additionally requires source-and-trajectory correlation or is reported unavailable; no telegraph card claimed.'
          : 'Single-event early/mid/near-terminal anatomy evidence with optional post-family-zero proof that rejects later same-source and foxSwipe-family alias events.';
      return [`- **${target.label}** — ${predicate}. ${review}`];
    }),
    '',
    'Each target folder includes `compositor.webm`, `full-f0..f2.png`, 2x color/grayscale crops, supporting video strips, and phase-timed `rendered-milestone-f*.png` compositor screenshots with matching strips. When a supplementary release or contact frame is admissible it is emitted as `rendered-supplementary-*.png` with a one-frame strip; otherwise `report.json` records why no such frame is claimed. `report.json` records the live event, screenshot timing contract, source provenance, and video timing journal.',
  ];
  writeFileSync(join(outputDirectory, 'README.md'), `${lines.join('\n')}\n`);
}

function writeBlocked(outputDirectory, error) {
  const text = [
    '# P2 signature evidence blocked',
    '',
    'The focused renderer harness did not produce a valid evidence strip; no visual phase may be closed from this directory.',
    '',
    '```text',
    error instanceof Error ? error.stack ?? error.message : String(error),
    '```',
    '',
    'Retry from `apps/web-toy` with `node scripts/p2-signature-evidence.mjs --iteration <new-name>`.',
  ].join('\n');
  writeFileSync(join(outputDirectory, 'BLOCKED.md'), `${text}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDirectory = join(capturesRoot, args.iteration);
  if (existsSync(outputDirectory)) fail(`output directory exists: ${outputDirectory}; choose a new --iteration`);
  mkdirSync(outputDirectory, { recursive: true });
  const selectedTargets = TARGETS.filter((target) => args.targets.includes(target.id));
  let server;
  try {
    if (args.baseUrl === null) {
      server = await startProductionPreview(args.port);
    } else {
      server = { baseUrl: args.baseUrl, close: async () => undefined, mode: 'external-base-url', build: null };
    }
    const ffmpegPath = resolveBundledFfmpeg();
    const targets = [];
    for (const target of selectedTargets) {
      console.log(`[p2-signature-evidence] capturing ${target.label}`);
      // Isolate each hero in its own Chromium process. A WebGL readback issue
      // in one capture must not poison the next target's evidence run.
      const browser = await chromium.launch({ headless: false });
      try {
        const evidence = await captureTarget(browser, ffmpegPath, server.baseUrl, outputDirectory, target, args, server.mode);
        targets.push({
          id: target.id,
          hero: target.hero,
          label: target.label,
          predicate: target.predicate,
          evidencePolicy: {
            captureMode: target.captureMode,
            eventEvidenceRole: target.eventEvidenceRole,
            telegraphCardClaimed: target.telegraphCardClaimed !== false,
            burst: target.burst ?? null,
            releaseEvidence: target.releaseEvidence ?? null,
            postBurstReleaseEvidence: target.postBurstReleaseEvidence ?? null,
            projectile: target.projectile ?? null,
            impactEvidence: target.impactEvidence ?? null,
          },
          ...evidence,
        });
      } finally {
        await browser.close().catch(() => undefined);
      }
    }
    const report = {
      captureMode: 'real-driver-event-playwright-compositor-video',
      evidenceSchemaVersion: 'p2-signature-lifecycle-proof-v4',
      ffmpegPath,
      generatedAt: new Date().toISOString(),
      outputDirectory,
      seed: args.seed,
      serverMode: server.mode,
      build: server.build,
      visualAssetProvenance: server.build?.source?.visualAssetProvenance ?? null,
      stripFrames: STRIP_FRAME_COUNT,
      targets,
    };
    writeFileSync(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeReadme(outputDirectory, args, server.mode, selectedTargets);
    console.log(`[p2-signature-evidence] wrote ${join(outputDirectory, 'report.json')}`);
  } catch (error) {
    writeBlocked(outputDirectory, error);
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  } finally {
    if (server !== undefined) await server.close().catch(() => undefined);
  }
}

await main();
