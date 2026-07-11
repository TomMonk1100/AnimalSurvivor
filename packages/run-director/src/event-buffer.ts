/**
 * AGENT B — OWNED.
 *
 * Fixed-capacity event sink with deterministic overflow policy. See
 * contracts.ts `EventBuffer` (diagnostic shape) — this module is the concrete
 * mutable implementation behind that shape, plus push/drain behavior.
 *
 * Overflow policy (push() when buffer is already at capacity):
 *   1. Incoming event is NON-critical -> reject it. Return false, increment
 *      overflowDropped. The buffered contents are untouched.
 *   2. Incoming event IS critical ('victory' | 'defeat' | 'bossRequested' |
 *      'eliteRequested') -> evict the OLDEST buffered NON-critical event to
 *      make room, increment overflowDropped (for the evicted event), then
 *      store the incoming critical event. Return true.
 *   3. Last-resort (should not occur with a capacity validated against the
 *      run's critical-event volume): every buffered event is itself critical.
 *      We still must not silently drop the incoming critical event (a
 *      terminal victory/defeat is worse to lose than an older bossRequested/
 *      eliteRequested), so we evict the OLDEST critical event, increment
 *      overflowDropped, and store the incoming one. Return true.
 * In all cases capacity is never exceeded; size only ever reaches `capacity`.
 */

import type { DirectorEvent } from './contracts.js';
import type { EventKind } from './ids.js';

const CRITICAL_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  'victory',
  'defeat',
  'bossRequested',
  'eliteRequested',
]);

function isCritical(event: DirectorEvent): boolean {
  return CRITICAL_KINDS.has(event.kind);
}

export interface EventSink {
  /** Push one event. Returns true if the event is retained in the buffer. */
  push(event: DirectorEvent): boolean;
  /** Return buffered events in insertion order, then clear the buffer. */
  drain(): DirectorEvent[];
  readonly size: number;
  readonly capacity: number;
  readonly overflowDropped: number;
  readonly highWater: number;
}

class EventBufferImpl implements EventSink {
  readonly capacity: number;
  private readonly buf: DirectorEvent[] = [];
  private _overflowDropped = 0;
  private _highWater = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get size(): number {
    return this.buf.length;
  }

  get overflowDropped(): number {
    return this._overflowDropped;
  }

  get highWater(): number {
    return this._highWater;
  }

  private recordHighWater(): void {
    if (this.buf.length > this._highWater) {
      this._highWater = this.buf.length;
    }
  }

  push(event: DirectorEvent): boolean {
    if (this.buf.length < this.capacity) {
      this.buf.push(event);
      this.recordHighWater();
      return true;
    }

    // Buffer is at capacity.
    if (!isCritical(event)) {
      this._overflowDropped += 1;
      return false;
    }

    // Incoming is critical: evict the oldest non-critical entry first.
    const nonCriticalIdx = this.buf.findIndex((e) => !isCritical(e));
    if (nonCriticalIdx >= 0) {
      this.buf.splice(nonCriticalIdx, 1);
      this._overflowDropped += 1;
      this.buf.push(event);
      this.recordHighWater();
      return true;
    }

    // Last resort: buffer is entirely critical events. Evict the oldest
    // critical event so the new critical event (often a terminal) survives.
    this.buf.shift();
    this._overflowDropped += 1;
    this.buf.push(event);
    this.recordHighWater();
    return true;
  }

  drain(): DirectorEvent[] {
    const out = this.buf.slice();
    this.buf.length = 0;
    return out;
  }
}

/** Create a fixed-capacity event sink. Throws if capacity < 1. */
export function createEventBuffer(capacity: number): EventSink {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`createEventBuffer: capacity must be a positive integer, got ${capacity}`);
  }
  return new EventBufferImpl(capacity);
}
