/**
 * Canonical state hashing: FNV-1a 64-bit over a caller-ordered byte stream.
 * The writer imposes no ordering itself — callers (the simulation module)
 * decide field order, and that order is what makes the hash meaningful for
 * determinism checks.
 *
 * Runs once per full-state hash (not per-entity in the hot loop), so BigInt
 * arithmetic is an acceptable cost here.
 */
import type { HashWriter } from './types.js';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

const textEncoder = new TextEncoder();

class Fnv1aHashWriter implements HashWriter {
  private hash: bigint = FNV_OFFSET_BASIS;
  private spent = false;

  // Shared scratch buffers, allocated once per writer, used to reinterpret
  // float bit patterns as integers (so e.g. +0 and -0 hash differently).
  private readonly f32Buf = new ArrayBuffer(4);
  private readonly f32Float = new Float32Array(this.f32Buf);
  private readonly f32Bits = new Uint32Array(this.f32Buf);

  private readonly f64Buf = new ArrayBuffer(8);
  private readonly f64Float = new Float64Array(this.f64Buf);
  private readonly f64Bits = new Uint32Array(this.f64Buf);

  private assertNotSpent(): void {
    if (this.spent) {
      throw new Error('HashWriter: writer already spent (digestHex already called)');
    }
  }

  private mixByte(byte: number): void {
    this.hash = ((this.hash ^ BigInt(byte & 0xff)) * FNV_PRIME) & MASK64;
  }

  private mixU32(v: number): void {
    this.mixByte(v & 0xff);
    this.mixByte((v >>> 8) & 0xff);
    this.mixByte((v >>> 16) & 0xff);
    this.mixByte((v >>> 24) & 0xff);
  }

  u8(v: number): void {
    this.assertNotSpent();
    this.mixByte(v & 0xff);
  }

  u16(v: number): void {
    this.assertNotSpent();
    this.mixByte(v & 0xff);
    this.mixByte((v >>> 8) & 0xff);
  }

  u32(v: number): void {
    this.assertNotSpent();
    this.mixU32(v);
  }

  i32(v: number): void {
    this.assertNotSpent();
    // Reinterpreted as its raw 32-bit pattern; the >>> shifts in mixU32
    // already treat v as an unsigned bit pattern regardless of sign.
    this.mixU32(v);
  }

  f32(v: number): void {
    this.assertNotSpent();
    this.f32Float[0] = v;
    this.mixU32(this.f32Bits[0]!);
  }

  f64(v: number): void {
    this.assertNotSpent();
    this.f64Float[0] = v;
    this.mixU32(this.f64Bits[0]!);
    this.mixU32(this.f64Bits[1]!);
  }

  str(s: string): void {
    this.assertNotSpent();
    const bytes = textEncoder.encode(s);
    this.mixU32(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      this.mixByte(bytes[i]!);
    }
  }

  digestHex(): string {
    this.assertNotSpent();
    this.spent = true;
    return this.hash.toString(16).padStart(16, '0');
  }
}

export function createHashWriter(): HashWriter {
  return new Fnv1aHashWriter();
}
