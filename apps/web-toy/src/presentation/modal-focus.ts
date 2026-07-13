/** Small DOM-only helpers for the prep screen's modal focus contract. */

function hasHiddenAncestor(element: HTMLElement, root: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current !== null && current !== root) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return true;
    current = current.parentElement;
  }
  return false;
}

/** Returns the currently reachable controls inside a modal root in DOM order. */
export function modalFocusableElements(root: HTMLElement): readonly HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  return Object.freeze([...candidates].filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    if (hasHiddenAncestor(element, root)) return false;
    return true;
  }));
}

/** Focuses a control without moving the page, while revealing it in a modal scroll container. */
function focusAndReveal(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

export function focusModalStart(root: HTMLElement, preferred?: HTMLElement | null): void {
  const focusable = modalFocusableElements(root);
  const target = preferred !== undefined && preferred !== null && focusable.includes(preferred)
    ? preferred
    : focusable[0];
  if (target !== undefined) focusAndReveal(target);
}

/** Keeps Tab navigation inside the modal while it is visible. */
export function trapModalFocus(event: KeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== 'Tab') return false;
  const focusable = modalFocusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    return true;
  }
  const active = document.activeElement;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    focusAndReveal(last);
    return true;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    focusAndReveal(first);
    return true;
  }
  return false;
}
