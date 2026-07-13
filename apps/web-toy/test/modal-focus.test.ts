import { describe, expect, it } from 'vitest';
import { focusModalStart, modalFocusableElements, trapModalFocus } from '../src/presentation/modal-focus';

function modal(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <button id="first">First</button>
    <details hidden><summary>Hidden</summary><button>Hidden button</button></details>
    <button id="disabled" disabled>Disabled</button>
    <label>Input <input id="input" /></label>
    <button id="last">Last</button>
  `;
  document.body.appendChild(root);
  return root;
}

describe('prep modal focus', () => {
  it('only returns visible, enabled controls in DOM order', () => {
    const root = modal();
    expect(modalFocusableElements(root).map((element) => element.id)).toEqual(['first', 'input', 'last']);
    root.remove();
  });

  it('focuses the first reachable control', () => {
    const root = modal();
    focusModalStart(root);
    expect(document.activeElement?.id).toBe('first');
    root.remove();
  });

  it('prefers the launch control when it is reachable', () => {
    const root = modal();
    const last = root.querySelector<HTMLElement>('#last')!;
    focusModalStart(root, last);
    expect(document.activeElement).toBe(last);
    root.remove();
  });

  it('reveals the preferred control inside a scrollable modal', () => {
    const root = modal();
    const last = root.querySelector<HTMLElement>('#last')!;
    const scrollCalls: ScrollIntoViewOptions[] = [];
    last.scrollIntoView = (options?: ScrollIntoViewOptions) => {
      scrollCalls.push(options ?? {});
    };
    focusModalStart(root, last);
    expect(scrollCalls).toEqual([{ block: 'nearest', inline: 'nearest' }]);
    root.remove();
  });

  it('wraps forward and reverse Tab at the modal edges', () => {
    const root = modal();
    const first = root.querySelector<HTMLElement>('#first')!;
    const last = root.querySelector<HTMLElement>('#last')!;
    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    expect(trapModalFocus(forward, root)).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    first.focus();
    const reverse = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    expect(trapModalFocus(reverse, root)).toBe(true);
    expect(reverse.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    root.remove();
  });

  it('returns false for ordinary keys and interior Tab navigation', () => {
    const root = modal();
    const input = root.querySelector<HTMLElement>('#input')!;
    input.focus();
    expect(trapModalFocus(new KeyboardEvent('keydown', { key: 'Enter' }), root)).toBe(false);
    expect(trapModalFocus(new KeyboardEvent('keydown', { key: 'Tab' }), root)).toBe(false);
    root.remove();
  });
});
