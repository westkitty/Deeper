/**
 * DEEPER — the rig: player machine simulation.
 * Movement, digging (tool-driven terrain damage), cargo, health, protection,
 * emergency extraction. Pure logic; the presentation layer drives it with input.
 * v1.2: machine identity — each tier has distinct footprint, cadence, power,
 * movement feel, heat/cooling, cargo, terrain interaction, utility, audio,
 * visual feedback and access. Heat, recoil, weight, debris multipliers.
 */

import { BASE_X, RIG, SURFACE_ROW, TICK_DT, WORLD_H, WORLD_W, stratumAtRow } from "../config";
import { M, mat } from "./materials";
import { RNG } from "./rng";
import { TOOLS, tool, type UpgradeDef } from "./tools";
import { RESOURCES } from "./resources";
import { LIQ_MAGMA, LIQ_WATER, World } from "./world";
import type { EventBus } from "./events";

export interface RigInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  dig: boolean;
  utility: boolean;
  interact: boolean;
  aimX: number;
  aimY: number;
  selectedTool: number;
  winch?: boolean;
}

export interface CargoEntry { res: string; amount: number }

export class Rig {
  world: World;
  bus: EventBus;
  x = BASE_X + 2;
  y = SURFACE_ROW - 3.2;
  vx = 0;
  vy = 0;
  grounded = false;
  facing = 1;

  hp = 100;
  maxHp = 100;
  dead = false;
  deadTimer = 0;
  assistMode = false;
  magnetStreak = 0;
  magnetStreakTimer = 0;
  lastPickupAt = -99;

  cargo = new Map<string, number>();
  money = 0;
  blueprints = new Set<string>();
  relics = new Set<string>();
  toolTier = 0;
  ownedTools = 0;
  upgrades = new Set<string>();
  charges = 0;
  maxCharges = 3;

  digCooldown = 0;
  utilityCooldown = 0;
  aimAngle = 0;
  digTicks = 0;

  heat = 0;
  overheatTimer = 0;
  lastRecoil = 0;
  weight = 1.0;
  momentum = 0;

  lastDugCell = { x: -1, y: -1 };
  onResonantHit?: (x: number, y: number) => void;
  onAftermath?: (x: number, y: number, kind: string, tier: number) => void;
  rng: RNG;

  constructor(world: World, bus: EventBus) {
    this.world = world;
    this.bus = bus;
    this.rng = new RNG(0x51ce + world.seed);
  }

  fx(): Required<Pick<UpgradeDef["fx"], "cargoCap" | "cargoBulkMul" | "vacuum" | "jump" | "run" | "heatProt" | "pressureProt" | "scanTier" | "refinery" | "chargeCap">> & { damper: boolean; winch: boolean; lift: boolean; caches: boolean } {
    const f = {
      cargoCap: 30, cargoBulkMul: 1, vacuum: 2.2, jump: RIG.jump, run: RIG.maxRun,
      heatProt: 0, pressureProt: 0, scanTier: 0, refinery: 0, chargeCap: 3,
      damper: false, winch: false, lift: false, caches: false,
    };
    for (const key of this.upgrades) {
      const u = UPGRADE_MAP.get(key);
      if (!u) continue;
      const fx = u.fx;
      if (fx.cargoCap !== undefined) f.cargoCap = fx.cargoCap;
      if (fx.cargoBulkMul !== undefined) f.cargoBulkMul = fx.cargoBulkMul;
      if (fx.vacuum !== undefined) f.vacuum = Math.max(f.vacuum, fx.vacuum);
      if (fx.jump !== undefined) f.jump = fx.jump;
      if (fx.run !== undefined) f.run = fx.run;
      if (fx.heatProt !== undefined) f.heatProt = Math.max(f.heatProt, fx.heatProt);
      if (fx.pressureProt !== undefined) f.pressureProt = Math.max(f.pressureProt, fx.pressureProt);
      if (fx.scanTier !== undefined) f.scanTier = Math.max(f.scanTier, fx.scanTier);
      if (fx.refinery !== undefined) f.refinery = Math.max(f.refinery, fx.refinery);
      if (fx.chargeCap !== undefined) f.chargeCap = fx.chargeCap;
      if (fx.damper) f.damper = true;
      if (fx.winch) f.winch = true;
      if (fx.lift) f.lift = true;
      if (fx.caches) f.caches = true;
    }
    return f;
  }

