import type { CombatPresentationEventView } from '../presentation/combat-presentation-events';

export interface DamageNumberPresentation {
  /** A presentation-only preference; disabling it clears visible feedback. */
  setEnabled(enabled: boolean): void;
  /** Copies a frame's transient simulation outcomes into the bounded view pool. */
  setEvents(events: readonly CombatPresentationEventView[]): void;
  /** Positions and expires active feedback using fixed simulation ticks. */
  update(renderTick: number, cameraTargetX: number, cameraTargetY: number, cameraAspect: number): void;
  dispose(): void;
}

export interface DamageNumberScreenPosition {
  readonly leftPercent: number;
  readonly topPercent: number;
}

export interface DamageNumberLabel {
  readonly text: string;
  readonly color: string;
  readonly fontScale: number;
}

interface ActiveDamageNumber {
  readonly event: CombatPresentationEventView;
}

interface DamageNumberView {
  readonly element: HTMLSpanElement;
  active: ActiveDamageNumber | null;
}

export const DEFAULT_DAMAGE_NUMBER_CAPACITY = 36;
export const DAMAGE_NUMBER_LIFETIME_TICKS = 28;
/** A normal-number stream stays readable without turning each hit into a flash. */
export const DAMAGE_NUMBER_NORMAL_MIN_INTERVAL_TICKS = 4;
/** Criticals remain special, but may not stack a second white/gold burst instantly. */
export const DAMAGE_NUMBER_CRITICAL_MIN_INTERVAL_TICKS = 6;
/** One cyan BLOCK label is enough to establish an active shield in a swarm. */
export const DAMAGE_NUMBER_SHIELD_ABSORB_MIN_INTERVAL_TICKS = 72;
const DAMAGE_NUMBER_ENTER_TICKS = 3;
const DAMAGE_NUMBER_RELEASE_START = 0.42;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Orthographic world-to-overlay mapping. It deliberately uses the same camera
 * target and half-height as the WebGL renderer, while remaining pure and easy
 * to verify without a graphics device.
 */
export function projectDamageNumberScreenPosition(
  worldX: number,
  worldY: number,
  cameraTargetX: number,
  cameraTargetY: number,
  cameraAspect: number,
  orthoHalfHeight: number,
): DamageNumberScreenPosition {
  const halfHeight = Math.max(1, finite(orthoHalfHeight, 1));
  const halfWidth = halfHeight * Math.max(0.1, finite(cameraAspect, 1));
  return Object.freeze({
    leftPercent: 50 + (finite(worldX, cameraTargetX) - finite(cameraTargetX, 0)) / halfWidth * 50,
    topPercent: 50 - (finite(worldY, cameraTargetY) - finite(cameraTargetY, 0)) / halfHeight * 50,
  });
}

/** Human-readable, color-stable labels for combat outcomes. */
export function presentDamageNumberLabel(event: CombatPresentationEventView): DamageNumberLabel {
  const amount = Math.max(0, Math.round(event.amount));
  switch (event.kind) {
    case 'enemyHit':
      return Object.freeze({
        text: String(amount),
        color: event.critical ? '#ffe15b' : '#ffffff',
        fontScale: event.critical ? 1.22 : 1,
      });
    case 'playerHit':
      return Object.freeze({ text: `-${amount}`, color: '#ff7770', fontScale: 0.94 });
    case 'heal':
      return Object.freeze({ text: `+${amount}`, color: '#8dff9d', fontScale: 0.96 });
    case 'shieldAbsorb':
      return Object.freeze({ text: 'BLOCK', color: '#85dfff', fontScale: 0.82 });
    case 'shieldBreak':
      return Object.freeze({ text: 'SHIELD BREAK', color: '#b6d7ff', fontScale: 0.78 });
    case 'armorBlock':
      return Object.freeze({ text: 'ARMOR', color: '#ffd06a', fontScale: 0.82 });
    case 'dodge':
      return Object.freeze({ text: 'DODGE', color: '#d6fbff', fontScale: 0.88 });
    case 'pickup':
      {
        const pickupKind = event.pickupKind?.trim() ?? '';
      return Object.freeze({
        text: pickupKind.length === 0 ? 'PICKUP' : pickupKind.toUpperCase(),
        color: '#9cff82',
        fontScale: 0.8,
      });
      }
  }
}

