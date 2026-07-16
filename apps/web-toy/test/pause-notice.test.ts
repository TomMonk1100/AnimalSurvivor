import { describe, expect, it } from 'vitest';
import { presentPauseNotice } from '../src/presentation/pause-notice';

describe('pause notice presentation', () => {
  it('only exposes a clear resume instruction while manually paused', () => {
    expect(presentPauseNotice(false)).toBeNull();
    expect(presentPauseNotice(true, [{
      id: 'porcupine-quills:bud',
      title: 'Porcupine Quills',
      stageLabel: 'Bud',
      effect: 'Automatically fires a compact quill burst at nearby enemies.',
      cadence: 'Every 1.5 seconds',
      impactCategory: 'Direct damage',
      impact: 'Direct damage: rank-one quills.',
    }])).toEqual({
      title: 'Paused',
      detail: 'Press Esc or Resume to continue.',
      actions: [
        { id: 'resume', label: 'Resume' },
        { id: 'restart', label: 'Restart run' },
        { id: 'quit', label: 'Quit to den' },
      ],
      upgrades: [{
        id: 'porcupine-quills:bud',
        title: 'Porcupine Quills',
        stageLabel: 'Bud',
        effect: 'Automatically fires a compact quill burst at nearby enemies.',
        cadence: 'Every 1.5 seconds',
        impactCategory: 'Direct damage',
        impact: 'Direct damage: rank-one quills.',
      }],
    });
  });
});
