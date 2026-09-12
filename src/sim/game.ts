/**
 * DEEPER — headless game simulation.
 * Wires world, environment, rig, loot, threats, economy, base, wow triggers and
 * stats into one deterministic stepped simulation. The Phaser layer consumes it;
 * Vitest drives it directly (no rendering required).
 */

import { BASE_X, SURFACE_ROW, TICK_DT, WORLD_H, WORLD_W, stratumAtRow, type StratumId } from "../config";
import { M, mat } from "./materials";
import { EventBus, type SimEvent } from "./events";
import { World } from "./world";
import { generateWorld, threatFamilyFor, type LandmarkInstance, type SpawnPoint } from "./worldgen";
import { EnvSim } from "./env";
import { Rig, type RigInput } from "./rig";
import { LootSim, type CacheEntity } from "./loot";
import { ThreatSim } from "./threats";
import { Economy } from "./economy";
import { BlockedSites } from "./blocked";
import { BaseProgress, stratumRank } from "./base";
import { WowState } from "./wow";
import { StatsTracker } from "./stats";
import { tool } from "./tools";

export interface ScanResult {
  x: number;
  y: number;
  tier: number;
  hits: { res: string; count: number }[];
  anomalies: { x: number; y: number; kind: string }[];
}

export interface Charge { x: number; y: number; fuse: number }

export class GameSim {
  seed: number;
  bus = new EventBus();
  world: World;
  env: EnvSim;
  rig: Rig;
  loot: LootSim;
  threats: ThreatSim;
  economy: Economy;
  blocked: BlockedSites;
  base: BaseProgress;
  wow: WowState;
  stats = new StatsTracker();

  landmarks: LandmarkInstance[] = [];
  spawns: SpawnPoint[] = [];
  motherlodes: { x: number; y: number }[] = [];
  drainChannel: { x: number; y0: number; y1: number } | null = null;
  drainOpen = false;
  coreExtracted = false;
  finaleShown = false;

  input: RigInput = {
    left: false, right: false, jump: false, dig: false, utility: false, interact: false,
    aimX: 0, aimY: 0, selectedTool: 0, winch: false,
  };
  charges: Charge[] = [];
  tick = 0;
  playtime = 0;
  qaMode = false;
  /** cells destroyed recently in early strata (revenge wow detector) */
  private earlyCellsWindow = 0;
  /** landmark reveal queue consumed by presentation */
  lastScan: ScanResult | null = null;
  private geodeRegions = new Set<string>();
  private motherlodeHits = new Map<number, number>();

