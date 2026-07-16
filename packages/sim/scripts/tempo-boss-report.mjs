#!/usr/bin/env node
/**
 * Fixed-policy technical evidence for the V1.2 tempo/boss contract.
 *
 * This is intentionally not a human-difficulty or fun claim. It runs a quiet,
 * no-upgrade, stationary-baseline simulation with extra health safety so the
 * real authoritative attack loop can measure damage and remaining boss health
 * without normal-wave variance ending the diagnostic early. A no-upgrade
 * baseline is not required to clear the intended 75-second boss window.
 */
import {
  DEFAULT_CONFIG,
  createSimulation,
} from '../dist/src/index.js';
import {
  BOSS_ENTRANCE_TICK,
  fingerprintDefinition,
  GREG_FIRST_RUN,
  RUN_DURATION_TICKS,
} from '../../run-director/dist/src/index.js';

const BOSS = GREG_FIRST_RUN.boss;
const REPORT_VERSION = 2;
const CONTENT_FINGERPRINT = fingerprintDefinition(GREG_FIRST_RUN);

function phaseAt(tick) {
  for (const phase of GREG_FIRST_RUN.phases) {
    if (tick >= phase.startTick && tick <= phase.endTick) return phase.id;
  }
  return 'boss';
}

function createBossOnlyDirector() {
  let tick = -1;
  let outcome = 'running';
  let bossRequested = false;
  return {
    get outcome() { return outcome; },
    get tick() { return tick; },
    get phase() { return phaseAt(Math.max(0, tick)); },
    step(metrics) {
      if (metrics.tick <= tick) throw new Error('tempo-boss report director tick order');
      tick = metrics.tick;
      if (outcome !== 'running') return [];
      const phase = phaseAt(tick);
      if (tick === BOSS.warningTick) {
        return [{ kind: 'bossWarning', tick, seq: tick, phase, requestTick: BOSS.requestTick }];
      }
      if (tick === BOSS.requestTick) {
        bossRequested = true;
        return [{
          kind: 'bossRequested', tick, seq: tick, phase,
          intent: {
            archetypeId: BOSS.archetypeId,
            count: 1,
            formation: BOSS.formation,
            minDistance: BOSS.minDistance,
            maxDistance: BOSS.maxDistance,
            elite: false,
            boss: true,
            bossProfile: BOSS.profile,
          },
        }];
      }
      if (bossRequested && metrics.bossDefeatedThisTick) {
        outcome = 'victory';
        return [{ kind: 'victory', tick, seq: tick, phase }];
      }
      if (tick >= RUN_DURATION_TICKS) {
        outcome = 'defeat';
        return [{ kind: 'defeat', tick, seq: tick, phase }];
      }
      return [];
    },
    stateHash() {
      const code = outcome === 'victory' ? 1 : outcome === 'defeat' ? 2 : 0;
      return ((Math.max(0, tick) * 4 + code) >>> 0).toString(16).padStart(8, '0');
    },
    contentFingerprint() { return CONTENT_FINGERPRINT; },
  };
}

const config = {
  ...DEFAULT_CONFIG,
  waves: [],
  player: {
    ...DEFAULT_CONFIG.player,
    // Diagnostic-only survival safety; outgoing player damage remains the
    // current production baseline and no upgrades are selected.
    maxHp: 100_000,
  },
};
const sim = createSimulation(config, 0x5eed, { runDirectorFactory: createBossOnlyDirector });

let bossArrivalTick = null;
let bossKillTick = null;
let bossMaxHp = null;

function readLiveBossHealth() {
  const data = sim.enemies.data;
  let health = null;
  for (let slot = 0; slot < data.capacity; slot += 1) {
    if (data.alive[slot] !== 1) continue;
    // The quiet diagnostic only creates one boss, but choosing the largest
    // live maximum remains deterministic if a future diagnostic adds support.
    if (health === null || data.maxHp[slot] > health.maxHp) {
      health = { hp: data.hp[slot], maxHp: data.maxHp[slot] };
    }
  }
  return health;
}

for (let tick = 1; tick <= RUN_DURATION_TICKS + 1 && sim.runOutcome === 'running'; tick += 1) {
  sim.step({ moveX: 0, moveY: 0, paused: false });
  if (sim.directorEvents.some((event) => event.kind === 'bossRequested')) {
    bossArrivalTick = sim.tick;
    bossMaxHp = readLiveBossHealth()?.maxHp ?? null;
  }
  if (bossKillTick === null && sim.totalKills > 0) bossKillTick = sim.tick;
}

const bossTtkTicks = bossArrivalTick === null || bossKillTick === null
  ? null
  : bossKillTick - bossArrivalTick;
const liveBossHealth = readLiveBossHealth();
const bossRemainingHp = bossKillTick === null ? liveBossHealth?.hp ?? null : 0;
const bossRemainingFraction = bossMaxHp === null || bossRemainingHp === null
  ? null
  : bossRemainingHp / bossMaxHp;
const bossDamageDealt = bossMaxHp === null || bossRemainingHp === null
  ? null
  : bossMaxHp - bossRemainingHp;
const report = {
  reportVersion: REPORT_VERSION,
  policy: 'stationary-clean-baseline-with-health-safety',
  humanEvidence: false,
  runDurationTicks: RUN_DURATION_TICKS,
  bossWarningTick: BOSS.warningTick,
  bossArrivalTick,
  bossKillTick,
  bossTtkTicks,
  bossWindowTicks: RUN_DURATION_TICKS - BOSS_ENTRANCE_TICK,
  bossMaxHp,
  bossRemainingHp,
  bossRemainingFraction,
  bossDamageDealt,
  terminalOutcome: sim.runOutcome,
  terminalTick: sim.tick,
  bossProfile: BOSS.profile,
  finalHash: sim.hash(),
};

if (
  bossArrivalTick !== BOSS_ENTRANCE_TICK
  || bossMaxHp === null
  || bossRemainingHp === null
  || bossRemainingHp < 0
  || bossRemainingHp > bossMaxHp
  || report.terminalTick > RUN_DURATION_TICKS
  || (bossTtkTicks !== null && (bossTtkTicks <= 0 || bossTtkTicks > report.bossWindowTicks))
) {
  console.error(JSON.stringify(report, null, 2));
  throw new Error('tempo-boss report did not produce bounded baseline boss evidence');
}

console.log(JSON.stringify(report, null, 2));
