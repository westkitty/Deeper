/**
 * DEEPER — the rig: player machine simulation.
 * Movement, digging (tool-driven terrain damage), cargo, health, protection,
 * emergency extraction. Pure logic; the presentation layer drives it with input.
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
  aimX: number; // world cells
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

  cargo = new Map<string, number>();
  money = 0;
  blueprints = new Set<string>();
  relics = new Set<string>();
  toolTier = 0;
  ownedTools = 0; // highest owned tool tier (contiguous unlock chain)
  upgrades = new Set<string>();
  charges = 0;
  maxCharges = 3;

  digCooldown = 0;
  utilityCooldown = 0;
  aimAngle = 0;
  digTicks = 0;

  // accumulated FX hooks
  lastDugCell = { x: -1, y: -1 };
  /** Called when the Resonator strikes resonant material (GameSim wires the pulse). */
  onResonantHit?: (x: number, y: number) => void;
  rng: RNG;

  constructor(world: World, bus: EventBus) {
    this.world = world;
    this.bus = bus;
    this.rng = new RNG(0x51ce + world.seed);
  }

  // ---- derived stats ------------------------------------------------------
  fx(): Required<Pick<UpgradeDef["fx"], "cargoCap" | "cargoBulkMul" | "vacuum" | "jump" | "run" | "heatProt" | "pressureProt" | "scanTier" | "refinery" | "chargeCap">> & { damper: boolean; winch: boolean; lift: boolean; caches: boolean } {
    const f = {
      cargoCap: 30, cargoBulkMul: 1, vacuum: 2.2, jump: RIG.jump, run: RIG.maxRun,
      heatProt: 0, pressureProt: 0, scanTier: 0, refinery: 0, chargeCap: 3,
      damper: false, winch: false, lift: false, caches: false,
    };
    for (const key of this.upgrades) {
      // imperatively apply owned upgrades (requires chains are enforced at purchase)
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
    for (const [res, amount] of this.cargo) {
      used += amount * (RESOURCES[res]?.bulk ?? 1) * bulkMul;
    }
    return used;
  }
  cargoFree(): number {
    return this.fx().cargoCap - this.cargoUsed(this.fx().cargoBulkMul);
  }
  cargoValue(): number {
    let v = 0;
    for (const [res, amount] of this.cargo) v += amount * (RESOURCES[res]?.value ?? 0);
    return v;
  }

  // ---- movement -------------------------------------------------------------
  step(input: RigInput, tick: number) {
    const w = this.world;
    if (this.dead) {
      this.deadTimer -= TICK_DT;
      if (this.deadTimer <= 0) this.emergencyExtract();
      return;
    }
    const f = this.fx();
    const run = f.run;

    let ax = 0;
    if (input.left) ax -= RIG.accel;
    if (input.right) ax += RIG.accel;
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    this.vx += ax * TICK_DT;
    if (input.left === input.right) this.vx -= this.vx * Math.min(1, RIG.friction * TICK_DT);
    this.vx = Math.max(-run, Math.min(run, this.vx));

    const inWater = this.liquidContact() === LIQ_WATER;
    const gravity = inWater ? RIG.gravity * 0.42 : RIG.gravity;
    const maxFall = inWater ? RIG.maxFall * 0.3 : RIG.maxFall;

    // jump / boost
    if (input.jump && this.grounded && this.vy > -1) {
      this.vy = -f.jump * (inWater ? 0.7 : 1);
      this.grounded = false;
    }
    // winch: slow vertical climb against walls
    if (input.winch && f.winch && !this.grounded) {
      const againstWall =
        (input.left && this.collidesAt(this.x - RIG.w / 2 - 0.1, this.y)) ||
        (input.right && this.collidesAt(this.x + RIG.w / 2 + 0.1, this.y));
      if (againstWall) this.vy = Math.min(this.vy, -4.2);
    }

    this.vy += gravity * TICK_DT;
    this.vy = Math.min(this.vy, maxFall);

    // horizontal move + collide (cell vs AABB)
    this.moveX(this.vx * TICK_DT);
    const fallSpeed = this.vy;
    this.moveY(this.vy * TICK_DT);

    // landing damage
    if (this.grounded && fallSpeed > RIG.fallSafeSpeed && !f.damper) {
      const dmg = (fallSpeed - RIG.fallSafeSpeed) * 1.35;
      this.hurt(dmg, "impact");
    }

    // environmental hazards
    this.applyStratumHazards();

    // dig
    this.digCooldown -= TICK_DT;
    this.utilityCooldown -= TICK_DT;
    if (input.dig && this.digCooldown <= 0) {
      this.digAt(input.aimX, input.aimY, tick);
    }
    if (input.utility && this.utilityCooldown <= 0) {
      this.useUtility(input.aimX, input.aimY);
    }
  }

  private moveX(dx: number) {
    if (dx === 0) return;
    const dir = Math.sign(dx);
    let remaining = Math.abs(dx);
    const edge = () => this.x + dir * (RIG.w / 2);
    while (remaining > 0) {
      const step = Math.min(0.2, remaining);
      const nx = this.x + dir * step;
      const col = Math.floor(nx + dir * (RIG.w / 2 - 0.02));
      // obstacle in the leading column across the hull's rows?
      let blocked = false;
      for (const oy of [-RIG.h / 2 + 0.1, 0, RIG.h / 2 - 0.05]) {
        if (this.world.solid(col, Math.floor(this.y + oy))) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        // step-up: 1-cell lip while grounded
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
          // land exactly on the obstacle row
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
      // magma adjacency
      if (f.heatProt < 2) {
        const cx = Math.floor(this.x);
        const cy = Math.floor(this.y + 1);
        const w = this.world;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [0, 0]] as const) {
          const i = cx + dx + (cy + dy) * w.w;
          if (w.liquid[i] === LIQ_MAGMA) {
            this.hurt(14 * TICK_DT * 60, "magma");
            break;
          }
        }
      }
    }
    // fire contact
    // (fires damage through events in GameSim)
  }

  hurt(amount: number, cause: string) {
    if (this.dead) return;
    this.hp -= amount;
    this.bus.emit({ type: "hurt", amount, cause });
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadTimer = 2.2;
      this.bus.emit({ type: "death" });
    }
  }

  /** Emergency extraction: keep upgrades + world; lose part of carried cargo. */
  emergencyExtract() {
    const lost = Math.floor(this.cargoValue() * 0.3);
    this.cargo.clear();
    this.dead = false;
    this.hp = this.maxHp;
    this.x = BASE_X + 2;
    this.y = SURFACE_ROW - 3.2;
    this.vx = 0;
    this.vy = 0;
    this.bus.emit({ type: "emergencyExtract" });
    return lost;
  }

  // ---- excavation -------------------------------------------------------------
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
    // first solid cell along the aim (including impact cell)
    const target = this.findImpact(this.x, this.y, ix, iy);
    if (!target) return;
    this.applyDig(target.x, target.y, td, tick);
    this.lastDugCell = target;
    this.digTicks++;
  }

  /** Walk the aim ray and return the first cell that stops the drill. */
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
      if (w.solid(cx, cy)) {
        // liquid does not block; treat only tiles
        return { x: cx, y: cy };
      }
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
      // this tool cannot even scratch it
      this.bus.emit({ type: "blocked", x: cx, y: cy, mat: tile, toolTier: t });
      this.bus.emit({ type: "drillHit", x: cx, y: cy, mat: tile, effective: false, toolTier: t });
      return;
    }
    // affinity scaling: drill class best on soft, impact on brittle, thermal on metal/structural...
    const affinity = affinityFor(td.cls, d.family);
    const dmg = td.dps * affinity * td.interval;
    w.addDamage(cx, cy, dmg);
    this.bus.emit({ type: "drillHit", x: cx, y: cy, mat: tile, effective: true, toolTier: t });
    if (w.damage[cx + cy * w.w] >= d.hp) {
      const extra = shapeExtra(td, cx, cy, w, t, this);
      w.set(cx, cy, M.AIR);
      this.bus.emit({ type: "break", x: cx, y: cy, mat: tile, count: 1 });
      // impact chaining: connected brittle material cracks with the Hammerhead
      if (td.cls === "impact" && d.family === "brittle") {
        this.chainCrack(cx, cy, tile);
      }
      // THE MAW: its shockwave finishes anything the swing already cracked
      if (td.cls === "maw") this.shockwaveFinish(cx, cy);
      void extra;
      void tick;
    }
  }

  /** MAW shockwave: shattered-fringe cells within 2.5 cells collapse. */
  private shockwaveFinish(cx: number, cy: number) {
    const w = this.world;
    let collapsed = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > 6) continue;
        const x = cx + dx;
        const y = cy + dy;
        const t = w.get(x, y);
        if (t === M.AIR || t === M.BEDROCK) continue;
        const d = mat(t);
        if (d.tier > 8) continue;
        if (w.damageOf(x, y) >= d.hp * 0.4) {
          w.set(x, y, M.AIR);
          collapsed++;
          this.bus.emit({ type: "break", x, y, mat: t, count: 1, chain: true });
        }
      }
    }
    if (collapsed >= 4) {
      this.bus.emit({ type: "break", x: cx, y: cy, mat: M.AIR, count: collapsed, chain: true });
    }
  }

  /** Hammerhead chain: connected brittle cells of the same material fracture. */
  chainCrack(cx: number, cy: number, tile: number) {
    const w = this.world;
    const maxChain = 12;
    let count = 0;
    const stack = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
    while (stack.length > 0 && count < maxChain) {
      const [x, y] = stack.pop()!;
      if (w.get(x, y) !== tile) continue;
      w.set(x, y, M.AIR);
      count++;
      this.bus.emit({ type: "break", x, y, mat: tile, count: 1 });
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (count > 0) this.bus.emit({ type: "break", x: cx, y: cy, mat: tile, count });
  }

  useUtility(ax: number, ay: number) {
    const td = tool(this.toolTier);
    if (this.utilityCooldown > 0) return; // single gate: both input paths funnel here
    this.utilityCooldown = 0.8;
    if (td.utility === "charge") {
      if (this.charges <= 0) return;
      this.charges--;
      return { charge: true, x: ax, y: ay }; // GameSim detonates (world effects)
    }
    if (td.utility === "resonate") {
      return { resonate: true, x: ax, y: ay };
    }
    return { scan: true, x: ax, y: ay };
  }

  pickup(res: string, amount: number): number {
    const f = this.fx();
    const def = RESOURCES[res];
    if (!def) return 0;
    const bulkEach = def.bulk * f.cargoBulkMul;
    const free = f.cargoCap - this.cargoUsed(f.cargoBulkMul);
    const take = Math.min(amount, Math.floor(free / bulkEach));
    if (take <= 0) {
      this.bus.emit({ type: "cargoFull" });
      return 0;
    }
    this.cargo.set(res, (this.cargo.get(res) ?? 0) + take);
    if (take < amount) this.bus.emit({ type: "cargoFull" });
    this.bus.emit({ type: "pickup", res, amount: take, x: this.x, y: this.y });
    return take;
  }
}

