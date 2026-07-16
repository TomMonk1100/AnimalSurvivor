/* global document, fetch, getComputedStyle, HTMLCanvasElement, process, setTimeout, clearTimeout, window */
/**
 * A bounded, real-artifact browser smoke gate for the Agent Harness.
 *
 * This intentionally uses only the app's existing DOM controls, supported
 * query parameters, and the documented `window.__webToy` acceptance handle.
 * It never injects gameplay state or adds a test-only application hook.
 */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from 'playwright';
import {
  AGENT_SMOKE_SELECTORS,
  AGENT_SMOKE_TIMEOUTS_MS,
  createAgentSmokeReport,
  hasTerminalEvidence,
  parseAgentSmokeArgs,
  unexpectedBrowserFaults,
} from './agent-smoke-contract.mjs';

const webToyRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const distRoot = resolve(webToyRoot, 'dist');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const MAX_RECORDED_TEXT_LENGTH = 4_000;

const contentTypes = Object.freeze({
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

class SmokeFailure extends Error {
  constructor(phase, message, details = null) {
    super(message);
    this.details = details;
    this.phase = phase;
  }
}

function usage() {
  return `Usage: npm run verify:agent-smoke -- [options]

Builds and loopback-serves apps/web-toy/dist, then runs a real Chromium smoke.

Options:
  --seed <uint32>                 Fixed seed for both flows (default: 1337)
  --full-run-timeout-ms <60000-300000>
                                  Bound for the supported terminal route
                                  (default: ${AGENT_SMOKE_TIMEOUTS_MS.fullRun})
  --help                          Show this help
`;
}

function compactText(value, maximum = MAX_RECORDED_TEXT_LENGTH) {
  const text = String(value ?? '').trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum)}…`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function errorDetails(error) {
  if (error instanceof SmokeFailure) return error.details;
  return null;
}

function fileForPath(requestPath) {
  const pathname = new URL(requestPath, 'http://127.0.0.1').pathname;
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const absolutePath = resolve(distRoot, relativePath);
  if (absolutePath !== distRoot && !absolutePath.startsWith(`${distRoot}/`)) return null;
  try {
    return statSync(absolutePath).isFile() ? absolutePath : null;
  } catch {
    return null;
  }
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    try {
      server.close((error) => error === undefined ? resolveClose() : rejectClose(error));
    } catch (error) {
      rejectClose(error);
    }
  });
}

function startArtifactServer() {
  if (!existsSync(distRoot)) {
    throw new SmokeFailure('server', `built artifact directory is missing: ${distRoot}`);
  }

  const server = createServer((request, response) => {
    const absolutePath = fileForPath(request.url ?? '/');
    if (absolutePath === null) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes[extname(absolutePath)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(absolutePath));
  });
  server.requestTimeout = AGENT_SMOKE_TIMEOUTS_MS.serverRequest;
  server.headersTimeout = AGENT_SMOKE_TIMEOUTS_MS.serverRequest;

  return new Promise((resolveServer, rejectServer) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // A server that never began listening has nothing to close.
      }
      rejectServer(new SmokeFailure('server', `loopback server did not bind within ${AGENT_SMOKE_TIMEOUTS_MS.serverStart}ms`));
    }, AGENT_SMOKE_TIMEOUTS_MS.serverStart);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectServer(new SmokeFailure('server', `loopback server could not bind: ${errorMessage(error)}`));
    };
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.off('error', fail);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        void closeServer(server).catch(() => undefined);
        rejectServer(new SmokeFailure('server', 'loopback server did not expose a TCP address'));
        return;
      }
      resolveServer({ baseUrl: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

function runBuildCommand(timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(npmCommand, ['run', 'build'], {
      cwd: webToyRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let forceKillTimer;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    }, timeoutMs);
    const cleanupTimers = () => {
      clearTimeout(timeout);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    };

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => {
      cleanupTimers();
      rejectRun(error);
    });
    child.once('close', (code, signal) => {
      cleanupTimers();
      resolveRun({
        code,
        outputTail: compactText(Buffer.concat([...stdout, ...stderr]).toString('utf8')),
        signal,
        timedOut,
      });
    });
  });
}

async function buildArtifact(report) {
  const startedAt = performance.now();
  report.artifact.build.status = 'running';
  let result;
  try {
    result = await runBuildCommand(report.timeoutsMs.build);
  } catch (error) {
    report.artifact.build.durationMs = Math.round(performance.now() - startedAt);
    report.artifact.build.status = 'failed';
    throw new SmokeFailure('build', `could not start the real app build: ${errorMessage(error)}`);
  }
  report.artifact.build.durationMs = Math.round(performance.now() - startedAt);
  report.artifact.build.outputTail = result.outputTail || null;
  if (result.timedOut) {
    report.artifact.build.status = 'failed';
    throw new SmokeFailure('build', `npm run build exceeded its ${report.timeoutsMs.build}ms limit`, result);
  }
  if (result.code !== 0) {
    report.artifact.build.status = 'failed';
    throw new SmokeFailure('build', `npm run build exited ${result.code ?? 'without a code'}${result.signal === null ? '' : ` (${result.signal})`}`, result);
  }
  report.artifact.build.status = 'passed';
}

async function loadBuildIdentity(baseUrl) {
  const buildInfoResponse = await fetch(new URL('/build-info.json', baseUrl));
  if (!buildInfoResponse.ok) {
    throw new SmokeFailure('artifact-identity', `build-info.json returned HTTP ${buildInfoResponse.status}`);
  }
  const buildInfo = await buildInfoResponse.json();
  if (typeof buildInfo.buildId !== 'string' || buildInfo.buildId.length === 0) {
    throw new SmokeFailure('artifact-identity', 'build-info.json has no usable buildId');
  }
  const indexResponse = await fetch(new URL('/', baseUrl));
  if (!indexResponse.ok) {
    throw new SmokeFailure('artifact-identity', `built index returned HTTP ${indexResponse.status}`);
  }
  const indexHtml = await indexResponse.text();
  if (!indexHtml.includes(buildInfo.buildId)) {
    throw new SmokeFailure('artifact-identity', 'built index does not identify the same buildId as build-info.json');
  }
  return Object.freeze({
    assetManifestHash: typeof buildInfo.assetManifestHash === 'string' ? buildInfo.assetManifestHash : null,
    buildId: buildInfo.buildId,
    commitSha: typeof buildInfo.commitSha === 'string' ? buildInfo.commitSha : null,
    contentFingerprint: typeof buildInfo.contentFingerprint === 'string' ? buildInfo.contentFingerprint : null,
    sourceState: typeof buildInfo.sourceState === 'string' ? buildInfo.sourceState : null,
  });
}

async function launchBrowser(timeoutMs) {
  const startedAt = performance.now();
  const launch = chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    headless: true,
  });
  let timedOut = false;
  let timeout;
  try {
    const browser = await Promise.race([
      launch,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          reject(new Error(`launch exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    return { browser, durationMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    if (timedOut) void launch.then((browser) => browser.close()).catch(() => undefined);
    throw new SmokeFailure(
      'browser',
      `Chromium could not launch. Install the project runtime with "npx playwright install chromium" and retry. ${errorMessage(error)}`,
    );
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function attachPageDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    diagnostics.console.push({ level: message.type(), text: compactText(message.text()) });
  });
  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push({ text: compactText(errorMessage(error)) });
  });
  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push({
      error: compactText(request.failure()?.errorText ?? 'unknown request failure'),
      url: request.url(),
    });
  });
}

