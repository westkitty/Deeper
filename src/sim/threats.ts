/**
 * DEEPER — threats: families with different movement and environmental interaction.
 * Combat is secondary; terrain manipulation is often the answer.
 * v1.2: expanded threat variety — territorial ambusher, burrowing pursuer,
 * environment-reactive, resource/loot pressure, stationary hazard organism.
 * Balanced to original power curve: rootbed stays grubble-only (dmg5), new families
 * spawn deeper with distinct behaviors but similar damage to their stratum peers.
 */

import { TICK_DT } from "../config";
import { M } from "./materials";
import { RNG } from "./rng";
import { RESOURCES } from "./resources";
import type { World } from "./world";
import type { EventBus } from "./events";

export interface ThreatFamily {
  key: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  behavior: "walker" | "burrower" | "floater" | "jumper" | "sentry" | "ambusher" | "siphon" | "stationary" | "reactive";
  drops: { res: string; min: number; max: number }[];
  spawnsIn: string[];
  tags?: string[];
}

export const THREAT_FAMILIES: Record<string, ThreatFamily> = {
  grubble: {
    key: "grubble", name: "Grubble", hp: 22, speed: 2.2, damage: 5, behavior: "burrower",
    drops: [{ res: "copper", min: 1, max: 3 }], spawnsIn: ["rootbed"],
    tags: ["softBurrower"],
  },
  shellsnout: {
    key: "shellsnout", name: "Shellsnout", hp: 40, speed: 2.0, damage: 10, behavior: "jumper",
    drops: [{ res: "iron", min: 1, max: 3 }, { res: "coal", min: 0, max: 2 }], spawnsIn: ["oldworks"],
    tags: ["jumper"],
  },
  crawler: {
    key: "crawler", name: "Rock-shell crawler", hp: 55, speed: 3.4, damage: 12, behavior: "walker",
    drops: [{ res: "aggregate", min: 1, max: 2 }, { res: "steel", min: 0, max: 1 }], spawnsIn: ["buriedmile"],
    tags: ["armored"],
  },
  lurker: {
    key: "lurker", name: "Flood-zone lurker", hp: 48, speed: 4.6, damage: 13, behavior: "floater",
    drops: [{ res: "brinepearl", min: 0, max: 1 }, { res: "silver", min: 1, max: 2 }], spawnsIn: ["drownedfault"],
    tags: ["aquatic"],
  },
  embermite: {
    key: "embermite", name: "Heat mite", hp: 34, speed: 3.0, damage: 9, behavior: "jumper",
    drops: [{ res: "sulfur", min: 1, max: 3 }], spawnsIn: ["redfault"],
    tags: ["thermal"],
  },
  prismite: {
    key: "prismite", name: "Crystal parasite", hp: 62, speed: 3.2, damage: 14, behavior: "walker",
    drops: [{ res: "quartz", min: 1, max: 3 }], spawnsIn: ["glasschoir"],
    tags: ["crystal"],
  },
  drone: {
    key: "drone", name: "Sentry drone", hp: 80, speed: 3.8, damage: 16, behavior: "sentry",
    drops: [{ res: "composite", min: 1, max: 2 }, { res: "alloy", min: 0, max: 1 }], spawnsIn: ["enginedeep"],
    tags: ["machine"],
  },
  stalker: {
    key: "stalker", name: "Stone Stalker", hp: 44, speed: 4.0, damage: 13, behavior: "ambusher",
    drops: [{ res: "iron", min: 2, max: 4 }, { res: "silver", min: 0, max: 1 }], spawnsIn: ["oldworks", "buriedmile"],
    tags: ["territorial", "ambusher"],
  },
  mole: {
    key: "mole", name: "Deep Mole", hp: 48, speed: 2.8, damage: 11, behavior: "burrower",
    drops: [{ res: "nickel", min: 1, max: 2 }, { res: "iron", min: 1, max: 3 }], spawnsIn: ["oldworks", "buriedmile", "drownedfault"],
    tags: ["pursuer", "burrower", "tunneler"],
  },
  siphon: {
    key: "siphon", name: "Loot Siphon", hp: 32, speed: 4.2, damage: 6, behavior: "siphon",
    drops: [{ res: "gold", min: 1, max: 2 }, { res: "silver", min: 1, max: 3 }], spawnsIn: ["buriedmile", "drownedfault"],
    tags: ["lootPressure", "floater"],
  },
  bloom: {
    key: "bloom", name: "Spore Bloom", hp: 26, speed: 0.2, damage: 8, behavior: "stationary",
    drops: [{ res: "brinepearl", min: 1, max: 2 }, { res: "sulfur", min: 1, max: 2 }], spawnsIn: ["glasschoir", "redfault", "drownedfault"],
    tags: ["stationary", "hazard", "gasEmitter"],
  },
  warden: {
    key: "warden", name: "Fault Warden", hp: 82, speed: 2.6, damage: 18, behavior: "reactive",
    drops: [{ res: "alloy", min: 1, max: 2 }, { res: "composite", min: 1, max: 2 }], spawnsIn: ["enginedeep", "redfault", "glasschoir"],
    tags: ["reactive", "machine", "environment"],
  },
};

