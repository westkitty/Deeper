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

  landmarks: LandmarkInstance[] = [];
  spawns: SpawnPoint[] = [];
  motherlodes: { x: number; y: number }[] = [];
  drainChannel: { x: number; y0: number; y1: number } | null = null;
  drainOpen = false;
  coreExtracted = false;
  finaleShown = false;
  // ---- iteration-1 gameplay state ----
  /** Persisted scan overlays (vein outlines, expiry in seconds). */
  scanOverlays: { x: number; y: number; tier: number; hits: { res: string; count: number }[]; expiresIn: number }[] = [];
  /** Resonance combo: consecutive pulses within 4s multiply cascade staging. */
  resonanceCombo = 0;
  resonanceComboTimer = 0;
  /** Corpse-run caches left by emergency extraction (recoverable). */
  deathCaches: DeathCache[] = [];
  /** Lift travel channel (seconds remaining; interrupted by damage). */
  liftChannel: { stop: string; t: number } | null = null;
  /** Contextual tutorial hints (shown once each, 6s apart). */
  tutorialShown = new Set<string>();
  tutorialCooldown = 0;
  /** Pending tutorial hint for the presentation layer to display. */
  pendingHint: { id: string; text: string } | null = null;
  /** Post-game: endless deep motherlodes spawned after finale. */
  postGameSpawns = 0;

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
    // corpse-run wrapper: dropped cargo becomes a recoverable world cache
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
          // combo: consecutive pulses within the window build a multiplier
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
          // lift channel interrupts on damage
          if (this.liftChannel) this.liftChannel = null;
          break;
        }
        case "emergencyExtract": {
          // corpse run: 25% of cargo becomes a recoverable cache at the death site
          // (rig state captured before reset via lastDugCell-adjacent fallback)
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

  // -------------------------------------------------------------------------
  step(dt: number) {
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(TICK_DT, remaining);
      remaining -= step;
      this.stepTick();
    }
  }

  /** Queue a one-time contextual tutorial hint (presentation displays it). */
  hint(id: string, text: string) {
    if (this.tutorialShown.has(id)) return;
    if (this.tutorialCooldown > 0) {
      // keep the first pending hint; drop overlaps (no spam)
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

    // tutorial + combo timers
    this.tutorialCooldown = Math.max(0, this.tutorialCooldown - TICK_DT);
    if (this.resonanceComboTimer > 0) {
      this.resonanceComboTimer -= TICK_DT;
      if (this.resonanceComboTimer <= 0) this.resonanceCombo = 0;
    }
    // scan overlay expiry
    for (let i = this.scanOverlays.length - 1; i >= 0; i--) {
      this.scanOverlays[i].expiresIn -= TICK_DT;
      if (this.scanOverlays[i].expiresIn <= 0) this.scanOverlays.splice(i, 1);
    }

    rig.step(this.input, this.tick);

    // water pressure pushes the rig
    const [pushX, pushY] = this.env.pressurePush(rig.x, rig.y);
    if (pushX !== 0 || pushY !== 0) {
      rig.vx += pushX * TICK_DT;
      rig.vy += pushY * TICK_DT * 0.5;
    }

    // base repair aura near the works
    const aura = this.base.auraRate();
    if (aura > 0 && Math.abs(rig.x - BASE_X) < 10 && Math.floor(rig.y) < 14) {
      rig.hp = Math.min(rig.effectiveMaxHp(), rig.hp + aura * TICK_DT);
    }
    this.world.setActiveAround(rig.x, rig.y, 2);
    this.syncEnvBox();
    this.env.step(this.tick);
    this.wow.tickCascade();

    // loot physics + pickup (magnet-streak vacuum included)
    const f = rig.fx();
    this.loot.physics(TICK_DT, { x: rig.x, y: rig.y, vacuumRadius: rig.effectiveVacuum() }, (l) => {
      const taken = rig.pickup(l.res, l.amount);
      return taken > 0;
    });

    // lift travel channel (2s, interrupted by damage via hurt event)
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

    // post-game: endless deep motherlodes + threat scaling after finale
    if (this.finaleShown && this.tick % 3600 === 0 && this.postGameSpawns < 40) {
      const mx = 8 + Math.floor(Math.random() * (WORLD_W - 16));
      const my = 560 + Math.floor(Math.random() * 280);
      this.motherlodes.push({ x: mx, y: my });
      this.threats.spawnCooldown = Math.max(2, this.threats.spawnCooldown - 0.5);
      this.postGameSpawns++;
    }

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
    // 2s channel (interrupted by damage); campus stage travels instantly
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

  /** True while a lift channel is in progress (HUD shows progress). */
  get liftChannelProgress(): number {
    if (!this.liftChannel) return 0;
    return 1 - this.liftChannel.t / 2.0;
  }

  /** Utility action from input — scanner ping / charge / resonance. */
  useUtilityAt(ax: number, ay: number) {
    const td = tool(this.rig.toolTier);
    // remote detonate: pressing utility again while charges are armed blows the oldest
    if (td.utility === "charge" && this.charges.length > 0 && this.rig.utilityCooldown > 0.4) {
      const c = this.charges.shift()!;
      this.env.explode(c.x, c.y, 3.4, 380);
      this.threats.damageNear(c.x, c.y, 4.2, 140);
      this.stats.chargesDetonated++;
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
      // tier 3+ vein outlines persist on the map for 25s
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
      v: 2,
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
    this.rig.assistMode = !!data.assistMode;
    this.deathCaches = (data.deathCaches ?? []).map((d) => ({ x: d.x, y: d.y, cargo: d.cargo }));
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
    // corpse-run recovery: touch your death cache to reclaim dropped cargo
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
    // cache maps: touch to reveal direction to nearest undiscovered landmark
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
