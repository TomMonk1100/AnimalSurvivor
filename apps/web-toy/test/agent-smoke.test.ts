import { describe, expect, it } from 'vitest';
// The browser runner is intentionally plain Node ESM; Vitest executes it directly.
// @ts-expect-error The runner helper is JavaScript because the production command is Node ESM.
import * as agentSmokeContract from '../scripts/agent-smoke-contract.mjs';

const {
  AGENT_SMOKE_SELECTORS,
  AGENT_SMOKE_TIMEOUTS_MS,
  createAgentSmokeReport,
  hasTerminalEvidence,
  parseAgentSmokeArgs,
  unexpectedBrowserFaults,
} = agentSmokeContract;

describe('agent browser smoke contract', () => {
  it('keeps the default command bounded and exposes its real-player selectors', () => {
    const args = parseAgentSmokeArgs([]);
    expect(args).toEqual({ fullRunTimeoutMs: AGENT_SMOKE_TIMEOUTS_MS.fullRun, help: false, seed: '1337' });
    expect(AGENT_SMOKE_TIMEOUTS_MS.fullRun).toBeLessThanOrEqual(300_000);
    expect(AGENT_SMOKE_SELECTORS.runIntroStart).toBe('#run-intro-start');
    expect(AGENT_SMOKE_SELECTORS.runOutcome).toBe('#run-outcome');
  });

  it('accepts only bounded deterministic seed and full-run inputs', () => {
    expect(parseAgentSmokeArgs(['--seed', '4294967295', '--full-run-timeout-ms', '120000']))
      .toEqual({ fullRunTimeoutMs: 120_000, help: false, seed: '4294967295' });
    expect(() => parseAgentSmokeArgs(['--seed', '4294967296'])).toThrow('between 0 and 4294967295');
    expect(() => parseAgentSmokeArgs(['--full-run-timeout-ms', '59999'])).toThrow('between 60000 and 300000');
    expect(() => parseAgentSmokeArgs(['--unbounded'])).toThrow('unknown option');
  });

  it('treats browser console errors, page errors, and failed requests as failures', () => {
    const faults = unexpectedBrowserFaults({
      console: [
        { level: 'warning', text: 'non-fatal warning' },
        { level: 'error', text: 'bundle failed' },
      ],
      pageErrors: [{ text: 'uncaught error' }],
      requestFailures: [{ error: 'net::ERR_FAILED', url: 'http://127.0.0.1/missing.png' }],
    });
    expect(faults).toEqual([
      { kind: 'console-error', level: 'error', text: 'bundle failed' },
      { kind: 'page-error', text: 'uncaught error' },
      { error: 'net::ERR_FAILED', kind: 'request-failure', url: 'http://127.0.0.1/missing.png' },
    ]);
  });

  it('requires matching terminal state and player-visible outcome evidence', () => {
    expect(hasTerminalEvidence({ outcome: 'victory', outcomeText: 'The Wildguard holds.', outcomeVisible: true })).toBe(true);
    expect(hasTerminalEvidence({ outcome: 'running', outcomeText: 'Still running', outcomeVisible: true })).toBe(false);
    expect(hasTerminalEvidence({ outcome: 'defeat', outcomeText: '', outcomeVisible: true })).toBe(false);
    expect(hasTerminalEvidence({ outcome: 'defeat', outcomeText: 'Retreat', outcomeVisible: false })).toBe(false);
  });

  it('creates a JSON-safe report with explicit pending evidence', () => {
    const report = createAgentSmokeReport(parseAgentSmokeArgs(['--seed', '7']), '2026-07-15T00:00:00.000Z');
    expect(report).toMatchObject({
      command: 'npm run verify:agent-smoke',
      configuration: { fullRunRoute: '?autopilot=1&stress=1&fullrun=1&debug=1', seed: '7' },
      status: 'running',
      timeoutsMs: { fullRun: AGENT_SMOKE_TIMEOUTS_MS.fullRun },
      version: 1,
    });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
