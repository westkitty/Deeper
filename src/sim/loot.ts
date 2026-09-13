/**
 * DEEPER — loot entities: drops, pickup, vacuum pull, caches, salvage, relics.
 * Loot exists as world entities the rig collects; the renderer draws them.
 */

import { RESOURCES, RELICS, RELIC_STRATUM } from "./resources";
import { RNG } from "./rng";
import { mat } from "./materials";
import { stratumAtRow, type StratumId } from "../config";
import { ORE_KEYS, World } from "./world";
import type { EventBus } from "./events";

export interface LootEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  res: string;
  amount: number;
  life: number; // seconds until despawn (long)
  pulled: boolean;
}

export interface CacheEntity {
  id: number;
  x: number;
  y: number;
  kind: "cache" | "relic" | "blueprint" | "salvage" | "valve" | "core" | "lift";
  data?: string;
  used: boolean;
  hp: number; // caches crack open when drilled (salvage uses interact)
}

export class LootSim {
  world: World;
  bus: EventBus;
  loot: LootEntity[] = [];
  caches: CacheEntity[] = [];
  private nextId = 1;
  rng: RNG;
  /** Discoveries for the museum + stats. */
  relicsFound = new Set<string>();
  blueprintsFound = new Set<string>();
  geodesFound = 0;
  motherlodesFound = 0;
  salvageFound = 0;

  constructor(world: World, bus: EventBus) {
    this.world = world;
    this.bus = bus;
    this.rng = new RNG(0x10077 + world.seed);
  }

  registerCaches(points: { kind: CacheEntity["kind"]; x: number; y: number; data?: string }[]) {
    for (const p of points) {
      this.caches.push({
        id: this.nextId++, x: p.x, y: p.y, kind: p.kind, data: p.data, used: false,
        hp: p.kind === "cache" ? 60 : 1,
      });
    }
  }

  drop(res: string, amount: number, x: number, y: number, scatter = 1) {
    const n = Math.min(6, Math.ceil(amount / 2));
    const per = Math.max(1, Math.round(amount / n));
    for (let i = 0; i < n; i++) {
      this.loot.push({
        id: this.nextId++,
        x: x + 0.5 + this.rng.range(-0.3, 0.3),
        y: y + 0.5,
        vx: this.rng.range(-2.4, 2.4) * scatter,
        vy: this.rng.range(-4.5, -1.2) * scatter,
        res,
        amount: per,
        life: 240,
        pulled: false,
      });
    }
  }

  /** Break-event hook: turn terrain into loot. */
  onBreak(x: number, y: number, tileId: number) {
    const w = this.world;
    const d = mat(tileId);
    const st = stratumAtRow(y);
    // ore overlay veins
    const oi = w.ore[x + y * w.w];
    if (oi > 0) {
      const res = ORE_KEYS[oi - 1];
      this.drop(res, 2 + this.rng.int(0, 3), x, y);
      w.ore[x + y * w.w] = 0;
    }
    // material drops
    if (d.drops) {
      for (const dropDef of d.drops) {
        const n = dropDef.min + this.rng.int(0, dropDef.max - dropDef.min + 1);
        if (n > 0) this.drop(dropDef.res, n, x, y);
      }
    }
    // stratum spice: rare finds while mining
    if (this.rng.chance(0.006)) {
      this.dropRare(st, x, y);
    }
  }

  /** Rare cache maps: point at the nearest undiscovered landmark (consumed on pickup). */
  cacheMaps: { x: number; y: number; targetX: number; targetY: number }[] = [];

  dropCacheMap(x: number, y: number, landmarks: { x: number; y: number; w: number; h: number; discovered: boolean }[]) {
    let best: { x: number; y: number; w: number; h: number } | null = null;
    let bd = 1e9;
    for (const l of landmarks) {
      if (l.discovered) continue;
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) return;
    this.cacheMaps.push({ x, y, targetX: (best as { x: number }).x, targetY: (best as { y: number }).y });
  }

  dropRare(st: StratumId, x: number, y: number) {
    const roll = this.rng.next();
    if (roll < 0.12) {
      // cache map: rare navigational find (needs landmark list; GameSim backfills target)
      this.cacheMaps.push({ x, y, targetX: x, targetY: y + 40 });
      return;
    }
    if (roll < 0.4) {
      // relic matching stratum
      const pool = RELICS.filter((r) => RELIC_STRATUM[r.key] === stratumTier(st));
      const relic = this.rng.pick(pool.length ? pool : RELICS);
      if (!this.relicsFound.has(relic.key)) {
        this.caches.push({ id: this.nextId++, x, y, kind: "relic", data: relic.key, used: false, hp: 1 });
        this.bus.emit({ type: "geode", x, y }); // reuse discovery ping
      }
    } else {
      const res = this.rng.pick(["silver", "gold", "tungsten"]);
      this.drop(res, 3 + this.rng.int(0, 4), x, y);
    }
  }

  /** Geode interior: concentrated loot burst when the shell breaks. */
  onGeodeBreak(x: number, y: number, st: StratumId) {
    this.geodesFound++;
    const res = ({ rootbed: "amber", oldworks: "silver", buriedmile: "gold", drownedfault: "brinepearl", redfault: "obsshard", glasschoir: "voidgem", enginedeep: "gold", surface: "copper" } as Record<StratumId, string>)[st];
    this.drop(res, 8 + this.rng.int(0, 8), x, y);
    if (this.rng.chance(0.35)) {
      const pool = RELICS.filter((r) => RELIC_STRATUM[r.key] === stratumTier(st));
      if (pool.length) {
        this.caches.push({ id: this.nextId++, x, y, kind: "relic", data: this.rng.pick(pool).key, used: false, hp: 1 });
      }
    }
    this.bus.emit({ type: "geode", x, y });
  }

  onMotherlodeDiscovered(x: number, y: number, st: StratumId) {
    this.motherlodesFound++;
    this.bus.emit({ type: "motherlode", x, y });
    void st;
  }

  physics(dt: number, rig: { x: number; y: number; vacuumRadius: number }, onPickup: (l: LootEntity) => boolean) {
    const w = this.world;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.life -= dt;
      const dx = rig.x - l.x;
      const dy = rig.y - l.y;
      const dist = Math.hypot(dx, dy);
      if (dist < rig.vacuumRadius) {
        const pull = 26 * (1 - dist / rig.vacuumRadius) + 4;
        l.vx += (dx / (dist || 1)) * pull * dt;
        l.vy += (dy / (dist || 1)) * pull * dt;
        l.pulled = true;
      }
      l.vy += 30 * dt;
      l.vx *= 1 - Math.min(1, 2.2 * dt);
      const steps = Math.max(1, Math.ceil(Math.abs(l.vy * dt) * 2));
      for (let s = 0; s < steps; s++) {
        const nx = l.x + (l.vx * dt) / steps;
        const ny = l.y + (l.vy * dt) / steps;
        if (w.solid(Math.floor(nx), Math.floor(ny + 0.35))) {
          l.vy = l.vy < 0 ? l.vy : -l.vy * 0.3;
          l.vx *= 0.6;
        } else {
          l.x = nx;
          l.y = ny;
        }
        if (w.solid(Math.floor(l.x + Math.sign(l.vx) * 0.3), Math.floor(l.y))) {
          l.vx = -l.vx * 0.4;
        }
      }
      if (l.life <= 0) {
        this.loot.splice(i, 1);
        continue;
      }
      if (dist < 2.4) {
        if (onPickup(l)) this.loot.splice(i, 1);
      }
    }
  }
}

function stratumTier(st: StratumId): number {
  return ["surface", "rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"].indexOf(st);
}