export interface Threat {
  id: number;
  family: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  hurtFlash: number;
  aggro: boolean;
  cooldown: number;
  burrowCooldown: number;
  elite: boolean;
  telegraph: number;
  fleeing: boolean;
  territoryX?: number;
  territoryY?: number;
  territoryRadius?: number;
  ambushState?: "hidden" | "alert" | "lunge" | "retreat";
  ambushTimer?: number;
  lootTargetId?: number;
  stationaryTimer?: number;
  gasEmitCooldown?: number;
  reactiveState?: "idle" | "fleeFire" | "seekWater" | "enraged";
}

export class ThreatSim {
  world: World;
  bus: EventBus;
  threats: Threat[] = [];
  private nextId = 1;
  rng: RNG;
  spawnCooldown = 6;
  enabled = true;
  getLoot?: () => { id: number; x: number; y: number; res: string; amount: number }[];
  getEnv?: () => { fires: { x: number; y: number }[]; steamCells: { x: number; y: number }[] };

  constructor(world: World, bus: EventBus) {
    this.world = world;
    this.bus = bus;
    this.rng = new RNG(0x7ea7 + world.seed);
  }

  spawn(family: string, x: number, y: number, forceElite = false) {
    const f = THREAT_FAMILIES[family];
    if (!f) return;
    const elite = forceElite || this.rng.chance(0.08);
    const t: Threat = {
      id: this.nextId++, family, x, y, vx: 0, vy: 0,
      hp: elite ? Math.round(f.hp * 2.2) : f.hp,
      maxHp: elite ? Math.round(f.hp * 2.2) : f.hp,
      hurtFlash: 0, aggro: false, cooldown: 0, burrowCooldown: 0,
      elite, telegraph: 0, fleeing: false,
      territoryX: x, territoryY: y, territoryRadius: 10 + this.rng.range(0, 6),
      ambushState: "hidden", ambushTimer: 0,
      stationaryTimer: 0, gasEmitCooldown: 2 + this.rng.range(0, 3),
      reactiveState: "idle",
    };
    this.threats.push(t);
    return t;
  }

