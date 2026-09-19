/**
 * DEEPER — persistent world aftermath.
 * Tracks permanent environmental consequences beyond simple tile deletion:
 * drained/flooded chambers, cooled magma, burned gas/oil, collapsed granular,
 * pressure releases, crystal fracture/stabilization, geological scars.
 *
 * Deterministic, bounded (max world size), survives save/load, locality-inspected.
 * Does NOT simulate entire world each frame; only records events from env/rig.
 */

export type AftermathKind =
  | "drained"
  | "flooded"
  | "cooledMagma"
  | "burnedGas"
  | "burnedOil"
  | "collapsed"
  | "pressureRelease"
  | "crystalFracture"
  | "crystalStabilized"
  | "mawScar"
  | "thermalScar"
  | "seismicScar";

export interface AftermathCell {
  x: number;
  y: number;
  kind: AftermathKind;
  tick: number; // when it happened
  tier?: number; // tool tier that caused it
}

export class AftermathTracker {
  cells: AftermathCell[] = [];
  private index = new Map<string, number>(); // key -> position in cells array
  private kindCounts = new Map<AftermathKind, number>();
  // bounded: cap at 4096 cells (world is 138k, but aftermath is rarer)
  private cap = 4096;

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  record(x: number, y: number, kind: AftermathKind, tick: number, tier?: number) {
    const k = this.key(x, y);
    const existing = this.index.get(k);
    if (existing !== undefined) {
      // update if new kind is more significant or same kind newer
      const cur = this.cells[existing];
      // priority: mawScar > thermalScar > seismicScar > cooledMagma > others
      const priority: Record<AftermathKind, number> = {
        drained: 1,
        flooded: 1,
        cooledMagma: 3,
        burnedGas: 2,
        burnedOil: 2,
        collapsed: 2,
        pressureRelease: 2,
        crystalFracture: 3,
        crystalStabilized: 2,
        mawScar: 10,
        thermalScar: 6,
        seismicScar: 5,
      };
      if ((priority[kind] ?? 0) >= (priority[cur.kind] ?? 0)) {
        // decrement old count
        this.kindCounts.set(cur.kind, (this.kindCounts.get(cur.kind) ?? 1) - 1);
        cur.kind = kind;
        cur.tick = tick;
        if (tier !== undefined) cur.tier = tier;
        this.kindCounts.set(kind, (this.kindCounts.get(kind) ?? 0) + 1);
      }
      return;
    }
    if (this.cells.length >= this.cap) {
      // evict oldest non-maw scar (bounded)
      let evictIdx = -1;
      for (let i = 0; i < this.cells.length; i++) {
        if (this.cells[i].kind !== "mawScar") {
          evictIdx = i;
          break;
        }
      }
      if (evictIdx === -1) evictIdx = 0;
      const evicted = this.cells[evictIdx];
      this.index.delete(this.key(evicted.x, evicted.y));
      this.kindCounts.set(evicted.kind, (this.kindCounts.get(evicted.kind) ?? 1) - 1);
      this.cells[evictIdx] = { x, y, kind, tick, tier };
      this.index.set(k, evictIdx);
      this.kindCounts.set(kind, (this.kindCounts.get(kind) ?? 0) + 1);
      return;
    }
    this.cells.push({ x, y, kind, tick, tier });
    this.index.set(k, this.cells.length - 1);
    this.kindCounts.set(kind, (this.kindCounts.get(kind) ?? 0) + 1);
  }

  has(x: number, y: number): boolean {
    return this.index.has(this.key(x, y));
  }

  get(x: number, y: number): AftermathCell | undefined {
    const idx = this.index.get(this.key(x, y));
    return idx !== undefined ? this.cells[idx] : undefined;
  }

  count(kind?: AftermathKind): number {
    if (!kind) return this.cells.length;
    return this.kindCounts.get(kind) ?? 0;
  }

  /** Cells within radius for map inspection. */
  nearby(x: number, y: number, radius: number): AftermathCell[] {
    const out: AftermathCell[] = [];
    const r2 = radius * radius;
    for (const c of this.cells) {
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy <= r2) out.push(c);
    }
    return out;
  }

  serialize(): AftermathCell[] {
    return this.cells.slice();
  }

  load(list: AftermathCell[] | undefined) {
    this.cells = [];
    this.index.clear();
    this.kindCounts.clear();
    if (!list) return;
    for (const c of list) {
      this.record(c.x, c.y, c.kind, c.tick, c.tier);
    }
  }

  get entries(): AftermathCell[] { return this.cells; }

  /** For diagnostics overlay. */
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.kindCounts) {
      if (v > 0) out[k] = v;
    }
    out.total = this.cells.length;
    return out;
  }
}
