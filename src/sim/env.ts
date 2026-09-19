/**
 * DEEPER — bounded cellular environment simulation.
 * Water / magma / oil flow, gas diffusion + ignition, granular fall,
 * thermal-shock steam fractures, explosions and crystal resonance.
 * Deterministic given the same world state, active box and tick order.
 * Only cells inside the active box are simulated each tick.
 * v1.2: compositional hazard interactions — water cools magma→steam (dangerous),
 * fire ignites gas/oil, explosions destabilize granular, pressure pockets release force,
 * crystal resonance propagates through compatible crystal, coolant mitigates thermal risks.
 * Persistent aftermath recorded via onAftermath hook.
 */

import { WORLD_H, WORLD_W } from "../config";
import { M, mat } from "./materials";
import { RNG } from "./rng";
import { LIQ_MAGMA, LIQ_NONE, LIQ_OIL, LIQ_WATER, World } from "./world";
import { absorbCheck } from "./worldgen";
import type { EventBus } from "./events";

export interface EnvOptions {
  /** Max liquid cell transitions per tick (performance bound). */
  liquidBudget?: number;
  /** Max milliseconds per env step (perf budget; defers remainder). */
  msBudget?: number;
}

export class EnvSim {
  world: World;
  bus: EventBus;
  /** Active simulation box (bounds of active chunks). */
  box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private rng: RNG;
  private liquidBudget: number;
  private msBudget: number;
  /** Fires: position + life. Cell-free list. */
  fires: { x: number; y: number; life: number }[] = [];
  /** Resonance fractures staged over time for the visible cascade. */
  pendingFractures: { x: number; y: number; delay: number }[] = [];
  /** Steam transient: dangerous hot steam cells that hurt rig briefly */
  steamCells: { x: number; y: number; life: number }[] = [];
  stats = { steam: 0, explosions: 0, resonated: 0, drained: 0, cooled: 0, burnedGas: 0, burnedOil: 0, collapsed: 0, pressureReleases: 0 };
  /** Perf metrics for diagnostics overlay. */
  metrics = { lastMs: 0, overBudgetTicks: 0, spills: 0, preheated: 0 };
  /** Aftermath hook wired by GameSim */
  onAftermath?: (x: number, y: number, kind: string, tier?: number) => void;

  constructor(world: World, bus: EventBus, opts: EnvOptions = {}) {
    this.world = world;
    this.bus = bus;
    this.rng = new RNG(0x5eed + world.seed);
    this.liquidBudget = opts.liquidBudget ?? 2600;
    this.msBudget = opts.msBudget ?? 4;
  }

  /** Water level at a cell (0 if none). */
  waterAt(x: number, y: number): number {
    if (!this.world.inBounds(x, y)) return 0;
    const i = x + y * this.world.w;
    return this.world.liquid[i] === LIQ_WATER ? this.world.liqLevel[i] : 0;
  }
  liquidAt(x: number, y: number): number {
    if (!this.world.inBounds(x, y)) return 0;
    return this.world.liquid[x + y * this.world.w];
  }