  cargoUsed(bulkMul = 1): number {
    let used = 0;
    for (const [res, amount] of this.cargo) used += amount * (RESOURCES[res]?.bulk ?? 1) * bulkMul;
    return used;
  }
  cargoFree(): number { return this.fx().cargoCap - this.cargoUsed(this.fx().cargoBulkMul); }
  cargoValue(): number {
    let v = 0;
    for (const [res, amount] of this.cargo) v += amount * (RESOURCES[res]?.value ?? 0);
    return v;
  }

  step(input: RigInput, tick: number) {
    const w = this.world;
    if (this.magnetStreakTimer > 0) {
      this.magnetStreakTimer -= TICK_DT;
      if (this.magnetStreakTimer <= 0) this.magnetStreak = 0;
    }
    const td = tool(this.toolTier);
    const f = this.fx();
    const cooling = td.heat.cool * (1 + f.heatProt * 0.5);
    this.heat = Math.max(0, this.heat - cooling * TICK_DT);
    if (this.overheatTimer > 0) {
      this.overheatTimer -= TICK_DT;
      if (this.overheatTimer <= 0) this.bus.emit({ type: "overheatEnd" } as any);
    }
    if (this.dead) {
      this.deadTimer -= TICK_DT;
      if (this.deadTimer <= 0) this.emergencyExtract();
      return;
    }
    const baseRun = f.run;
    const run = baseRun * td.move.runMul;
    const accelBase = RIG.accel * td.move.accelMul;
    const weight = td.move.weight;
    this.weight = weight;

    let ax = 0;
    if (input.left) ax -= accelBase;
    if (input.right) ax += accelBase;
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    const friction = RIG.friction / weight;
    this.vx += ax * TICK_DT;
    if (input.left === input.right) {
      this.vx -= this.vx * Math.min(1, friction * TICK_DT);
      this.momentum *= 0.92;
    } else {
      this.momentum = Math.min(1, Math.abs(this.vx) / run) * weight * 0.5;
    }
    this.vx = Math.max(-run, Math.min(run, this.vx));

    const inWater = this.liquidContact() === LIQ_WATER;
    const gravity = inWater ? RIG.gravity * (0.42 / Math.max(0.5, weight * 0.6)) : RIG.gravity * weight * 0.85;
    const maxFall = inWater ? RIG.maxFall * 0.3 : RIG.maxFall * Math.min(1.2, weight * 0.5 + 0.5);

    const jumpMul = td.move.jumpMul;
    if (input.jump && this.grounded && this.vy > -1) {
      this.vy = -f.jump * jumpMul * (inWater ? 0.7 : 1) / Math.max(0.7, weight * 0.6);
      this.grounded = false;
      this.bus.emit({ type: "jump", tier: this.toolTier, weight } as any);
    }
    if (input.winch && f.winch && !this.grounded) {
      const againstWall =
        (input.left && this.collidesAt(this.x - RIG.w / 2 - 0.1, this.y)) ||
        (input.right && this.collidesAt(this.x + RIG.w / 2 + 0.1, this.y));
      if (againstWall) this.vy = Math.min(this.vy, -4.2 / Math.max(0.8, weight * 0.7));
    }

    this.vy += gravity * TICK_DT;
    this.vy = Math.min(this.vy, maxFall);

    this.moveX(this.vx * TICK_DT);
    const fallSpeed = this.vy;
    this.moveY(this.vy * TICK_DT);

    if (this.grounded && fallSpeed > RIG.fallSafeSpeed && !f.damper) {
      const weightDmg = weight > 1.5 ? 1.0 : 1.35;
      const dmg = (fallSpeed - RIG.fallSafeSpeed) * weightDmg;
      if (td.specials.includes("heavyLanding")) {
        this.heavyLandingShock();
        this.bus.emit({ type: "heavyLanding", tier: this.toolTier, x: this.x, y: this.y } as any);
      }
      this.hurt(dmg, "impact");
      this.bus.emit({ type: "landing", impact: fallSpeed, tier: this.toolTier, weight } as any);
    }

    this.applyStratumHazards();

    this.digCooldown -= TICK_DT;
    this.utilityCooldown -= TICK_DT;
    const overheatMul = this.heat > td.heat.overheatAt ? 1.6 : 1.0;
    if (input.dig && this.digCooldown <= 0) {
      if (this.overheatTimer <= 0) {
        this.digAt(input.aimX, input.aimY, tick);
        this.digCooldown *= overheatMul;
      } else {
        if (this.rng.chance(0.5)) {
          this.bus.emit({ type: "drillHit", x: Math.floor(input.aimX), y: Math.floor(input.aimY), mat: M.AIR, effective: false, toolTier: this.toolTier } as any);
        } else {
          this.digAt(input.aimX, input.aimY, tick);
        }
      }
    }
    if (input.utility && this.utilityCooldown <= 0) this.useUtility(input.aimX, input.aimY);
    this.lastRecoil *= Math.pow(0.1, TICK_DT);
  }

