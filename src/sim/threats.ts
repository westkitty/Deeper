/**
 * DEEPER — threats: six families with different movement and environmental
 * interaction. Combat is secondary; terrain manipulation is often the answer.
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
  /** Movement style. */
  behavior: "walker" | "burrower" | "floater" | "jumper" | "sentry";
  drops: { res: string; min: number; max: number }[];
  spawnsIn: string[]; // strata
}

export const THREAT_FAMILIES: Record<string, ThreatFamily> = {
  grubble: {
    key: "grubble", name: "Grubble", hp: 22, speed: 2.6, damage: 7, behavior: "burrower",
    drops: [{ res: "copper", min: 1, max: 3 }], spawnsIn: ["rootbed"],
  },
  shellsnout: {
    key: "shellsnout", name: "Shellsnout", hp: 40, speed: 2.0, damage: 10, behavior: "jumper",
    drops: [{ res: "iron", min: 1, max: 3 }, { res: "coal", min: 0, max: 2 }], spawnsIn: ["oldworks"],
  },
  crawler: {
    key: "crawler", name: "Rock-shell crawler", hp: 55, speed: 3.4, damage: 12, behavior: "walker",
    drops: [{ res: "aggregate", min: 1, max: 2 }, { res: "steel", min: 0, max: 1 }], spawnsIn: ["buriedmile"],
  },
  lurker: {
    key: "lurker", name: "Flood-zone lurker", hp: 48, speed: 4.6, damage: 13, behavior: "floater",
    drops: [{ res: "brinepearl", min: 0, max: 1 }, { res: "silver", min: 1, max: 2 }], spawnsIn: ["drownedfault"],
  },
  embermite: {
    key: "embermite", name: "Heat mite", hp: 34, speed: 3.0, damage: 9, behavior: "jumper",
    drops: [{ res: "sulfur", min: 1, max: 3 }], spawnsIn: ["redfault"],
  },
  prismite: {
    key: "prismite", name: "Crystal parasite", hp: 62, speed: 3.2, damage: 14, behavior: "walker",
    drops: [{ res: "quartz", min: 1, max: 3 }], spawnsIn: ["glasschoir"],
  },
  drone: {
    key: "drone", name: "Sentry drone", hp: 80, speed: 3.8, damage: 16, behavior: "sentry",
    drops: [{ res: "composite", min: 1, max: 2 }, { res: "alloy", min: 0, max: 1 }], spawnsIn: ["enginedeep"],
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
  /** Elite variant: 2.2x HP, 1.4x damage, 3x drops. */
  elite: boolean;
  /** Telegraph timer: >0 means a lunge is winding up (renderer flashes). */
  telegraph: number;
  /** Grubbles flee when weak; stalkers commit. */
  fleeing: boolean;
}

export class ThreatSim {
  world: World;
  bus: EventBus;
  threats: Threat[] = [];
  private nextId = 1;
  rng: RNG;
  spawnCooldown = 6; // seconds between ambient spawn attempts
  enabled = true;

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
    };
    this.threats.push(t);
    return t;
  }

  /** Nearest threat within radius (for radar ping + audio warning). */
  nearest(x: number, y: number, radius: number): Threat | null {
    let best: Threat | null = null;
    let bd = radius;
    for (const t of this.threats) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /** Ambient spawning near the rig in dangerous strata. */
  tryAmbientSpawn(px: number, py: number, stratum: string, dt: number) {
    if (!this.enabled) return;
    this.spawnCooldown -= dt;
    if (this.spawnCooldown > 0 || this.threats.length >= 7) return;
    const families = Object.values(THREAT_FAMILIES).filter((f) => f.spawnsIn.includes(stratum));
    if (families.length === 0) return;
    this.spawnCooldown = 9 + this.rng.next() * 8;
    const f = this.rng.pick(families);
    for (let attempt = 0; attempt < 14; attempt++) {
      const sx = px + this.rng.range(-16, 16);
      const sy = py + this.rng.range(-9, 9);
      const tx = Math.floor(sx);
      const ty = Math.floor(sy);
      if (!this.world.inBounds(tx, ty) || this.world.solid(tx, ty)) continue;
      if (Math.hypot(sx - px, sy - py) < 9) continue;
      this.spawn(f.key, sx, sy);
      return;
    }
  }

  step(dt: number, rig: { x: number; y: number; hurt: (a: number, c: string) => void }, digDamage: (x: number, y: number, dmg: number) => boolean) {
    const w = this.world;
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const t = this.threats[i];
      const f = THREAT_FAMILIES[t.family];
      t.hurtFlash = Math.max(0, t.hurtFlash - dt * 4);
      t.cooldown -= dt;
      t.telegraph = Math.max(0, t.telegraph - dt);
      const dx = rig.x - t.x;
      const dy = rig.y - t.y;
      const dist = Math.hypot(dx, dy);
      t.aggro = dist < 15;
      // grubbles flee at low HP (cowardly burrowers); others fight on
      t.fleeing = t.family === "grubble" && t.hp < t.maxHp * 0.3 && !t.elite;
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
          // grubbles chew through soft earth toward you
          if (t.aggro && dist < 9) {
            t.vx += Math.sign(dx) * f.speed * 2 * dt;
            t.vy += Math.sign(dy) * f.speed * 1.4 * dt;
            t.burrowCooldown -= dt;
            const cx = Math.floor(t.x);
            const cy = Math.floor(t.y);
            const tile = w.get(cx, cy);
            if (tile !== M.AIR && tile !== M.BEDROCK && t.burrowCooldown <= 0) {
              digDamage(cx, cy, 26);
              t.burrowCooldown = 0.5;
            }
          } else {
            t.vy += 20 * dt;
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
          // drones hover and strafe at range
          const want = 6.5;
          const sign = dist > want ? 1 : -1;
          t.vx += Math.sign(dx) * sign * f.speed * 2 * dt;
          t.vy += Math.sign(dy) * f.speed * 1.6 * dt + (t.aggro ? Math.sin(t.id + t.x) * 2 * dt : 0);
          t.vx = Math.max(-f.speed, Math.min(f.speed, t.vx));
          t.vy = Math.max(-f.speed, Math.min(f.speed, t.vy));
          this.moveThreat(t, f, dt, true);
          break;
        }
      }

      // telegraphed lunge: wind up at mid range, then commit
      if (t.aggro && dist > 2.2 && dist < 7 && t.cooldown <= 0 && t.telegraph <= 0 &&
          (f.behavior === "jumper" || f.behavior === "walker")) {
        t.telegraph = 0.45;
      }
      if (t.telegraph > 0 && t.telegraph <= dt * 1.5) {
        // commit: dash toward the rig
        t.vx = Math.sign(dx || 1) * f.speed * 2.6;
        t.vy = Math.min(t.vy, -4);
        t.cooldown = 1.4;
      }
      // contact damage
      if (dist < 1.9 && t.cooldown <= 0) {
        rig.hurt(Math.round(f.damage * (t.elite ? 1.4 : 1)), "threat");
        t.cooldown = 1.1;
        t.vx -= Math.sign(dx) * 3;
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
        if (f.behavior === "jumper" || f.behavior === "burrower") t.vy = Math.min(t.vy, -6);
      } else t.x = nx;
      const ny = t.y + (t.vy * dt) / steps;
      if (w.solid(Math.floor(t.x), Math.floor(ny))) {
        if (t.vy > 0) t.vy = 0;
        else t.vy = 0;
      } else t.y = ny;
    }
    void TICK_DT;
  }

  /** Drill/charge damage against threats (area attacks included). */
  damageNear(x: number, y: number, radius: number, dmg: number) {
    for (const t of this.threats) {
      if (Math.hypot(t.x - x, t.y - y) <= radius) {
        t.hp -= dmg;
        t.hurtFlash = 1;
        this.bus.emit({ type: "threatHit", id: t.id, x: t.x, y: t.y });
      }
    }
  }

  dropsFor(t: Threat): { res: string; amount: number }[] {
    const f = THREAT_FAMILIES[t.family];
    const out: { res: string; amount: number }[] = [];
    const mul = (t as Threat).elite ? 3 : 1;
    for (const d of f.drops) {
      const n = (d.min + this.rng.int(0, d.max - d.min + 1)) * mul;
      if (n > 0 && RESOURCES[d.res]) out.push({ res: d.res, amount: n });
    }
    return out;
  }
}
