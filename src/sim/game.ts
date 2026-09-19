/**
 * DEEPER — headless game simulation.
 * Wires world, environment, rig, loot, threats, economy, base, wow triggers and
 * stats into one deterministic stepped simulation. The Phaser layer consumes it;
 * Vitest drives it directly (no rendering required).
 * v1.2: aftermath tracker, compositional hazards, expanded threats, machine identity
 * heat/recoil/weight, vulnerable site details, performance culling.
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
import { AftermathTracker } from "./aftermath";

export interface ScanResult {
  x: number;
  y: number;
  tier: number;
  hits: { res: string; count: number }[];
  anomalies: { x: number; y: number; kind: string }[];
}

export interface Charge { x: number; y: number; fuse: number }

export interface DeathCache { x: number; y: number; cargo: [string, number][] }

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
  aftermath = new AftermathTracker();

  landmarks: LandmarkInstance[] = [];
  spawns: SpawnPoint[] = [];
  motherlodes: { x: number; y: number }[] = [];
  drainChannel: { x: number; y0: number; y1: number } | null = null;
  drainOpen = false;
  coreExtracted = false;
  finaleShown = false;
  scanOverlays: { x: number; y: number; tier: number; hits: { res: string; count: number }[]; expiresIn: number }[] = [];
  resonanceCombo = 0;
  resonanceComboTimer = 0;
  deathCaches: DeathCache[] = [];
  liftChannel: { stop: string; t: number } | null = null;
  tutorialShown = new Set<string>();
  tutorialCooldown = 0;
  pendingHint: { id: string; text: string } | null = null;
  postGameSpawns = 0;

  input: RigInput = {
    left: false, right: false, jump: false, dig: false, utility: false, interact: false,
    aimX: 0, aimY: 0, selectedTool: 0, winch: false,
  };
  charges: Charge[] = [];
  tick = 0;
  playtime = 0;
  qaMode = false;
  private earlyCellsWindow = 0;
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
    // aftermath wiring
    this.env.onAftermath = (x, y, kind, tier) => {
      this.aftermath.record(x, y, kind as any, this.tick, tier);
      this.bus.emit({ type: "aftermath", x, y, kind, tier });
    };
    this.rig.onAftermath = (x, y, kind, tier) => {
      this.aftermath.record(x, y, kind as any, this.tick, tier);
      this.bus.emit({ type: "aftermath", x, y, kind, tier });
    };
    const baseExtract = this.rig.emergencyExtract.bind(this.rig);
    this.rig.emergencyExtract = (() => {
      const out = baseExtract();
      if (out.dropped.length > 0) {
        this.deathCaches.push({ x: out.x, y: out.y, cargo: out.dropped });
      }
      return out;
    }) as Rig["emergencyExtract"];
    this.loot = new LootSim(this.world, this.bus);
    this.loot.registerCaches(gen.spawns.filter((s) => s.kind !== "threat" && s.kind !== "lift").map((s) => ({ kind: s.kind as CacheEntity["kind"], x: s.x, y: s.y, data: s.data })));
    this.threats = new ThreatSim(this.world, this.bus);
    this.threats.getLoot = () => this.loot.loot.map((l) => ({ id: l.id, x: l.x, y: l.y, res: l.res, amount: l.amount }));
    this.threats.getEnv = () => ({ fires: this.env.fires, steamCells: this.env.steamCells });
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
          this.stats.noteStratumBreak(stratumAtRow(e.y));
          if (this.stats.cellsDestroyed === 1) {
            this.hint("dig", "You broke ground. Hold LEFT CLICK toward the pointer to keep digging.");
          }
          if (mat(e.mat).drops?.length || this.world.ore[e.x + e.y * this.world.w] > 0) {
            this.stats.noteOre(1);
          }
          if (e.chain) {
            this.wow.noteBreak(true);
          } else {
            const st = stratumAtRow(e.y);
            if (stratumRank(st) <= 1) this.earlyCellsWindow += 1;
          }
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
          for (let mi = 0; mi < this.motherlodes.length; mi++) {
            const m = this.motherlodes[mi];
            if (Math.abs(e.x - m.x) <= 4 && Math.abs(e.y - m.y) <= 3) {
              const n = (this.motherlodeHits.get(mi) ?? 0) + 1;
              this.motherlodeHits.set(mi, n);
              if (n === 8) {
                this.loot.onMotherlodeDiscovered(m.x, m.y, stratumAtRow(m.y));
                this.stats.motherlodes++;
                this.wow.trigger("wow01_vein");
              }
            }
          }
          // check if a blocked site was cleared
          for (const site of this.blocked.sites.values()) {
            if (Math.abs(site.x - e.x) <= 4 && Math.abs(site.y - e.y) <= 4 && site.vulnerable) {
              this.stats.markedConquered++;
            }
          }
          break;
        }
        case "pickup": {
          this.stats.noteOre(e.amount);
          this.stats.magnetStreakBest = Math.max(this.stats.magnetStreakBest, this.rig.magnetStreak);
          this.hint("pickup", "Loot flows to your hopper. Vacuum upgrades pull from further away.");
          break;
        }
        case "sell": {
          this.stats.noteSell(e.money);
          this.hint("sell", "Cargo sold. Hopper extensions and Stack Compression stretch every trip further.");
          break;
        }
        case "cargoFull": {
          this.hint("cargo", "Hopper full — sell at the works (E at base) or buy cargo upgrades.");
          break;
        }
        case "blocked": {
          this.blocked.reportBlocked(e.x, e.y, e.mat, e.toolTier);
          if (!this.wow.has("wow02_wall")) this.wow.trigger("wow02_wall");
          this.hint("blocked", "That wall outclasses your rig. It is marked on the map (M) — come back with better tools.");
          break;
        }
        case "toolBought": {
          if (e.tier === 1) this.wow.trigger("wow03_drill");
          if (e.tier === 7) this.wow.trigger("wow11_maw");
          const n = this.blocked.reevaluate(e.tier);
          if (n > 0) {
            const summary = this.blocked.vulnerableSummary();
            this.pendingHint = { id: `vuln_${e.tier}`, text: `${n} marked sites now vulnerable: ${summary}. Check map (M).` };
            this.tutorialCooldown = 1;
          }
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
          if (this.resonanceComboTimer > 0) this.resonanceCombo++;
          else this.resonanceCombo = 1;
          this.resonanceComboTimer = 4.0;
          this.stats.resonanceCombos++;
          this.stats.bestResonanceCombo = Math.max(this.stats.bestResonanceCombo, this.resonanceCombo);
          break;
        }
        case "explode": {
          this.threats.damageNear(e.x, e.y, e.radius + 0.5, 120);
          this.stats.largestChain = Math.max(this.stats.largestChain, Math.round(e.radius * e.radius * 3));
          this.aftermath.record(e.x, e.y, "seismicScar" as any, this.tick);
          break;
        }
        case "threatDeath": {
          this.stats.threatsKilled++;
          if (e.elite) this.stats.elitesKilled++;
          const pseudo = { family: e.family } as never as Parameters<ThreatSim["dropsFor"]>[0];
          for (const d of this.threats.dropsFor(pseudo)) {
            this.loot.drop(d.res, d.amount, e.x, e.y, 0.7);
          }
          break;
        }
        case "hurt": {
          if (this.liftChannel) this.liftChannel = null;
          break;
        }
        case "threatSteal": {
          // remove stolen loot - find nearest loot to threat
          const threatForIdx = this.threats.threats.find((t) => t.id === e.id);
          const tx = threatForIdx?.x ?? 0;
          const ty = threatForIdx?.y ?? 0;
          const idx = this.loot.loot.findIndex((l) => l.id === (e as any).id || (l.res === e.res && Math.hypot(l.x - tx, l.y - ty) < 2));
          // deterministic removal: find loot near threat
          const threat = this.threats.threats.find((t) => t.id === e.id);
          if (threat) {
            for (let li = this.loot.loot.length - 1; li >= 0; li--) {
              const l = this.loot.loot[li];
              if (Math.hypot(l.x - threat.x, l.y - threat.y) < 1.6) {
                this.loot.loot.splice(li, 1);
                break;
              }
            }
          }
          break;
        }
        case "landmarkRevealed": {
          this.stats.landmarksFound++;
          this.economy.landmarksFound = this.stats.landmarksFound;
          this.hint("landmark", "Landmark discovered. Blueprints hide in places like this — and every 5 landmarks lift sell prices.");
          break;
        }
        default:
          break;
      }
    });
  }

  step(dt: number) {
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(TICK_DT, remaining);
      remaining -= step;
      this.stepTick();
    }
  }

  hint(id: string, text: string) {
    if (this.tutorialShown.has(id)) return;
    if (this.tutorialCooldown > 0) {
      if (!this.pendingHint) this.pendingHint = { id, text };
      return;
    }
    this.tutorialShown.add(id);
    this.tutorialCooldown = 6;
    this.pendingHint = { id, text };
  }

  private stepTick() {
    this.tick++;
    this.playtime += TICK_DT;
    this.stats.playtime = this.playtime;
    const rig = this.rig;

    this.tutorialCooldown = Math.max(0, this.tutorialCooldown - TICK_DT);
    if (this.resonanceComboTimer > 0) {
      this.resonanceComboTimer -= TICK_DT;
      if (this.resonanceComboTimer <= 0) this.resonanceCombo = 0;
    }
    for (let i = this.scanOverlays.length - 1; i >= 0; i--) {
      this.scanOverlays[i].expiresIn -= TICK_DT;
      if (this.scanOverlays[i].expiresIn <= 0) this.scanOverlays.splice(i, 1);
    }

    rig.step(this.input, this.tick);

    const [pushX, pushY] = this.env.pressurePush(rig.x, rig.y);
    if (pushX !== 0 || pushY !== 0) {
      rig.vx += pushX * TICK_DT;
      rig.vy += pushY * TICK_DT * 0.5;
    }
    // steam hazard: dangerous transient steam hurts if close and not coolant protected
    if (this.env.steamHazardAt(rig.x, rig.y, 2.2)) {
      const f = rig.fx();
      if (f.heatProt < 1) {
        rig.hurt(3.5 * TICK_DT * 60, "steam");
        this.bus.emit({ type: "hazardWarn", kind: "steam", x: rig.x, y: rig.y, severity: 2 });
      } else if (f.heatProt < 2 && this.tick % 20 === 0) {
        rig.hurt(1.2 * TICK_DT * 60, "steam");
      }
    }

    const aura = this.base.auraRate();
    if (aura > 0 && Math.abs(rig.x - BASE_X) < 10 && Math.floor(rig.y) < 14) {
      rig.hp = Math.min(rig.effectiveMaxHp(), rig.hp + aura * TICK_DT);
    }
    this.world.setActiveAround(rig.x, rig.y, 2);
    this.syncEnvBox();
    this.env.step(this.tick);
    this.wow.tickCascade();

    const f = rig.fx();
    this.loot.physics(TICK_DT, { x: rig.x, y: rig.y, vacuumRadius: rig.effectiveVacuum() }, (l) => {
      const taken = rig.pickup(l.res, l.amount);
      return taken > 0;
    });

    if (this.liftChannel) {
      this.liftChannel.t -= TICK_DT;
      if (this.liftChannel.t <= 0) {
        const stop = this.liftChannel.stop;
        this.liftChannel = null;
        const sp = this.liftSpawn(stop);
        if (sp) {
          rig.x = sp.x;
          rig.y = sp.y - 1;
          rig.vx = 0;
          rig.vy = 0;
          this.stats.liftsTaken++;
        }
      }
    }

    if (this.finaleShown && this.tick % 3600 === 0 && this.postGameSpawns < 40) {
      const mx = 8 + Math.floor(Math.random() * (WORLD_W - 16));
      const my = 560 + Math.floor(Math.random() * 280);
      this.motherlodes.push({ x: mx, y: my });
      this.threats.spawnCooldown = Math.max(2, this.threats.spawnCooldown - 0.5);
      this.postGameSpawns++;
    }

    for (const c of this.loot.caches) {
      if (c.used) continue;
      if (c.kind === "cache" && c.hp > 0) {
        if (Math.hypot(c.x - this.rig.lastDugCell.x, c.y - this.rig.lastDugCell.y) < 1.6 && this.input.dig) {
          c.hp -= 40;
        }
        if (c.hp <= 0) this.openCache(c);
      }
    }

    this.touchCollect();

    const st = stratumAtRow(Math.floor(rig.y));
    this.threats.tryAmbientSpawn(rig.x, rig.y, st, TICK_DT);
    // cull far threats to keep bounded
    if (this.tick % 120 === 0) this.threats.cullFar(rig.x, rig.y, 80);
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

    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.fuse -= TICK_DT;
      if (c.fuse <= 0) {
        this.charges.splice(i, 1);
        this.env.explode(c.x, c.y, 3.4, 380);
        this.threats.damageNear(c.x, c.y, 4.2, 140);
      }
    }

    this.world.markExplored(Math.floor(rig.x), Math.floor(rig.y), 8);
    this.checkLandmarks();
    this.checkStratum(st);

    this.earlyCellsWindow = Math.max(0, this.earlyCellsWindow - 0.12);
    this.wow.checkRevenge(rig.y, Math.round(this.earlyCellsWindow), st);
    this.wow.checkBase(this.base);

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

    if (this.drainOpen && this.tick % 120 === 0) {
      const bell = this.landmarks.find((l) => l.key === "sunkenbell");
      if (bell) this.wow.checkBellExposed(this.world, bell);
      this.base.evaluate({ lifetimeEarned: this.economy.lifetimeEarned, ownedTools: rig.ownedTools, upgrades: rig.upgrades, deepestStratum: this.stats.deepestStratum });
    }

    // long-session perf bounds: compact edited, cap dirtyChunks, prune scan overlays
    if (this.tick % 600 === 0) {
      this.world.compactEdited(40, this.rig.x, this.rig.y);
      this.world.capDirtyChunks(64);
      if (this.scanOverlays.length > 6) this.scanOverlays.splice(0, this.scanOverlays.length - 6);
      if (this.charges.length > 12) this.charges.splice(0, this.charges.length - 12);
    }
  }

  syncEnvBox() {
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

  openCache(c: CacheEntity) {
    if (c.used) return;
    c.used = true;
    this.loot.drop("gold", 3 + (this.tick % 4), c.x, c.y);
    this.loot.drop("silver", 3, c.x, c.y);
    this.loot.drop("tungsten", 2, c.x, c.y);
    this.bus.emit({ type: "pickup", res: "gold", amount: 1, x: c.x, y: c.y });
  }

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
            return true;
          }
        }
        return false;
      }
    }
    return false;
  }

  openDrain() {
    if (this.drainOpen || !this.drainChannel) return false;
    this.drainOpen = true;
    const { x, y0, y1 } = this.drainChannel;
    for (let y = y0; y <= y1; y++) {
      for (let dx = 0; dx < 2; dx++) {
        const tx = x + dx;
        if (this.world.get(tx, y) !== M.BEDROCK) {
          this.world.set(tx, y, M.AIR);
          this.aftermath.record(tx, y, "drained" as any, this.tick);
        }
      }
    }
    this.base.valvesUsed.add("pumproom");
    this.wow.trigger("wow06_drain");
    this.bus.emit({ type: "explode", x, y: y0, radius: 2, big: false });
    this.bus.emit({ type: "drain", x, y: y0 });
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
    if (this.base.campusOnline) {
      this.rig.x = sp.x;
      this.rig.y = sp.y - 1;
      this.rig.vx = 0;
      this.rig.vy = 0;
      this.stats.liftsTaken++;
      return true;
    }
    this.liftChannel = { stop: stopKey, t: 2.0 };
    return true;
  }

  get liftChannelProgress(): number {
    if (!this.liftChannel) return 0;
    return 1 - this.liftChannel.t / 2.0;
  }

  useUtilityAt(ax: number, ay: number) {
    const td = tool(this.rig.toolTier);
    if (td.utility === "charge" && this.charges.length > 0 && this.rig.utilityCooldown > 0.4) {
      const c = this.charges.shift()!;
      this.env.explode(c.x, c.y, 3.4, 380);
      this.threats.damageNear(c.x, c.y, 4.2, 140);
      this.stats.chargesDetonated++;
      this.aftermath.record(c.x, c.y, "seismicScar" as any, this.tick, this.rig.toolTier);
      return;
    }
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
      this.stats.scansPulsed++;
      if (this.lastScan.tier >= 3) {
        this.scanOverlays.push({
          x: this.lastScan.x, y: this.lastScan.y, tier: this.lastScan.tier,
          hits: this.lastScan.hits, expiresIn: 25,
        });
        if (this.scanOverlays.length > 6) this.scanOverlays.shift();
      }
      this.hint("scan", "Scanner ping reveals nearby ore. Higher tiers outline whole veins and flag anomalies.");
    }
    void td;
  }

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
      // include aftermath as anomalies for high-tier scanner
      for (const cell of this.aftermath.nearby(Math.floor(ax), Math.floor(ay), radius + 2)) {
        anomalies.push({ x: cell.x, y: cell.y, kind: `aftermath_${cell.kind}` });
      }
    }
    return { x: ax, y: ay, tier, hits: [...counts].map(([res, count]) => ({ res, count })), anomalies };
  }

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
      v: 3,
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
      assistMode: this.rig.assistMode,
      deathCaches: this.deathCaches.map((d) => ({ x: d.x, y: d.y, cargo: d.cargo })),
      aftermath: this.aftermath.serialize(),
    } as any;
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
    this.rig.assistMode = !!(data as any).assistMode;
    this.deathCaches = ((data as any).deathCaches ?? []).map((d: any) => ({ x: d.x, y: d.y, cargo: d.cargo }));
    this.aftermath.load((data as any).aftermath);
    this.economy.lifetimeEarned = data.economy.lifetimeEarned;
    this.economy.landmarksFound = this.landmarks.filter((l) => l.discovered).length;
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
    if (this.drainOpen) this.openDrain();
    this.stats.strataSeen = new Set([...this.stats.strataSeen]);
    this.world.setActiveAround(this.rig.x, this.rig.y, 2);
    this.syncEnvBox();
  }

  collectCache(c: CacheEntity) {
    if (c.used) return;
    c.used = true;
    if (c.kind === "cache") {
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

  touchCollect() {
    for (const c of this.loot.caches) {
      if (c.used) continue;
      if (c.kind === "cache") continue;
      if (Math.hypot(c.x - this.rig.x, c.y - this.rig.y) < 2.2) {
        if (c.kind === "salvage" || c.kind === "valve" || c.kind === "core" || c.kind === "lift") continue;
        this.collectCache(c);
      }
    }
    for (let i = this.deathCaches.length - 1; i >= 0; i--) {
      const dc = this.deathCaches[i];
      if (Math.hypot(dc.x - this.rig.x, dc.y - this.rig.y) < 2.6) {
        for (const [res, amount] of dc.cargo) {
          this.rig.pickup(res, amount);
        }
        this.deathCaches.splice(i, 1);
        this.stats.deathsRecovered++;
        this.bus.emit({ type: "pickup", res: "gold", amount: 1, x: dc.x, y: dc.y });
      }
    }
    for (let i = this.loot.cacheMaps.length - 1; i >= 0; i--) {
      const m = this.loot.cacheMaps[i];
      if (Math.hypot(m.x - this.rig.x, m.y - this.rig.y) < 2.6) {
        this.loot.dropCacheMap(m.x, m.y, this.landmarks);
        this.loot.cacheMaps.splice(i, 1);
      }
    }
  }
}

export { threatFamilyFor };
