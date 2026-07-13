import type { Hud, HudStats } from '../contracts';
import type { RunProgress } from '../presentation/run-progress';

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
  /** Presentation-only current run context, read when the HUD redraws. */
  readonly progress?: () => RunProgress;
  /** Presentation-only selected hero label. */
  readonly heroName?: () => string;
}

interface PlayerHudElements {
  readonly hero: HTMLElement;
  readonly level: HTMLElement;
  readonly hpText: HTMLElement;
  readonly hpFill: HTMLElement;
  readonly xpText: HTMLElement;
  readonly xpFill: HTMLElement;
  readonly phase: HTMLElement;
  readonly objective: HTMLElement;
  readonly hint: HTMLElement;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function whole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}

/** Pure copy formatter so player and diagnostic HUD variants stay testable. */
export function formatHud(
  stats: HudStats,
  diagnostics = true,
  progress: RunProgress | null = null,
  heroName = 'Greg',
): string {
  const fps = stats.fps.toFixed(1);
  const frameTime = stats.frameTimeMs.toFixed(2);
  const dropped = stats.droppedAccumSec.toFixed(4);
  const paused = stats.paused ? 'YES' : 'NO';
  const autopilot = stats.autopilot ? 'ON' : 'OFF';
  const xp = stats.playerNextXp === null
    ? `XP ${whole(stats.playerXp)} • MAX LEVEL`
    : `XP ${whole(stats.playerXp)}/${whole(stats.playerNextXp)}`;
  const playerLines = [
    `${heroName.toUpperCase()}  HP ${whole(stats.playerHp)}/${whole(stats.playerMaxHp)}  LV ${whole(stats.playerLevel)}  ${xp}`,
    'Move: keyboard / mouse drag / touch / gamepad • auto-fire • Esc pause',
  ];
  if (!diagnostics && stats.playerXp === 0 && stats.pickupsLive > 0) {
    playerLines.push('Green motes = XP — collect them to level up.');
  }
  if (!diagnostics && progress !== null) {
    playerLines.push(progress.status, progress.objective);
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

/**
 * Builds the normal-player HUD once. Update calls only mutate text and two
 * transforms, keeping the same allocation discipline as the old `<pre>` while
 * giving the live game a real visual hierarchy instead of telemetry copy.
 */
function createPlayerHud(root: HTMLElement): PlayerHudElements {
  const element = (tag: keyof HTMLElementTagNameMap, className: string, text = ''): HTMLElement => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const shell = element('section', 'hud-shell');
  const top = element('header', 'hud-topline');
  const hero = element('strong', 'hud-hero');
  const level = element('span', 'hud-level');
  top.append(hero, level);
  const hpLabel = element('div', 'hud-bar-label');
  hpLabel.append(element('span', 'hud-bar-name', 'VITALITY'));
  const hpText = element('strong', 'hud-hp-text');
  hpLabel.append(hpText);
  const hpBar = element('div', 'hud-bar hud-hp-bar');
  hpBar.setAttribute('role', 'progressbar');
  hpBar.setAttribute('aria-label', 'Vitality');
  hpBar.setAttribute('aria-valuemin', '0');
  hpBar.setAttribute('aria-valuemax', '100');
  const hpFill = element('div', 'hud-bar-fill hud-hp-fill');
  hpBar.append(hpFill);
  const xpLabel = element('div', 'hud-bar-label hud-xp-label');
  xpLabel.append(element('span', 'hud-bar-name', 'GROWTH'));
  const xpText = element('strong', 'hud-xp-text');
  xpLabel.append(xpText);
  const xpBar = element('div', 'hud-bar hud-xp-bar');
  xpBar.setAttribute('role', 'progressbar');
  xpBar.setAttribute('aria-label', 'Experience');
  xpBar.setAttribute('aria-valuemin', '0');
  xpBar.setAttribute('aria-valuemax', '100');
  const xpFill = element('div', 'hud-bar-fill hud-xp-fill');
  xpBar.append(xpFill);
  const mission = element('div', 'hud-mission');
  const phase = element('strong', 'hud-phase');
  const objective = element('span', 'hud-objective');
  mission.append(phase, objective);
  const hint = element('span', 'hud-hint');
  shell.append(top, hpLabel, hpBar, xpLabel, xpBar, mission, hint);
  root.replaceChildren(shell);
  root.dataset.hudMode = 'player';
  return { hero, level, hpText, hpFill, xpText, xpFill, phase, objective, hint };
}

export function createHud(root: HTMLElement, options: HudOptions = {}): Hud {
  let lastWriteMs = -Infinity;
  let disposed = false;
  const diagnostics = options.diagnostics ?? true;
  const textNode = diagnostics ? document.createTextNode('') : null;
  const playerHud = diagnostics ? null : createPlayerHud(root);
  if (textNode !== null) {
    root.textContent = '';
    root.appendChild(textNode);
    root.dataset.hudMode = 'diagnostics';
  }

  return {
    update(stats: HudStats): void {
      if (disposed) return;
      const t = now();
      if (t - lastWriteMs < THROTTLE_MS) return;
      lastWriteMs = t;
      const heroName = options.heroName?.() ?? 'Greg';
      const progress = diagnostics ? null : options.progress?.() ?? null;
      if (diagnostics) {
        if (textNode !== null) {
          textNode.textContent = formatHud(stats, true, null, heroName);
        }
        return;
      }
      if (playerHud === null) return;
      const hpRatio = stats.playerMaxHp <= 0 ? 0 : Math.min(1, Math.max(0, stats.playerHp / stats.playerMaxHp));
      const xpRatio = stats.playerNextXp === null || stats.playerNextXp <= 0
        ? 1
        : Math.min(1, Math.max(0, stats.playerXp / stats.playerNextXp));
      const xpLabel = stats.playerNextXp === null
        ? `${whole(stats.playerXp)} / MAX`
        : `${whole(stats.playerXp)} / ${whole(stats.playerNextXp)}`;
      playerHud.hero.textContent = heroName.toUpperCase();
      playerHud.level.textContent = `LEVEL ${whole(stats.playerLevel)}`;
      playerHud.hpText.textContent = `${whole(stats.playerHp)} / ${whole(stats.playerMaxHp)}`;
      playerHud.hpFill.style.transform = `scaleX(${hpRatio})`;
      playerHud.xpText.textContent = xpLabel;
      playerHud.xpFill.style.transform = `scaleX(${xpRatio})`;
      playerHud.phase.textContent = progress?.status ?? 'EXPEDITION';
      playerHud.objective.textContent = progress?.objective ?? 'Survive the Wildguard.';
      playerHud.hint.textContent = stats.playerXp === 0 && stats.pickupsLive > 0
        ? 'Gather the green motes to awaken your first adaptation.'
        : 'Instincts are auto-aimed — keep moving through the glade.';
      root.setAttribute(
        'aria-label',
        `${heroName}, level ${whole(stats.playerLevel)}, vitality ${whole(stats.playerHp)} of ${whole(stats.playerMaxHp)}, ${progress?.objective ?? 'survive'}`,
      );
    },
    dispose(): void {
      disposed = true;
      root.textContent = '';
    },
  };
}
