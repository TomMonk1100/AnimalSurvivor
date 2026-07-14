/* global console, process, Buffer, URL, window, document, requestAnimationFrame, setTimeout, HTMLCanvasElement, performance */
/**
 * Panel-facing proof capture for P5 impact framing.
 *
 * This deliberately observes the real browser run rather than manufacturing
 * combat events. A fixed-seed autopilot run is paused only after the app's
 * renderer has consumed a matching event. It then advances one fixed tick at
 * a time, preserving the exact same simulation authority and allowing the
 * panel to inspect the three-tick enemy flash and five-tick camera shake.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview, build } from 'vite';
import { chromium } from 'playwright';
import { createCanvas, loadImage } from 'canvas';
import { findFfmpeg } from './flash-audit.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webToyRoot = resolve(scriptDirectory, '..');
const workspaceRoot = resolve(webToyRoot, '../..');
const capturesRoot = join(workspaceRoot, 'docs', 'vfx', 'captures');
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const FLASH_SAMPLE_TICKS = 3;
const SHAKE_SAMPLE_TICKS = 5;
const DEFAULT_MAX_SECONDS = 90;
const CROP_WIDTH = 960;
const CROP_HEIGHT = 540;
const CROP_SCALE = 2;
// These mirror the renderer's fixed orthographic framing. They are used only
// to crop the already-rendered canvas around a real event; the capture never
// writes a camera value back to the running application.
const CAMERA_ORTHO_HALF_HEIGHT = 190;
const CAMERA_HEIGHT = 600;
const CAMERA_FOLLOW_BACK_OFFSET = 520;
const LIVE_CAPTURE_FRAMES = 16;
const TARGET_CROP_WIDTH = 480;
const TARGET_CROP_HEIGHT = 360;

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Pin acceptance evidence to the exact source bytes, even before the user
 * chooses to commit the shared worktree. */
function sourceFingerprint() {
  const files = [
    'apps/web-toy/src/render/playcanvas-scene.ts',
    'apps/web-toy/src/render/enemy-hit-flash-presentation.ts',
    'apps/web-toy/src/render/camera-impact-shake.ts',
    'apps/web-toy/scripts/p5-impact-evidence.mjs',
  ];
  let gitHead = null;
  try {
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
  } catch {
    // A source hash remains sufficient in a local worktree without Git.
  }
  return {
    gitHead,
    sha256: Object.fromEntries(files.map((file) => [file, sha256File(join(workspaceRoot, file))])),
  };
}

// A byte-for-byte independent replay of the renderer-only critical activation
// branch in camera-impact-shake.ts. The browser-side mirror first proves that
// this event passed the history/threshold/rate policy; this helper then records
// its policy-world offset beside the measured pixel residual. It never reaches
// into, writes, or replaces the running renderer's camera.
function mixShakeHash(hash, value) {
  return Math.imul(hash ^ (value >>> 0), 0x01000193) >>> 0;
}

function mixShakeText(hash, value) {
  let result = mixShakeHash(hash, value.length);
  for (let index = 0; index < value.length; index++) result = mixShakeHash(result, value.charCodeAt(index));
  return result;
}

function shakeEventIdentity(event) {
  let hash = mixShakeText(0x811c9dc5, event.kind);
  hash = mixShakeHash(hash, Math.max(0, Math.floor(event.tick)));
  hash = mixShakeHash(hash, Math.round(event.amount * 1000));
  hash = mixShakeHash(hash, typeof event.targetId === 'number'
    ? event.targetId
    : mixShakeText(0x9e3779b9, String(event.targetId)));
  hash = mixShakeText(hash, event.sourceId);
  return mixShakeHash(hash, event.critical ? 1 : 0);
}

function criticalShakePolicyPath(event, activation) {
  const identity = shakeEventIdentity(event);
  const phase = (identity >>> 0) / 0x1_0000_0000 * Math.PI * 2;
  const amplitude = 1.25;
  const samples = [];
  for (let age = 0; age <= SHAKE_SAMPLE_TICKS; age++) {
    if (age >= SHAKE_SAMPLE_TICKS) {
      samples.push({ ageTicks: age, active: false, x: 0, y: 0, magnitude: 0 });
      continue;
    }
    const release = Math.pow(1 - age / SHAKE_SAMPLE_TICKS, 1.35);
    const angle = phase + age * 2.35;
    const microPulse = 0.71 + 0.29 * Math.cos(phase * 0.5 + age * 3.1);
    const magnitude = amplitude * release * microPulse;
    samples.push({
      index: age,
      ageTicks: age,
      active: magnitude > 1e-4,
      x: Math.cos(angle) * magnitude,
      y: Math.sin(angle) * magnitude,
      magnitude,
    });
  }
  return {
    identity,
    activation,
    criticalAmplitudeWorldUnits: amplitude,
    hardCapWorldUnits: 2,
    samples,
  };
}

function fail(message) {
  throw new Error(`[p5-impact-evidence] ${message}`);
}

function normalizeIteration(value) {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) {
    fail(`iteration must contain only letters, digits, dots, underscores, or hyphens: ${value}`);
  }
  return value;
}

function isoIteration() {
  return `p5-impact-${new Date().toISOString().replace(/[:.]/gu, '-').replace(/Z$/u, 'Z')}`;
}

function parseArgs(argv) {
  const args = {
    browserMode: 'auto',
    hero: 'greg',
    iteration: isoIteration(),
    maxSeconds: DEFAULT_MAX_SECONDS,
    port: 5201,
    preview: false,
    seed: '3',
    live: false,
    liveOnly: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--headed') {
      args.browserMode = 'headed';
    } else if (argument === '--headless') {
      args.browserMode = 'headless';
    } else if (argument === '--hero' && value) {
      args.hero = value;
      index++;
    } else if (argument === '--iteration' && value) {
      args.iteration = normalizeIteration(value);
      index++;
    } else if (argument === '--max-seconds' && value) {
      args.maxSeconds = Number(value);
      index++;
    } else if (argument === '--port' && value) {
      args.port = Number(value);
      index++;
    } else if (argument === '--preview') {
      args.preview = true;
    } else if (argument === '--live') {
      args.live = true;
    } else if (argument === '--live-only') {
      args.live = true;
      args.liveOnly = true;
    } else if (argument === '--seed' && value) {
      args.seed = value;
      index++;
    } else if (argument === '--help') {
      console.log(`Usage: node scripts/p5-impact-evidence.mjs [options]

Captures real fixed-seed P5 evidence without injecting combat events.

  --iteration <name>  Output folder below docs/vfx/captures/.
  --hero <id>         Hero query value (default: greg).
  --seed <seed>       Fixed run seed (default: 3).
  --max-seconds <n>   Simulated search budget for each proof (default: 90).
  --headed            Require headed Chromium.
  --headless          Force SwiftShader fallback.
  --preview           Capture built dist instead of Vite source.
  --live              Add no-pause, normal-rAF canvas proof with target-relative crops.
  --live-only         Run only the no-pause visual proof (skips exact lifecycle strips).
`);
      process.exit(0);
    } else {
      fail(`unknown or incomplete argument: ${argument}`);
    }
  }
  if (!Number.isFinite(args.maxSeconds) || args.maxSeconds <= 0) fail(`invalid --max-seconds: ${args.maxSeconds}`);
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) fail(`invalid --port: ${args.port}`);
  args.iteration = normalizeIteration(args.iteration);
  return args;
}

async function startViteServer({ port, usePreview }) {
  if (usePreview) {
    await build({ root: webToyRoot, logLevel: 'error' });
    const server = await preview({
      root: webToyRoot,
      logLevel: 'error',
      preview: { host: '127.0.0.1', port, strictPort: false },
    });
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') fail('Vite preview did not expose a TCP port');
    return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => server.close(), mode: 'preview' };
  }
  const server = await createServer({
    root: webToyRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    fail('Vite dev server did not expose a TCP port');
  }
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => server.close(), mode: 'dev' };
}

