/**
 * Renderer-only WebGL recovery state.
 *
 * The browser owns the actual GPU context lifecycle. This controller only
 * records the visible transition so the renderer can stop drawing while the
 * context is unavailable; it never advances, rewinds, or mutates simulation
 * state. Keeping the transition pure makes the recovery contract testable in
 * a DOM harness without manufacturing a PlayCanvas/WebGL device.
 */
export interface ContextLossController {
  readonly lost: boolean;
  handleLost(event: { preventDefault(): void }): void;
  handleRestored(): void;
}

export function createContextLossController(): ContextLossController {
  let lost = false;

  return {
    get lost(): boolean {
      return lost;
    },
    handleLost(event): void {
      // Required by the WebGL contract: without this, the browser may not
      // attempt to restore the context and the app cannot recover in place.
      event.preventDefault();
      lost = true;
    },
    handleRestored(): void {
      lost = false;
    },
  };
}
