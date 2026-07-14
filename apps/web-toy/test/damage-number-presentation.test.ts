import { afterEach, describe, expect, it } from 'vitest';
import type { CombatPresentationEventView } from '../src/presentation/combat-presentation-events';
import {
  DAMAGE_NUMBER_CRITICAL_MIN_INTERVAL_TICKS,
  DAMAGE_NUMBER_NORMAL_MIN_INTERVAL_TICKS,
  createDamageNumberPresentation,
  presentDamageNumberLabel,
  projectDamageNumberScreenPosition,
} from '../src/render/damage-number-presentation';

const event = (overrides: Partial<CombatPresentationEventView> = {}): CombatPresentationEventView => ({
  kind: 'enemyHit',
  tick: 20,
  x: 10,
  y: 15,
  amount: 13.4,
  critical: false,
  sourceId: 'greg-swipe',
  targetId: 'enemy-7',
  pickupKind: null,
  ...overrides,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('damage number presentation', () => {
  it('projects simulation positions through the renderer camera target', () => {
    expect(projectDamageNumberScreenPosition(0, 0, 0, 0, 1.5, 190)).toEqual({
      leftPercent: 50,
      topPercent: 50,
    });
    expect(projectDamageNumberScreenPosition(285, 190, 0, 0, 1.5, 190)).toEqual({
      leftPercent: 100,
      topPercent: 0,
    });
  });

  it('keeps normal damage white and critical damage yellow', () => {
    expect(presentDamageNumberLabel(event())).toMatchObject({ text: '13', color: '#ffffff', fontScale: 1 });
    expect(presentDamageNumberLabel(event({ critical: true }))).toMatchObject({ text: '13', color: '#ffe15b', fontScale: 1.22 });
  });

  it('uses distinct readable labels for armor and dodge outcomes', () => {
    expect(presentDamageNumberLabel(event({ kind: 'armorBlock', amount: 8 }))).toMatchObject({
      text: 'ARMOR', color: '#ffd06a',
    });
    expect(presentDamageNumberLabel(event({ kind: 'dodge' }))).toMatchObject({ text: 'DODGE' });
  });

  it('copies transient events into a bounded overlay and clears them when disabled', () => {
    const surface = document.createElement('div');
    const canvas = document.createElement('canvas');
    surface.appendChild(canvas);
    document.body.appendChild(surface);
    const presentation = createDamageNumberPresentation(canvas, 190, 2);

    presentation.setEvents([event(), event()]);
    presentation.update(20, 0, 0, 1);
    const numbers = [...surface.querySelectorAll<HTMLSpanElement>('.damage-number')];
    expect(numbers).toHaveLength(2);
    expect(numbers.filter((number) => number.style.display === 'block')).toHaveLength(1);
    expect(numbers.find((number) => number.style.display === 'block')?.textContent).toBe('13');

    presentation.setEnabled(false);
    expect(numbers.every((number) => number.style.display === 'none')).toBe(true);
    presentation.setEnabled(true);
    presentation.update(21, 0, 0, 1);
    expect(numbers.every((number) => number.style.display === 'none')).toBe(true);
    presentation.dispose();
    expect(surface.querySelector('.damage-number-overlay')).toBeNull();
  });

  it('admits optional dense-hit labels at a flash-safe deterministic cadence and eases them from true zero', () => {
    const surface = document.createElement('div');
    const canvas = document.createElement('canvas');
    surface.appendChild(canvas);
    document.body.appendChild(surface);
    const presentation = createDamageNumberPresentation(canvas, 190, 8);

    presentation.setEvents([
      event({ tick: 40, targetId: 'a' }),
      event({ tick: 40, targetId: 'b' }),
      event({ tick: 40 + DAMAGE_NUMBER_NORMAL_MIN_INTERVAL_TICKS, targetId: 'c' }),
      event({ tick: 40 + DAMAGE_NUMBER_CRITICAL_MIN_INTERVAL_TICKS, targetId: 'crit-a', critical: true }),
      event({ tick: 40 + DAMAGE_NUMBER_CRITICAL_MIN_INTERVAL_TICKS, targetId: 'crit-b', critical: true }),
    ]);
    presentation.update(40, 0, 0, 1);
    const labels = [...surface.querySelectorAll<HTMLSpanElement>('.damage-number')]
      .filter((label) => label.style.display === 'block');
    expect(labels).toHaveLength(1);
    expect(Number(labels[0]!.style.opacity)).toBe(0);

    presentation.update(43, 0, 0, 1);
    expect(Number(labels[0]!.style.opacity)).toBeGreaterThan(0);
  });
});