async function launchBrowser(mode) {
  const swiftShaderArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  if (mode === 'headless') {
    return {
      browser: await chromium.launch({ headless: true, args: swiftShaderArgs }),
      mode: 'headless-swiftshader',
      fallbackReason: null,
    };
  }
  try {
    return {
      browser: await chromium.launch({ headless: false }),
      mode: 'headed',
      fallbackReason: null,
    };
  } catch (error) {
    if (mode === 'headed') throw error;
    return {
      browser: await chromium.launch({ headless: true, args: swiftShaderArgs }),
      mode: 'headless-swiftshader',
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}

function runningUrl(baseUrl, args) {
  const url = new URL(baseUrl);
  url.searchParams.set('autopilot', '1');
  url.searchParams.set('hero', args.hero);
  url.searchParams.set('seed', args.seed);
  return url.toString();
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function ensureRunStarted(page) {
  await page.waitForFunction(() => {
    const handle = window.__webToy;
    return handle !== undefined && handle.driver.tick > 3 && document.getElementById('run-intro')?.hidden === true;
  }, undefined, { timeout: 15_000 });
  const state = await page.evaluate(() => ({
    tick: window.__webToy?.driver.tick ?? -1,
    webgl2: document.getElementById('game-canvas')?.getContext('webgl2') !== null,
  }));
  if (!state.webgl2) fail('the page reached a run without a WebGL2 canvas');
  return state;
}

/**
 * Install the evidence-only mirror before the run begins. It is a literal
 * replay of the renderer's small camera-impact policy: the mirror observes
 * event views but never reaches into the renderer, changes a camera value, or
 * writes a simulation field. Starting before tick zero means a later visible
 * critical can be checked against the complete recorded critical history
 * instead of being incorrectly rejected merely because an off-screen crit
 * happened first.
 */
async function installCameraImpactPolicyMirrorFactory(page) {
  await page.evaluate(() => {
    if (typeof window.__createP5CameraImpactPolicyMirror === 'function') return;
    window.__createP5CameraImpactPolicyMirror = (trackingStartedAtTick) => {
      const durationTicks = 5;
      const globalRateLimitTicks = 20;
      const criticalHistoryCapacity = 32;
      const seenCapacity = 192;
      const seen = new Uint32Array(seenCapacity);
      let seenCount = 0;
      let nextSeen = 0;
      const criticalAmounts = new Float32Array(criticalHistoryCapacity);
      const criticalScratch = new Float32Array(criticalHistoryCapacity);
      let criticalCount = 0;
      let nextCritical = 0;
      let lastShakeTick = -globalRateLimitTicks;
      let activeStartTick = -1;
      let activeAmplitude = 0;
      let activePhase = 0;
      let processedEventCount = 0;
      let processedCriticalCount = 0;
      let processedPlayerHitCount = 0;

      const normalizedTick = (value) => Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
      const mixHash = (hash, value) => Math.imul(hash ^ (value >>> 0), 0x01000193) >>> 0;
      const mixText = (hash, value) => {
        let result = mixHash(hash, value.length);
        for (let index = 0; index < value.length; index++) result = mixHash(result, value.charCodeAt(index));
        return result;
      };
      const eventIdentity = (event) => {
        let hash = mixText(0x811c9dc5, event.kind);
        hash = mixHash(hash, normalizedTick(event.tick));
        hash = mixHash(hash, Math.round(event.amount * 1000));
        hash = mixHash(hash, typeof event.targetId === 'number'
          ? event.targetId
          : mixText(0x9e3779b9, event.targetId));
        hash = mixText(hash, event.sourceId);
        return mixHash(hash, event.critical ? 1 : 0);
      };
      const usableEvent = (event) => Number.isFinite(event.tick) && Number.isFinite(event.amount);
      const isCriticalEnemyHit = (event) => event.kind === 'enemyHit' && event.critical && event.amount > 0;
      const hasSeen = (identity) => {
        for (let index = 0; index < seenCount; index++) {
          if (seen[index] === identity) return true;
        }
        return false;
      };
      const remember = (identity) => {
        seen[nextSeen] = identity;
        nextSeen = (nextSeen + 1) % seenCapacity;
        if (seenCount < seenCapacity) seenCount++;
      };
      const percentile75 = () => {
        if (criticalCount <= 0) return 0;
        for (let index = 0; index < criticalCount; index++) criticalScratch[index] = criticalAmounts[index];
        for (let index = 1; index < criticalCount; index++) {
          const value = criticalScratch[index];
          let cursor = index - 1;
          while (cursor >= 0 && criticalScratch[cursor] > value) {
            criticalScratch[cursor + 1] = criticalScratch[cursor];
            cursor--;
          }
          criticalScratch[cursor + 1] = value;
        }
        return criticalScratch[Math.floor((criticalCount - 1) * 0.75)];
      };
      const rememberCritical = (amount) => {
        criticalAmounts[nextCritical] = amount;
        nextCritical = (nextCritical + 1) % criticalHistoryCapacity;
        if (criticalCount < criticalHistoryCapacity) criticalCount++;
      };
      const phaseForIdentity = (identity) => (identity >>> 0) / 0x1_0000_0000 * Math.PI * 2;
      const startShake = (eventTick, amplitude, identity) => {
        const lastShakeTickBefore = lastShakeTick;
        const elapsedTicks = eventTick - lastShakeTickBefore;
        const allowed = elapsedTicks >= globalRateLimitTicks;
        if (allowed) {
          lastShakeTick = eventTick;
          activeStartTick = eventTick;
          activeAmplitude = Math.min(2, Math.max(0, amplitude));
          activePhase = phaseForIdentity(identity);
        }
        return {
          started: allowed,
          lastShakeTickBefore,
          elapsedTicks,
          requiredTicks: globalRateLimitTicks,
          allowed,
        };
      };
      const frameAt = (tick) => {
        const ageTicks = tick - activeStartTick;
        if (ageTicks < 0 || ageTicks >= durationTicks || activeAmplitude <= 0) {
          return {
            tick,
            active: false,
            x: 0,
            y: 0,
            magnitude: 0,
            ageTicks,
            activeStartTick,
            activeAmplitude,
          };
        }
        const release = Math.pow(1 - ageTicks / durationTicks, 1.35);
        const angle = activePhase + ageTicks * 2.35;
        const microPulse = 0.71 + 0.29 * Math.cos(activePhase * 0.5 + ageTicks * 3.1);
        const magnitude = activeAmplitude * release * microPulse;
        return {
          tick,
          active: magnitude > 1e-4,
          x: Math.cos(angle) * magnitude,
          y: Math.sin(angle) * magnitude,
          magnitude,
          ageTicks,
          activeStartTick,
          activeAmplitude,
        };
      };

      return {
        consume(events, renderTick) {
          const tick = normalizedTick(renderTick);
          const decisions = [];
          for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
            const event = events[eventIndex];
            if (!usableEvent(event)) continue;
            const eventTick = normalizedTick(event.tick);
            if (eventTick > tick) continue;
            const identity = eventIdentity(event);
            if (hasSeen(identity)) continue;
            remember(identity);
            processedEventCount++;

            if (isCriticalEnemyHit(event)) {
              const historyCountBefore = criticalCount;
              const percentileBefore = percentile75();
              const qualifies = criticalCount < 4 || event.amount >= percentileBefore;
              // This order intentionally matches camera-impact-shake.ts:
              // measure, record, then test the shared shake rate limit.
              rememberCritical(event.amount);
              processedCriticalCount++;
              const rateLimit = qualifies
                ? startShake(eventTick, 1.25, identity)
                : {
                  started: false,
                  lastShakeTickBefore: lastShakeTick,
                  elapsedTicks: eventTick - lastShakeTick,
                  requiredTicks: globalRateLimitTicks,
                  allowed: false,
                };
              decisions.push({
                type: 'critical',
                event,
                eventIndex,
                eventTick,
                identity,
                historyCountBefore,
                percentileBefore,
                qualifies,
                rateLimit,
                started: qualifies && rateLimit.started,
                amplitudeWorldUnits: qualifies && rateLimit.started ? 1.25 : 0,
              });
            } else if (event.kind === 'playerHit') {
              processedPlayerHitCount++;
              const rateLimit = startShake(eventTick, 1.8, identity);
              decisions.push({
                type: 'playerHit',
                event,
                eventIndex,
                eventTick,
                identity,
                rateLimit,
                started: rateLimit.started,
                amplitudeWorldUnits: rateLimit.started ? 1.8 : 0,
              });
            }
          }
          return {
            frame: frameAt(tick),
            decisions,
            history: {
              trackingStartedAtTick: normalizedTick(trackingStartedAtTick),
              processedEventCount,
              processedCriticalCount,
              processedPlayerHitCount,
              criticalHistoryCount: criticalCount,
              lastShakeTick,
              globalRateLimitTicks,
              durationTicks,
            },
          };
        },
      };
    };
  });
}

async function ensureWebToyHandle(page) {
  await page.waitForFunction(() => window.__webToy !== undefined && window.__webToy.driver !== undefined, undefined, { timeout: 15_000 });
}

/** Keep normal gameplay moving through real player-visible upgrade controls. */
function startUpgradeChooser(page) {
  let active = true;
  let clicks = 0;
  const loop = (async () => {
    while (active) {
      const choice = page.locator('#upgrade-choices:not([hidden]) button').first();
      try {
        if (await choice.count() > 0) {
          await choice.click({ timeout: 300 });
          clicks++;
        }
      } catch {
        // A deterministic tick may close the prompt between observation and click.
      }
      await sleep(75);
    }
  })();
  return {
    async stop() {
      active = false;
      await loop;
      return clicks;
    },
  };
}

/**
 * The watcher is queued after the app's rAF callback, so a focus can only be
 * frozen after the renderer has received the real event for that render tick.
 * It never appends, changes, or fabricates a combat event.
 */
async function installFocusWatcher(page, kind) {
  await installCameraImpactPolicyMirrorFactory(page);
  await page.evaluate((focusKind) => {
    const proof = {
      focus: null,
      focusKind,
      status: 'watching',
      skippedTick: null,
      forceOneTick: false,
      lastDriverNowMs: null,
      observedCriticalEnemyHits: 0,
      observedPlayerHits: 0,
    };
    window.__p5ImpactEvidence = proof;
    const observedEventKeys = new Set();

    // The app's rAF can occasionally span two simulation ticks after a Node
    // screenshot readback. Keep a capture-local copy of the existing driver
    // call and, only between frozen proof frames, feed it one exact fixed dt.
    // The original driver still owns the input, fixed simulation step, and all
    // snapshots; no combat event or simulation field is written here.
    const handleAtInstall = window.__webToy;
    const policyMirror = focusKind === 'shake'
      ? window.__createP5CameraImpactPolicyMirror(handleAtInstall?.driver.tick ?? 0)
      : null;
    proof.policyTracking = policyMirror === null
      ? null
      : {
        trackingStartedAtTick: handleAtInstall?.driver.tick ?? 0,
        trackingBoundary: 'watcher installed before run-start evidence; mirror consumes the same copied combat event order as camera-impact-shake.ts',
      };
    const originalFrame = handleAtInstall?.driver.frame.bind(handleAtInstall.driver);
    if (originalFrame !== undefined) {
      handleAtInstall.driver.frame = (nowMs, input, paused) => {
        const currentProof = window.__p5ImpactEvidence;
        const shouldForceOneTick = currentProof?.forceOneTick === true
          && paused === false
          && Number.isFinite(currentProof.lastDriverNowMs);
        const driverNowMs = shouldForceOneTick
          ? currentProof.lastDriverNowMs + 1000 / 60
          : nowMs;
        originalFrame(driverNowMs, input, paused);
        currentProof.lastDriverNowMs = driverNowMs;
        if (shouldForceOneTick) currentProof.forceOneTick = false;
      };
    }

    const cloneEvent = (event) => ({
      kind: event.kind,
      tick: event.tick,
      x: event.x,
      y: event.y,
      amount: event.amount,
      critical: event.critical,
      sourceId: event.sourceId,
      targetId: event.targetId,
      pickupKind: event.pickupKind,
    });
    const targetIsLive = (handle, targetId) => {
      if (typeof targetId !== 'number') return false;
      const enemies = handle.driver.curr.enemies;
      for (let index = 0; index < enemies.count; index++) {
        if (enemies.id[index] === targetId) return true;
      }
      return false;
    };
    const targetScreenPosition = (handle, event) => {
      const canvas = document.getElementById('game-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const aspect = width / height;
      const groundVerticalScale = 600 / Math.hypot(600, 520);
      return {
        x: (event.x - handle.driver.curr.playerX) / (190 * aspect) * width * 0.5 + width * 0.5,
        y: height * 0.5 - (event.y - handle.driver.curr.playerY) * groundVerticalScale / 190 * height * 0.5,
        width,
        height,
      };
    };
    const targetIsUsefulFlashProof = (handle, event) => {
      const point = targetScreenPosition(handle, event);
      if (point === null) return false;
      // Demand a whole target-relative crop inside the canvas and keep it away
      // from the centered hero. A valid hit at the edge is correct gameplay,
      // but it is not useful visual proof of a readable enemy flash.
      const insetX = 240;
      // Bottom inset also keeps the capture-only DOM timing marker outside the
      // evaluated target crop; it never shares pixels with the flash panel.
      const insetY = 240;
      const distanceFromHero = Math.hypot(point.x - point.width * 0.5, point.y - point.height * 0.5);
      return point.x >= insetX && point.x <= point.width - insetX
        && point.y >= insetY && point.y <= point.height - insetY
        && distanceFromHero >= 150;
    };
    const targetIsScreenVisible = (handle, event) => {
      const point = targetScreenPosition(handle, event);
      if (point === null) return false;
      // Keep the crit and the centered player in the calm middle of the
      // screen, leaving fixed-screen terrain on every side for the shake read.
      const lowerSafeBand = Math.min(point.height * 0.8, point.height - 240);
      return point.x >= point.width * 0.2 && point.x <= point.width * 0.8
        && point.y >= point.height * 0.2 && point.y <= lowerSafeBand;
    };
    const eventKey = (event) => [
      event.kind,
      event.tick,
      event.targetId,
      event.sourceId,
      event.amount,
      event.critical,
    ].join('|');
    const poll = () => {
      const handle = window.__webToy;
      if (handle === undefined) {
        requestAnimationFrame(poll);
        return;
      }
      const tick = handle.driver.tick;
      const events = handle.driver.combatPresentationEvents ?? [];
      const unseenEvents = [];
      for (const event of events) {
        const key = eventKey(event);
        if (observedEventKeys.has(key)) continue;
        observedEventKeys.add(key);
        unseenEvents.push(event);
      }
      // The renderer receives every event from a catch-up frame in source
      // order. Let the evidence mirror consume that full ordered set, while
      // the visual predicate below still requires a current-tick panel target.
      const currentEvents = unseenEvents.filter((event) => event.tick === tick);
      const currentCriticalEnemyHits = currentEvents.filter((event) => event.kind === 'enemyHit' && event.critical);
      const currentPlayerHits = currentEvents.filter((event) => event.kind === 'playerHit');
      const policyFrame = policyMirror === null ? null : policyMirror.consume(unseenEvents, tick);
      if (policyFrame !== null) {
        proof.lastPolicyFrame = {
          history: policyFrame.history,
          frame: policyFrame.frame,
          currentTickCriticalEnemyHits: currentCriticalEnemyHits.length,
          decisions: policyFrame.decisions.map((decision) => ({
            type: decision.type,
            eventTick: decision.eventTick,
            historyCountBefore: decision.historyCountBefore ?? null,
            percentileBefore: decision.percentileBefore ?? null,
            qualifies: decision.qualifies ?? null,
            rateLimit: decision.rateLimit,
            started: decision.started,
          })),
        };
      }
      let match = null;
      let visualMatch = null;
      let criticalBatch = null;
      let policyActivation = null;
      if (focusKind === 'flash') {
        for (const event of currentEvents) {
          // A catch-up event older than the current frame cannot have a live
          // P5 three-tick overlay, so evidence only accepts the current tick.
          if (event.tick !== tick) continue;
          if (event.kind === 'enemyHit' && !event.critical && targetIsLive(handle, event.targetId)
            && targetIsUsefulFlashProof(handle, event)) {
            match = event;
            break;
          }
        }
      } else if (currentCriticalEnemyHits.length >= 1 && policyFrame !== null) {
        // Do not equate a visible crit with a camera shake. Select only a
        // current critical whose independently mirrored renderer policy
        // actually started the five-tick shake after its threshold and shared
        // 20-tick rate-limit checks. This permits a later visible activation
        // after harmless off-screen crits, without inventing one.
        for (const decision of policyFrame.decisions) {
          if (decision.type === 'critical' && decision.started && decision.eventTick === tick) {
            policyActivation = decision;
            break;
          }
        }
        let visualAnchorIndex = -1;
        for (let index = 0; index < currentCriticalEnemyHits.length; index++) {
          if (targetIsScreenVisible(handle, currentCriticalEnemyHits[index])) {
            visualAnchorIndex = index;
            break;
          }
        }
        if (
          policyActivation !== null
          && policyFrame.frame.active
          && policyFrame.frame.activeStartTick === tick
          && visualAnchorIndex >= 0
        ) {
          match = policyActivation.event;
          visualMatch = currentCriticalEnemyHits[visualAnchorIndex];
          criticalBatch = {
            count: currentCriticalEnemyHits.length,
            policyActivationIndex: currentCriticalEnemyHits.indexOf(policyActivation.event),
            visualAnchorIndex,
            anchorStrategy: 'current-tick critical that started the mirrored renderer shake; first screen-visible member of that same batch for the panel crop',
          };
        }
      }
      if (match !== null) {
        const visualEvent = visualMatch ?? match;
        proof.focus = {
          renderTick: tick,
          capturedAtMs: performance.now(),
          event: cloneEvent(match),
          visualEvent: visualMatch === null ? null : cloneEvent(visualMatch),
          criticalBatch,
          targetLiveAtTrigger: targetIsLive(handle, visualEvent.targetId),
          targetScreenAtTrigger: targetScreenPosition(handle, visualEvent),
          playerScreenAtTrigger: (() => {
            const canvas = document.getElementById('game-canvas');
            if (!(canvas instanceof HTMLCanvasElement)) return null;
            const rect = canvas.getBoundingClientRect();
            return { x: rect.width * 0.5, y: rect.height * 0.5, width: rect.width, height: rect.height };
          })(),
          playerX: handle.driver.curr.playerX,
          playerY: handle.driver.curr.playerY,
          shakePolicyActivation: focusKind === 'shake' && policyActivation !== null && policyFrame !== null
            ? {
              mirror: 'camera-impact-shake.ts policy replay from pre-run watcher installation',
              policyHistory: policyFrame.history,
              decision: {
                eventIndexInFrame: policyActivation.eventIndex,
                eventTick: policyActivation.eventTick,
                historyCountBefore: policyActivation.historyCountBefore,
                percentile75Before: policyActivation.percentileBefore,
                thresholdQualified: policyActivation.qualifies,
                rateLimit: policyActivation.rateLimit,
                started: policyActivation.started,
                amplitudeWorldUnits: policyActivation.amplitudeWorldUnits,
              },
              frameAtFocus: policyFrame.frame,
              observedBeforeSelection: {
                criticalEnemyHits: proof.observedCriticalEnemyHits,
                playerHits: proof.observedPlayerHits,
              },
              currentTickCriticalEnemyHits: currentCriticalEnemyHits.length,
              currentTickPlayerHits: currentPlayerHits.length,
            }
            : null,
        };
        proof.status = 'frozen-after-render';
        // This is the same presentation-only pause a player can invoke. The
        // completed simulation tick and renderer input are already fixed.
        handle.controls.paused = true;
        return;
      }
      proof.observedCriticalEnemyHits += unseenEvents.filter((event) => event.kind === 'enemyHit' && event.critical).length;
      proof.observedPlayerHits += unseenEvents.filter((event) => event.kind === 'playerHit').length;
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }, kind);
}

async function waitForFocus(page, maxSeconds) {
  const timeout = Math.ceil((maxSeconds * 1.7 + 15) * 1_000);
  try {
    await page.waitForFunction(() => window.__p5ImpactEvidence?.focus !== null, undefined, { timeout });
  } catch {
    const state = await page.evaluate(() => ({
      tick: window.__webToy?.driver.tick ?? -1,
      status: window.__p5ImpactEvidence?.status ?? 'missing',
      policy: window.__p5ImpactEvidence?.lastPolicyFrame ?? null,
      events: (window.__webToy?.driver.combatPresentationEvents ?? []).map((event) => ({
        kind: event.kind, tick: event.tick, critical: event.critical, sourceId: event.sourceId,
      })),
    }));
    fail(`no qualifying event before the ${maxSeconds}s budget: ${JSON.stringify(state)}`);
  }
  return page.evaluate(() => window.__p5ImpactEvidence.focus);
}

/**
 * The panel-facing visual pass intentionally never pauses the game and never
 * replaces the driver's clock. It records only lightweight timing metadata in
 * normal requestAnimationFrame callbacks; real pixels come later from the
 * compositor-owned Playwright video, so capture never calls WebGL readPixels
 * or canvas.toDataURL while the run is in progress.
 */
async function installLiveCaptureWatcher(page, kind) {
  await installCameraImpactPolicyMirrorFactory(page);
  await page.evaluate(({ focusKind, captureFrames }) => {
    const proof = {
      focus: null,
      focusKind,
      status: 'watching',
      samples: [],
      observedCriticalEnemyHits: 0,
      observedPlayerHits: 0,
    };
    window.__p5LiveEvidence = proof;
    const observedEventKeys = new Set();
    const handleAtInstall = window.__webToy;
    const policyMirror = focusKind === 'shake'
      ? window.__createP5CameraImpactPolicyMirror(handleAtInstall?.driver.tick ?? 0)
      : null;
    proof.policyTracking = policyMirror === null
      ? null
      : {
        trackingStartedAtTick: handleAtInstall?.driver.tick ?? 0,
        trackingBoundary: 'watcher installed before run-start evidence; mirror consumes the same copied combat event order as camera-impact-shake.ts',
      };

    // Capture-only timing beacon. It lives in the DOM above the canvas, never
    // touches the renderer or simulation, and sits outside the target crops.
    // We use it to associate compositor-video frames with the real event
    // without a WebGL readback or any wall-clock guessing.
    const timingMarker = document.createElement('div');
    timingMarker.id = 'p5-impact-evidence-marker';
    timingMarker.setAttribute('aria-hidden', 'true');
    timingMarker.style.position = 'fixed';
    timingMarker.style.right = '8px';
    timingMarker.style.bottom = '8px';
    timingMarker.style.width = '176px';
    timingMarker.style.height = '30px';
    timingMarker.style.display = 'none';
    timingMarker.style.background = 'rgb(255, 0, 255)';
    timingMarker.style.border = '2px solid rgb(255, 255, 255)';
    timingMarker.style.color = 'rgb(0, 0, 0)';
    timingMarker.style.font = 'bold 13px monospace';
    timingMarker.style.lineHeight = '30px';
    timingMarker.style.textAlign = 'center';
    timingMarker.style.zIndex = '2147483647';
    timingMarker.style.pointerEvents = 'none';
    document.body.appendChild(timingMarker);
    const showTimingMarker = (tick) => {
      timingMarker.textContent = `P5 REAL EVENT · T${tick}`;
      timingMarker.style.display = 'block';
      proof.marker = { tick, kind: focusKind, color: '#ff00ff', captureOnly: true };
    };

    const cloneEvent = (event) => ({
      kind: event.kind,
      tick: event.tick,
      x: event.x,
      y: event.y,
      amount: event.amount,
      critical: event.critical,
      sourceId: event.sourceId,
      targetId: event.targetId,
      pickupKind: event.pickupKind,
    });
    const targetIsLive = (handle, targetId) => {
      if (typeof targetId !== 'number') return false;
      const enemies = handle.driver.curr.enemies;
      for (let index = 0; index < enemies.count; index++) {
        if (enemies.id[index] === targetId) return true;
      }
      return false;
    };
    const targetScreenPosition = (handle, event) => {
      const canvas = document.getElementById('game-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const aspect = width / height;
      const groundVerticalScale = 600 / Math.hypot(600, 520);
      return {
        x: (event.x - handle.driver.curr.playerX) / (190 * aspect) * width * 0.5 + width * 0.5,
        y: height * 0.5 - (event.y - handle.driver.curr.playerY) * groundVerticalScale / 190 * height * 0.5,
        width,
        height,
      };
    };
    const targetIsUsefulFlashProof = (handle, event) => {
      const point = targetScreenPosition(handle, event);
      if (point === null) return false;
      const distanceFromHero = Math.hypot(point.x - point.width * 0.5, point.y - point.height * 0.5);
      return point.x >= 240 && point.x <= point.width - 240
        && point.y >= 240 && point.y <= point.height - 240
        && distanceFromHero >= 150;
    };
    const targetIsScreenVisible = (handle, event) => {
      const point = targetScreenPosition(handle, event);
      if (point === null) return false;
      const lowerSafeBand = Math.min(point.height * 0.8, point.height - 240);
      return point.x >= point.width * 0.2 && point.x <= point.width * 0.8
        && point.y >= point.height * 0.2 && point.y <= lowerSafeBand;
    };
    const eventKey = (event) => [
      event.kind,
      event.tick,
      event.targetId,
      event.sourceId,
      event.amount,
      event.critical,
    ].join('|');
    const recordFrameMetadata = () => {
      const handle = window.__webToy;
      const canvas = document.getElementById('game-canvas');
      if (handle === undefined || !(canvas instanceof HTMLCanvasElement)) {
        proof.status = 'blocked';
        proof.error = 'the live canvas or web toy handle disappeared during capture';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      // Keep rAF near video rate: this is metadata only, not a WebGL pixel
      // readback. The later frame extraction reads Playwright's compositor
      // recording after the browser context has closed.
      proof.samples.push({
        tick: handle.driver.tick,
        capturedAtMs: performance.now(),
        playerX: handle.driver.curr.playerX,
        playerY: handle.driver.curr.playerY,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasX: rect.x,
        canvasY: rect.y,
        canvasCssWidth: rect.width,
        canvasCssHeight: rect.height,
      });
      if (proof.samples.length >= captureFrames) {
        proof.status = 'complete';
        timingMarker.remove();
        return;
      }
      requestAnimationFrame(recordFrameMetadata);
    };
    const poll = () => {
      const handle = window.__webToy;
      if (handle === undefined) {
        requestAnimationFrame(poll);
        return;
      }
      const tick = handle.driver.tick;
      const events = handle.driver.combatPresentationEvents ?? [];
      const unseenEvents = [];
      for (const event of events) {
        const key = eventKey(event);
        if (observedEventKeys.has(key)) continue;
        observedEventKeys.add(key);
        unseenEvents.push(event);
      }
      const currentEvents = unseenEvents.filter((event) => event.tick === tick);
      const currentCriticalEnemyHits = currentEvents.filter((event) => event.kind === 'enemyHit' && event.critical);
      const currentPlayerHits = currentEvents.filter((event) => event.kind === 'playerHit');
      const policyFrame = policyMirror === null ? null : policyMirror.consume(unseenEvents, tick);
      if (policyFrame !== null) {
        proof.lastPolicyFrame = {
          history: policyFrame.history,
          frame: policyFrame.frame,
          currentTickCriticalEnemyHits: currentCriticalEnemyHits.length,
          decisions: policyFrame.decisions.map((decision) => ({
            type: decision.type,
            eventTick: decision.eventTick,
            historyCountBefore: decision.historyCountBefore ?? null,
            percentileBefore: decision.percentileBefore ?? null,
            qualifies: decision.qualifies ?? null,
            rateLimit: decision.rateLimit,
            started: decision.started,
          })),
        };
      }
      let match = null;
      let visualMatch = null;
      let criticalBatch = null;
      let policyActivation = null;
      if (focusKind === 'flash') {
        for (const event of currentEvents) {
          if (event.tick !== tick) continue;
          if (event.kind === 'enemyHit' && !event.critical && targetIsLive(handle, event.targetId)
            && targetIsUsefulFlashProof(handle, event)) {
            match = event;
            break;
          }
        }
      } else if (currentCriticalEnemyHits.length >= 1 && policyFrame !== null) {
        // The companion video follows the same policy mirror as exact proof,
        // so its marker belongs to a real active shake rather than merely a
        // later critical that happened while the rate limit was closed.
        for (const decision of policyFrame.decisions) {
          if (decision.type === 'critical' && decision.started && decision.eventTick === tick) {
            policyActivation = decision;
            break;
          }
        }
        let visualAnchorIndex = -1;
        for (let index = 0; index < currentCriticalEnemyHits.length; index++) {
          if (targetIsScreenVisible(handle, currentCriticalEnemyHits[index])) {
            visualAnchorIndex = index;
            break;
          }
        }
        if (
          policyActivation !== null
          && policyFrame.frame.active
          && policyFrame.frame.activeStartTick === tick
          && visualAnchorIndex >= 0
        ) {
          match = policyActivation.event;
          visualMatch = currentCriticalEnemyHits[visualAnchorIndex];
          criticalBatch = {
            count: currentCriticalEnemyHits.length,
            policyActivationIndex: currentCriticalEnemyHits.indexOf(policyActivation.event),
            visualAnchorIndex,
            anchorStrategy: 'current-tick critical that started the mirrored renderer shake; first screen-visible member of that same batch for the panel crop',
          };
        }
      }
      if (match !== null) {
        const visualEvent = visualMatch ?? match;
        proof.focus = {
          renderTick: tick,
          capturedAtMs: performance.now(),
          event: cloneEvent(match),
          visualEvent: visualMatch === null ? null : cloneEvent(visualMatch),
          criticalBatch,
          targetLiveAtTrigger: targetIsLive(handle, visualEvent.targetId),
          targetScreenAtTrigger: targetScreenPosition(handle, visualEvent),
          playerScreenAtTrigger: (() => {
            const canvas = document.getElementById('game-canvas');
            if (!(canvas instanceof HTMLCanvasElement)) return null;
            const rect = canvas.getBoundingClientRect();
            return { x: rect.width * 0.5, y: rect.height * 0.5, width: rect.width, height: rect.height };
          })(),
          playerX: handle.driver.curr.playerX,
          playerY: handle.driver.curr.playerY,
          shakePolicyActivation: focusKind === 'shake' && policyActivation !== null && policyFrame !== null
            ? {
              mirror: 'camera-impact-shake.ts policy replay from pre-run watcher installation',
              policyHistory: policyFrame.history,
              decision: {
                eventIndexInFrame: policyActivation.eventIndex,
                eventTick: policyActivation.eventTick,
                historyCountBefore: policyActivation.historyCountBefore,
                percentile75Before: policyActivation.percentileBefore,
                thresholdQualified: policyActivation.qualifies,
                rateLimit: policyActivation.rateLimit,
                started: policyActivation.started,
                amplitudeWorldUnits: policyActivation.amplitudeWorldUnits,
              },
              frameAtFocus: policyFrame.frame,
              observedBeforeSelection: {
                criticalEnemyHits: proof.observedCriticalEnemyHits,
                playerHits: proof.observedPlayerHits,
              },
              currentTickCriticalEnemyHits: currentCriticalEnemyHits.length,
              currentTickPlayerHits: currentPlayerHits.length,
            }
            : null,
        };
        proof.status = 'capturing-normal-raf';
        showTimingMarker(tick);
        // The watcher is already running after the app's rAF callback, so this
        // first record describes the same real renderer frame that consumed
        // the event. No pixels are read until compositor video extraction.
        recordFrameMetadata();
        return;
      }
      proof.observedCriticalEnemyHits += unseenEvents.filter((event) => event.kind === 'enemyHit' && event.critical).length;
      proof.observedPlayerHits += unseenEvents.filter((event) => event.kind === 'playerHit').length;
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }, { focusKind: kind, captureFrames: LIVE_CAPTURE_FRAMES });
}

async function waitForLiveEvidence(page, maxSeconds) {
  const timeout = Math.ceil((maxSeconds * 1.7 + 15) * 1_000);
  try {
    await page.waitForFunction(() => window.__p5LiveEvidence?.status === 'complete', undefined, { timeout });
  } catch {
    const state = await page.evaluate(() => ({
      tick: window.__webToy?.driver.tick ?? -1,
      status: window.__p5LiveEvidence?.status ?? 'missing',
      error: window.__p5LiveEvidence?.error ?? null,
      samples: window.__p5LiveEvidence?.samples?.length ?? 0,
      policy: window.__p5LiveEvidence?.lastPolicyFrame ?? null,
    }));
    fail(`no complete normal-rAF capture before the ${maxSeconds}s budget: ${JSON.stringify(state)}`);
  }
  return page.evaluate(() => window.__p5LiveEvidence);
}

/** Advance exactly one normal app tick, then pause after that frame rendered. */
async function advanceOneTick(page, targetTick) {
  await page.evaluate((expectedTick) => {
    const handle = window.__webToy;
    if (handle === undefined) throw new Error('web toy handle is unavailable');
    const proof = window.__p5ImpactEvidence;
    proof.step = { targetTick: expectedTick, complete: false, actualTick: null };
    // `installFocusWatcher` recorded the app's last driver timestamp while
    // paused. The next unpaused rAF receives exactly one 60 Hz interval, so a
    // screenshot workload cannot accidentally consume two simulation ticks.
    proof.forceOneTick = true;
    handle.controls.paused = false;
    const stopAfterRenderedTick = () => {
      const current = window.__webToy;
      if (current === undefined) {
        requestAnimationFrame(stopAfterRenderedTick);
        return;
      }
      if (current.driver.tick >= expectedTick) {
        current.controls.paused = true;
        proof.step.actualTick = current.driver.tick;
        proof.step.complete = true;
        if (current.driver.tick !== expectedTick) proof.skippedTick = current.driver.tick;
        return;
      }
      requestAnimationFrame(stopAfterRenderedTick);
    };
    requestAnimationFrame(stopAfterRenderedTick);
  }, targetTick);
  await page.waitForFunction((expectedTick) => {
    const step = window.__p5ImpactEvidence?.step;
    return step?.targetTick === expectedTick && step.complete === true;
  }, targetTick, { timeout: 4_000 });
  const result = await page.evaluate(() => window.__p5ImpactEvidence.step);
  if (result.actualTick !== targetTick) {
    fail(`the browser advanced from a paused proof state to tick ${result.actualTick}, expected ${targetTick}; retry the capture`);
  }
}

async function canvasBox(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  if (box === null) fail('game canvas is not visible');
  return box;
}

function cropRectForCanvas(box) {
  const width = Math.min(CROP_WIDTH, Math.floor(box.width));
  const height = Math.min(CROP_HEIGHT, Math.floor(box.height));
  return {
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + (box.height - height) / 2),
    width,
    height,
  };
}

/**
 * Project a simulation-space contact into the renderer's orthographic canvas.
 * This is the same fixed camera geometry used by the renderer and the damage
 * number overlay. It exists solely so a review crop centers the actually hit
 * enemy instead of an arbitrary part of the full frame.
 */
function projectEventToCanvas(event, playerX, playerY, canvasWidth, canvasHeight) {
  const aspect = Math.max(0.1, canvasWidth / Math.max(1, canvasHeight));
  const groundVerticalScale = CAMERA_HEIGHT / Math.hypot(CAMERA_HEIGHT, CAMERA_FOLLOW_BACK_OFFSET);
  return {
    x: canvasWidth * 0.5
      + (event.x - playerX) / (CAMERA_ORTHO_HALF_HEIGHT * aspect) * canvasWidth * 0.5,
    y: canvasHeight * 0.5
      - (event.y - playerY) * groundVerticalScale / CAMERA_ORTHO_HALF_HEIGHT * canvasHeight * 0.5,
  };
}

function clampedCropRect(canvasWidth, canvasHeight, center, requestedWidth, requestedHeight) {
  const width = Math.min(requestedWidth, canvasWidth);
  const height = Math.min(requestedHeight, canvasHeight);
  return {
    x: Math.max(0, Math.min(canvasWidth - width, Math.round(center.x - width / 2))),
    y: Math.max(0, Math.min(canvasHeight - height, Math.round(center.y - height / 2))),
    width,
    height,
  };
}

function targetCropRect(sample, focus) {
  const visualEvent = focus.visualEvent ?? focus.event;
  const center = projectEventToCanvas(
    visualEvent,
    sample.playerX,
    sample.playerY,
    sample.canvasWidth,
    sample.canvasHeight,
  );
  return {
    rect: clampedCropRect(
      sample.canvasWidth,
      sample.canvasHeight,
      center,
      TARGET_CROP_WIDTH,
      TARGET_CROP_HEIGHT,
    ),
    marker: center,
  };
}

function drawDiagnosticLabel(context, width, height, label, subtitle, placement = 'top', marker = null) {
  context.save();
  const labelHeight = 74;
  const labelY = placement === 'bottom' ? height - labelHeight : 0;
  context.fillStyle = 'rgba(5, 10, 18, 0.78)';
  context.fillRect(0, labelY, width, labelHeight);
  context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  context.lineWidth = 2;
  const crosshairX = marker?.x ?? width / 2;
  const crosshairY = marker?.y ?? height / 2;
  context.beginPath();
  context.moveTo(crosshairX - 18, crosshairY);
  context.lineTo(crosshairX + 18, crosshairY);
  context.moveTo(crosshairX, crosshairY - 18);
  context.lineTo(crosshairX, crosshairY + 18);
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = 'bold 30px sans-serif';
  context.fillText(label, 20, labelY + 34);
  context.fillStyle = '#cbd5e1';
  context.font = '22px sans-serif';
  context.fillText(subtitle, 20, labelY + 62);
  context.restore();
}

async function writeTwoXCrop({ rawPath, cropPath, rect, label, subtitle, placement, marker }) {
  const image = await loadImage(rawPath);
  const canvas = createCanvas(rect.width * CROP_SCALE, rect.height * CROP_SCALE);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width * CROP_SCALE,
    rect.height * CROP_SCALE,
  );
  const scaledMarker = marker === undefined || marker === null
    ? null
    : {
      x: (marker.x - rect.x) * CROP_SCALE,
      y: (marker.y - rect.y) * CROP_SCALE,
    };
  drawDiagnosticLabel(context, canvas.width, canvas.height, label, subtitle, placement, scaledMarker);
  writeFileSync(cropPath, canvas.toBuffer('image/png'));
}

async function writeContactSheet({ samples, outputPath, title }) {
  const thumbnailWidth = 480;
  const thumbnailHeight = 270;
  const columns = 3;
  const rows = Math.ceil(samples.length / columns);
  const canvas = createCanvas(columns * thumbnailWidth, 68 + rows * thumbnailHeight);
  const context = canvas.getContext('2d');
  context.fillStyle = '#07111d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f8fafc';
  context.font = 'bold 30px sans-serif';
  context.fillText(title, 18, 42);
  for (let index = 0; index < samples.length; index++) {
    const image = await loadImage(samples[index].cropPath);
    const x = (index % columns) * thumbnailWidth;
    const y = 68 + Math.floor(index / columns) * thumbnailHeight;
    context.drawImage(image, x, y, thumbnailWidth, thumbnailHeight);
  }
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
    });
  });
}

async function trimObservedVideo({ ffmpeg, rawPath, outputPath, startSeconds, durationSeconds }) {
  const base = [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', rawPath,
    '-ss', startSeconds.toFixed(3), '-t', durationSeconds.toFixed(3), '-an',
  ];
  try {
    await runFfmpeg(ffmpeg, [...base, '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', outputPath]);
    return { path: outputPath, encoding: 'libvpx-vp9' };
  } catch {
    // The compact browser-bundled ffmpeg can remux its own WebM input even
    // when it omits a codec. Preserve real recorded frames rather than
    // fabricating an animation from diagnostic PNGs.
    await runFfmpeg(ffmpeg, [...base, '-c', 'copy', outputPath]);
    return { path: outputPath, encoding: 'stream-copy' };
  }
}

function relativeArtifact(outputDir, path) {
  return relative(outputDir, path).split('\\').join('/');
}

async function captureTickSequence({ page, focus, outputDir, slug, sampleTicks, rect }) {
  const samples = [];
  for (let age = 0; age <= sampleTicks; age++) {
    const expectedTick = focus.renderTick + age;
    if (age > 0) await advanceOneTick(page, expectedTick);
    const state = await page.evaluate(() => ({
      tick: window.__webToy?.driver.tick ?? -1,
      paused: window.__webToy?.controls.paused ?? false,
      playerX: window.__webToy?.driver.curr.playerX ?? Number.NaN,
      playerY: window.__webToy?.driver.curr.playerY ?? Number.NaN,
      canvas: (() => {
        const canvas = document.getElementById('game-canvas');
        if (!(canvas instanceof HTMLCanvasElement)) return null;
        const box = canvas.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      })(),
    }));
    if (state.tick !== expectedTick || state.paused !== true || state.canvas === null) {
      fail(`expected frozen tick ${expectedTick}; received ${JSON.stringify(state)}`);
    }
    const rawPath = join(outputDir, `frame-${String(age).padStart(2, '0')}-raw.png`);
    const cropPath = join(outputDir, `frame-${String(age).padStart(2, '0')}.png`);
    await page.screenshot({ path: rawPath });
    const label = `${slug.toUpperCase()} · tick ${state.tick} · +${age}`;
    const subtitle = slug === 'flash'
      ? (age < FLASH_SAMPLE_TICKS ? `enemy flash age ${age} of ${FLASH_SAMPLE_TICKS}` : 'enemy flash released')
      : (age < SHAKE_SAMPLE_TICKS ? `camera-shake age ${age} of ${SHAKE_SAMPLE_TICKS}` : 'camera shake released');
    const targetRelative = slug === 'flash';
    const target = targetRelative
      ? targetCropRect({
        playerX: state.playerX,
        playerY: state.playerY,
        canvasWidth: state.canvas.width,
        canvasHeight: state.canvas.height,
      }, focus)
      : null;
    const targetCanvasProjection = projectEventToCanvas(
      focus.visualEvent ?? focus.event,
      state.playerX,
      state.playerY,
      state.canvas.width,
      state.canvas.height,
    );
    const targetScreenProjection = {
      x: state.canvas.x + targetCanvasProjection.x,
      y: state.canvas.y + targetCanvasProjection.y,
    };
    const evidenceRect = target === null
      ? rect
      : {
        x: Math.round(state.canvas.x + target.rect.x),
        y: Math.round(state.canvas.y + target.rect.y),
        width: target.rect.width,
        height: target.rect.height,
      };
    // Keep acceptance strips clean: the raw full-frame evidence and JSON keep
    // the target projection, but no diagnostic crosshair is drawn over the
    // silhouette that the judges must evaluate.
    const evidenceMarker = null;
    await writeTwoXCrop({
      rawPath,
      cropPath,
      rect: evidenceRect,
      label,
      subtitle: targetRelative
        ? `${subtitle} · target-relative crop from the real hit position`
        : `${subtitle} · fixed-screen scene patch`,
      marker: evidenceMarker,
    });
    samples.push({
      ageTicks: age,
      renderTick: state.tick,
      raw: relativeArtifact(outputDir, rawPath),
      crop2x: relativeArtifact(outputDir, cropPath),
      cropKind: targetRelative ? 'target-relative' : 'fixed-screen',
      cropRect: evidenceRect,
      targetProjection: targetScreenProjection,
      playerX: state.playerX,
      playerY: state.playerY,
      canvasWidth: state.canvas.width,
      canvasHeight: state.canvas.height,
      deltaTicksFromEvent: age,
      rawPath,
      cropPath,
    });
  }
  const sheetPath = join(outputDir, `${slug}-tick-strip-2x.png`);
  await writeContactSheet({
    samples,
    outputPath: sheetPath,
    title: slug === 'flash'
      ? 'P5 enemy hit flash — exact target-relative fixed-tick samples'
      : 'P5 camera shake — exact fixed-screen fixed-tick samples',
  });
  const cameraDisplacement = slug === 'shake'
    ? await writeShakeRegistrationComparison({
      outputDir,
      evidence: { samples },
      captureLabel: 'exact fixed-tick frame',
      outputFile: 'shake-exact-camera-displacement-2x.png',
    })
    : null;
  return {
    samples: samples.map((sample) => {
      const publicSample = { ...sample };
      delete publicSample.cropPath;
      delete publicSample.rawPath;
      return publicSample;
    }),
    tickStrip2x: relativeArtifact(outputDir, sheetPath),
    cameraDisplacement,
  };
}

async function compositorMarkerScore(path) {
  const image = await loadImage(path);
  const width = Math.min(204, image.width);
  const height = Math.min(56, image.height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(image, image.width - width, image.height - height, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    // Deliberately vivid capture-only marker survives VP8 compression without
    // being confusable with the game's reserved palette lanes.
    if (pixels[index] > 200 && pixels[index + 1] < 80 && pixels[index + 2] > 200) count++;
  }
  return count;
}

function targetCropRectForVideo(focus, videoWidth, videoHeight) {
  // The raw compositor PTS is deliberately not converted into a driver tick:
  // recordVideo has its own cadence. Anchor every short panel crop to the real
  // event's screen projection captured in the post-render event rAF instead.
  const eventScreen = focus.targetScreenAtTrigger;
  const visualEvent = focus.visualEvent ?? focus.event;
  const projected = eventScreen === null || eventScreen === undefined
    ? projectEventToCanvas(visualEvent, focus.playerX, focus.playerY, videoWidth, videoHeight)
    : eventScreen;
  const marker = {
    x: projected.x,
    y: projected.y,
  };
  return {
    rect: clampedCropRect(videoWidth, videoHeight, marker, TARGET_CROP_WIDTH, TARGET_CROP_HEIGHT),
    marker,
  };
}

function fixedScreenCropRectForVideo(videoWidth, videoHeight) {
  return {
    rect: clampedCropRect(
      videoWidth,
      videoHeight,
      { x: videoWidth * 0.5, y: videoHeight * 0.5 },
      CROP_WIDTH,
      CROP_HEIGHT,
    ),
    marker: null,
  };
}

function liveSampleLabel(kind, markerPhase) {
  return `${kind.toUpperCase()} · ${markerPhase}`;
}

async function writeLiveVideoEvidence({ rawVideoPath, proof, outputDir, kind, startMs, durationMs }) {
  if (!Array.isArray(proof.samples) || proof.samples.length === 0) {
    fail(`${kind} live capture contained no normal-rAF metadata`);
  }
  const framesDir = join(outputDir, 'recorded-video-frames');
  mkdirSync(framesDir, { recursive: true });
  await runFfmpeg(findFfmpeg(), [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', rawVideoPath,
    '-ss', (startMs / 1_000).toFixed(3), '-t', (durationMs / 1_000).toFixed(3), '-an',
    '-c:v', 'png', join(framesDir, 'frame-%03d.png'),
  ]);
  const frameFiles = readdirSync(framesDir)
    .filter((file) => /^frame-\d+\.png$/u.test(file))
    .sort();
  if (frameFiles.length === 0) fail(`${kind} compositor video did not yield PNG frames`);
  const markerScores = [];
  for (const file of frameFiles) {
    markerScores.push(await compositorMarkerScore(join(framesDir, file)));
  }
  const firstMarkerIndex = markerScores.findIndex((score) => score >= 240);
  if (firstMarkerIndex < 0) {
    fail(`${kind} compositor video did not contain the capture-only timing marker`);
  }
  const markerRelativeRafMetadata = (sourceIndex) => {
    // The timing marker itself is the synchronisation point. Associate a
    // compositor frame with the nearest page-side rAF journal entry only for
    // player/follow metadata; this deliberately remains an estimate, never a
    // claim that video PTS equals a simulation tick.
    const estimatedPagePerformanceMs = proof.focus.capturedAtMs
      + (sourceIndex - firstMarkerIndex) * durationMs / Math.max(1, frameFiles.length);
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < proof.samples.length; index++) {
      const sample = proof.samples[index];
      const distance = Math.abs(sample.capturedAtMs - estimatedPagePerformanceMs);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    const sample = proof.samples[nearestIndex];
    const requiredFields = ['tick', 'playerX', 'playerY', 'canvasWidth', 'canvasHeight'];
    for (const field of requiredFields) {
      if (!Number.isFinite(sample?.[field])) {
        fail(`${kind} live capture is missing ${field} in normal-rAF metadata sample ${nearestIndex}`);
      }
    }
    return {
      sample,
      sampleIndex: nearestIndex,
      estimatedPagePerformanceMs,
      association: 'nearest marker-relative normal-rAF journal entry; compositor video PTS is not treated as a driver tick',
    };
  };
  // Flash needs contact plus two release samples; shake gets six normal-speed
  // compositor frames so a single fixed-screen strip includes player, target,
  // and terrain through its recovery. Neither case converts video PTS into
  // simulation ticks—the exact frozen-tick journal carries that authority.
  const panelFrameCount = kind === 'shake' ? 6 : 3;
  const selectedFrameIndices = Array.from({ length: panelFrameCount }, (_, offset) => firstMarkerIndex + offset)
    .filter((index) => index >= 0 && index < frameFiles.length);
  const firstFrame = await loadImage(join(framesDir, frameFiles[0]));
  const metadataPath = join(outputDir, 'normal-raf-metadata.json');
  writeFileSync(metadataPath, `${JSON.stringify({
    focus: proof.focus,
    samples: proof.samples,
    capture: 'metadata-only normal-rAF watcher; pixels extracted after close from Playwright compositor video',
    compositorMapping: 'The marker is shown in the post-render rAF that observed the real current-tick event. The first marker-bearing compositor frame is therefore at-or-after that event observer, but video PTS is never treated as a simulation tick. Subsequent panel frames are the next recorded compositor frames; exact fixed-tick life is retained in the separate lifecycle proof.',
  }, null, 2)}\n`);
  const samples = [];
  for (let selectedIndex = 0; selectedIndex < selectedFrameIndices.length; selectedIndex++) {
    const sourceIndex = selectedFrameIndices[selectedIndex];
    const normalRaf = markerRelativeRafMetadata(sourceIndex);
    const rawPath = join(framesDir, frameFiles[sourceIndex]);
    const eventTarget = targetCropRectForVideo(proof.focus, firstFrame.width, firstFrame.height);
    const crop = kind === 'shake'
      ? fixedScreenCropRectForVideo(firstFrame.width, firstFrame.height)
      : eventTarget;
    const cropKind = kind === 'shake' ? 'fixed-screen' : 'target-relative';
    const cropPath = join(outputDir, `frame-${String(selectedIndex).padStart(2, '0')}-${cropKind}-2x.png`);
    const markerPhase = sourceIndex === firstMarkerIndex
      ? `event anchor: first marker-bearing compositor frame after T${proof.focus.renderTick}`
      : `release: compositor frame +${sourceIndex - firstMarkerIndex} after event anchor`;
    await writeTwoXCrop({
      rawPath,
      cropPath,
      rect: crop.rect,
      // The marker remains only in the retained full raw compositor frame,
      // outside this target crop. Do not let a diagnostic crosshair masquerade
      // as the enemy flash in the judgeable strip.
      marker: null,
      placement: 'bottom',
      label: liveSampleLabel(kind, markerPhase),
      subtitle: `Playwright compositor video · ${cropKind} panel · exact driver-tick lifecycle is recorded separately`,
    });
    samples.push({
      index: selectedIndex,
      sourceVideoFrameIndex: sourceIndex,
      markerPhase,
      eventTickAnchor: proof.focus.renderTick,
      renderTick: normalRaf.sample.tick,
      deltaTicksFromEvent: normalRaf.sample.tick - proof.focus.renderTick,
      capturedAtMs: normalRaf.sample.capturedAtMs,
      estimatedPagePerformanceMs: normalRaf.estimatedPagePerformanceMs,
      normalRafSampleIndex: normalRaf.sampleIndex,
      compositorTickMapping: normalRaf.association,
      playerX: normalRaf.sample.playerX,
      playerY: normalRaf.sample.playerY,
      canvasWidth: normalRaf.sample.canvasWidth,
      canvasHeight: normalRaf.sample.canvasHeight,
      rawVideoFrame: relativeArtifact(outputDir, rawPath),
      panelCrop2x: relativeArtifact(outputDir, cropPath),
      cropKind,
      targetProjection: eventTarget.marker,
      panelCrop: crop.rect,
      rawPath,
      cropPath,
    });
  }
  const sheetPath = join(outputDir, `${kind}-normal-raf-${kind === 'shake' ? 'fixed-screen' : 'target-relative'}-strip-2x.png`);
  await writeContactSheet({
    samples,
    outputPath: sheetPath,
    title: kind === 'flash'
      ? 'P5 enemy flash — compositor-video target-relative samples'
      : 'P5 camera shake — normal-speed fixed-screen samples',
  });
  return {
    samples,
    tickDeltas: samples.map((sample) => sample.deltaTicksFromEvent),
    panelStrip2x: relativeArtifact(outputDir, sheetPath),
    normalRafMetadata: relativeArtifact(outputDir, metadataPath),
    videoWindow: {
      requestedPagePerformanceWindowMs: { startMs, durationMs },
      extractedFrameCount: frameFiles.length,
      firstMarkerFrameIndex: firstMarkerIndex,
      markerScores,
      markerMapping: `Marker became visible in the post-render rAF that observed real event tick ${proof.focus.renderTick}. Frame ${firstMarkerIndex + 1} is the first recorded compositor frame containing it and is at-or-after the event observer; it is not represented as an exact video-PTS-to-driver-tick conversion.`,
    },
  };
}

function luma(data, index) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

async function readImageData(path) {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return { image, data: context.getImageData(0, 0, image.width, image.height).data };
}

/** Pick a textured, non-combat screen patch so camera motion is measurable. */
function pickRegistrationRect(imageData, width, height, exclusions) {
  const patchWidth = Math.min(260, Math.max(160, Math.floor(width * 0.24)));
  const patchHeight = Math.min(190, Math.max(120, Math.floor(height * 0.24)));
  // Playwright records the whole viewport, including HUD DOM layered over the
  // canvas. Exclude that top band: a static vitality panel would falsely say
  // there is zero camera displacement.
  const minimumY = Math.min(height - patchHeight, 220);
  let best = {
    x: Math.max(0, Math.floor((width - patchWidth) / 2)),
    y: minimumY,
    width: patchWidth,
    height: patchHeight,
    score: -1,
  };
  const stepX = Math.max(32, Math.floor(patchWidth / 2));
  const stepY = Math.max(28, Math.floor(patchHeight / 2));
  for (let y = minimumY; y <= height - patchHeight; y += stepY) {
    for (let x = 0; x <= width - patchWidth; x += stepX) {
      const centerX = x + patchWidth / 2;
      const centerY = y + patchHeight / 2;
      if (exclusions.some((point) => Math.hypot(centerX - point.x, centerY - point.y) < Math.max(patchWidth, patchHeight) * 0.78)) continue;
      let score = 0;
      for (let row = y + 2; row < y + patchHeight - 2; row += 5) {
        for (let column = x + 2; column < x + patchWidth - 2; column += 5) {
          const index = (row * width + column) * 4;
          const horizontal = (row * width + column + 1) * 4;
          const vertical = ((row + 1) * width + column) * 4;
          score += Math.abs(luma(imageData, index) - luma(imageData, horizontal))
            + Math.abs(luma(imageData, index) - luma(imageData, vertical));
        }
      }
      if (score > best.score) best = { x, y, width: patchWidth, height: patchHeight, score };
    }
  }
  return best;
}

function estimateTranslation(reference, candidate, width, rect) {
  let best = { x: 0, y: 0, error: Number.POSITIVE_INFINITY };
  const margin = 10;
  for (let shiftY = -8; shiftY <= 8; shiftY++) {
    for (let shiftX = -8; shiftX <= 8; shiftX++) {
      let error = 0;
      let count = 0;
      for (let y = rect.y + margin; y < rect.y + rect.height - margin; y += 4) {
        for (let x = rect.x + margin; x < rect.x + rect.width - margin; x += 4) {
          const referenceIndex = (y * width + x) * 4;
          const candidateIndex = ((y + shiftY) * width + x + shiftX) * 4;
          error += Math.abs(luma(reference, referenceIndex) - luma(candidate, candidateIndex));
          count++;
        }
      }
      const meanError = error / Math.max(1, count);
      if (meanError < best.error) best = { x: shiftX, y: shiftY, error: meanError };
    }
  }
  return best;
}

function assertRegistrationMetadata(sample) {
  const required = ['renderTick', 'playerX', 'playerY', 'canvasWidth', 'canvasHeight'];
  for (const field of required) {
    if (!Number.isFinite(sample?.[field])) {
      fail(`shake registration cannot use a frame without ${field} metadata`);
    }
  }
}

function expectedFollowSceneShift(reference, candidate) {
  const aspect = reference.canvasWidth / Math.max(1, reference.canvasHeight);
  const groundVerticalScale = CAMERA_HEIGHT / Math.hypot(CAMERA_HEIGHT, CAMERA_FOLLOW_BACK_OFFSET);
  return {
    x: -(candidate.playerX - reference.playerX) / (CAMERA_ORTHO_HALF_HEIGHT * aspect) * reference.canvasWidth * 0.5,
    y: (candidate.playerY - reference.playerY) * groundVerticalScale / CAMERA_ORTHO_HALF_HEIGHT * reference.canvasHeight * 0.5,
  };
}

function drawRegistrationGrid(context, x, y, width, height, scale) {
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  context.lineWidth = 1.5;
  const halfX = x + width * scale / 2;
  const halfY = y + height * scale / 2;
  context.beginPath();
  context.moveTo(halfX - 20, halfY);
  context.lineTo(halfX + 20, halfY);
  context.moveTo(halfX, halfY - 20);
  context.lineTo(halfX, halfY + 20);
  context.stroke();
  context.restore();
}

async function writeShakeRegistrationComparison({
  outputDir,
  evidence,
  captureLabel = 'normal-rAF frame',
  outputFile = 'shake-camera-displacement-2x.png',
}) {
  const reference = evidence.samples[0];
  assertRegistrationMetadata(reference);
  const referenceImage = await readImageData(reference.rawPath);
  const referencePlayer = projectEventToCanvas(
    { x: reference.playerX, y: reference.playerY },
    reference.playerX,
    reference.playerY,
    referenceImage.image.width,
    referenceImage.image.height,
  );
  const targetPoint = reference.targetProjection ?? referencePlayer;
  const registrationRect = pickRegistrationRect(
    referenceImage.data,
    referenceImage.image.width,
    referenceImage.image.height,
    [referencePlayer, targetPoint],
  );
  const translations = [];
  for (const sample of evidence.samples) {
    assertRegistrationMetadata(sample);
    const image = await readImageData(sample.rawPath);
    const observed = estimateTranslation(referenceImage.data, image.data, referenceImage.image.width, registrationRect);
    const follow = expectedFollowSceneShift(reference, sample);
    const residual = { x: observed.x - follow.x, y: observed.y - follow.y };
    translations.push({
      index: sample.index,
      renderTick: sample.renderTick,
      deltaTicksFromEvent: sample.deltaTicksFromEvent,
      observedSceneShiftPixels: observed,
      expectedFollowShiftPixels: follow,
      residualPixels: residual,
      residualMagnitudePixels: Math.hypot(residual.x, residual.y),
      image,
    });
  }
  const compare = translations.slice(1).reduce((best, candidate) => (
    candidate.residualMagnitudePixels > best.residualMagnitudePixels ? candidate : best
  ), translations[0]);
  const scale = 2;
  const header = 104;
  const panelWidth = registrationRect.width * scale;
  const panelHeight = registrationRect.height * scale;
  const canvas = createCanvas(panelWidth * 3, header + panelHeight);
  const context = canvas.getContext('2d');
  context.fillStyle = '#07111d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const referenceCrop = await loadImage(reference.rawPath);
  const compareCrop = await loadImage(evidence.samples[compare.index].rawPath);
  const drawCrop = (image, column) => {
    context.drawImage(
      image,
      registrationRect.x,
      registrationRect.y,
      registrationRect.width,
      registrationRect.height,
      column * panelWidth,
      header,
      panelWidth,
      panelHeight,
    );
    drawRegistrationGrid(context, column * panelWidth, header, registrationRect.width, registrationRect.height, scale);
  };
  drawCrop(referenceCrop, 0);
  drawCrop(compareCrop, 1);
  const anaglyph = context.createImageData(registrationRect.width, registrationRect.height);
  for (let y = 0; y < registrationRect.height; y++) {
    for (let x = 0; x < registrationRect.width; x++) {
      const sourceIndex = ((registrationRect.y + y) * referenceImage.image.width + registrationRect.x + x) * 4;
      const outputIndex = (y * registrationRect.width + x) * 4;
      anaglyph.data[outputIndex] = referenceImage.data[sourceIndex];
      anaglyph.data[outputIndex + 1] = compare.image.data[sourceIndex + 1];
      anaglyph.data[outputIndex + 2] = compare.image.data[sourceIndex + 2];
      anaglyph.data[outputIndex + 3] = 255;
    }
  }
  const anaglyphCanvas = createCanvas(registrationRect.width, registrationRect.height);
  anaglyphCanvas.getContext('2d').putImageData(anaglyph, 0, 0);
  context.drawImage(anaglyphCanvas, panelWidth * 2, header, panelWidth, panelHeight);
  drawRegistrationGrid(context, panelWidth * 2, header, registrationRect.width, registrationRect.height, scale);
  context.fillStyle = '#f8fafc';
  context.font = 'bold 24px sans-serif';
  context.fillText(`P5 camera displacement — fixed screen patch · rAF tick ${reference.renderTick} vs ${compare.renderTick}`, 18, 32);
  context.fillStyle = '#cbd5e1';
  context.font = '16px sans-serif';
  context.fillText(
    `Observed scene shift: (${compare.observedSceneShiftPixels.x.toFixed(1)}, ${compare.observedSceneShiftPixels.y.toFixed(1)}) px  ·  normal follow: (${compare.expectedFollowShiftPixels.x.toFixed(1)}, ${compare.expectedFollowShiftPixels.y.toFixed(1)}) px  ·  residual: (${compare.residualPixels.x.toFixed(1)}, ${compare.residualPixels.y.toFixed(1)}) px`,
    18,
    58,
  );
  context.fillText('focus frame', 18, 86);
  context.fillText(`later ${captureLabel}`, panelWidth + 18, 86);
  context.fillText('red = focus, cyan = later; colored edge = screen displacement', panelWidth * 2 + 18, 86);
  const comparisonPath = join(outputDir, outputFile);
  writeFileSync(comparisonPath, canvas.toBuffer('image/png'));
  return {
    registrationRect: {
      x: registrationRect.x,
      y: registrationRect.y,
      width: registrationRect.width,
      height: registrationRect.height,
    },
    compareSampleIndex: compare.index,
    comparison2x: relativeArtifact(outputDir, comparisonPath),
    translations: translations.map((translation) => {
      const publicTranslation = { ...translation };
      delete publicTranslation.image;
      return publicTranslation;
    }),
  };
}

async function runFocusCapture({ browser, args, baseUrl, outputDir, kind }) {
  const evidenceDir = join(outputDir, kind);
  const rawVideoDir = join(evidenceDir, 'raw-video');
  mkdirSync(rawVideoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    recordVideo: { dir: rawVideoDir, size: VIEWPORT },
  });
  const page = await context.newPage();
  const video = page.video();
  const messages = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') messages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  let chooser;
  let result;
  try {
    const route = runningUrl(baseUrl, args);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await ensureWebToyHandle(page);
    await installFocusWatcher(page, kind);
    const boot = await ensureRunStarted(page);
    chooser = startUpgradeChooser(page);
    const focus = await waitForFocus(page, args.maxSeconds);
    const rect = cropRectForCanvas(await canvasBox(page));
    const sequence = await captureTickSequence({
      page,
      focus,
      outputDir: evidenceDir,
      slug: kind,
      sampleTicks: kind === 'flash' ? FLASH_SAMPLE_TICKS : SHAKE_SAMPLE_TICKS,
      rect,
    });
    const cameraPolicy = kind === 'shake'
      && focus.shakePolicyActivation?.decision?.started === true
      ? criticalShakePolicyPath(focus.event, focus.shakePolicyActivation)
      : null;
    const completedAtMs = await page.evaluate(() => performance.now());
    result = {
      route,
      boot,
      focus,
      completedAtMs,
      crop: { sourceViewport: VIEWPORT, sourceRect: rect, scale: CROP_SCALE },
      evidence: {
        ...sequence,
        samples: sequence.samples.map((sample) => ({
          ...sample,
          raw: `${kind}/${sample.raw}`,
          crop2x: `${kind}/${sample.crop2x}`,
        })),
        tickStrip2x: `${kind}/${sequence.tickStrip2x}`,
        cameraDisplacement: sequence.cameraDisplacement === null
          ? null
          : {
            ...sequence.cameraDisplacement,
            comparison2x: `${kind}/${sequence.cameraDisplacement.comparison2x}`,
          },
        cameraPolicy,
      },
      browserMessages: messages,
      upgradeChoiceClicks: chooser === undefined ? 0 : await chooser.stop(),
    };
  } finally {
    if (chooser !== undefined) await chooser.stop();
    await context.close();
  }
  if (result === undefined) fail(`${kind} capture did not produce evidence`);
  const rawVideoPath = video === null ? null : await video?.path();
  if (rawVideoPath === null || rawVideoPath === undefined || !existsSync(rawVideoPath)) {
    fail(`Playwright did not retain an observed ${kind} video`);
  }
  const focusSeconds = Math.max(0, result.focus.capturedAtMs / 1_000 - 0.25);
  const durationSeconds = Math.max(1, (result.completedAtMs - result.focus.capturedAtMs) / 1_000 + 0.75);
  const observedPath = join(evidenceDir, `${kind}-observed.webm`);
  const observed = await trimObservedVideo({
    ffmpeg: findFfmpeg(),
    rawPath: rawVideoPath,
    outputPath: observedPath,
    startSeconds: focusSeconds,
    durationSeconds,
  });
  result.evidence.observedVideo = `${kind}/${relativeArtifact(evidenceDir, observed.path)}`;
  result.evidence.observedVideoEncoding = observed.encoding;
  result.evidence.rawVideo = `${kind}/${relativeArtifact(evidenceDir, rawVideoPath)}`;
  return result;
}

async function runLiveFocusCapture({ browser, args, baseUrl, outputDir, kind }) {
  const evidenceDir = join(outputDir, `live-${kind}`);
  const rawVideoDir = join(evidenceDir, 'raw-video');
  mkdirSync(rawVideoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    recordVideo: { dir: rawVideoDir, size: VIEWPORT },
  });
  const page = await context.newPage();
  const video = page.video();
  const messages = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') messages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  let chooser;
  let proof;
  let captureMetadata;
  try {
    const route = runningUrl(baseUrl, args);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await ensureWebToyHandle(page);
    await installLiveCaptureWatcher(page, kind);
    const boot = await ensureRunStarted(page);
    chooser = startUpgradeChooser(page);
    proof = await waitForLiveEvidence(page, args.maxSeconds);
    const completedAtMs = await page.evaluate(() => performance.now());
    captureMetadata = {
      route,
      boot,
      focus: proof.focus,
      completedAtMs,
      captureMode: 'normal-rAF metadata watcher plus post-close Playwright compositor-video extraction; no pause; no capture clock wrapper; no canvas readback',
      browserMessages: messages,
      upgradeChoiceClicks: chooser === undefined ? 0 : await chooser.stop(),
    };
  } finally {
    if (chooser !== undefined) await chooser.stop();
    await context.close();
  }
  if (proof === undefined || captureMetadata === undefined) fail(`${kind} live capture did not produce evidence`);
  const rawVideoPath = video === null ? null : await video?.path();
  if (rawVideoPath === null || rawVideoPath === undefined || !existsSync(rawVideoPath)) {
    fail(`Playwright did not retain an observed live ${kind} video`);
  }
  // The capture-only marker is added in the event's post-render rAF. Extract
  // a generous window so VP8 cadence cannot hide it, then select only the
  // marker-adjacent compositor frames for the actual panel strip.
  const startMs = Math.max(0, captureMetadata.focus.capturedAtMs - 140);
  const durationMs = 520;
  const artifacts = await writeLiveVideoEvidence({
    rawVideoPath,
    proof,
    outputDir: evidenceDir,
    kind,
    startMs,
    durationMs,
  });
  const cameraDisplacement = kind === 'shake'
    ? await writeShakeRegistrationComparison({ outputDir: evidenceDir, evidence: artifacts })
    : null;
  const cameraPolicy = kind === 'shake'
    && proof.focus.shakePolicyActivation?.decision?.started === true
    ? criticalShakePolicyPath(proof.focus.event, proof.focus.shakePolicyActivation)
    : null;
  const focusSeconds = startMs / 1_000;
  const durationSeconds = durationMs / 1_000;
  const observedPath = join(evidenceDir, `${kind}-normal-raf-observed.webm`);
  const observed = await trimObservedVideo({
    ffmpeg: findFfmpeg(),
    rawPath: rawVideoPath,
    outputPath: observedPath,
    startSeconds: focusSeconds,
    durationSeconds,
  });
  const rootDir = kind === 'flash' ? 'live-flash' : 'live-shake';
  const result = {
    ...captureMetadata,
    evidence: {
      samples: artifacts.samples.map((sample) => {
        const publicSample = { ...sample };
        delete publicSample.rawPath;
        delete publicSample.cropPath;
        return {
          ...publicSample,
          rawVideoFrame: `${rootDir}/${sample.rawVideoFrame}`,
          panelCrop2x: `${rootDir}/${sample.panelCrop2x}`,
        };
      }),
      tickDeltas: artifacts.tickDeltas,
      panelStrip2x: `${rootDir}/${artifacts.panelStrip2x}`,
      normalRafMetadata: `${rootDir}/${artifacts.normalRafMetadata}`,
      videoWindow: artifacts.videoWindow,
      cameraDisplacement: cameraDisplacement === null ? null : {
        ...cameraDisplacement,
        comparison2x: `${rootDir}/${cameraDisplacement.comparison2x}`,
      },
      cameraPolicy,
      observedVideo: `${rootDir}/${relativeArtifact(evidenceDir, observed.path)}`,
      observedVideoEncoding: observed.encoding,
      rawVideo: `${rootDir}/${relativeArtifact(evidenceDir, rawVideoPath)}`,
    },
  };
  return result;
}

