/**
 * AGENT C — OWNED.
 *
 * Reusable command buffer with zero steady-state allocation.
 *
 * Implement a class that satisfies CommandBuffer. Pre-allocate `capacity`
 * Command structs at construction and reuse them across resets. `acquire()`
 * returns the next free struct (already zeroed to BLANK_COMMAND values) for the
 * caller to fill in place, advancing `length`. When full, `acquire()` returns
 * null and increments `overflowCount` (documented overflow policy: drop-newest,
 * count-dropped). `reset()` sets length and overflowCount to 0 WITHOUT
 * reallocating. `at(i)` returns the live struct at index i in [0, length).
 *
 * Zeroing on acquire must reset every field to its BLANK_COMMAND value so stale
 * data never leaks between emits. Do this by copying BLANK_COMMAND fields, not
 * by allocating a new object.
 */

import type { Command, CommandBuffer, CommandKind } from './contracts.js';
import { BLANK_COMMAND, COMMAND_KINDS } from './contracts.js';

/** Create a fresh Command struct initialized to BLANK_COMMAND values. */
function makeCommand(): Command {
  return {
    kind: BLANK_COMMAND.kind,
    sourceId: BLANK_COMMAND.sourceId,
    tick: BLANK_COMMAND.tick,
    targeting: BLANK_COMMAND.targeting,
    originX: BLANK_COMMAND.originX,
    originY: BLANK_COMMAND.originY,
    dirX: BLANK_COMMAND.dirX,
    dirY: BLANK_COMMAND.dirY,
    count: BLANK_COMMAND.count,
    damage: BLANK_COMMAND.damage,
    speed: BLANK_COMMAND.speed,
    radius: BLANK_COMMAND.radius,
    strength: BLANK_COMMAND.strength,
    durationTicks: BLANK_COMMAND.durationTicks,
    arc: BLANK_COMMAND.arc,
    facing: BLANK_COMMAND.facing,
    spread: BLANK_COMMAND.spread,
    jumps: BLANK_COMMAND.jumps,
    pierce: BLANK_COMMAND.pierce,
    range: BLANK_COMMAND.range,
    amount: BLANK_COMMAND.amount,
    intervalTicks: BLANK_COMMAND.intervalTicks,
    tag: BLANK_COMMAND.tag,
  };
}

/** Copy BLANK_COMMAND fields onto `cmd` in place (no allocation). */
export function resetCommand(cmd: Command): void {
  cmd.kind = BLANK_COMMAND.kind;
  cmd.sourceId = BLANK_COMMAND.sourceId;
  cmd.tick = BLANK_COMMAND.tick;
  cmd.targeting = BLANK_COMMAND.targeting;
  cmd.originX = BLANK_COMMAND.originX;
  cmd.originY = BLANK_COMMAND.originY;
  cmd.dirX = BLANK_COMMAND.dirX;
  cmd.dirY = BLANK_COMMAND.dirY;
  cmd.count = BLANK_COMMAND.count;
  cmd.damage = BLANK_COMMAND.damage;
  cmd.speed = BLANK_COMMAND.speed;
  cmd.radius = BLANK_COMMAND.radius;
  cmd.strength = BLANK_COMMAND.strength;
  cmd.durationTicks = BLANK_COMMAND.durationTicks;
  cmd.arc = BLANK_COMMAND.arc;
  cmd.facing = BLANK_COMMAND.facing;
  cmd.spread = BLANK_COMMAND.spread;
  cmd.jumps = BLANK_COMMAND.jumps;
  cmd.pierce = BLANK_COMMAND.pierce;
  cmd.range = BLANK_COMMAND.range;
  cmd.amount = BLANK_COMMAND.amount;
  cmd.intervalTicks = BLANK_COMMAND.intervalTicks;
  cmd.tag = BLANK_COMMAND.tag;
}

class FixedCommandBuffer implements CommandBuffer {
  readonly capacity: number;
  private readonly slots: Command[];
  private _length: number;
  private _overflowCount: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('CommandBuffer capacity must be an integer >= 1');
    }
    this.capacity = capacity;
    this.slots = new Array<Command>(capacity);
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = makeCommand();
    }
    this._length = 0;
    this._overflowCount = 0;
  }

  get length(): number {
    return this._length;
  }

  get overflowCount(): number {
    return this._overflowCount;
  }

  acquire(): Command | null {
    if (this._length === this.capacity) {
      this._overflowCount++;
      return null;
    }
    const cmd = this.slots[this._length] as Command;
    resetCommand(cmd);
    this._length++;
    return cmd;
  }

  at(index: number): Command {
    return this.slots[index] as Command;
  }

  reset(): void {
    this._length = 0;
    this._overflowCount = 0;
  }

  countsByKind(): Record<CommandKind, number> {
    const counts = {} as Record<CommandKind, number>;
    for (const kind of COMMAND_KINDS) {
      counts[kind] = 0;
    }
    for (let i = 0; i < this._length; i++) {
      const cmd = this.slots[i] as Command;
      counts[cmd.kind]++;
    }
    return counts;
  }
}

/** Create a command buffer with the given fixed capacity (must be >= 1). */
export function createCommandBuffer(capacity: number): CommandBuffer {
  return new FixedCommandBuffer(capacity);
}
