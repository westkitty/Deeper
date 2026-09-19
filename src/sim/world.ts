/**
 * DEEPER — world grid, chunks, cell damage, liquids, gas and exploration fog.
 * Base terrain is deterministic from the seed; player modifications are stored
 * as sparse deltas for persistence. Only cells near the rig actively simulate.
 */

import { CHUNK, CHUNKS_X, CHUNKS_Y, WORLD_H, WORLD_W, stratumAtRow, type StratumId } from "../config";
import { M, mat, type MaterialDef } from "./materials";

export const LIQ_NONE = 0;
export const LIQ_WATER = 1;
export const LIQ_MAGMA = 2;
export const LIQ_OIL = 3;

export class World {
  readonly w = WORLD_W;
  readonly h = WORLD_H;
  seed: number;

  tiles: Uint8Array;
  damage: Uint16Array; // accumulated damage points (hp scale)
  ore: Uint8Array; // resource overlay index (index into ORE_KEYS + 1)
  variant: Uint8Array; // visual variant per cell
  liquid: Uint8Array; // 0 none 1 water 2 magma 3 oil
  liqLevel: Uint8Array; // 1..8
  liqSrc: Uint8Array; // 1 water source, 2 magma source
  gas: Uint8Array; // gas concentration 0..8
  gasSeed: Uint8Array; // trapped gas pocket cells (refill slowly)
  explored: Uint8Array; // seen by the player (fog of war)