/** Per-class multiplier for shape (non-impact) cells: big machines sweep clean. */
const SHAPE_FACTOR: Record<string, number> = {
  drill: 0.5, impact: 0.55, thermal: 0.55, seismic: 0.55,
  rotary: 0.9, resonator: 0.85, maw: 1.15,
};

function shapeExtra(td: ReturnType<typeof tool>, cx: number, cy: number, w: World, toolTier: number, rig: Rig) {
  // multi-cell shapes hit neighbours on the same tick (drill width)
  let n = 0;
  const factor = SHAPE_FACTOR[td.cls] ?? 0.6;
  for (const [ox, oy] of td.shape) {
    if (ox === 0 && oy === 0) continue;
    const x = cx + ox;
    const y = cy + oy;
    const tile = w.get(x, y);
    if (tile === M.AIR || tile === M.BEDROCK) continue;
    const d = mat(tile);
    if (d.tier > [0, 1, 2, 3, 4, 5, 6, 8][toolTier]) continue;
    const dmg = td.dps * affinityFor(td.cls, d.family) * td.interval * factor;
    w.addDamage(x, y, dmg);
    if (w.damage[x + y * w.w] >= d.hp) {
      w.set(x, y, M.AIR);
      rig.bus.emit({ type: "break", x, y, mat: tile, count: 1 });
      n++;
    }
  }
  return n;
}

/** Tool-class affinity per material family (feels right > simulates rock). */
export function affinityFor(cls: string, family: string): number {
  switch (cls) {
    case "drill":
      return family === "soft" || family === "granular" || family === "organic" ? 1.25 :
        family === "brittle" ? 0.8 : family === "metal" || family === "structural" ? 0.35 : 0.5;
    case "impact":
      return family === "brittle" ? 1.5 : family === "dense" ? 0.7 :
        family === "soft" || family === "granular" ? 0.9 : family === "crystal" ? 0.4 : 0.45;
    case "thermal":
      return family === "metal" || family === "structural" || family === "machine" ? 1.35 :
        family === "dense" ? 0.6 : family === "crystal" ? 0.35 : 0.8;
    case "seismic":
      return family === "brittle" || family === "dense" ? 1.1 : 0.7;
    case "rotary":
      return 1.0;
    case "resonator":
      return family === "crystal" ? 1.6 : family === "dense" ? 0.8 : 0.7;
    case "maw":
      return 1.15;
    default:
      return 1;
  }
}

import { UPGRADES } from "./tools";
const UPGRADE_MAP = new Map<string, UpgradeDef>(UPGRADES.map((u) => [u.key, u]));

export { TOOLS };