function eventKey(event: CombatPresentationEventView): string {
  return [
    event.kind,
    event.tick,
    event.x,
    event.y,
    event.amount,
    event.critical ? 1 : 0,
    event.sourceId,
    event.targetId,
    event.pickupKind ?? '',
  ].join('|');
}

function applyBaseStyle(element: HTMLSpanElement): void {
  element.style.position = 'absolute';
  element.style.left = '50%';
  element.style.top = '50%';
  element.style.display = 'none';
  element.style.pointerEvents = 'none';
  element.style.whiteSpace = 'nowrap';
  element.style.fontFamily = 'ui-rounded, "Avenir Next", system-ui, sans-serif';
  element.style.fontWeight = '900';
  element.style.fontSize = 'clamp(12px, 2.1vw, 24px)';
  element.style.letterSpacing = '0.025em';
  element.style.lineHeight = '1';
  element.style.textShadow = '0 2px 0 #162018, 0 0 7px rgba(0, 0, 0, 0.92)';
  element.style.userSelect = 'none';
  element.style.willChange = 'transform, opacity';
}

/**
 * A compact DOM overlay for numbers and outcome words. It is deliberately
 * renderer-owned: the simulation produces events, this pool only copies and
 * displays them, and expiry is driven by render tick rather than wall time.
 */