  step(tick: number) {
    const t0 = performance.now();
    const w = this.world;
    if (tick % 30 === 0) this.stepPreheat();
    // fires
    for (let f = this.fires.length - 1; f >= 0; f--) {
      const fire = this.fires[f];
      fire.life -= 1;
      const i = fire.x + fire.y * w.w;
      if (w.inBounds(fire.x, fire.y)) {
        // ignite gas — compositional: fire + gas = explosion
        if (w.gas[i] >= 3) {
          this.explode(fire.x, fire.y, 3.2, 90);
          w.gas[i] = 0;
          this.stats.burnedGas++;
          this.onAftermath?.(fire.x, fire.y, "burnedGas");
          this.bus.emit({ type: "hazardWarn", kind: "gas_ignite", x: fire.x, y: fire.y, severity: 2 });
        }
        // burn flammable terrain
        const t = w.tiles[i];
        const d = mat(t);
        if (d.flammable && this.rng.chance(0.12)) {
          w.set(fire.x, fire.y, M.AIR);
          this.breakTerrain(fire.x, fire.y, t, false);
          fire.life -= 20;
          this.onAftermath?.(fire.x, fire.y, "burnedOil");
        }
        // spread to adjacent flammables / oil — compositional: oil fire spreads
        if (this.rng.chance(0.08)) {
          const dx = this.rng.int(-1, 2);
          const dy = this.rng.int(-1, 2);
          const nx = fire.x + dx;
          const ny = fire.y + dy;
          const j = nx + ny * w.w;
          if (w.inBounds(nx, ny)) {
            const matJ = mat(w.tiles[j]);
            if (matJ.flammable || w.liquid[j] === LIQ_OIL) {
              this.ignite(nx, ny);
              if (w.liquid[j] === LIQ_OIL) {
                this.stats.burnedOil++;
                this.onAftermath?.(nx, ny, "burnedOil");
                // oil fire creates more fire spread
                if (this.rng.chance(0.3)) {
                  this.explode(nx, ny, 2.5, 70);
                }
              }
            }
            // gas adjacent also ignites
            if (w.gas[j] >= 2 && this.rng.chance(0.4)) {
              this.explode(nx, ny, 3.0, 80);
              w.gas[j] = 0;
              this.stats.burnedGas++;
              this.onAftermath?.(nx, ny, "burnedGas");
            }
          }
        }
      }
      if (fire.life <= 0) this.fires.splice(f, 1);
    }
    // steam transient decay
    for (let s = this.steamCells.length - 1; s >= 0; s--) {
      this.steamCells[s].life -= 1;
      if (this.steamCells[s].life <= 0) this.steamCells.splice(s, 1);
    }
    // staged resonance fractures
    for (let k = this.pendingFractures.length - 1; k >= 0; k--) {
      const f = this.pendingFractures[k];
      f.delay -= 1;
      if (f.delay <= 0) {
        this.pendingFractures.splice(k, 1);
        const idx = f.x + f.y * w.w;
        const t = w.tiles[idx];
        if (t !== M.AIR && t !== M.BEDROCK) {
          w.set(f.x, f.y, M.AIR);
          this.breakTerrain(f.x, f.y, t, true);
          this.stats.resonated++;
          if (mat(t).resonant || mat(t).conductive) {
            this.onAftermath?.(f.x, f.y, "crystalFracture");
          }
        }
      }
    }
    if (tick % 2 === 0) this.stepLiquids(tick);
    if (tick % 3 === 0) this.stepGas(tick);
    if (tick % 2 === 1) this.stepGranular();
    const ms = performance.now() - t0;
    this.metrics.lastMs = ms;
    if (ms > this.msBudget) this.metrics.overBudgetTicks++;
  }