  private heavyLandingShock() {
    const w = this.world;
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y + 1);
    for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx; const y = cy + dy;
      const t = w.get(x, y);
      if (t === M.AIR || t === M.BEDROCK) continue;
      const d = mat(t);
      if (w.damageOf(x, y) >= d.hp * 0.3) {
        w.set(x, y, M.AIR);
        this.bus.emit({ type: "break", x, y, mat: t, count: 1, chain: true });
      }
    }
  }

  private moveX(dx: number) {
    if (dx === 0) return;
    const dir = Math.sign(dx);
    let remaining = Math.abs(dx);
    while (remaining > 0) {
      const step = Math.min(0.2, remaining);
      const nx = this.x + dir * step;
      const col = Math.floor(nx + dir * (RIG.w / 2 - 0.02));
      let blocked = false;
      for (const oy of [-RIG.h / 2 + 0.1, 0, RIG.h / 2 - 0.05]) {
        if (this.world.solid(col, Math.floor(this.y + oy))) { blocked = true; break; }
      }
      if (blocked) {
        if (this.grounded &&
            !this.world.solid(col, Math.floor(this.y - RIG.h / 2 + 0.1) - 1) &&
            !this.world.solid(Math.floor(this.x), Math.floor(this.y - RIG.h / 2 + 0.1) - 1)) {
          this.y -= RIG.stepUp;
          this.x = nx;
          remaining -= step;
          continue;
        }
        this.vx = 0;
        return;
      }
      this.x = nx;
      remaining -= step;
    }
    this.x = Math.max(2.5, Math.min(WORLD_W - 2.5, this.x));
  }

  private moveY(dy: number) {
    if (dy === 0) return;
    const dir = Math.sign(dy);
    let remaining = Math.abs(dy);
    while (remaining > 0) {
      const step = Math.min(0.2, remaining);
      const ny = this.y + dir * step;
      const probe = ny + (dir > 0 ? RIG.h / 2 : -RIG.h / 2);
      if (this.collidesAt(this.x, ny, dir > 0 ? Math.floor(probe) : -1)) {
        if (dir > 0) {
          const obstacleRow = Math.floor(probe);
          this.y = obstacleRow - RIG.h / 2 - 0.01;
          this.grounded = true;
        }
        this.vy = 0;
        return;
      }
      this.y = ny;
      this.grounded = false;
      remaining -= step;
    }
    if (this.y > WORLD_H) this.y = WORLD_H - 4;
  }

  collidesAt(px: number, py: number, rowOverride = -1): boolean {
    const w = this.world;
    const halfW = RIG.w / 2 - 0.02;
    const halfH = RIG.h / 2 - 0.02;
    for (const [ox, oy] of [[-halfW, -halfH], [halfW, -halfH], [-halfW, halfH], [halfW, halfH]] as const) {
      const row = oy < 0 ? Math.floor(py + oy) : rowOverride >= 0 ? rowOverride : Math.floor(py + oy);
      if (w.solid(Math.floor(px + ox), row)) return true;
    }
    return false;
  }

  liquidContact(): number {
    const w = this.world;
    const i = Math.floor(this.x) + Math.floor(this.y + RIG.h / 2) * w.w;
    return w.liquid[i] ?? 0;
  }
  submerged(): boolean {
    const w = this.world;
    const i = Math.floor(this.x) + Math.floor(this.y) * w.w;
    return w.liquid[i] === LIQ_WATER && w.liqLevel[i] >= 4;
  }

  private applyStratumHazards() {
    const st = stratumAtRow(Math.floor(this.y));
    const f = this.fx();
    if (st === "drownedfault" && Math.floor(this.y) > 340) {
      if (f.pressureProt < 1) this.hurt(2.2 * TICK_DT * 60, "pressure");
      else if (Math.floor(this.y) > 400 && f.pressureProt < 2) this.hurt(1.4 * TICK_DT * 60, "pressure");
    }
    if (st === "redfault") {
      if (f.heatProt < 1) this.hurt(2.6 * TICK_DT * 60, "heat");
      if (f.heatProt < 2) {
        const cx = Math.floor(this.x);
        const cy = Math.floor(this.y + 1);
        const w = this.world;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [0, 0]] as const) {
          const i = cx + dx + (cy + dy) * w.w;
          if (w.liquid[i] === LIQ_MAGMA) { this.hurt(14 * TICK_DT * 60, "magma"); break; }
        }
      }
    }
  }

  effectiveMaxHp(): number { return this.assistMode ? this.maxHp * 2 : this.maxHp; }
  get overheated(): boolean { return this.overheatTimer > 0; }

  hurt(amount: number, cause: string) {
    if (this.dead) return;
    if (this.assistMode && cause === "threat") amount *= 0.5;
    if (this.assistMode && (cause === "heat" || cause === "pressure")) amount *= 0.75;
    this.hp -= amount;
    this.bus.emit({ type: "hurt", amount, cause });
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadTimer = 2.2;
      this.bus.emit({ type: "death" });
    }
  }

  emergencyExtract(): { lost: number; dropped: [string, number][]; x: number; y: number } {
    const dropped: [string, number][] = [];
    let lost = 0;
    for (const [res, amount] of this.cargo) {
      const drop = Math.floor(amount * 0.25);
      if (drop > 0) { dropped.push([res, drop]); lost += drop * (RESOURCES[res]?.value ?? 0); }
      const keep = amount - drop;
      if (keep <= 0) this.cargo.delete(res); else this.cargo.set(res, keep);
    }
    const dx = this.x; const dy = this.y;
    this.cargo.clear();
    this.dead = false;
    this.hp = this.effectiveMaxHp();
    this.heat = 0;
    this.overheatTimer = 0;
    this.x = BASE_X + 2;
    this.y = SURFACE_ROW - 3.2;
    this.vx = 0; this.vy = 0;
    this.bus.emit({ type: "emergencyExtract" });
    return { lost, dropped, x: dx, y: dy };
  }

  private digAt(ax: number, ay: number, tick: number) {
    const w = this.world;
    const td = tool(this.toolTier);
    this.digCooldown = td.interval;
    const dx = ax - this.x;
    const dy = ay - this.y;
    this.aimAngle = Math.atan2(dy, dx);
    this.facing = dx >= 0 ? 1 : -1;
    const dist = Math.hypot(dx, dy);
    const reach = Math.min(dist, td.reach);
    const ix = this.x + (dx / (dist || 1)) * reach;
    const iy = this.y + (dy / (dist || 1)) * reach;
    const target = this.findImpact(this.x, this.y, ix, iy);
    if (!target) return;
    this.applyDig(target.x, target.y, td, tick);
    this.lastDugCell = target;
    this.digTicks++;
    this.heat += td.heat.gen;
    if (this.heat >= td.heat.overheatAt && this.overheatTimer <= 0) {
      this.overheatTimer = 2.0;
      this.bus.emit({ type: "overheat", tier: this.toolTier } as any);
    }
    this.lastRecoil = td.recoil;
    this.bus.emit({ type: "digRecoil", recoil: td.recoil, tier: this.toolTier } as any);
  }

  findImpact(sx: number, sy: number, ex: number, ey: number): { x: number; y: number } | null {
    const w = this.world;
    const steps = Math.max(1, Math.ceil(Math.hypot(ex - sx, ey - sy) * 3));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = sx + (ex - sx) * t;
      const py = sy + (ey - sy) * t;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      if (cy < 0) continue;
      if (w.solid(cx, cy)) return { x: cx, y: cy };
    }
    return null;
  }

  applyDig(cx: number, cy: number, td = tool(this.toolTier), tick = 0) {
    const w = this.world;
    const tile = w.get(cx, cy);
    if (tile === M.AIR) return;
    const d = mat(tile);
    const t = this.toolTier;
    if (tile === M.BEDROCK || d.tier > [0, 1, 2, 3, 4, 5, 6, 8][t]) {
      this.bus.emit({ type: "blocked", x: cx, y: cy, mat: tile, toolTier: t });
      this.bus.emit({ type: "drillHit", x: cx, y: cy, mat: tile, effective: false, toolTier: t });
      return;
    }
    const affinity = affinityFor(td.cls, d.family);
    const dmg = td.dps * affinity * td.interval;
    w.addDamage(cx, cy, dmg);
    this.bus.emit({ type: "drillHit", x: cx, y: cy, mat: tile, effective: true, toolTier: t });
    if (w.damage[cx + cy * w.w] >= d.hp) {
      const extra = shapeExtra(td, cx, cy, w, t, this);
      w.set(cx, cy, M.AIR);
      this.bus.emit({ type: "break", x: cx, y: cy, mat: tile, count: 1 });
      if (td.specials.includes("mawScar") || t === 7) this.onAftermath?.(cx, cy, "mawScar", t);
      else if (td.specials.includes("thermalScar")) this.onAftermath?.(cx, cy, "thermalScar", t);
      else if (td.specials.includes("seismicScar") || td.cls === "seismic") this.onAftermath?.(cx, cy, "seismicScar", t);
      if (td.cls === "impact" && d.family === "brittle") this.chainCrack(cx, cy, tile);
      if (td.specials.includes("thermalIgnite") && (d.flammable || this.rng.chance(0.15))) {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = cx + dx; const ny = cy + dy;
          const liq = w.liquid[nx + ny * w.w];
          const gas = w.gas[nx + ny * w.w];
          if (liq === 3 || gas >= 3) {
            this.bus.emit({ type: "ignite", x: nx, y: ny });
            this.onAftermath?.(nx, ny, liq === 3 ? "burnedOil" : "burnedGas", t);
          }
        }
      }
      if (td.specials.includes("rotaryClear")) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx; const y = cy + dy;
          const tt = w.get(x, y);
          if (tt === M.AIR || tt === M.BEDROCK) continue;
          const dd = mat(tt);
          if (dd.granular) {
            w.set(x, y, M.AIR);
            this.bus.emit({ type: "break", x, y, mat: tt, count: 1 });
            this.onAftermath?.(x, y, "collapsed", t);
          }
        }
      }
      if (td.cls === "maw") this.shockwaveFinish(cx, cy);
      if (w.gasSeed[cx + cy * w.w] || w.gas[cx + cy * w.w] >= 6) {
        const force = 18 + t * 3;
        this.vx += (this.rng.range(-1, 1)) * force * 0.1;
        this.vy -= force * 0.2;
        this.bus.emit({ type: "pressureRelease", x: cx, y: cy, force } as any);
        this.onAftermath?.(cx, cy, "pressureRelease", t);
      }
      void extra; void tick;
    }
  }

  private shockwaveFinish(cx: number, cy: number) {
    const w = this.world;
    let collapsed = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx*dx+dy*dy>6) continue;
      const x = cx + dx; const y = cy + dy;
      const t = w.get(x, y);
      if (t === M.AIR || t === M.BEDROCK) continue;
      const d = mat(t);
      if (d.tier > 8) continue;
      if (w.damageOf(x, y) >= d.hp * 0.4) {
        w.set(x, y, M.AIR);
        collapsed++;
        this.bus.emit({ type: "break", x, y, mat: t, count: 1, chain: true });
        this.onAftermath?.(x, y, "mawScar", this.toolTier);
      }
    }
    if (collapsed >= 4) this.bus.emit({ type: "break", x: cx, y: cy, mat: M.AIR, count: collapsed, chain: true });
  }

  chainCrack(cx: number, cy: number, tile: number) {
    const w = this.world;
    const maxChain = 12;
    let count = 0;
    const stack = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
    while (stack.length>0 && count<maxChain) {
      const [x,y]=stack.pop()!;
      if (w.get(x,y)!==tile) continue;
      w.set(x,y,M.AIR);
      count++;
      this.bus.emit({ type: "break", x, y, mat: tile, count: 1 });
      this.onAftermath?.(x,y,"collapsed",this.toolTier);
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    if (count>0) this.bus.emit({ type: "break", x: cx, y: cy, mat: tile, count });
  }

  useUtility(ax: number, ay: number) {
    const td = tool(this.toolTier);
    if (this.utilityCooldown > 0) return;
    this.utilityCooldown = 0.8;
    if (td.utility === "charge") {
      if (this.charges <= 0) return;
      this.charges--;
      return { charge: true, x: ax, y: ay };
    }
    if (td.utility === "resonate") return { resonate: true, x: ax, y: ay };
    return { scan: true, x: ax, y: ay };
  }

  pickup(res: string, amount: number): number {
    const f = this.fx();
    const def = RESOURCES[res];
    if (!def) return 0;
    const bulkEach = def.bulk * f.cargoBulkMul;
    const free = f.cargoCap - this.cargoUsed(f.cargoBulkMul);
    const take = Math.min(amount, Math.floor(free / bulkEach));
    if (take <= 0) { this.bus.emit({ type: "cargoFull" }); return 0; }
    this.cargo.set(res, (this.cargo.get(res) ?? 0) + take);
    if (take < amount) this.bus.emit({ type: "cargoFull" });
    this.bus.emit({ type: "pickup", res, amount: take, x: this.x, y: this.y } as any);
    const now = performance.now() / 1000;
    if (now - this.lastPickupAt < 2.0) this.magnetStreak++; else this.magnetStreak = 1;
    this.lastPickupAt = now;
    this.magnetStreakTimer = 2.0;
    return take;
  }

  effectiveVacuum(): number {
    const base = Math.max(this.fx().vacuum, tool(this.toolTier).vacuum);
    if (this.magnetStreak >= 5 && this.magnetStreakTimer > 0) return base + 1.5;
    return base;
  }
}