  nearest(x: number, y: number, radius: number): Threat | null {
    let best: Threat | null = null;
    let bd = radius;
    for (const t of this.threats) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  tryAmbientSpawn(px: number, py: number, stratum: string, dt: number) {
    if (!this.enabled) return;
    this.spawnCooldown -= dt;
    const cap = stratum === "rootbed" ? 3 : stratum === "oldworks" ? 5 : 8;
    if (this.spawnCooldown > 0 || this.threats.length >= cap) return;
    const families = Object.values(THREAT_FAMILIES).filter((f) => f.spawnsIn.includes(stratum));
    if (families.length === 0) return;
    const baseCd = stratum === "rootbed" ? 22 : stratum === "oldworks" ? 14 : 10;
    this.spawnCooldown = baseCd + this.rng.next() * (stratum === "rootbed" ? 12 : 8);
    const f = this.rng.pick(families);
    for (let attempt = 0; attempt < 14; attempt++) {
      const sx = px + this.rng.range(-16, 16);
      const sy = py + this.rng.range(-9, 9);
      const tx = Math.floor(sx);
      const ty = Math.floor(sy);
      if (!this.world.inBounds(tx, ty) || this.world.solid(tx, ty)) continue;
      if (Math.hypot(sx - px, sy - py) < 9) continue;
      if (this.threats.some((t) => Math.hypot(t.x - sx, t.y - sy) < 5)) continue;
      this.spawn(f.key, sx, sy);
      return;
    }
  }

  cullFar(px: number, py: number, maxDist = 80) {
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const t = this.threats[i];
      if (Math.hypot(t.x - px, t.y - py) > maxDist) this.threats.splice(i, 1);
    }
  }

