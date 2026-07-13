import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('browser viewport accessibility contract', () => {
  it('keeps browser zoom available and opts into safe-area layout', () => {
    expect(indexHtml).toContain('width=device-width, initial-scale=1, viewport-fit=cover');
    expect(indexHtml).not.toContain('user-scalable=no');
    expect(indexHtml).not.toContain('maximum-scale=1');
    expect(indexHtml).toContain('env(safe-area-inset-top, 0px)');
    expect(indexHtml).toContain('env(safe-area-inset-right, 0px)');
    expect(indexHtml).toContain('env(safe-area-inset-bottom, 0px)');
    expect(indexHtml).toContain('env(safe-area-inset-left, 0px)');
  });

  it('keeps the prep dialog readable when zoom or a short viewport enlarges content', () => {
    expect(indexHtml).toContain('max-height: calc(100dvh - var(--safe-area-top) - var(--safe-area-bottom) - 32px)');
    expect(indexHtml).toContain('overflow-y: auto;');
  });
});
