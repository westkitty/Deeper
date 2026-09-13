/** Deterministic PRNG utilities. mulberry32 core + value noise helpers. */

export class RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** mulberry32 — fast, deterministic, good enough for worldgen. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Integer hash — deterministic per-coordinate noise. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** 0..1 pseudo-random from coordinates + seed. */
export function rand2(x: number, y: number, seed: number): number {
  return hash2(x, y, seed) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in 0..1 with wrapX for horizontal tiling. */
export function valueNoise(x: number, y: number, seed: number, period = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wrap = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
  const x1 = wrap(x0 + 1);
  const a = rand2(wrap(x0), y0, seed);
  const b = rand2(x1, y0, seed);
  const c = rand2(wrap(x0), y0 + 1, seed);
  const d = rand2(x1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** SplitMix32 — higher-quality stream for loot/threat rolls (still deterministic). */
export class SplitMix32 {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x9e3779b9) >>> 0;
    let z = this.s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  }
  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Forked subsystem streams: worldgen/loot/threats/env never share state. */
export function forkStreams(seed: number): { world: RNG; loot: SplitMix32; threats: SplitMix32; env: RNG } {
  return {
    world: new RNG(seed ^ 0x1a2b3c),
    loot: new SplitMix32(seed ^ 0x4d5e6f),
    threats: new SplitMix32(seed ^ 0x708192),
    env: new RNG(seed ^ 0xa3b4c5),
  };
}

/** Fractal brownian motion over valueNoise. */
export function fbm(x: number, y: number, seed: number, octaves = 3, lacunarity = 2, gain = 0.5): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
