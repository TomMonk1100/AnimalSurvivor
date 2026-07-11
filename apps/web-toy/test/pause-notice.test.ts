import { describe, expect, it } from 'vitest';
import { presentPauseNotice } from '../src/presentation/pause-notice';

describe('pause notice presentation', () => {
  it('only exposes a clear resume instruction while manually paused', () => {
    expect(presentPauseNotice(false)).toBeNull();
    expect(presentPauseNotice(true)).toEqual({
      title: 'Paused',
      detail: 'Press Esc or Resume to continue.',
    });
  });
});