  /** Magma pre-heat: adjacent dense stone takes small pre-damage (softens ~10%). Coolant mitigates. */
  private stepPreheat() {
    const w = this.world;
    const { x0, y0, x1, y1 } = this.box;
    let n = 0;
    for (let y = y0; y <= y1 && n < 40; y += 2) {
      for (let x = x0; x <= x1 && n < 40; x += 2) {
        const i = x + y * w.w;
        if (w.liquid[i] !== LIQ_MAGMA) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (!w.inBounds(nx, ny)) continue;
          const ni = nx + ny * w.w;
          const t = w.tiles[ni];
          if (t === M.AIR || t === M.BEDROCK) continue;
          const d = mat(t);
          if (d.family !== "dense" && d.family !== "brittle") continue;
          if (w.damage[ni] < d.hp * 0.1) {
            w.damage[ni] = Math.min(Math.floor(d.hp * 0.1), w.damage[ni] + 2);
            n++;
            this.metrics.preheated++;
          }
        }
      }
    }
  }

  /** Water pressure push on an entity (rig/loot): returns [pushX, pushY]. */
  pressurePush(x: number, y: number): [number, number] {
    const w = this.world;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (!w.inBounds(cx, cy)) return [0, 0];
    const i = cx + cy * w.w;
    if (w.liquid[i] !== LIQ_WATER || w.liqLevel[i] < 5) return [0, 0];
    let bx = 0;
    let by = 1;
    let best = w.liqLevel[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!w.inBounds(nx, ny)) continue;
      const ni = nx + ny * w.w;
      const lv = w.liquid[ni] === LIQ_WATER ? w.liqLevel[ni] : 0;
      if (lv < best) { best = lv; bx = dx; by = dy; }
    }
    const force = 14 * (w.liqLevel[i] / 8);
    return [bx * force, by * force];
  }

  /** Dangerous steam check: is rig near hot steam? */
  steamHazardAt(x: number, y: number, radius = 2.5): boolean {
    for (const s of this.steamCells) {
      if (Math.hypot(s.x - x, s.y - y) <= radius) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  private stepLiquids(tick: number) {
    const w = this.world;
    const { x0, y0, x1, y1 } = this.box;
    let budget = this.liquidBudget;
    for (let y = y0; y <= y1 && budget > 0; y++) {
      for (let x = x0; x <= x1 && budget > 0; x++) {
        const i = x + y * w.w;
        const liq = w.liquid[i];
        if (liq === LIQ_NONE) continue;
        budget--;
        if (absorbCheck(x, y)) {
          if (liq === LIQ_WATER) {
            this.onAftermath?.(x, y, "drained");
          }
          w.liquid[i] = LIQ_NONE;
          w.liqLevel[i] = 0;
          w.liqSrc[i] = 0;
          this.stats.drained++;
          this.bus.emit({ type: "drain", x, y });
          continue;
        }
        const isMagma = liq === LIQ_MAGMA;
        const isOil = liq === LIQ_OIL;
        if (isMagma && tick % 3 !== 0) continue;
        if (isOil && tick % 2 !== 0) continue;
        let level = w.liqLevel[i];
        if (w.liqSrc[i] && tick % 30 === 0 && level < 8) {
          level = 8;
          w.liqLevel[i] = 8;
        }
        if (level <= 0) {
          w.liquid[i] = LIQ_NONE;
          continue;
        }
        const below = i + w.w;
        const canEnter = (j: number, yy: number) => {
          if (yy >= WORLD_H) return false;
          if (w.tiles[j] !== M.AIR) return false;
          if (absorbCheck(j % w.w, (j / w.w) | 0)) return true;
          return w.liquid[j] === LIQ_NONE || w.liquid[j] === liq;
        };
        // magma + water interaction → steam + thermal fracture (compositional hazard)
        if (isMagma) {
          const nb = [i - 1, i + 1, i - w.w, below];
          for (const j of nb) {
            if (j < 0 || j >= w.tiles.length) continue;
            if (w.liquid[j] === LIQ_WATER) {
              w.liqLevel[j] = Math.max(0, w.liqLevel[j] - 2);
              if (w.liqLevel[j] === 0 && !w.liqSrc[j]) w.liquid[j] = LIQ_NONE;
              w.liqLevel[i] = Math.max(1, level - 1);
              level = w.liqLevel[i];
              const sx = j % w.w;
              const sy = (j / w.w) | 0;
              this.bus.emit({ type: "steam", x: sx, y: sy });
              this.steamCells.push({ x: sx, y: sy, life: 90 });
              this.stats.steam++;
              this.bus.emit({ type: "hazardWarn", kind: "steam", x: sx, y: sy, severity: 2 });
              // thermal shock fractures brittle neighbours
              if (this.rng.chance(0.4)) {
                const fx = sx + this.rng.int(-1, 2);
                const fy = sy + this.rng.int(-1, 2);
                if (w.inBounds(fx, fy)) {
                  const t = w.tiles[fx + fy * w.w];
                  if (t !== M.AIR && t !== M.BEDROCK && mat(t).family === "brittle") {
                    w.addDamage(fx, fy, 120);
                    if (w.damage[fx + fy * w.w] >= mat(t).hp) {
                      w.set(fx, fy, M.AIR);
                      this.breakTerrain(fx, fy, t, false);
                      this.onAftermath?.(fx, fy, "thermalScar");
                    }
                  }
                }
              }
            } else if (w.gas[j] >= 3) {
              // magma ignites gas
              this.explode(j % w.w, (j / w.w) | 0, 3.2, 90);
              w.gas[j] = 0;
              this.stats.burnedGas++;
              this.onAftermath?.(j % w.w, (j / w.w) | 0, "burnedGas");
              this.bus.emit({ type: "hazardWarn", kind: "gas_ignite", x: j % w.w, y: (j / w.w) | 0, severity: 3 });
            } else if (w.liquid[j] === LIQ_OIL) {
              // magma ignites oil
              this.ignite(j % w.w, (j / w.w) | 0);
              this.stats.burnedOil++;
              this.onAftermath?.(j % w.w, (j / w.w) | 0, "burnedOil");
            }
          }
          // magma cools to stone next to plenty of water — persistent aftermath: cooled magma region
          if (w.liquid[below] === LIQ_WATER && this.rng.chance(0.02)) {
            w.liquid[i] = LIQ_NONE;
            w.liqLevel[i] = 0;
            w.liqSrc[i] = 0;
            w.set(x, y, M.BASALT);
            this.stats.cooled++;
            this.onAftermath?.(x, y, "cooledMagma");
            this.bus.emit({ type: "aftermath", x, y, kind: "cooledMagma" });
            continue;
          }
        }
        // oil + fire interaction already handled in fire loop, but also oil near magma ignites
        if (isOil) {
          const nb = [i - 1, i + 1, i - w.w, below];
          for (const j of nb) {
            if (j < 0 || j >= w.tiles.length) continue;
            if (w.liquid[j] === LIQ_MAGMA || this.fires.some((f) => f.x === (j % w.w) && f.y === ((j / w.w) | 0))) {
              this.ignite(x, y);
              break;
            }
          }
        }
        // flow down
        if (level > 1 && canEnter(below, y + 1)) {
          const space = 8 - (w.liquid[below] === liq ? w.liqLevel[below] : 0);
          const move = Math.min(level - (isMagma ? 3 : 1), space);
          if (move > 0) {
            if (w.liquid[below] === LIQ_NONE) w.liquid[below] = liq;
            w.liqLevel[below] += move;
            level -= move;
            w.liqLevel[i] = level;
            if (w.liqSrc[i]) w.liqLevel[i] = Math.max(w.liqLevel[i], 6);
            w.dirtyChunks.add(w.chunkOf(x, y + 1));
            if (liq === LIQ_WATER && !isMagma) {
              this.onAftermath?.(x, y + 1, "flooded");
            }
            continue;
          }
        }
        // spread sideways
        const dirFirst = (x + y) & 1;
        for (const dir of dirFirst ? [1, -1] : [-1, 1]) {
          const j = i + dir;
          const nx = x + dir;
          if (nx < 1 || nx >= WORLD_W - 1) continue;
          if (w.tiles[j] === M.AIR && (w.liquid[j] === LIQ_NONE || w.liquid[j] === liq)) {
            const nl = w.liqLevel[j];
            if (nl < level - (isMagma ? 2 : 1)) {
              const move = 1;
              if (w.liquid[j] === LIQ_NONE) w.liquid[j] = liq;
              w.liqLevel[j] += move;
              level -= move;
              w.liqLevel[i] = level;
              w.dirtyChunks.add(w.chunkOf(nx, y));
              if (liq === LIQ_WATER) this.onAftermath?.(nx, y, "flooded");
              break;
            }
          }
        }
        if (level <= 0) {
          if (!w.liqSrc[i]) {
            w.liquid[i] = LIQ_NONE;
            w.liqLevel[i] = 0;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  private stepGas(tick: number) {
    const w = this.world;
    const { x0, y0, x1, y1 } = this.box;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = x + y * w.w;
        if (w.gasSeed[i] && tick % 240 === 0 && w.tiles[i] === M.AIR && w.gas[i] < 8) {
          w.gas[i]++;
          w.dirtyChunks.add(w.chunkOf(x, y));
        }
        const g = w.gas[i];
        if (g <= 0 || g >= 8) continue;
        // pressure pocket release: high gas near open space pushes
        if (g >= 6 && w.gasSeed[i] && this.rng.chance(0.02)) {
          // release force
          this.stats.pressureReleases++;
          this.onAftermath?.(x, y, "pressureRelease");
          this.bus.emit({ type: "pressureRelease", x, y, force: g * 2 });
          this.bus.emit({ type: "hazardWarn", kind: "pressure", x, y, severity: g >= 7 ? 3 : 2 });
        }
        const dirs = [i - w.w, i + w.w, i - 1, i + 1];
        const j = dirs[(x * 3 + y * 7 + tick) & 3];
        if (j >= 0 && j < w.tiles.length && w.tiles[j] === M.AIR && w.gas[j] < g - 1) {
          w.gas[j]++;
          w.gas[i] = g - 1;
          w.dirtyChunks.add(w.chunkOf(x, y));
          w.dirtyChunks.add(w.chunkOf(j % w.w, (j / w.w) | 0));
          if (w.gasSeed[i]) {
            this.onAftermath?.(j % w.w, (j / w.w) | 0, "pressureRelease");
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  private stepGranular() {
    const w = this.world;
    const { x0, y0, x1, y1 } = this.box;
    for (let y = y1; y >= y0; y--) {
      for (let x = x0; x <= x1; x++) {
        const i = x + y * w.w;
        const t = w.tiles[i];
        if (t === M.AIR) continue;
        const d = mat(t);
        if (!d.granular) continue;
        const below = i + w.w;
        if (y + 1 >= WORLD_H) continue;
        if (w.tiles[below] === M.AIR) {
          const liq = w.liquid[below];
          w.tiles[below] = t;
          w.ore[below] = w.ore[i];
          w.tiles[i] = M.AIR;
          w.ore[i] = 0;
          w.damage[i] = 0;
          w.damage[below] = 0;
          if (liq !== LIQ_NONE && !w.liqSrc[below]) {
            w.liquid[i] = liq;
            w.liqLevel[i] = w.liqLevel[below];
            w.liquid[below] = LIQ_NONE;
            w.liqLevel[below] = 0;
          }
          w.dirtyChunks.add(w.chunkOf(x, y));
          w.dirtyChunks.add(w.chunkOf(x, y + 1));
          this.stats.collapsed++;
          this.onAftermath?.(x, y, "collapsed");
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  breakTerrain(x: number, y: number, tileId: number, chain = true) {
    const w = this.world;
    w.dirtyChunks.add(w.chunkOf(x, y));
    this.bus.emit({ type: "break", x, y, mat: tileId, count: 1, chain });
  }

  ignite(x: number, y: number) {
    if (!this.world.inBounds(x, y)) return;
    const existing = this.fires.find((f) => f.x === x && f.y === y);
    if (existing) {
      existing.life = Math.max(existing.life, 90);
      return;
    }
    this.fires.push({ x, y, life: 120 });
    this.bus.emit({ type: "ignite", x, y });
  }

  /** Deterministic explosion: removes weak materials, damages stronger ones, ignites gas. Destabilizes granular. */
  explode(cx: number, cy: number, radius: number, power: number) {
    const w = this.world;
    this.stats.explosions++;
    const r = Math.ceil(radius);
    const granularToCollapse: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!w.inBounds(x, y)) continue;
        const i = x + y * w.w;
        const t = w.tiles[i];
        if (t === M.AIR || t === M.BEDROCK) {
          if (w.gas[i] >= 3) {
            w.gas[i] = 0;
            this.pendingFractures.push({ x, y, delay: 0 });
            w.set(x, y, M.AIR);
            this.explodeInto(x, y, radius * 0.8, power * 0.8);
            this.stats.burnedGas++;
            this.onAftermath?.(x, y, "burnedGas");
          }
          if (w.liquid[i] === LIQ_OIL) {
            this.ignite(x, y);
            this.stats.burnedOil++;
            this.onAftermath?.(x, y, "burnedOil");
          }
          continue;
        }
        const d = mat(t);
        const dmg = power * (1 - dist / (radius + 0.001));
        if (d.tier <= 2 || (d.granular ?? false)) {
          w.set(x, y, M.AIR);
          this.breakTerrain(x, y, t, false);
          if (d.granular) granularToCollapse.push([x, y]);
        } else if (d.tier <= 5) {
          w.addDamage(x, y, dmg);
          if (w.damage[i] >= d.hp) {
            w.set(x, y, M.AIR);
            this.breakTerrain(x, y, t, false);
          }
        }
        if (d.flammable && this.rng.chance(0.5)) {
          this.ignite(x, y);
          this.onAftermath?.(x, y, "burnedOil");
        }
        // check for granular neighbors to destabilize (compositional: explosions destabilize granular)
        if (dist <= radius * 0.7) {
          for (const [gx, gy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
            const nx = x + gx;
            const ny = y + gy;
            if (!w.inBounds(nx, ny)) continue;
            const nt = w.tiles[nx + ny * w.w];
            if (nt !== M.AIR && mat(nt).granular) {
              granularToCollapse.push([nx, ny]);
            }
          }
        }
      }
    }
    // destabilize granular after explosion
    for (const [gx, gy] of granularToCollapse) {
      if (!w.inBounds(gx, gy)) continue;
      const gi = gx + gy * w.w;
      const below = gi + w.w;
      if (w.tiles[below] === M.AIR) {
        w.tiles[below] = w.tiles[gi];
        w.ore[below] = w.ore[gi];
        w.tiles[gi] = M.AIR;
        w.ore[gi] = 0;
        w.dirtyChunks.add(w.chunkOf(gx, gy));
        w.dirtyChunks.add(w.chunkOf(gx, gy + 1));
        this.stats.collapsed++;
        this.onAftermath?.(gx, gy, "collapsed");
      }
    }
    this.bus.emit({ type: "explode", x: cx, y: cy, radius, big: radius >= 3 });
    this.onAftermath?.(cx, cy, "seismicScar");
  }

  private explodeInto(cx: number, cy: number, radius: number, power: number) {
    this.pendingFractures.push({ x: cx, y: cy, delay: 2 });
    void radius;
    void power;
  }

  /**
   * Resonance pulse: flood-fill connected resonant/conductive material and stage
   * a sequential fracture wave across it. Returns the number of cells affected.
   * Compositional: propagates through compatible crystal, can stabilize with water nearby.
   */
  resonancePulse(cx: number, cy: number, maxCells = 260, maxRadius = 26): number {
    const w = this.world;
    const start = w.tiles[cx + cy * w.w];
    const d0 = mat(start);
    if (!d0.resonant && !d0.conductive) return 0;
    const seen = new Set<number>();
    const queue: number[] = [cx + cy * w.w];
    let count = 0;
    while (queue.length > 0 && count < maxCells) {
      const i = queue.shift()!;
      if (seen.has(i)) continue;
      seen.add(i);
      const x = i % w.w;
      const y = (i / w.w) | 0;
      const t = w.tiles[i];
      const d = mat(t);
      if (t === M.AIR || t === M.BEDROCK) continue;
      if (!(d.resonant || d.conductive)) continue;
      if (Math.abs(x - cx) > maxRadius || Math.abs(y - cy) > maxRadius) continue;
      // water nearby can stabilize crystal instead of fracturing (compositional)
      let stabilized = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.inBounds(nx, ny)) continue;
        if (w.liquid[nx + ny * w.w] === LIQ_WATER && w.liqLevel[nx + ny * w.w] >= 4) {
          if (this.rng.chance(0.15)) {
            stabilized = true;
            this.onAftermath?.(x, y, "crystalStabilized");
            this.bus.emit({ type: "crystalStabilize", x, y });
            break;
          }
        }
      }
      if (!stabilized) {
        count++;
        this.pendingFractures.push({ x, y, delay: count >> 3 });
        this.onAftermath?.(x, y, "crystalFracture");
      }
      const dirs = [i - 1, i + 1, i - w.w, i + w.w];
      for (const j of dirs) {
        if (!seen.has(j) && j >= 0 && j < w.tiles.length) queue.push(j);
      }
    }
    this.bus.emit({ type: "resonance", x: cx, y: cy, cells: count });
    return count;
  }

  countLiquid(kind = LIQ_WATER): number {
    const w = this.world;
    let n = 0;
    for (let y = this.box.y0; y <= this.box.y1; y++) {
      for (let x = this.box.x0; x <= this.box.x1; x++) {
        if (w.liquid[x + y * w.w] === kind) n++;
      }
    }
    return n;
  }
  countGas(): number {
    const w = this.world;
    let n = 0;
    for (let y = this.box.y0; y <= this.box.y1; y++) {
      for (let x = this.box.x0; x <= this.box.x1; x++) {
        if (w.gas[x + y * w.w] > 0) n++;
      }
    }
    return n;
  }
}