  /** Chunks whose cells changed since last render flush. */
  dirtyChunks = new Set<number>();
  /** Chunk activity bookkeeping: simulated if near rig or explicitly awake. */
  activeChunks = new Set<number>();
  /** Cell indices the player/world have modified (for delta persistence). */
  edited = new Set<number>();
  /** Metrics: dirty flush stats for diagnostics overlay. */
  metrics = { dirtyFlushes: 0, cellsSet: 0, damageAdds: 0, batchCoalesced: 0 };
  /** Batched dirty-chunk queue: coalesces rapid same-chunk edits per tick. */
  private dirtyBatch = new Map<number, number>();
  private batchTick = -1;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const n = this.w * this.h;
    this.tiles = new Uint8Array(n);
    this.damage = new Uint16Array(n);
    this.ore = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.liquid = new Uint8Array(n);
    this.liqLevel = new Uint8Array(n);
    this.liqSrc = new Uint8Array(n);
    this.gas = new Uint8Array(n);
    this.gasSeed = new Uint8Array(n);
    this.explored = new Uint8Array(n);
  }

  idx(x: number, y: number): number {
    return x + y * this.w;
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  chunkOf(x: number, y: number): number {
    return ((y / CHUNK) | 0) * CHUNKS_X + ((x / CHUNK) | 0);
  }
  stratumAt(x: number, y: number): StratumId {
    return stratumAtRow(y);
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return M.BEDROCK;
    return this.tiles[x + y * this.w];
  }
  set(x: number, y: number, id: number) {
    if (!this.inBounds(x, y)) return;
    const i = x + y * this.w;
    this.tiles[i] = id;
    this.damage[i] = 0;
    this.metrics.cellsSet++;
    this.markDirty(x, y);
  }

  /** Batched dirty marking: same-chunk edits within a tick coalesce. */
  markDirty(x: number, y: number, tick = -1) {
    const c = this.chunkOf(x, y);
    if (tick >= 0) {
      if (tick !== this.batchTick) {
        this.batchTick = tick;
        this.dirtyBatch.clear();
      }
      const n = (this.dirtyBatch.get(c) ?? 0) + 1;
      this.dirtyBatch.set(c, n);
      if (n > 1) this.metrics.batchCoalesced++;
    }
    this.dirtyChunks.add(c);
  }

  /** Drain up to `budget` dirty chunks (renderer calls per frame). */
  drainDirty(budget: number): number[] {
    const out: number[] = [];
    for (const c of this.dirtyChunks) {
      out.push(c);
      if (out.length >= budget) break;
    }
    for (const c of out) this.dirtyChunks.delete(c);
    if (out.length) this.metrics.dirtyFlushes++;
    return out;
  }
  getDef(x: number, y: number): MaterialDef {
    return mat(this.get(x, y));
  }

  /** Below-sky solidity: sky rows are always air. */
  solid(x: number, y: number): boolean {
    if (y < 0) return false;
    if (!this.inBounds(x, y)) return true; // world edge blocks
    return this.tiles[x + y * this.w] !== M.AIR;
  }

  damageOf(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.damage[x + y * this.w];
  }
  addDamage(x: number, y: number, amount: number) {
    if (!this.inBounds(x, y)) return;
    const i = x + y * this.w;
    this.damage[i] = Math.min(0xffff, this.damage[i] + amount);
    this.metrics.damageAdds++;
    this.dirtyChunks.add(this.chunkOf(x, y));
  }
  damageRatio(x: number, y: number): number {
    const d = this.getDef(x, y);
    return this.damageOf(x, y) / d.hp;
  }

  markExplored(cx: number, cy: number, radius: number) {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        if (dx * dx + dy * dy <= radius * radius) {
          this.explored[x + y * this.w] = 1;
        }
      }
    }
  }

  chunkKey(cx: number, cy: number): number {
    return cy * CHUNKS_X + cx;
  }
  setActiveAround(px: number, py: number, chunkRadius: number) {
    const pcx = (px / CHUNK) | 0;
    const pcy = (py / CHUNK) | 0;
    this.activeChunks.clear();
    for (let cy = pcy - chunkRadius; cy <= pcy + chunkRadius; cy++) {
      for (let cx = pcx - chunkRadius; cx <= pcx + chunkRadius; cx++) {
        if (cx >= 0 && cy >= 0 && cx < CHUNKS_X && cy < CHUNKS_Y) {
          this.activeChunks.add(this.chunkKey(cx, cy));
        }
      }
    }
  }
  isActive(x: number, y: number): boolean {
    return this.activeChunks.has(this.chunkOf(x, y));
  }

  /** Serialize player modifications (not the deterministic base). */
  exportDeltas(): {
    tiles: [number, number][];
    damage: [number, number][];
    ore: [number, number][];
    liquid: [number, number, number, number][]; // idx, kind, level, src
    gas: [number, number][];
    explored: number[]; // RLE as [start, count] pairs
  } {
    const tiles: [number, number][] = [];
    const damage: [number, number][] = [];
    const ore: [number, number][] = [];
    for (const i of this.edited) {
      if (this.tiles[i] !== M.AIR || this.ore[i] !== 0) tiles.push([i, this.tiles[i]]);
      else tiles.push([i, M.AIR]);
      if (this.damage[i] > 0) damage.push([i, this.damage[i]]);
      if (this.ore[i] > 0) ore.push([i, this.ore[i]]);
    }
    const liquid: [number, number, number, number][] = [];
    const gas: [number, number][] = [];
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.liquid[i] !== 0) liquid.push([i, this.liquid[i], this.liqLevel[i], this.liqSrc[i]]);
      if (this.gas[i] > 0) gas.push([i, this.gas[i]]);
    }
    // Explored RLE
    const explored: number[] = [];
    let runStart = -1;
    for (let i = 0; i < this.explored.length; i++) {
      const v = this.explored[i];
      if (v && runStart < 0) runStart = i;
      else if (!v && runStart >= 0) {
        explored.push(runStart, i - runStart);
        runStart = -1;
      }
    }
    if (runStart >= 0) explored.push(runStart, this.explored.length - runStart);
    return { tiles, damage, ore, liquid, gas, explored };
  }

  importDeltas(d: {
    tiles?: [number, number][];
    damage?: [number, number][];
    ore?: [number, number][];
    liquid?: [number, number, number, number][];
    levels?: [number, number][];
    gas?: [number, number][];
    explored?: number[];
  }) {
    for (const [i, v] of d.tiles ?? []) {
      this.tiles[i] = v;
      this.edited.add(i);
      this.dirtyChunks.add(this.chunkOf(i % this.w, (i / this.w) | 0));
    }
    for (const [i, v] of d.damage ?? []) { this.damage[i] = v; this.edited.add(i); }
    for (const [i, v] of d.ore ?? []) { this.ore[i] = v; this.edited.add(i); }
    for (const entry of (d.liquid ?? []) as [number, number, number, number][]) {
      const [i, kind, level, src] = entry;
      this.liquid[i] = kind; this.liqLevel[i] = level; this.liqSrc[i] = src;
    }
    for (const [i, v] of d.gas ?? []) this.gas[i] = v;
    if (d.explored) {
      for (let k = 0; k < d.explored.length; k += 2) {
        const start = d.explored[k];
        const len = d.explored[k + 1];
        for (let i = start; i < start + len; i++) this.explored[i] = 1;
      }
    }
  }

  /** True if the liquid cell can be replaced by terrain without side effects. */
  clearLiquid(x: number, y: number) {
    if (!this.inBounds(x, y)) return;
    const i = x + y * this.w;
    if (!this.liqSrc[i]) {
      this.liquid[i] = LIQ_NONE;
      this.liqLevel[i] = 0;
      this.dirtyChunks.add(this.chunkOf(x, y));
    }
  }

  /** Compact destruction history: drop edited entries that are redundant AIR with no ore/damage. */
  compactEdited(keepRadius: number, px: number, py: number): number {
    let removed = 0;
    const r2 = keepRadius * keepRadius;
    for (const i of [...this.edited]) {
      if (this.tiles[i] !== M.AIR) continue;
      if (this.ore[i] !== 0) continue;
      if (this.damage[i] !== 0) continue;
      const x = i % this.w; const y = (i / this.w) | 0;
      const dx = x - px; const dy = y - py;
      if (dx * dx + dy * dy < r2) continue; // keep near player
      this.edited.delete(i);
      removed++;
      if (removed > 512) break; // budget per call
    }
    return removed;
  }

  /** Long-session safety: cap dirtyChunks size, drop oldest if too many. */
  capDirtyChunks(max = 64) {
    if (this.dirtyChunks.size <= max) return 0;
    let dropped = 0;
    for (const c of this.dirtyChunks) {
      if (this.dirtyChunks.size <= max) break;
      this.dirtyChunks.delete(c);
      dropped++;
    }
    return dropped;
  }
}

/** Ore overlay keys — index = world.ore value - 1. */
export const ORE_KEYS = [
  "copper", "coal", "iron", "silver", "gold", "tungsten", "quartz", "voidgem",
  "nickel", "amber", "brinepearl", "obsshard",
] as const;

export function oreIndex(res: string): number {
  const i = ORE_KEYS.indexOf(res as (typeof ORE_KEYS)[number]);
  return i < 0 ? -1 : i;
}