  step(dt: number, rig: { x: number; y: number; hurt: (a: number, c: string) => void }, digDamage: (x: number, y: number, dmg: number) => boolean) {
    const w = this.world;
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const t = this.threats[i];
      const f = THREAT_FAMILIES[t.family];
      if (!f) continue;
      t.hurtFlash = Math.max(0, t.hurtFlash - dt * 4);
      t.cooldown -= dt;
      t.telegraph = Math.max(0, t.telegraph - dt);
      if (t.ambushTimer !== undefined) t.ambushTimer = Math.max(0, t.ambushTimer - dt);
      if (t.stationaryTimer !== undefined) t.stationaryTimer += dt;
      if (t.gasEmitCooldown !== undefined) t.gasEmitCooldown -= dt;
      const dx = rig.x - t.x;
      const dy = rig.y - t.y;
      const dist = Math.hypot(dx, dy);
      t.aggro = dist < (f.behavior === "ambusher" ? 8 : f.behavior === "stationary" ? 6 : 15);
      t.fleeing = t.family === "grubble" && t.hp < t.maxHp * 0.5 && !t.elite;

      if (t.fleeing) {
        t.vx += -Math.sign(dx || 1) * f.speed * 2.4 * dt;
        t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
        this.moveThreat(t, f, dt, true);
        if (t.hp <= 0) {
          this.threats.splice(i, 1);
          this.bus.emit({ type: "threatDeath", id: t.id, x: t.x, y: t.y, family: t.family, elite: t.elite });
        }
        continue;
      }

      switch (f.behavior) {
        case "walker": {
          if (t.aggro) t.vx += Math.sign(dx) * f.speed * 3 * dt;
          else t.vx += (this.rng.chance(0.01) ? this.rng.range(-1, 1) : Math.sign(t.vx)) * f.speed * dt;
          t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
          this.moveThreat(t, f, dt);
          break;
        }
        case "burrower": {
          if (t.aggro && dist < (t.family === "mole" ? 14 : 9)) {
            t.vx += Math.sign(dx) * f.speed * (t.family === "mole" ? 2.8 : 2) * dt;
            t.vy += Math.sign(dy) * f.speed * (t.family === "mole" ? 2.0 : 1.4) * dt;
            t.burrowCooldown -= dt;
            const cx = Math.floor(t.x);
            const cy = Math.floor(t.y);
            const tile = w.get(cx, cy);
            if (tile !== M.AIR && tile !== M.BEDROCK && t.burrowCooldown <= 0) {
              digDamage(cx, cy, t.family === "mole" ? 42 : 26);
              t.burrowCooldown = t.family === "mole" ? 0.3 : 0.5;
              if (t.family === "mole" && this.rng.chance(0.6)) w.set(cx, cy, M.AIR);
            }
          } else {
            t.vy += 20 * dt;
            if (t.territoryX !== undefined) {
              const tdx = t.territoryX - t.x;
              t.vx += Math.sign(tdx) * f.speed * 0.5 * dt;
            }
          }
          t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
          t.vy = Math.max(-4, Math.min(4, t.vy));
          this.moveThreat(t, f, dt, true);
          break;
        }
        case "floater": {
          if (t.aggro) {
            t.vx += Math.sign(dx) * f.speed * 2.2 * dt;
            t.vy += Math.sign(dy) * f.speed * 2.2 * dt;
          } else {
            t.vx += this.rng.range(-1, 1) * dt * 6;
            t.vy += this.rng.range(-0.4, 0.4) * dt * 6;
          }
          t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
          t.vy = Math.max(-f.speed, Math.min(f.speed, t.vy));
          this.moveThreat(t, f, dt, true);
          break;
        }
        case "jumper": {
          t.vy += 40 * dt;
          if (t.aggro && Math.abs(dy) < 6 && t.cooldown <= 0) {
            t.vx = Math.sign(dx) * f.speed * 1.6;
            t.vy = -11;
            t.cooldown = 1.4;
          }
          this.moveThreat(t, f, dt);
          break;
        }
        case "sentry": {
          const want = 6.5;
          const sign = dist > want ? 1 : -1;
          t.vx += Math.sign(dx) * sign * f.speed * 2 * dt;
          t.vy += Math.sign(dy) * f.speed * 1.6 * dt + (t.aggro ? Math.sin(t.id + t.x) * 2 * dt : 0);
          t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
          t.vy = Math.max(-f.speed, Math.min(f.speed, t.vy));
          this.moveThreat(t, f, dt, true);
          break;
        }
        case "ambusher": {
          const rigTerrDist = t.territoryX !== undefined ? Math.hypot(rig.x - t.territoryX, rig.y - (t.territoryY ?? t.y)) : 999;
          if (t.ambushState === "hidden") {
            t.vx *= 0.9; t.vy *= 0.9;
            if (rigTerrDist < (t.territoryRadius ?? 10) && dist < 8) {
              t.ambushState = "alert"; t.ambushTimer = 0.6; t.telegraph = 0.6;
            }
          } else if (t.ambushState === "alert") {
            if ((t.ambushTimer ?? 0) <= 0) {
              t.ambushState = "lunge";
              t.vx = Math.sign(dx) * f.speed * 3.0;
              t.vy = Math.sign(dy) * f.speed * 1.5 - 2;
              t.cooldown = 1.8; t.telegraph = 0;
            }
          } else if (t.ambushState === "lunge") {
            this.moveThreat(t, f, dt, true);
            if (dist < 2.0 || (t.cooldown <= 0.5)) { t.ambushState = "retreat"; t.ambushTimer = 2.5; }
          } else if (t.ambushState === "retreat") {
            const tx = t.territoryX ?? t.x; const ty = t.territoryY ?? t.y;
            t.vx += Math.sign(tx - t.x) * f.speed * 2 * dt;
            t.vy += Math.sign(ty - t.y) * f.speed * 2 * dt;
            t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
            t.vy = Math.max(-f.speed, Math.min(f.speed, t.vy));
            this.moveThreat(t, f, dt, true);
            if ((t.ambushTimer ?? 0) <= 0 || Math.hypot(t.x - tx, t.y - ty) < 1.5) { t.ambushState = "hidden"; t.vx = 0; t.vy = 0; }
          }
          if (t.ambushState !== "lunge") this.moveThreat(t, f, dt, true);
          break;
        }
        case "siphon": {
          const lootList = this.getLoot?.() ?? [];
          let nearestLoot: { id: number; x: number; y: number } | null = null;
          let bestD = 999;
          for (const l of lootList) {
            const d = Math.hypot(l.x - t.x, l.y - t.y);
            if (d < bestD && d < 18) { bestD = d; nearestLoot = l; }
          }
          if (nearestLoot) {
            t.lootTargetId = nearestLoot.id;
            const ldx = nearestLoot.x - t.x; const ldy = nearestLoot.y - t.y;
            t.vx += Math.sign(ldx) * f.speed * 2.5 * dt;
            t.vy += Math.sign(ldy) * f.speed * 2.5 * dt;
            if (bestD < 1.5 && t.cooldown <= 0) {
              this.bus.emit({ type: "threatSteal", id: t.id, res: (nearestLoot as any).res ?? "copper", amount: (nearestLoot as any).amount ?? 1 });
              t.cooldown = 1.2; t.vx = -t.vx * 0.5;
            }
          } else if (t.aggro) {
            t.vx += Math.sign(dx) * f.speed * 1.2 * dt;
            t.vy += Math.sign(dy) * f.speed * 1.2 * dt;
          } else {
            t.vx += this.rng.range(-1, 1) * dt * 4;
            t.vy += this.rng.range(-0.5, 0.5) * dt * 4;
          }
          t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
          t.vy = Math.max(-f.speed, Math.min(f.speed, t.vy));
          this.moveThreat(t, f, dt, true);
          break;
        }
        case "stationary": {
          t.vx *= 0.85; t.vy *= 0.85;
          if ((t.gasEmitCooldown ?? 0) <= 0) {
            t.gasEmitCooldown = 4 + this.rng.range(0, 4);
            const cx = Math.floor(t.x); const cy = Math.floor(t.y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const x = cx + dx; const y = cy + dy;
              if (!w.inBounds(x, y)) continue;
              if (w.tiles[x + y * w.w] === M.AIR) w.gas[x + y * w.w] = Math.min(8, w.gas[x + y * w.w] + 3);
            }
            this.bus.emit({ type: "hazardWarn", kind: "bloom_gas", x: t.x, y: t.y, severity: 1 });
          }
          if (dist < 3.5 && t.cooldown <= 0) { rig.hurt(Math.round(f.damage * (t.elite ? 1.4 : 1) * 0.8), "bloom"); t.cooldown = 1.6; }
          break;
        }
        case "reactive": {
          const env = this.getEnv?.();
          const nearFire = env?.fires.some((ff) => Math.hypot(ff.x - t.x, ff.y - t.y) < 5) ?? false;
          const nearSteam = env?.steamCells.some((ss) => Math.hypot(ss.x - t.x, ss.y - t.y) < 4) ?? false;
          const isHotArea = w.liquid[Math.floor(t.x) + Math.floor(t.y) * w.w] === 2;
          if (nearFire || nearSteam) {
            t.reactiveState = "fleeFire";
            t.vx += -Math.sign(dx || this.rng.range(-1, 1)) * f.speed * 2.5 * dt;
            t.vy += -Math.sign(dy || this.rng.range(-1, 1)) * f.speed * 2 * dt;
          } else if (isHotArea && t.hp < t.maxHp * 0.5) {
            t.reactiveState = "seekWater";
            let bestWater: [number, number] | null = null; let bd = 999;
            for (let yy = Math.floor(t.y) - 8; yy <= Math.floor(t.y) + 8; yy++) for (let xx = Math.floor(t.x) - 8; xx <= Math.floor(t.x) + 8; xx++) {
              if (!w.inBounds(xx, yy)) continue;
              if (w.liquid[xx + yy * w.w] === 1) { const d = Math.hypot(xx - t.x, yy - t.y); if (d < bd) { bd = d; bestWater = [xx, yy]; } }
            }
            if (bestWater) { t.vx += Math.sign(bestWater[0] - t.x) * f.speed * 2 * dt; t.vy += Math.sign(bestWater[1] - t.y) * f.speed * 2 * dt; }
          } else if (t.aggro) {
            if (dist < 4 && this.rng.chance(0.02)) t.reactiveState = "enraged";
            if (t.reactiveState === "enraged") { t.vx += Math.sign(dx) * f.speed * 3.5 * dt; t.vy += Math.sign(dy) * f.speed * 2.5 * dt; }
            else { t.vx += Math.sign(dx) * f.speed * 2 * dt; t.vy += Math.sign(dy) * f.speed * 1.6 * dt; }
          } else {
            t.reactiveState = "idle"; t.vx += this.rng.range(-1, 1) * dt * 2; t.vy += this.rng.range(-0.3, 0.3) * dt * 2;
          }
          t.vx = Math.max(-f.speed * (t.reactiveState === "enraged" ? 1.6 : 1), Math.min(f.speed * (t.reactiveState === "enraged" ? 1.6 : 1), t.vx));
          t.vy = Math.max(-f.speed, Math.min(f.speed, t.vy));
          this.moveThreat(t, f, dt, true);
          break;
        }
      }

      if (t.aggro && dist > 2.2 && dist < 7 && t.cooldown <= 0 && t.telegraph <= 0 &&
          (f.behavior === "jumper" || f.behavior === "walker" || f.behavior === "ambusher")) {
        t.telegraph = 0.45;
      }
      if (t.telegraph > 0 && t.telegraph <= dt * 1.5) {
        t.vx = Math.sign(dx || 1) * f.speed * 2.6;
        t.vy = Math.min(t.vy, -4);
        t.cooldown = 1.4;
      }
      if (dist < 1.9 && t.cooldown <= 0 && f.behavior !== "stationary" && f.behavior !== "siphon") {
        rig.hurt(Math.round(f.damage * (t.elite ? 1.4 : 1)), "threat");
        t.cooldown = t.family === "grubble" ? 1.8 : 1.1;
        t.vx -= Math.sign(dx) * 3;
      } else if (dist < 1.9 && t.cooldown <= 0 && f.behavior === "siphon") {
        rig.hurt(Math.round(f.damage * (t.elite ? 1.4 : 1) * 0.5), "threat");
        t.cooldown = 1.6;
      }

      if (t.hp <= 0) {
        this.threats.splice(i, 1);
        this.bus.emit({ type: "threatDeath", id: t.id, x: t.x, y: t.y, family: t.family, elite: t.elite });
      }
    }
  }

  private moveThreat(t: Threat, f: ThreatFamily, dt: number, noGravity = false) {
    const w = this.world;
    if (!noGravity) t.vy += 44 * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(t.vy * dt) * 3));
    for (let s = 0; s < steps; s++) {
      const nx = t.x + (t.vx * dt) / steps;
      if (w.solid(Math.floor(nx), Math.floor(t.y))) {
        t.vx = -t.vx * 0.5;
        if (f.behavior === "jumper" || f.behavior === "burrower" || f.behavior === "ambusher") t.vy = Math.min(t.vy, -6);
        if (f.behavior === "stationary") { t.vx = 0; break; }
      } else t.x = nx;
      const ny = t.y + (t.vy * dt) / steps;
      if (w.solid(Math.floor(t.x), Math.floor(ny))) {
        if (t.vy > 0) t.vy = 0; else t.vy = 0;
      } else t.y = ny;
    }
    void TICK_DT;
  }

  damageNear(x: number, y: number, radius: number, dmg: number) {
    for (const t of this.threats) {
      if (Math.hypot(t.x - x, t.y - y) <= radius) {
        t.hp -= dmg;
        t.hurtFlash = 1;
        this.bus.emit({ type: "threatHit", id: t.id, x: t.x, y: t.y });
        if (THREAT_FAMILIES[t.family]?.behavior === "reactive") t.reactiveState = "enraged";
      }
    }
  }

  dropsFor(t: Threat): { res: string; amount: number }[] {
    const f = THREAT_FAMILIES[t.family];
    if (!f) return [];
    const out: { res: string; amount: number }[] = [];
    const mul = (t as Threat).elite ? 3 : 1;
    for (const d of f.drops) {
      const n = (d.min + this.rng.int(0, d.max - d.min + 1)) * mul;
      if (n > 0 && RESOURCES[d.res]) out.push({ res: d.res, amount: n });
    }
    return out;
  }
}