function assertNoBrowserFaults(phase, diagnostics) {
  const faults = unexpectedBrowserFaults(diagnostics);
  if (faults.length > 0) {
    throw new SmokeFailure(phase, `browser reported ${faults.length} unhandled console, page, or network fault(s)`, faults);
  }
}

async function readPageState(page) {
  return page.evaluate((selectors) => {
    const handle = window.__webToy;
    const intro = document.querySelector(selectors.runIntro);
    const start = document.querySelector(selectors.runIntroStart);
    const outcome = document.querySelector(selectors.runOutcome);
    const pauseNotice = document.querySelector(selectors.pauseNotice);
    const canvas = document.querySelector(selectors.gameCanvas);
    const banner = document.querySelector(selectors.contextBanner);
    const buildIdentity = document.querySelector(selectors.buildIdentity);
    const metaBuildId = document.querySelector('meta[name="animal-survivor-build-id"]')?.getAttribute('content') ?? null;
    const text = (element) => element?.textContent?.trim().slice(0, 1_000) ?? null;
    return {
      buildIdentityText: text(buildIdentity),
      contextBannerHidden: banner !== null && getComputedStyle(banner).display === 'none',
      hasApp: handle !== undefined,
      introHidden: intro?.hidden ?? null,
      labelBuildId: buildIdentity?.getAttribute('data-build-id') ?? null,
      metaBuildId,
      outcome: handle?.driver.runOutcome ?? null,
      outcomeText: text(outcome),
      outcomeVisible: outcome?.hidden === false,
      pauseNoticeText: text(pauseNotice),
      pauseVisible: pauseNotice?.hidden === false,
      paused: handle?.controls.paused ?? null,
      startLabel: text(start),
      tick: handle?.driver.tick ?? null,
      title: document.title,
      webgl2: canvas instanceof HTMLCanvasElement && canvas.getContext('webgl2') !== null,
    };
  }, AGENT_SMOKE_SELECTORS);
}

