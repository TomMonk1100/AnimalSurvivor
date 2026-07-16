/**
 * Small, browser-smoke-only contract helpers.
 *
 * Keeping argument parsing and evidence rules here lets the Playwright runner
 * stay focused on real browser work while Vitest can protect the machine
 * readable report shape without needing a browser runtime.
 */

export const AGENT_SMOKE_SELECTORS = Object.freeze({
  buildIdentity: '#build-identity',
  controlsButtons: '#controls button',
  contextBanner: '#ctx-banner',
  gameCanvas: '#game-canvas',
  runIntro: '#run-intro',
  runIntroStart: '#run-intro-start',
  runOutcome: '#run-outcome',
  pauseNotice: '#pause-notice',
});

export const AGENT_SMOKE_TIMEOUTS_MS = Object.freeze({
  build: 120_000,
  browserLaunch: 30_000,
  navigation: 30_000,
  boot: 30_000,
  interaction: 15_000,
  fullRun: 180_000,
  serverStart: 10_000,
  serverRequest: 15_000,
});

const MIN_FULL_RUN_TIMEOUT_MS = 60_000;
const MAX_FULL_RUN_TIMEOUT_MS = 300_000;
const MAX_SEED = 0xffff_ffff;

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseBoundedInteger(value, option, minimum, maximum) {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${option} must be a whole number between ${minimum} and ${maximum}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${option} must be a whole number between ${minimum} and ${maximum}`);
  }
  return parsed;
}

/** Parse only bounded inputs so the browser command cannot become unbounded. */
export function parseAgentSmokeArgs(argv) {
  let seed = 1337;
  let fullRunTimeoutMs = AGENT_SMOKE_TIMEOUTS_MS.fullRun;
  let help = false;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
    } else if (argument === '--seed') {
      seed = parseBoundedInteger(requiredValue(argv, index, argument), argument, 0, MAX_SEED);
      index++;
    } else if (argument === '--full-run-timeout-ms') {
      fullRunTimeoutMs = parseBoundedInteger(
        requiredValue(argv, index, argument),
        argument,
        MIN_FULL_RUN_TIMEOUT_MS,
        MAX_FULL_RUN_TIMEOUT_MS,
      );
      index++;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }

  return Object.freeze({
    fullRunTimeoutMs,
    help,
    seed: String(seed),
  });
}

/** Returns only browser faults that invalidate the smoke result. */
export function unexpectedBrowserFaults(diagnostics) {
  return Object.freeze([
    ...diagnostics.console
      .filter((entry) => entry.level === 'error')
      .map((entry) => Object.freeze({ ...entry, kind: 'console-error' })),
    ...diagnostics.pageErrors
      .map((entry) => Object.freeze({ ...entry, kind: 'page-error' })),
    ...diagnostics.requestFailures
      .map((entry) => Object.freeze({ ...entry, kind: 'request-failure' })),
  ]);
}

/** A terminal card is evidence only when the authoritative terminal state and UI agree. */
export function hasTerminalEvidence(state) {
  return (state.outcome === 'victory' || state.outcome === 'defeat')
    && state.outcomeVisible === true
    && typeof state.outcomeText === 'string'
    && state.outcomeText.trim().length > 0;
}

/** Creates a JSON-safe report with explicit pending states for interrupted runs. */
export function createAgentSmokeReport(args, startedAt) {
  return {
    artifact: {
      build: { durationMs: null, outputTail: null, status: 'pending' },
      buildIdentity: null,
      server: { baseUrl: null, durationMs: null, status: 'pending' },
    },
    browser: {
      engine: 'chromium',
      launchDurationMs: null,
      mode: 'headless-swiftshader',
      status: 'pending',
    },
    cleanup: { browser: 'pending', server: 'pending' },
    command: 'npm run verify:agent-smoke',
    configuration: {
      fullRunRoute: '?autopilot=1&stress=1&fullrun=1&debug=1',
      seed: args.seed,
    },
    diagnostics: {
      fullRun: { console: [], pageErrors: [], requestFailures: [] },
      manual: { console: [], pageErrors: [], requestFailures: [] },
    },
    failure: null,
    flows: {
      fullRun: {
        durationMs: null,
        presentation: null,
        route: null,
        state: null,
        status: 'pending',
      },
      manual: {
        durationMs: null,
        route: null,
        start: null,
        pauseResume: null,
        state: null,
        status: 'pending',
      },
    },
    startedAt,
    status: 'running',
    timeoutsMs: {
      ...AGENT_SMOKE_TIMEOUTS_MS,
      fullRun: args.fullRunTimeoutMs,
    },
    totalDurationMs: null,
    version: 1,
  };
}