function writeReadme(outputDir, report) {
  const flash = report.flash?.focus ?? null;
  const shake = report.shake?.focus ?? null;
  const shakeVisual = shake?.visualEvent ?? shake?.event ?? null;
  const shakeActivation = shake?.shakePolicyActivation ?? null;
  const live = report.live;
  const exactSection = flash === null || shake === null
    ? ''
    : `## Exact-tick lifecycle support\n\n` +
      `- Enemy flash: [clean 2× target-relative tick strip](${report.flash.evidence.tickStrip2x}) · [observed renderer video](${report.flash.evidence.observedVideo})\n` +
      `  - Real event: \`${flash.event.kind}\` at tick ${flash.renderTick}, source \`${flash.event.sourceId}\`, target ${flash.event.targetId}, target live at trigger: ${flash.targetLiveAtTrigger}.\n` +
      `  - Samples: tick ${flash.renderTick} through ${flash.renderTick + FLASH_SAMPLE_TICKS}; the final frame is the release tick.\n` +
      `- Camera shake: [clean 2× fixed-screen tick strip](${report.shake.evidence.tickStrip2x}) · [fixed-screen residual comparison](${report.shake.evidence.cameraDisplacement.comparison2x}) · [observed renderer video](${report.shake.evidence.observedVideo})\n` +
      `  - Real qualifying critical batch: ${shake.criticalBatch?.count ?? 1} hit(s) at tick ${shake.renderTick}; shake-starting critical \`${shake.event.sourceId}\`, visual anchor \`${shakeVisual?.sourceId ?? shake.event.sourceId}\`, amount ${shakeVisual?.amount ?? shake.event.amount}.\n` +
      `  - Policy history before activation: ${shakeActivation?.decision?.historyCountBefore ?? 'n/a'} tracked crit(s); 75th-percentile threshold ${shakeActivation?.decision?.percentile75Before ?? 'n/a'}; rate-limit elapsed ${shakeActivation?.decision?.rateLimit?.elapsedTicks ?? 'n/a'} of ${shakeActivation?.decision?.rateLimit?.requiredTicks ?? 'n/a'} ticks.\n` +
      `  - Samples: tick ${shake.renderTick} through ${shake.renderTick + SHAKE_SAMPLE_TICKS}; the final frame is the release tick.\n\n` +
      `The 2× strips show exact fixed-tick samples. The paired observed videos are real-time renderer recordings around the same event. The raw full-frame PNGs are retained beside the crops.\n\n`;
  const text = `# P5 impact-framing visual proof\n\n` +
    `This directory is a deterministic, panel-facing capture of the **real** renderer. ` +
    `It does not inject combat events, alter renderer state, or mutate simulation state. ` +
    `Any exact-tick lifecycle support pauses only after the app's own rAF has rendered a matching event.\n\n` +
    exactSection +
    `## Authority boundary\n\n` +
    `- Fixed seed: \`${report.seed}\`; hero: \`${report.hero}\`; normal autopilot plus real DOM upgrade clicks.\n` +
    `- Served route: \`${report.route}\`; server mode: \`${report.serverMode}\`; Git HEAD: \`${report.source.gitHead ?? 'unavailable'}\`. Exact P5 source-byte hashes are retained in \`report.json\`.\n` +
    `- Event predicate: actual current-tick combat events from \`window.__webToy.driver.combatPresentationEvents\`.\n` +
    `- P5 flash accepts only a non-critical \`enemyHit\` whose target remains in the current enemy snapshot.\n` +
    `- Exact P5 shake proof accepts a current-tick critical batch only when an evidence-only replay of \`camera-impact-shake.ts\`, installed before run start, records a real critical activation: it consumes the same copied event order, checks the bounded critical history and 75th-percentile rule, and verifies the shared 20-tick rate limit before the five-tick shake begins. Earlier off-screen crits remain in the recorded policy history; they no longer falsely veto a later visible activation. The first screen-visible member of the activated batch is the panel anchor. The no-pause companion uses the same activation requirement. \`report.json\` separates \`policyHistory\` from the selected \`decision\` and records the independently replayed world-offset path and ≤2-unit policy cap beside measured screen residuals.\n` +
    `- Routine non-critical enemy hits do not schedule camera shake; that policy has a dedicated renderer unit proof alongside the capture gate.\n` +
    `- Flash strips are clean target-relative crops; shake strips are clean fixed-screen scene patches. Target projections remain in JSON only—no crosshair is drawn over judgeable pixels.\n`;
  const liveSection = live === null
    ? ''
    : `\n## No-pause visual closure\n\n` +
      `- Flash: [target-relative normal-rAF strip](${live.flash.evidence.panelStrip2x}) · [observed renderer video](${live.flash.evidence.observedVideo})\n` +
      `  - Crops were extracted after close from Playwright's compositor video; the in-run watcher recorded metadata only. A capture-only magenta DOM timing marker identifies the real event video frame and is excluded from the crop. Nearest marker-relative normal-rAF tick deltas: ${live.flash.evidence.tickDeltas.join(', ')} (not a video-PTS-to-tick conversion).\n` +
      `- Shake: [normal-speed fixed-screen strip with player, target, and terrain](${live.shake.evidence.panelStrip2x}) · [fixed-screen displacement comparison](${live.shake.evidence.cameraDisplacement.comparison2x}) · [observed renderer video](${live.shake.evidence.observedVideo})\n` +
      `  - Crops were extracted after close from Playwright's compositor video; the in-run watcher recorded metadata only. A capture-only magenta DOM timing marker identifies the real event video frame and is excluded from the crop. Nearest marker-relative normal-rAF tick deltas: ${live.shake.evidence.tickDeltas.join(', ')} (not a video-PTS-to-tick conversion).\n` +
      `  - The displacement panel compares a textured fixed screen patch, reports raw pixel registration, and subtracts the normal player-follow contribution. It is a diagnostic measurement of rendered pixels; it does not inject events or write camera state.\n`;
  const manualAcceptance = `\n## Manual rejection rule\n\n` +
    `Reject this artifact and recapture if any flash sample lets a damage number, card, or unrelated VFX cover more than 25% of the struck enemy silhouette, if the white contact is not plainly lower at tick +1 and faint-but-shaped at tick +2, or if the shake strip does not visibly retain the centered player, struck enemy, and at least two stable terrain landmarks through recovery. Video frames are marker-anchored only; the exact-tick journal, not video PTS, is the authority for tick labels.\n`;
  writeFileSync(join(outputDir, 'README.md'), text + liveSection + manualAcceptance);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = join(capturesRoot, args.iteration);
  if (existsSync(outputDir)) fail(`capture output already exists: ${outputDir}; choose --iteration <new-name>`);
  mkdirSync(outputDir, { recursive: true });
  let server;
  let browserLaunch;
  try {
    server = await startViteServer({ port: args.port, usePreview: args.preview });
    browserLaunch = await launchBrowser(args.browserMode);
    const flash = args.liveOnly
      ? null
      : await runFocusCapture({
        browser: browserLaunch.browser,
        args,
        baseUrl: server.baseUrl,
        outputDir,
        kind: 'flash',
      });
    const shake = args.liveOnly
      ? null
      : await runFocusCapture({
        browser: browserLaunch.browser,
        args,
        baseUrl: server.baseUrl,
        outputDir,
        kind: 'shake',
      });
    const live = args.live
      ? {
        flash: await runLiveFocusCapture({
          browser: browserLaunch.browser,
          args,
          baseUrl: server.baseUrl,
          outputDir,
          kind: 'flash',
        }),
        shake: await runLiveFocusCapture({
          browser: browserLaunch.browser,
          args,
          baseUrl: server.baseUrl,
          outputDir,
          kind: 'shake',
        }),
      }
      : null;
    const report = {
      generatedAt: new Date().toISOString(),
      purpose: 'P5 enemy hit-flash and camera-shake visual proof from real renderer events',
      authority: {
        eventInjection: false,
        rendererMutation: false,
        simulationMutation: false,
        pausePolicy: args.liveOnly
          ? null
          : 'The existing app pause control is set only after the app rAF has rendered a matching event; normal fixed ticks resume one at a time for evidence.',
        captureClockPacing: args.liveOnly
          ? null
          : 'Only while moving between frozen proof samples, the page-local capture wrapper supplies the existing driver one exact 1/60s timestamp interval. It preserves the driver input, fixed simulation step, snapshots, and event arrays, and is discarded with the browser context.',
        liveVisualClosure: args.live
          ? 'The live visual pass records only timing metadata in normal requestAnimationFrame callbacks after a real matching event. A capture-only magenta DOM timing marker is outside the target crop and does not write renderer state. PNGs are extracted after close from the existing Playwright compositor video; the pass does not pause the app, replace the clock, inject events, or read WebGL pixels.'
          : null,
      },
      browser: { mode: browserLaunch.mode, fallbackReason: browserLaunch.fallbackReason },
      route: runningUrl(server.baseUrl, args),
      serverMode: server.mode,
      source: sourceFingerprint(),
      hero: args.hero,
      seed: args.seed,
      flash,
      shake,
      live,
    };
    writeFileSync(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeReadme(outputDir, report);
    console.log(`[p5-impact-evidence] wrote ${join(outputDir, 'report.json')}`);
  } catch (error) {
    const blocked = {
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
    writeFileSync(join(outputDir, 'BLOCKED.json'), `${JSON.stringify(blocked, null, 2)}\n`);
    throw error;
  } finally {
    if (browserLaunch !== undefined) await browserLaunch.browser.close().catch(() => undefined);
    if (server !== undefined) await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