export function createDamageNumberPresentation(
  canvas: HTMLCanvasElement,
  orthoHalfHeight: number,
  capacity = DEFAULT_DAMAGE_NUMBER_CAPACITY,
): DamageNumberPresentation {
  const safeCapacity = Math.max(1, Math.floor(finite(capacity, DEFAULT_DAMAGE_NUMBER_CAPACITY)));
  const parent = canvas.parentElement;
  const overlay = parent === null ? null : document.createElement('div');
  const views: DamageNumberView[] = [];
  const seenEvents = new Map<string, number>();
  let enabled = true;
  let lastRenderTick = -1;
  let nextReplacement = 0;
  let lastNormalAdmissionTick = Number.NEGATIVE_INFINITY;
  let lastCriticalAdmissionTick = Number.NEGATIVE_INFINITY;
  let lastShieldAbsorbAdmissionTick = Number.NEGATIVE_INFINITY;

  if (overlay !== null && parent !== null) {
    overlay.className = 'damage-number-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.overflow = 'hidden';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1';
    // Preserve the joystick's visual layer, while keeping the overlay above
    // the canvas even in pages that do not include the standard markup.
    parent.insertBefore(overlay, canvas.nextSibling);
    for (let index = 0; index < safeCapacity; index++) {
      const element = document.createElement('span');
      element.className = 'damage-number';
      applyBaseStyle(element);
      overlay.appendChild(element);
      views.push({ element, active: null });
    }
  }

  function hide(view: DamageNumberView): void {
    view.active = null;
    view.element.style.display = 'none';
  }

  function clear(): void {
    for (const view of views) hide(view);
    seenEvents.clear();
    nextReplacement = 0;
    lastNormalAdmissionTick = Number.NEGATIVE_INFINITY;
    lastCriticalAdmissionTick = Number.NEGATIVE_INFINITY;
    lastShieldAbsorbAdmissionTick = Number.NEGATIVE_INFINITY;
  }

  /**
   * Damage is still canonical and every event remains available to the combat
   * feed. This only throttles the optional DOM overlay, which otherwise makes
   * a dense multi-hit look like alternating white pixels in the flash audit.
   */
  function admitsDamageNumber(event: CombatPresentationEventView): boolean {
    const eventTick = Math.max(0, Math.floor(finite(event.tick, 0)));
    if (event.kind === 'shieldAbsorb') {
      if (eventTick - lastShieldAbsorbAdmissionTick < DAMAGE_NUMBER_SHIELD_ABSORB_MIN_INTERVAL_TICKS) return false;
      lastShieldAbsorbAdmissionTick = eventTick;
      return true;
    }
    if (event.kind !== 'enemyHit') return true;
    if (event.critical) {
      if (eventTick - lastCriticalAdmissionTick < DAMAGE_NUMBER_CRITICAL_MIN_INTERVAL_TICKS) return false;
      lastCriticalAdmissionTick = eventTick;
      return true;
    }
    if (eventTick - lastNormalAdmissionTick < DAMAGE_NUMBER_NORMAL_MIN_INTERVAL_TICKS) return false;
    lastNormalAdmissionTick = eventTick;
    return true;
  }

  function acquireView(): DamageNumberView | null {
    for (const view of views) {
      if (view.active === null) return view;
    }
    if (views.length === 0) return null;
    const view = views[nextReplacement % views.length]!;
    nextReplacement = (nextReplacement + 1) % views.length;
    return view;
  }

  return {
    setEnabled(nextEnabled) {
      if (enabled === nextEnabled) return;
      enabled = nextEnabled;
      clear();
    },
    setEvents(events) {
      if (!enabled || views.length === 0) return;
      for (const event of events) {
        const key = eventKey(event);
        if (seenEvents.has(key)) continue;
        // Remember rejected optional labels too: the same copied event is
        // supplied across several rAF frames and must not get admitted late.
        seenEvents.set(key, event.tick);
        if (!admitsDamageNumber(event)) continue;
        const view = acquireView();
        if (view === null) return;
        view.active = { event: { ...event } };
      }
      // A bounded event identity cache prevents a long run from retaining a
      // key per historical hit, while still suppressing duplicated rAF input.
      const oldestAllowedTick = Math.max(0, lastRenderTick - DAMAGE_NUMBER_LIFETIME_TICKS * 2);
      for (const [key, tick] of seenEvents) {
        if (tick < oldestAllowedTick) seenEvents.delete(key);
      }
    },
    update(renderTick, cameraTargetX, cameraTargetY, cameraAspect) {
      const safeTick = Math.max(0, Math.floor(finite(renderTick, 0)));
      if (safeTick < lastRenderTick) clear();
      lastRenderTick = safeTick;
      if (!enabled) return;
      for (const view of views) {
        const active = view.active;
        if (active === null) continue;
        const age = safeTick - active.event.tick;
        if (age < 0 || age >= DAMAGE_NUMBER_LIFETIME_TICKS) {
          hide(view);
          continue;
        }
        const position = projectDamageNumberScreenPosition(
          active.event.x,
          active.event.y,
          cameraTargetX,
          cameraTargetY,
          cameraAspect,
          orthoHalfHeight,
        );
        if (position.leftPercent < -8 || position.leftPercent > 108 || position.topPercent < -8 || position.topPercent > 108) {
          view.element.style.display = 'none';
          continue;
        }
        const progress = clamp(age / DAMAGE_NUMBER_LIFETIME_TICKS, 0, 1);
        const label = presentDamageNumberLabel(active.event);
        const risePixels = 12 + progress * 43;
        const driftPixels = ((active.event.x * 0.37 + active.event.y * 0.19 + active.event.tick) % 9 - 4) * progress;
        const enter = clamp(age / DAMAGE_NUMBER_ENTER_TICKS, 0, 1);
        const release = progress <= DAMAGE_NUMBER_RELEASE_START
          ? 1
          : 1 - ((progress - DAMAGE_NUMBER_RELEASE_START) / (1 - DAMAGE_NUMBER_RELEASE_START)) ** 2;
        const opacity = (active.event.critical ? 0.88 : 0.7) * (1 - (1 - enter) ** 3) * release;
        const scale = label.fontScale * (0.92 + 0.16 * (1 - (1 - enter) ** 3) - progress * 0.12);
        view.element.textContent = label.text;
        view.element.style.color = label.color;
        view.element.style.left = `${position.leftPercent}%`;
        view.element.style.top = `${position.topPercent}%`;
        view.element.style.opacity = String(opacity);
        view.element.style.transform = `translate(calc(-50% + ${driftPixels}px), calc(-50% - ${risePixels}px)) scale(${scale})`;
        view.element.style.display = 'block';
      }
    },
    dispose() {
      clear();
      overlay?.remove();
    },
  };
}