function assertRuntimeBuildIdentity(state, buildIdentity) {
  if (state.metaBuildId !== buildIdentity.buildId || state.labelBuildId !== buildIdentity.buildId || !state.buildIdentityText?.includes(buildIdentity.buildId)) {
    throw new SmokeFailure(
      'build-identity',
      `runtime build identity does not match served build ${buildIdentity.buildId}`,
      state,
    );
  }
}

async function waitForManualBoot(page, timeoutsMs) {
  try {
    await page.waitForFunction((selectors) => {
      const handle = window.__webToy;
      const intro = document.querySelector(selectors.runIntro);
      const start = document.querySelector(selectors.runIntroStart);
      const canvas = document.querySelector(selectors.gameCanvas);
      const banner = document.querySelector(selectors.contextBanner);
      return handle !== undefined
        && intro?.hidden === false
        && start?.textContent?.trim() === 'Start run'
        && canvas instanceof HTMLCanvasElement
        && canvas.getContext('webgl2') !== null
        && banner !== null
        && getComputedStyle(banner).display === 'none';
    }, AGENT_SMOKE_SELECTORS, { timeout: timeoutsMs.boot });
  } catch (error) {
    throw new SmokeFailure(
      'manual-boot',
      `manual boot did not reach an interactive WebGL prep screen within ${timeoutsMs.boot}ms: ${errorMessage(error)}`,
      await readPageState(page),
    );
  }
}

async function waitForManualRun(page, minimumTick, timeoutsMs, phase) {
  try {
    await page.waitForFunction(({ minTick, selectors }) => {
      const handle = window.__webToy;
      return handle !== undefined
        && handle.driver.tick >= minTick
        && handle.controls.paused === false
        && document.querySelector(selectors.runIntro)?.hidden === true;
    }, { minTick: minimumTick, selectors: AGENT_SMOKE_SELECTORS }, { timeout: timeoutsMs.interaction });
  } catch (error) {
    throw new SmokeFailure(
      phase,
      `manual run did not advance to tick ${minimumTick} within ${timeoutsMs.interaction}ms: ${errorMessage(error)}`,
      await readPageState(page),
    );
  }
}

