import type { Hud, HudStats } from '../contracts';

/**
 * Compact player HUD with optional diagnostics rendered into the app's `#hud`
 * element (already a `<pre>` with `white-space: pre` in `index.html`, so `\n`
 * in a single text node renders as line breaks).
 *
 * CRITICAL perf note: the text structure (a single `Text` node) is created
 * ONCE in the constructor. `update()` never creates DOM nodes; it only
 * (throttled) overwrites that node's `textContent`.
 */

const THROTTLE_MS = 100;

export interface HudOptions {
  /** Keep frame, pool, and hash diagnostics out of a normal player run. */
  readonly diagnostics?: boolean;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function whole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}

/** Pure copy formatter so player and diagnostic HUD variants stay testable. */
export function formatHud(stats: HudStats, diagnostics = true): string {
  const fps = stats.fps.toFixed(1);
  const frameTime = stats.frameTimeMs.toFixed(2);
  const dropped = stats.droppedAccumSec.toFixed(4);
  const paused = stats.paused ? 'YES' : 'NO';
  const autopilot = stats.autopilot ? 'ON' : 'OFF';
  const xp = stats.playerNextXp === null
    ? `XP ${whole(stats.playerXp)} • MAX LEVEL`
    : `XP ${whole(stats.playerXp)}/${whole(stats.playerNextXp)}`;
  const playerLines = [
    `GREG  HP ${whole(stats.playerHp)}/${whole(stats.playerMaxHp)}  LV ${whole(stats.playerLevel)}  ${xp}`,
    'Move: WASD / Arrow Keys • auto-fire',
  ];
  if (!diagnostics && stats.playerXp === 0 && stats.pickupsLive > 0) {
    playerLines.push('Green motes = XP — collect them to level up.');
  }
  if (!diagnostics) return playerLines.join('\n');

  return [
    ...playerLines,
    `FPS: ${fps}  frame: ${frameTime}ms  p95: ${stats.frameP95Ms.toFixed(2)}ms  p99: ${stats.frameP99Ms.toFixed(2)}ms`,
    `tick: ${stats.simTick}  ticks/frame: ${stats.ticksLastFrame}  dropped: ${dropped}s`,
    `enemies: ${stats.enemiesLive}/${stats.enemiesHigh}  proj: ${stats.projLive}/${stats.projHigh}  pickups: ${stats.pickupsLive}/${stats.pickupsHigh}`,
    `draw calls: ${stats.drawCalls}`,
    `hash: ${stats.stateHash}`,
    `paused: ${paused}  autopilot: ${autopilot}`,
  ].join('\n');
}

export function createHud(root: HTMLElement, options: HudOptions = {}): Hud {
  const textNode = document.createTextNode('');
  root.textContent = '';
  root.appendChild(textNode);

  let lastWriteMs = -Infinity;
  let disposed = false;
  const diagnostics = options.diagnostics ?? true;

  return {
    update(stats: HudStats): void {
      if (disposed) return;
      const t = now();
      if (t - lastWriteMs < THROTTLE_MS) return;
      lastWriteMs = t;
      textNode.textContent = formatHud(stats, diagnostics);
    },
    dispose(): void {
      disposed = true;
      root.textContent = '';
    },
  };
}