  constructor(seed?: number) {
    this.seed = (seed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) & 0x7fffffff)) >>> 0;
    this.world = new World(this.seed);
    const gen = generateWorld(this.world);
    this.landmarks = gen.landmarks;
    this.spawns = gen.spawns;
    this.drainChannel = gen.drainChannel;
    this.motherlodes = gen.motherlodes;

    this.env = new EnvSim(this.world, this.bus);
    this.rig = new Rig(this.world, this.bus);
    this.rig.onResonantHit = (x, y) => {
      const cells = this.env.resonancePulse(x, y);
      this.wow.checkResonance(cells);
    };
    this.loot = new LootSim(this.world, this.bus);
    this.loot.registerCaches(gen.spawns.filter((s) => s.kind !== "threat" && s.kind !== "lift").map((s) => ({ kind: s.kind as CacheEntity["kind"], x: s.x, y: s.y, data: s.data })));
    this.threats = new ThreatSim(this.world, this.bus);
    this.economy = new Economy(this.rig, this.bus);
    this.blocked = new BlockedSites(this.bus);
    this.base = new BaseProgress(this.bus);
    this.wow = new WowState(this.bus);

    this.input.aimX = this.rig.x + 3;
    this.input.aimY = this.rig.y;

    this.wireEvents();
    this.world.setActiveAround(this.rig.x, this.rig.y, 2);
    this.syncEnvBox();
  }

  private wireEvents() {
    this.bus.on((e: SimEvent) => {
      switch (e.type) {
        case "break": {
          this.loot.onBreak(e.x, e.y, e.mat);
          this.stats.noteBreak();
          if (mat(e.mat).drops?.length || this.world.ore[e.x + e.y * this.world.w] > 0) {
            this.stats.noteOre(1);
          }
          if (e.chain) {
            this.wow.noteBreak(true);
          } else {
            const st = stratumAtRow(e.y);
            if (stratumRank(st) <= 1) this.earlyCellsWindow += 1;
          }
          // geode detection: shell broken with rich interior nearby
          if (e.mat === M.GEODESHELL) {
            const k = `${e.x >> 3},${e.y >> 3}`;
            if (!this.geodeRegions.has(k)) {
              let oreNear = 0;
              for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                  if (this.world.ore[e.x + dx + (e.y + dy) * this.world.w] > 0) oreNear++;
                }
              }
              if (oreNear >= 3) {
                this.geodeRegions.add(k);
                this.loot.onGeodeBreak(e.x, e.y, stratumAtRow(e.y));
              }
            }
          }
          // motherlode detection
          const oi = this.world.ore[e.x + e.y * this.world.w];
          void oi;
          for (let mi = 0; mi < this.motherlodes.length; mi++) {
            const m = this.motherlodes[mi];
            if (Math.abs(e.x - m.x) <= 4 && Math.abs(e.y - m.y) <= 3) {
              const n = (this.motherlodeHits.get(mi) ?? 0) + 1;
              this.motherlodeHits.set(mi, n);
              if (n === 8) {
                this.loot.onMotherlodeDiscovered(m.x, m.y, stratumAtRow(m.y));
                this.stats.motherlodes++;
                this.wow.trigger("wow01_vein"); // guaranteed jackpot also teaches anticipation
              }
            }
          }
          break;
        }
        case "pickup": {
          this.stats.noteOre(e.amount);
          break;
        }
        case "sell": {
          this.stats.noteSell(e.money);
          break;
        }
        case "blocked": {
          this.blocked.reportBlocked(e.x, e.y, e.mat, e.toolTier);
          if (!this.wow.has("wow02_wall")) this.wow.trigger("wow02_wall");
          break;
        }
        case "toolBought": {
          if (e.tier === 1) this.wow.trigger("wow03_drill");
          if (e.tier === 7) this.wow.trigger("wow11_maw");
          const n = this.blocked.reevaluate(e.tier);
          void n;
          break;
        }
        case "upgradeBought": {
          const n = this.blocked.reevaluate(this.rig.toolTier);
          void n;
          break;
        }
        case "relic": {
          this.stats.relics++;
          break;
        }
        case "geode": {
          this.stats.geodes = this.loot.geodesFound;
          break;
        }
        case "motherlode": {
          this.stats.motherlodes = this.loot.motherlodesFound;
          break;
        }
        case "resonance": {
          this.stats.largestChain = Math.max(this.stats.largestChain, e.cells);
          break;
        }
        case "explode": {
          this.threats.damageNear(e.x, e.y, e.radius + 0.5, 120);
          this.stats.largestChain = Math.max(this.stats.largestChain, Math.round(e.radius * e.radius * 3));
          break;
        }
        case "threatDeath": {
          const pseudo = { family: e.family } as never as Parameters<ThreatSim["dropsFor"]>[0];
          for (const d of this.threats.dropsFor(pseudo)) {
            this.loot.drop(d.res, d.amount, e.x, e.y, 0.7);
          }
          break;
        }
        default:
          break;
      }
    });
  }

  // -------------------------------------------------------------------------
  step(dt: number) {
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(TICK_DT, remaining);
      remaining -= step;
      this.stepTick();
    }
  }

  private stepTick() {
    this.tick++;
    this.playtime += TICK_DT;
    this.stats.playtime = this.playtime;
    const rig = this.rig;

    rig.step(this.input, this.tick);
    this.world.setActiveAround(rig.x, rig.y, 2);
    this.syncEnvBox();
    this.env.step(this.tick);
    this.wow.tickCascade();

    // loot physics + pickup
    const f = rig.fx();
    this.loot.physics(TICK_DT, { x: rig.x, y: rig.y, vacuumRadius: Math.max(f.vacuum, tool(rig.toolTier).vacuum) }, (l) => {
      const taken = rig.pickup(l.res, l.amount);
      return taken > 0;
    });

    // caches the drill cracked open
    for (const c of this.loot.caches) {
      if (c.used) continue;
      if (c.kind === "cache" && c.hp > 0) {
        // drill proximity damages caches
        if (Math.hypot(c.x - this.rig.lastDugCell.x, c.y - this.rig.lastDugCell.y) < 1.6 && this.input.dig) {
          c.hp -= 40;
        }
        if (c.hp <= 0) this.openCache(c);
      }
    }

    this.touchCollect();

    // threats
    const st = stratumAtRow(Math.floor(rig.y));
    this.threats.tryAmbientSpawn(rig.x, rig.y, st, TICK_DT);
    this.threats.step(TICK_DT, rig, (x, y, dmg) => {
      const t = this.world.get(x, y);
      if (t === M.AIR || t === M.BEDROCK) return false;
      this.world.addDamage(x, y, dmg);
      const d = mat(t);
      if (this.world.damage[x + y * this.world.w] >= d.hp) {
        this.world.set(x, y, M.AIR);
        this.bus.emit({ type: "break", x, y, mat: t, count: 1 });
      }
      return true;
    });

    // seismic charges fuse
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.fuse -= TICK_DT;
      if (c.fuse <= 0) {
        this.charges.splice(i, 1);
        this.env.explode(c.x, c.y, 3.4, 380);
        this.threats.damageNear(c.x, c.y, 4.2, 140);
      }
    }

    // exploration fog + landmarks
    this.world.markExplored(Math.floor(rig.x), Math.floor(rig.y), 8);
    this.checkLandmarks();
    this.checkStratum(st);

    // early-window decay (revenge detector)
    this.earlyCellsWindow = Math.max(0, this.earlyCellsWindow - 0.12);
    this.wow.checkRevenge(rig.y, Math.round(this.earlyCellsWindow), st);
    this.wow.checkBase(this.base);

    // charges refill at the works
    if (st === "surface" && Math.abs(rig.x - BASE_X) < 9 && Math.floor(rig.y) < 14) {
      if (rig.charges < rig.maxCharges) rig.charges = rig.maxCharges;
    }
    if (f.caches) {
      for (const stop of this.base.liftStops) {
        const sp = this.liftSpawn(stop);
        if (sp && Math.hypot(sp.x - rig.x, sp.y - rig.y) < 7) {
          rig.charges = rig.maxCharges;
          rig.hp = Math.min(rig.maxHp, rig.hp + 6 * TICK_DT);
        }
      }
    }

    // environmental state: bell exposure checks while draining
    if (this.drainOpen && this.tick % 120 === 0) {
      const bell = this.landmarks.find((l) => l.key === "sunkenbell");
      if (bell) this.wow.checkBellExposed(this.world, bell);
      this.base.evaluate({ lifetimeEarned: this.economy.lifetimeEarned, ownedTools: rig.ownedTools, upgrades: rig.upgrades, deepestStratum: this.stats.deepestStratum });
    }
  }

  private syncEnvBox() {
    const cx = Math.floor(this.rig.x / 32);
    const cy = Math.floor(this.rig.y / 32);
    this.env.box = {
      x0: Math.max(1, (cx - 2) * 32),
      y0: Math.max(0, (cy - 2) * 32),
      x1: Math.min(WORLD_W - 2, (cx + 2) * 32 + 31),
      y1: Math.min(WORLD_H - 1, (cy + 2) * 32 + 31),
    };
  }

  private checkLandmarks() {
    const rig = this.rig;
    for (const l of this.landmarks) {
      if (!l.discovered) {
        const near = Math.abs(rig.x - (l.x + l.w / 2)) < l.w / 2 + 10 && Math.abs(rig.y - (l.y + l.h / 2)) < l.h / 2 + 8;
        if (near && l.stratum !== "surface") {
          l.discovered = true;
          this.bus.emit({ type: "landmarkRevealed", key: l.key, name: l.name, x: l.x, y: l.y, wow: l.reveal });
        }
        continue;
      }
      if (l.reveal === "wow04") this.wow.checkExcavator(this.world, l);
      if (l.reveal === "wow05_site") this.wow.checkVaultEntry(this.world, l, rig.x, rig.y);
      if (l.reveal === "wow06_bell" && this.drainOpen && this.tick % 90 === 0) this.wow.checkBellExposed(this.world, l);
    }
  }

  private checkStratum(st: StratumId) {
    if (!this.stats.strataSeen.has(st)) {
      this.stats.strataSeen.add(st);
      this.stats.noteDepth(Math.floor(this.rig.y), st);
      this.bus.emit({ type: "stratumRevealed", stratum: st });
      this.base.evaluate({
        lifetimeEarned: this.economy.lifetimeEarned, ownedTools: this.rig.ownedTools,
        upgrades: this.rig.upgrades, deepestStratum: this.stats.deepestStratum,
      });
    }
    this.stats.noteDepth(Math.floor(this.rig.y), st);
  }

  // ---- interactions --------------------------------------------------------
  /** Drill proximity opens cache crates into loot bursts. */
  openCache(c: CacheEntity) {
    if (c.used) return;
    c.used = true;
    this.loot.drop("gold", 3 + (this.tick % 4), c.x, c.y);
    this.loot.drop("silver", 3, c.x, c.y);
    this.loot.drop("tungsten", 2, c.x, c.y);
    this.bus.emit({ type: "pickup", res: "gold", amount: 1, x: c.x, y: c.y });
  }

  /** Returns the label of the interactable in range, or null. */
  interactTarget(): { kind: string; label: string; x: number; y: number } | null {
    const rig = this.rig;
    const st = stratumAtRow(Math.floor(rig.y));
    if (st === "surface" && Math.abs(rig.x - BASE_X) < 9 && Math.floor(rig.y) < 14) {
      return { kind: "base", label: "The Works — sell & upgrades", x: BASE_X, y: SURFACE_ROW };
    }
    for (const c of this.loot.caches) {
      if (c.used) continue;
      const d = Math.hypot(c.x - rig.x, c.y - rig.y);
      if (d < 3.2) {
        if (c.kind === "salvage") return { kind: "salvage", label: "Extract large salvage", x: c.x, y: c.y };
        if (c.kind === "valve" && !this.drainOpen) return { kind: "valve", label: "Open drainage gallery", x: c.x, y: c.y };
        if (c.kind === "core") return { kind: "core", label: "Extract the Deep Engine core", x: c.x, y: c.y };
      }
    }
    if (this.rig.fx().lift) {
      for (const sp of this.spawns) {
        if (sp.kind !== "lift") continue;
        if (Math.hypot(sp.x - rig.x, sp.y - rig.y) < 3.5) {
          const known = this.base.liftStops.has(sp.data!);
          return { kind: "lift", label: known ? "Freight lift — travel" : "Freight lift — unlock landing", x: sp.x, y: sp.y };
        }
      }
    }
    return null;
  }

  interact(): boolean {
    const t = this.interactTarget();
    if (!t) return false;
    switch (t.kind) {
      case "base": {
        this.economy.sellAll();
        this.rig.charges = this.rig.maxCharges;
        return true;
      }
      case "salvage": {
        const c = this.loot.caches.find((c) => c.kind === "salvage" && !c.used && Math.hypot(c.x - this.rig.x, c.y - this.rig.y) < 3.2);
        if (!c) return false;
        // requires open space around it
        let open = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (this.world.get(c.x + dx, c.y + dy) === M.AIR) open++;
          }
        }
        if (open < 16) return false;
        c.used = true;
        this.loot.salvageFound++;
        this.loot.drop("composite", 4, c.x, c.y);
        this.loot.drop("alloy", 3, c.x, c.y);
        this.loot.drop("gold", 2, c.x, c.y);
        this.bus.emit({ type: "salvage", x: c.x, y: c.y });
        return true;
      }
      case "valve": {
        this.openDrain();
        return true;
      }
      case "core": {
        if (this.coreExtracted) return false;
        this.coreExtracted = true;
        this.wow.trigger("wow12_depth");
        this.bus.emit({ type: "coreExtracted" });
        if (!this.finaleShown) {
          this.finaleShown = true;
          this.bus.emit({ type: "finale" });
        }
        return true;
      }
      case "lift": {
        for (const sp of this.spawns) {
          if (sp.kind === "lift" && Math.hypot(sp.x - this.rig.x, sp.y - this.rig.y) < 3.5) {
            if (!this.base.liftStops.has(sp.data!)) {
              this.base.liftStops.add(sp.data!);
              this.bus.emit({ type: "liftUnlocked", stop: sp.data! });
            }
            return true; // travel itself is a UI action
          }
        }
        return false;
      }
    }
    return false;
  }

  /** WOW-06: pump-room valve carves the drainage gallery to the cistern. */
  openDrain() {
    if (this.drainOpen || !this.drainChannel) return false;
    this.drainOpen = true;
    const { x, y0, y1 } = this.drainChannel;
    for (let y = y0; y <= y1; y++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        if (this.world.get(tx, y) !== M.BEDROCK) {
          this.world.set(tx, y, M.AIR);
        }
      }
    }
    this.base.valvesUsed.add("pumproom");
    this.wow.trigger("wow06_drain");
    this.bus.emit({ type: "explode", x, y: y0, radius: 2, big: false });
    return true;
  }

  liftSpawn(stopKey: string): { x: number; y: number } | null {
    const sp = this.spawns.find((s) => s.kind === "lift" && s.data === stopKey);
    return sp ? { x: sp.x, y: sp.y } : null;
  }

  travelTo(stopKey: string): boolean {
    if (!this.rig.fx().lift || !this.base.liftStops.has(stopKey)) return false;
    const sp = this.liftSpawn(stopKey);
    if (!sp) return false;
    this.rig.x = sp.x;
    this.rig.y = sp.y - 1;
    this.rig.vx = 0;
    this.rig.vy = 0;
    return true;
  }

  /** Utility action from input — scanner ping / charge / resonance. */
  useUtilityAt(ax: number, ay: number) {
    const td = tool(this.rig.toolTier);
    const res = this.rig.useUtility(ax, ay) as { scan?: boolean; charge?: boolean; resonate?: boolean; x: number; y: number };
    if (!res) return;
    if (res.charge) {
      this.charges.push({ x: ax, y: ay, fuse: 0.9 });
    } else if (res.resonate) {
      const target = this.rig.findImpact(this.rig.x, this.rig.y, ax, ay);
      if (target) {
        const t = this.world.get(target.x, target.y);
        const d = mat(t);
        if (d.resonant || d.conductive) {
          const cells = this.env.resonancePulse(target.x, target.y);
          this.wow.checkResonance(cells);
          this.threats.damageNear(target.x, target.y, 6, 90);
        } else {
          this.env.explode(target.x, target.y, 1.6, 120);
        }
      }
    } else if (res.scan) {
      this.lastScan = this.scan(ax, ay);
    }
    void td;
  }

  /** Scanner ping. Detail scales with scan tier. */
  scan(ax: number, ay: number): ScanResult {
    const tier = this.rig.fx().scanTier;
    const w = this.world;
    const radius = 10;
    const counts = new Map<string, number>();
    const anomalies: { x: number; y: number; kind: string }[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(ax + dx);
        const y = Math.floor(ay + dy);
        if (!w.inBounds(x, y)) continue;
        if (dx * dx + dy * dy > radius * radius) continue;
        const oi = w.ore[x + y * w.w];
        if (oi > 0 && tier >= 1) {
          const key = ["copper", "coal", "iron", "silver", "gold", "tungsten", "quartz", "voidgem", "nickel", "amber", "brinepearl", "obsshard"][oi - 1];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        if (tier >= 4) {
          const t = w.tiles[x + y * w.w];
          if (t === M.GEODESHELL) anomalies.push({ x, y, kind: "geode" });
        }
      }
    }
    if (tier >= 4) {
      for (const m of this.motherlodes) {
        if (Math.hypot(m.x - ax, m.y - ay) < radius + 4) anomalies.push({ x: m.x, y: m.y, kind: "motherlode" });
      }
    }
    return { x: ax, y: ay, tier, hits: [...counts].map(([res, count]) => ({ res, count })), anomalies };
  }

  // ---- persistence -----------------------------------------------------------
  serializeWorld() {
    return this.world.exportDeltas();
  }
  serializeBlocked() {
    return this.blocked.serialize();
  }
  serializeStats() {
    return this.stats.serialize();
  }

  serialize(): import("./save").SaveData {
    return {
      v: 1,
      seed: this.seed,
      playtime: this.playtime,
      world: this.serializeWorld(),
      rig: {
        x: this.rig.x, y: this.rig.y, hp: this.rig.hp, money: this.rig.money,
        toolTier: this.rig.toolTier, ownedTools: this.rig.ownedTools,
        cargo: [...this.rig.cargo], blueprints: [...this.rig.blueprints],
        relics: [...this.rig.relics], upgrades: [...this.rig.upgrades],
        charges: this.rig.charges,
      },
      economy: { lifetimeEarned: this.economy.lifetimeEarned },
      base: this.base.serialize(),
      blocked: this.serializeBlocked(),
      wow: this.wow.serialize(),
      caches: this.loot.caches.map((c) => ({ id: c.id, used: c.used })),
      landmarks: this.landmarks.map((l) => ({ key: l.key, x: l.x, discovered: l.discovered })),
      stats: this.serializeStats(),
      drainOpen: this.drainOpen,
    };
  }

  load(data: import("./save").SaveData) {
    this.world.importDeltas(data.world);
    const r = data.rig;
    this.rig.x = r.x; this.rig.y = r.y; this.rig.hp = r.hp;
    this.rig.money = r.money; this.rig.toolTier = r.toolTier; this.rig.ownedTools = r.ownedTools;
    this.rig.cargo = new Map(r.cargo);
    this.rig.blueprints = new Set(r.blueprints);
    this.rig.relics = new Set(r.relics);
    this.rig.upgrades = new Set(r.upgrades);
    this.rig.charges = r.charges ?? 0;
    this.economy.lifetimeEarned = data.economy.lifetimeEarned;
    this.base.load(data.base);
    this.blocked.load(data.blocked);
    this.wow.load(data.wow);
    for (const cs of data.caches ?? []) {
      const c = this.loot.caches.find((x) => x.id === cs.id);
      if (c) c.used = cs.used;
    }
    for (const l of data.landmarks ?? []) {
      const inst = this.landmarks.find((x) => x.key === l.key && x.x === l.x);
      if (inst) inst.discovered = l.discovered;
    }
    this.stats.load(data.stats);
    this.playtime = data.playtime ?? 0;
    this.drainOpen = !!data.drainOpen;
    if (this.drainOpen) this.openDrain(); // re-carve channel (idempotent)
    this.stats.strataSeen = new Set([...this.stats.strataSeen]);
    this.world.setActiveAround(this.rig.x, this.rig.y, 2);
    this.syncEnvBox();
  }

  /** Blueprint collection (called by scene when interacting with cache pickups). */
  collectCache(c: CacheEntity) {
    if (c.used) return;
    c.used = true;
    if (c.kind === "cache") {
      // rich loot
      this.loot.drop("gold", 4 + (this.seed % 5), c.x, c.y);
      this.loot.drop("silver", 4, c.x, c.y);
      this.loot.drop("tungsten", 2, c.x, c.y);
    } else if (c.kind === "relic" && c.data) {
      if (!this.rig.relics.has(c.data)) {
        this.rig.relics.add(c.data);
        this.loot.relicsFound.add(c.data);
        this.bus.emit({ type: "relic", key: c.data });
      } else {
        this.loot.drop("gold", 2, c.x, c.y);
      }
    } else if (c.kind === "blueprint" && c.data) {
      if (!this.rig.blueprints.has(c.data)) {
        this.rig.blueprints.add(c.data);
        this.loot.blueprintsFound.add(c.data);
        this.bus.emit({ type: "blueprint", key: c.data });
      } else {
        this.rig.money += 2500;
      }
    }
  }

  /** Caches near the rig that can be collected by touch. */
  touchCollect() {
    for (const c of this.loot.caches) {
      if (c.used) continue;
      if (c.kind === "cache") continue; // drills open these
      if (Math.hypot(c.x - this.rig.x, c.y - this.rig.y) < 2.2) {
        if (c.kind === "salvage" || c.kind === "valve" || c.kind === "core" || c.kind === "lift") continue;
        this.collectCache(c);
      }
    }
  }
}

export { threatFamilyFor };