async function runManualFlow({ baseUrl, browser, buildIdentity, report }) {
  const flow = report.flows.manual;
  const startedAt = performance.now();
  const context = await browser.newContext({ viewport: { height: 800, width: 1280 } });
  try {
    const page = await context.newPage();
    attachPageDiagnostics(page, report.diagnostics.manual);
    const route = new URL('/', baseUrl);
    route.searchParams.set('hero', 'greg');
    route.searchParams.set('seed', report.configuration.seed);
    flow.route = route.toString();
    flow.status = 'running';

    await page.goto(flow.route, { timeout: report.timeoutsMs.navigation, waitUntil: 'domcontentloaded' });
    await waitForManualBoot(page, report.timeoutsMs);
    const bootState = await readPageState(page);
    assertRuntimeBuildIdentity(bootState, buildIdentity);

    await page.locator(AGENT_SMOKE_SELECTORS.runIntroStart).click({ timeout: report.timeoutsMs.interaction });
    await waitForManualRun(page, 4, report.timeoutsMs, 'manual-start');
    const startedState = await readPageState(page);
    flow.start = {
      introHidden: startedState.introHidden,
      startButton: AGENT_SMOKE_SELECTORS.runIntroStart,
      tick: startedState.tick,
    };

    const pauseButton = page.locator(AGENT_SMOKE_SELECTORS.controlsButtons).filter({ hasText: /^Pause$/u });
    await pauseButton.click({ timeout: report.timeoutsMs.interaction });
    await page.waitForFunction((selectors) => {
      const handle = window.__webToy;
      const notice = document.querySelector(selectors.pauseNotice);
      return handle?.controls.paused === true && notice?.hidden === false && notice.textContent?.includes('Paused') === true;
    }, AGENT_SMOKE_SELECTORS, { timeout: report.timeoutsMs.interaction });
    const pausedState = await readPageState(page);
    await page.waitForTimeout(250);
    const stablePausedState = await readPageState(page);
    if (pausedState.tick !== stablePausedState.tick) {
      throw new SmokeFailure('manual-pause', 'the player pause control did not hold the simulation tick steady', {
        pausedState,
        stablePausedState,
      });
    }

    const resumeButton = page.locator(AGENT_SMOKE_SELECTORS.controlsButtons).filter({ hasText: /^Resume$/u });
    await resumeButton.click({ timeout: report.timeoutsMs.interaction });
    await waitForManualRun(page, (stablePausedState.tick ?? 0) + 3, report.timeoutsMs, 'manual-resume');
    const resumedState = await readPageState(page);
    flow.pauseResume = {
      controlSelector: AGENT_SMOKE_SELECTORS.controlsButtons,
      pauseNoticeText: pausedState.pauseNoticeText,
      pausedAtTick: pausedState.tick,
      resumedAtTick: resumedState.tick,
      stablePausedTick: stablePausedState.tick,
    };
    flow.state = resumedState;
    assertNoBrowserFaults('manual-browser', report.diagnostics.manual);
    flow.status = 'passed';
  } catch (error) {
    flow.status = 'failed';
    flow.failure = { message: errorMessage(error), phase: error instanceof SmokeFailure ? error.phase : 'manual' };
    throw error;
  } finally {
    flow.durationMs = Math.round(performance.now() - startedAt);
    await context.close().catch(() => undefined);
  }
}

async function waitForFullRunTerminal(page, timeoutsMs) {
  try {
    await page.waitForFunction((selectors) => {
      const handle = window.__webToy;
      const outcome = handle?.driver.runOutcome;
      return (outcome === 'victory' || outcome === 'defeat')
        && document.querySelector(selectors.runOutcome)?.hidden === false;
    }, AGENT_SMOKE_SELECTORS, { timeout: timeoutsMs.fullRun });
  } catch (error) {
    throw new SmokeFailure(
      'full-run-terminal',
      `supported autopilot terminal route did not finish within ${timeoutsMs.fullRun}ms: ${errorMessage(error)}`,
      await readPageState(page),
    );
  }
}