const SHAPE_FACTOR: Record<string, number> = {
  drill: 0.5, impact: 0.55, thermal: 0.55, seismic: 0.55,
  rotary: 0.9, resonator: 0.85, maw: 1.15,
};

function shapeExtra(td: ReturnType<typeof tool>, cx: number, cy: number, w: World, toolTier: number, rig: Rig) {
  let n = 0;
  const factor = SHAPE_FACTOR[td.cls] ?? 0.6;
  for (const [ox, oy] of td.shape) {
    if (ox===0 && oy===0) continue;
    const x = cx+ox; const y = cy+oy;
    const tile = w.get(x,y);
    if (tile===M.AIR || tile===M.BEDROCK) continue;
    const d = mat(tile);
    if (d.tier > [0,1,2,3,4,5,6,8][toolTier]) continue;
    const dmg = td.dps * affinityFor(td.cls, d.family) * td.interval * factor;
    w.addDamage(x,y,dmg);
    if (w.damage[x + y * w.w] >= d.hp) {
      w.set(x,y,M.AIR);
      rig.bus.emit({ type: "break", x, y, mat: tile, count: 1 });
      rig.onAftermath?.(x,y,td.tier===7?"mawScar":"collapsed",td.tier);
      n++;
    }
  }
  return n;
}

export function affinityFor(cls: string, family: string): number {
  switch (cls) {
    case "drill": return family==="soft"||family==="granular"||family==="organic"?1.25: family==="brittle"?0.8: family==="metal"||family==="structural"?0.35:0.5;
    case "impact": return family==="brittle"?1.5: family==="dense"?0.7: family==="soft"||family==="granular"?0.9: family==="crystal"?0.4:0.45;
    case "thermal": return family==="metal"||family==="structural"||family==="machine"?1.35: family==="dense"?0.6: family==="crystal"?0.35:0.8;
    case "seismic": return family==="brittle"||family==="dense"?1.1:0.7;
    case "rotary": return 1.0;
    case "resonator": return family==="crystal"?1.6: family==="dense"?0.8:0.7;
    case "maw": return 1.15;
    default: return 1;
  }
}

import { UPGRADES } from "./tools";
const UPGRADE_MAP = new Map<string, UpgradeDef>(UPGRADES.map((u)=>[u.key,u]));
export { TOOLS };