async function runFullRunFlow({ baseUrl, browser, report }) {
  const flow = report.flows.fullRun;
  const startedAt = performance.now();
  const context = await browser.newContext({ viewport: { height: 800, width: 1280 } });
  let page;
  try {
    page = await context.newPage();
    attachPageDiagnostics(page, report.diagnostics.fullRun);
    const route = new URL('/', baseUrl);
    route.searchParams.set('autopilot', '1');
    route.searchParams.set('debug', '1');
    route.searchParams.set('fullrun', '1');
    route.searchParams.set('hero', 'greg');
    route.searchParams.set('seed', report.configuration.seed);
    route.searchParams.set('stress', '1');
    flow.route = route.toString();
    flow.status = 'running';

    await page.goto(flow.route, { timeout: report.timeoutsMs.navigation, waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction((selectors) => {
        const handle = window.__webToy;
        return handle !== undefined
          && handle.driver.tick > 3
          && document.querySelector(selectors.runIntro)?.hidden === true;
      }, AGENT_SMOKE_SELECTORS, { timeout: report.timeoutsMs.boot });
    } catch (error) {
      throw new SmokeFailure(
        'full-run-boot',
        `supported autopilot route did not boot within ${report.timeoutsMs.boot}ms: ${errorMessage(error)}`,
        await readPageState(page),
      );
    }
    // This is the existing diagnostics control, exercised through its real DOM
    // button. The manual lane above already proves the built WebGL renderer;
    // disabling only presentation here lets the supported five-ticks-per-frame
    // route reach its authoritative terminal state inside a CI-sized bound.
    const rendererButton = page.locator(AGENT_SMOKE_SELECTORS.controlsButtons).filter({ hasText: /^Renderer: ON$/u });
    const rendererControlVisible = await rendererButton.isVisible();
    // The app deliberately hides secondary diagnostics controls from player
    // UI. Dispatch only the existing button's own click handler; the report
    // makes clear this is diagnostics acceleration, not player interaction.
    const rendererToggle = await page.evaluate((selectors) => {
      const button = [...document.querySelectorAll(selectors.controlsButtons)]
        .find((candidate) => candidate.textContent?.trim() === 'Renderer: ON');
      if (button === undefined) return { final: null, found: false, initial: null };
      const initial = button.textContent?.trim() ?? null;
      button.click();
      return { final: button.textContent?.trim() ?? null, found: true, initial };
    }, AGENT_SMOKE_SELECTORS);
    if (!rendererToggle.found || rendererToggle.initial !== 'Renderer: ON' || rendererToggle.final !== 'Renderer: OFF') {
      throw new SmokeFailure('full-run-renderer-toggle', 'existing diagnostic Renderer control did not transition from ON to OFF', rendererToggle);
    }
    await page.waitForFunction((selectors) => {
      const handle = window.__webToy;
      const buttons = [...document.querySelectorAll(selectors.controlsButtons)];
      return handle?.controls.renderEnabled === false
        && buttons.some((button) => button.textContent?.trim() === 'Renderer: OFF');
    }, AGENT_SMOKE_SELECTORS, { timeout: report.timeoutsMs.interaction });
    flow.presentation = {
      diagnosticRendererToggle: {
        final: 'Renderer: OFF',
        forced: true,
        initial: 'Renderer: ON',
        interaction: 'programmatic hidden diagnostics click',
        selector: AGENT_SMOKE_SELECTORS.controlsButtons,
        visibleBeforeToggle: rendererControlVisible,
      },
      evidenceKind: 'non-player-visible diagnostics acceleration',
      note: 'Presentation is disabled only for the accelerated terminal proof. The separate seeded manual flow verified WebGL with rendering enabled.',
      rendererEnabled: false,
    };
    await waitForFullRunTerminal(page, report.timeoutsMs);
    const terminalState = await readPageState(page);
    if (!hasTerminalEvidence(terminalState)) {
      throw new SmokeFailure('full-run-terminal', 'terminal route reached a state where simulation and terminal UI disagree', terminalState);
    }
    flow.state = terminalState;
    assertNoBrowserFaults('full-run-browser', report.diagnostics.fullRun);
    flow.status = 'passed';
  } catch (error) {
    if (error instanceof SmokeFailure && error.details !== null && typeof error.details === 'object') {
      flow.state = error.details;
    } else if (page !== undefined) {
      try {
        flow.state = await readPageState(page);
      } catch {
        // Preserve the original browser failure when state collection fails too.
      }
    }
    flow.status = 'failed';
    flow.failure = { message: errorMessage(error), phase: error instanceof SmokeFailure ? error.phase : 'full-run' };
    throw error;
  } finally {
    flow.durationMs = Math.round(performance.now() - startedAt);
    await context.close().catch(() => undefined);
  }
}

function setFailure(report, error, fallbackPhase) {
  report.failure = {
    details: errorDetails(error),
    message: errorMessage(error),
    phase: error instanceof SmokeFailure ? error.phase : fallbackPhase,
  };
  report.status = 'failed';
}

function emitReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  let args;
  try {
    args = parseAgentSmokeArgs(process.argv.slice(2));
  } catch (error) {
    const report = createAgentSmokeReport(parseAgentSmokeArgs([]), startedAt);
    setFailure(report, new SmokeFailure('arguments', errorMessage(error)), 'arguments');
    report.cleanup.browser = 'not-started';
    report.cleanup.server = 'not-started';
    report.totalDurationMs = Math.round(performance.now() - startedAtMs);
    emitReport(report);
    process.stderr.write(`[verify-agent-smoke] ${report.failure.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const report = createAgentSmokeReport(args, startedAt);
  let browser;
  let server;
  try {
    await buildArtifact(report);

    const serverStartedAt = performance.now();
    report.artifact.server.status = 'running';
    let startedServer;
    try {
      startedServer = await startArtifactServer();
    } catch (error) {
      report.artifact.server.durationMs = Math.round(performance.now() - serverStartedAt);
      report.artifact.server.status = 'failed';
      throw error;
    }
    server = startedServer.server;
    report.artifact.server.baseUrl = startedServer.baseUrl;
    report.artifact.server.durationMs = Math.round(performance.now() - serverStartedAt);
    report.artifact.server.status = 'passed';
    report.artifact.buildIdentity = await loadBuildIdentity(startedServer.baseUrl);

    const launched = await launchBrowser(report.timeoutsMs.browserLaunch);
    browser = launched.browser;
    report.browser.launchDurationMs = launched.durationMs;
    report.browser.status = 'passed';

    await runManualFlow({
      baseUrl: startedServer.baseUrl,
      browser,
      buildIdentity: report.artifact.buildIdentity,
      report,
    });
    await runFullRunFlow({ baseUrl: startedServer.baseUrl, browser, report });
    report.status = 'passed';
  } catch (error) {
    setFailure(report, error, 'runner');
  } finally {
    let cleanupError = null;
    if (browser !== undefined) {
      try {
        await browser.close();
        report.cleanup.browser = 'closed';
      } catch (error) {
        report.cleanup.browser = `failed: ${errorMessage(error)}`;
        cleanupError ??= error;
      }
    } else {
      report.cleanup.browser = 'not-started';
    }
    if (server !== undefined) {
      try {
        await closeServer(server);
        report.cleanup.server = 'closed';
      } catch (error) {
        report.cleanup.server = `failed: ${errorMessage(error)}`;
        cleanupError ??= error;
      }
    } else {
      report.cleanup.server = 'not-started';
    }
    if (cleanupError !== null && report.status === 'passed') {
      setFailure(report, new SmokeFailure('cleanup', `resource cleanup failed: ${errorMessage(cleanupError)}`), 'cleanup');
    }
    report.totalDurationMs = Math.round(performance.now() - startedAtMs);
    emitReport(report);
  }
  if (report.status !== 'passed') {
    process.stderr.write(`[verify-agent-smoke] ${report.failure?.phase ?? 'runner'} failed: ${report.failure?.message ?? 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}

void main();
