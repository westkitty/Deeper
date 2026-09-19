/**
 * DEEPER — main world scene. Drives the headless sim, renders terrain/entities,
 * handles input, HUD, menus, wow staging, save/load and diagnostics.
 * v1.2: aftermath, heat/recoil, hazard warnings, gamefeel, WOW audio payoff,
 * performance bounds diagnostics. Fix: avoid scene.restart() crash in headless
 * SwiftShader by resetting world without restart, defer heavy work, and make
 * audio.ensure headless-safe.
 */

import Phaser from "phaser";
import { BASE_X, CAM_ZOOM, GAME_HEIGHT, GAME_WIDTH, STRATUM_DEPTHS, STRATA_START } from "../config";
import { GameSim } from "../sim/game";
import { stratumAtRow } from "../config";
import { TOOLS, tool } from "../sim/tools";
import { mat } from "../sim/materials";
import { TerrainRenderer, CELL } from "../render/terrain";
import { EntityRenderer } from "../render/entities";
import { loadSheets, sliceAll } from "../render/slices";
import { AudioEngine } from "../audio";
import { InputManager } from "../input";
import { UI, type SettingsState } from "../ui/dom";
import { openMap, openWorkshop, openFinale, stratumBanner } from "../ui/menus";
import { hasSave, loadSaveData, saveGame, saveSummary, exportSave, importSave, clearSave } from "../sim/save";
import { log, installErrorBoundary } from "../log";
import type { WowKey } from "../sim/wow";

const WOW_BANNERS: Record<WowKey, [string, string, string]> = {
  wow01_vein: ["A VEIN", "It keeps going. Follow it.", "discovery"],
  wow02_wall: ["THAT WALL SAYS NO", "Marked on your map. Remember it.", "hard_fail"],
  wow03_drill: ["TWIN-TOOTH INSTALLED", "Listen to it. Sandstone is nothing now.", "upgrade"],
  wow04_excavator: ["THE MACHINE IN THE ROCK", "You are uncovering something enormous. You are not equipped to dig it out. Yet.", "discovery"],
  wow05_vault: ["THE VAULT OPENS", "The wall that said no now says nothing at all.", "big_loot"],
  wow06_drain: ["DRAINAGE OPENED", "The reservoir has somewhere new to be. Watch the waterline.", "water"],
  wow06_bell: ["THE SUNKEN BELL", "It rang for a city. Now it hangs in open air.", "discovery"],
  wow07_chain: ["CHAIN REACTION", "You did that. The systems did that. You told them to.", "explosion"],
  wow08_choir: ["THE GLASS CHOIR FALLS", "One note. The whole formation heard it.", "resonance"],
  wow09_base: ["THE WORKS GROWS", "Your tarp is a refinery now. The surface remembers your trips.", "upgrade"],
  wow10_revenge: ["REVENGE TOUR", "This used to stop you. It doesn't even slow you down.", "machine"],
  wow11_maw: ["THE MAW", "Geography is now a suggestion.", "explosion"],
  wow12_depth: ["HOW DEEP YOU WENT", "The engine goes quiet. Look at what you did to this world.", "discovery"],
};

export class WorldScene extends Phaser.Scene {
  sim!: GameSim;
  terrain!: TerrainRenderer;
  entities!: EntityRenderer;
  audio = new AudioEngine();
  input2 = new InputManager();
  ui = new UI();
  animTime = 0;
  paused = false;
  workshopOpen = false;
  mapOpen = false;
  settingsOpen = false;
  finaleOpen = false;
  private workshop: { refresh: () => void; close: () => void } | null = null;
  private mapView: { close: () => void } | null = null;
  private fps = 60;
  private frames = 0;
  private fpsTime = 0;
  private diagOn = false;
  private autosaveTimer = 0;
  private hudTimer = 0;
  private shakeAmount = 0;
  private screenCenterTarget = new Phaser.Math.Vector2();
  private extractedShown = false;
  private qaSeed: number | null = null;
  private started = false;
  private pointerWorld = new Phaser.Math.Vector2();
  private digLoopStop: { stop: () => void } | null = null;
  private lastDigLoopKey = "";

  constructor() { super("world"); }

  preload() {
    loadSheets(this);
    this.load.image("bg_hills", "assets/props.png");
  }

  create() {
    installErrorBoundary();
    this.input2.loadBindings();
    this.audio.loadMuted();
    try {
      const s = JSON.parse(localStorage.getItem("deeper.settings") ?? "{}");
      if (s.highContrast) this.ui.setHighContrast(true);
      if (typeof s.reducedMotion === "boolean") {
        this.ui.reducedMotion = s.reducedMotion;
        this.audio.setReducedMotion(s.reducedMotion);
      }
    } catch { /* defaults */ }
    sliceAll(this);
    log.info("scene", "world create");
    const seedData = this.game.registry.get("pendingSeed") as number | undefined;
    const save = this.game.registry.get("pendingLoad") as boolean | undefined;
    if (seedData !== undefined) {
      this.sim = new GameSim(seedData);
      this.game.registry.set("pendingSeed", undefined);
    } else if (save) {
      const data = loadSaveData();
      this.sim = new GameSim(data?.seed);
      if (data) this.sim.load(data);
      this.game.registry.set("pendingLoad", undefined);
    } else {
      this.sim = new GameSim();
    }
    if (this.qaSeed !== null) this.sim = new GameSim(this.qaSeed);

    this.cameras.main.setBounds(0, 0, CELL * 160, CELL * 864);
    this.cameras.main.setZoom(1);
    void CAM_ZOOM; void GAME_WIDTH; void GAME_HEIGHT;

    this.terrain = new TerrainRenderer(this, this.sim.world);
    this.entities = new EntityRenderer(this, this.sim);
    this.entities.reducedMotion = this.audio.reducedMotion;
    this.terrain.warmup(this.sim.rig.x, this.sim.rig.y, 1);

    this.input2.attach(this.game.canvas);
    this.wireInput();
    this.wireSimEvents();
    this.physics?.world?.setBounds(0, 0, CELL * 160, CELL * 864);
    (window as unknown as { deeper?: unknown }).deeper = this.makeQAHook();

    if (this.game.registry.get("autostart")) {
      this.game.registry.set("autostart", false);
      this.beginPlay(true);
    }
  }

  private onResize(size: Phaser.Structs.Size) { this.scale.resize(size.width, size.height); }

  beginPlay(fresh: boolean) {
    this.started = true;
    this.paused = false;
    this.ui.clearMenu();
    try { this.audio.ensure(); } catch {}
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      this.ui.showTouchControls({
        onLeft: (v) => (this.input2.touchLeft = v),
        onRight: (v) => (this.input2.touchRight = v),
        onJump: (v) => (this.input2.touchJump = v),
        onDig: (v) => (this.input2.touchDig = v),
        onUtility: () => {
          const inp = this.sim.input;
          this.sim.useUtilityAt(inp.aimX, inp.aimY);
        },
        onInteract: () => this.interact(),
      });
    }
    if (fresh) {
      this.ui.banner("THE WORKS", "Dig. Fill the hopper. Sell at the works. Go deeper.", 4200);
      this.ui.toast({ text: "LEFT CLICK to dig · A/D to drive · E at the works to sell", icon: "info" });
    } else {
      this.ui.toast({ text: "Welcome back. The world is how you left it.", icon: "info" });
      if (this.sim.deathCaches.length > 0) {
        this.ui.toast({ text: `${this.sim.deathCaches.length} death cache(s) await recovery — purple on the map.`, color: "#b070e8" });
      }
    }
  }

  private pressUnsub?: () => void;

  private wireInput() {
    this.pressUnsub?.();
    this.pressUnsub = this.input2.onPress((k) => {
      if (k === "escape") {
        if (this.workshopOpen) this.closeWorkshop();
        else if (this.mapOpen) this.closeMap();
        else if (this.settingsOpen) this.closeSettings();
        else if (this.finaleOpen) this.closeFinale();
        else this.togglePause();
        return;
      }
      if (!this.started || this.paused) return;
      if (k === "e") {
        if (this.workshopOpen) this.closeWorkshop();
        else this.interact();
        return;
      }
      if (k === "m" || k === "tab") {
        if (this.mapOpen) this.closeMap();
        else this.openMap();
        return;
      }
      if (k === "f3") {
        this.diagOn = !this.diagOn;
        if (!this.diagOn) this.ui.setDiag(null);
        return;
      }
      const toolKeys: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7 };
      if (k in toolKeys) {
        const t = toolKeys[k];
        if (t <= this.sim.rig.ownedTools) {
          this.sim.rig.toolTier = t;
          this.ui.toast({ text: `${tool(t).name} selected`, color: "#d8a83c" });
          this.audio.playTierAcquire(t);
          this.entities.spawnTierAcquire(this.sim.rig.x * CELL, this.sim.rig.y * CELL, t);
        }
      }
      if (k === "q") {
        const next = (this.sim.rig.toolTier + 1) % (this.sim.rig.ownedTools + 1);
        this.sim.rig.toolTier = next;
        this.ui.toast({ text: `${tool(next).name} selected`, color: "#d8a83c" });
        this.audio.playTierAcquire(next);
      }
    });
  }

  private interact() {
    const t = this.sim.interactTarget();
    if (!t) return;
    if (t.kind === "base") { this.openWorkshop(); return; }
    this.sim.interact();
    if (t.kind === "valve") this.audio.play("valve", 0.9);
    if (t.kind === "lift") this.audio.play("lift", 0.7);
  }

  private togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.ui.showPause(
        () => this.togglePause(),
        () => { this.openSettings("pause"); },
        () => {
          saveGame(this.sim);
          this.game.registry.set("showTitle", true);
          window.location.reload();
        },
        {
          cells: this.sim.stats.cellsDestroyed, ore: this.sim.stats.oreExtracted,
          money: this.sim.stats.moneyEarned, playtime: this.sim.playtime,
          depth: Math.max(0, Math.floor(this.sim.rig.y) - 8),
        },
      );
    } else {
      this.ui.clearMenu();
    }
  }

  private openSettings(from: string) {
    this.settingsOpen = true;
    const cur: SettingsState = {
      master: this.audio.vol.master, sfx: this.audio.vol.sfx, ambient: this.audio.vol.ambient,
      shake: this.audio.shake, reducedMotion: this.audio.reducedMotion,
      assistMode: this.sim.rig.assistMode,
      highContrast: document.body.classList.contains("high-contrast"),
    };
    this.ui.showSettings(
      cur,
      (s) => {
        this.audio.setVolumes(s);
        this.audio.shake = s.shake;
        this.audio.setReducedMotion(s.reducedMotion);
        this.ui.reducedMotion = s.reducedMotion;
        this.entities.reducedMotion = s.reducedMotion;
        this.sim.rig.assistMode = s.assistMode;
        if (s.assistMode) this.sim.rig.hp = Math.min(this.sim.rig.effectiveMaxHp(), this.sim.rig.hp + 50);
        this.ui.setHighContrast(s.highContrast);
        localStorage.setItem("deeper.settings", JSON.stringify(s));
      },
      () => {
        this.settingsOpen = false;
        this.ui.clearMenu();
        if (from === "title") this.showTitle();
      },
      {
        bindings: { ...this.input2.bindings } as unknown as Record<string, string[]>,
        onResetBindings: () => {
          this.input2.resetBindings();
          this.ui.toast({ text: "Bindings reset to defaults.", icon: "info" });
        },
        onExportSave: () => {
          saveGame(this.sim);
          const json = exportSave();
          if (json) {
            const blob = new Blob([json], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `deeper-save-${this.sim.seed}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }
        },
        onImportSave: (json: string) => importSave(json),
        onResetSave: () => {
          clearSave();
          this.ui.toast({ text: "Save deleted. Reloading to title.", color: "#e05838" });
          window.setTimeout(() => window.location.reload(), 900);
        },
      },
    );
  }

  private resetWorld(newSim: GameSim, fresh: boolean) {
    try {
      this.sim = newSim;
      if (this.terrain) {
        this.terrain.world = newSim.world;
        try {
          const blitters = (this.terrain as any).blitters as (Phaser.GameObjects.Blitter | null)[];
          for (let i = 0; i < blitters.length; i++) {
            const b = blitters[i];
            if (b) { try { b.clear(); } catch {} }
          }
        } catch {}
        try { this.terrain.warmup(newSim.rig.x, newSim.rig.y, 1); } catch {}
      }
      if (this.entities) {
        try {
          const er: any = this.entities as any;
          for (const s of this.entities.lootSprites.values()) try { s.destroy(); } catch {}
          this.entities.lootSprites.clear();
          for (const s of this.entities.threatSprites.values()) try { s.destroy(); } catch {}
          this.entities.threatSprites.clear();
          for (const fx of er.threatFxMap?.values?.() ?? []) { try { fx.aura?.destroy(); } catch {} try { fx.tele?.destroy(); } catch {} }
          er.threatFxMap?.clear?.();
          for (const s of this.entities.cacheSprites.values()) try { s.destroy(); } catch {}
          this.entities.cacheSprites.clear();
          for (const spr of er.chargeSprites ?? []) try { spr.destroy(); } catch {}
          er.chargeSprites = [];
          for (const spr of er.scanSprites ?? []) try { spr.destroy(); } catch {}
          er.scanSprites = [];
          for (const s of er.deathSprites?.values?.() ?? []) try { s.destroy(); } catch {}
          er.deathSprites?.clear?.();
          for (const s of er.mapSprites?.values?.() ?? []) try { s.destroy(); } catch {}
          er.mapSprites?.clear?.();
          for (const p of er.particles ?? []) try { p.s?.destroy(); } catch {}
          er.particles = [];
          for (const t of er.texts ?? []) try { t.t?.destroy(); } catch {}
          er.texts = [];
          for (const s of er.fireSprites?.values?.() ?? []) try { s.destroy(); } catch {}
          er.fireSprites?.clear?.();
          for (const s of er.steamSprites ?? []) try { s.s?.destroy(); } catch {}
          er.steamSprites = [];
          for (const s of er.aftermathSprites?.values?.() ?? []) try { s.destroy(); } catch {}
          er.aftermathSprites?.clear?.();
          for (const h of er.hazardSprites ?? []) try { h.s?.destroy(); } catch {}
          er.hazardSprites = [];
          this.entities.sim = newSim;
          try { er.syncCaches?.(true); } catch {}
        } catch {}
      }
      this.wireSimEvents();
      (window as unknown as { deeper?: unknown }).deeper = this.makeQAHook();
      this.beginPlay(fresh);
    } catch (e) {
      console.error('resetWorld err', e);
    }
  }

  private showTitle() {
    this.paused = true;
    this.ui.showTitle(
      (seedOpt?: number) => {
        const seed = seedOpt ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
        window.setTimeout(() => {
          try {
            const newSim = new GameSim(seed);
            this.resetWorld(newSim, true);
          } catch (e) { console.error('new game err', e); }
        }, 10);
      },
      () => {
        window.setTimeout(() => {
          try {
            const data = loadSaveData();
            const newSim = new GameSim(data?.seed);
            if (data) newSim.load(data);
            this.resetWorld(newSim, false);
          } catch (e) { console.error('load err', e); }
        }, 10);
      },
      () => this.openSettings("title"),
      () => this.ui.showCredits(() => this.showTitle()),
      hasSave(),
      hasSave() ? saveSummary() : null,
    );
  }

  private openWorkshop() {
    if (this.workshopOpen) return;
    this.workshopOpen = true;
    this.workshop = openWorkshop(this.sim, this.sim.economy, this.sim.base, {
      onPurchase: () => {
        this.audio.play("upgrade");
        this.checkVulnerableAnnounce();
      },
      onClose: () => this.closeWorkshop(),
    });
  }

  private closeWorkshop() { this.workshopOpen = false; this.workshop = null; this.ui.clearMenu(); }
  private openMap() {
    if (this.mapOpen) return;
    this.mapOpen = true;
    this.mapView = openMap(this.sim, () => this.closeMap());
  }
  private closeMap() { this.mapOpen = false; this.mapView = null; this.ui.clearMenu(); }
  private closeSettings() { this.settingsOpen = false; this.ui.clearMenu(); if (!this.started) this.showTitle(); }
  private closeFinale() { this.finaleOpen = false; this.ui.clearMenu(); }

  private wireSimEvents() {
    this.sim.bus.on((e) => {
      switch (e.type) {
        case "drillHit": {
          const [wx, wy] = [e.x * CELL + CELL / 2, e.y * CELL + CELL / 2];
          if (e.effective) {
            if (Math.random() < 0.5) this.entities.spawnSparks(wx, wy, 2);
            this.audio.digSound(mat(e.mat).sound, true, this.sim.rig.toolTier);
            if (this.sim.rig.toolTier >= 2) this.entities.spawnRecoil(wx, wy, tool(this.sim.rig.toolTier).recoil * 0.3);
          } else {
            this.audio.digSound(mat(e.mat).sound, false);
            this.entities.spawnSparks(wx, wy, 1);
          }
          break;
        }
        case "break": {
          this.entities.spawnBreakDebris(e.x, e.y, e.mat, (e.count ?? 1) > 2);
          this.audio.playDebris();
          if (e.chain) {
            this.audio.play("wow_chain", 0.5, 0.9 + Math.random() * 0.2);
            this.addShake(5);
            this.ui.toast({ text: `CHAIN x${e.count} — collapse!`, color: "#e8a040" });
          }
          if ((e.count ?? 0) >= 4) {
            this.entities.spawnBreakthrough(e.x, e.y);
            this.audio.playBreakthrough();
          }
          break;
        }
        case "explode": {
          this.entities.spawnExplosion(e.x * CELL, e.y * CELL, e.radius * 0.6);
          this.audio.play("explosion", 0.9);
          this.addShake(e.big ? 14 : 7);
          break;
        }
        case "steam": {
          this.entities.spawnSteam(e.x * CELL + CELL / 2, e.y * CELL);
          this.audio.play("steam", 0.4, 1 + Math.random() * 0.4);
          break;
        }
        case "ignite": {
          this.audio.play("ignite", 0.5);
          break;
        }
        case "resonance": {
          this.entities.spawnResonanceWave(e.x * CELL, e.y * CELL);
          this.audio.play("resonance", 0.85);
          this.addShake(8);
          break;
        }
        case "hurt": {
          this.audio.play("hurt", 0.6);
          this.addShake(3);
          break;
        }
        case "death": { this.audio.play("extract", 0.9); break; }
        case "emergencyExtract": {
          this.audio.play("extract", 1);
          if (!this.extractedShown) {
            this.ui.showGameExtracted(() => {
              document.querySelectorAll("#menu .modal").forEach((m) => m.remove());
            }, 0);
            this.extractedShown = true;
            window.setTimeout(() => (this.extractedShown = false), 1000);
          }
          break;
        }
        case "sell": {
          this.audio.play("sell");
          this.ui.toast({ text: `Sold cargo: +¤${e.money.toLocaleString()}`, color: "#d8a83c", icon: "money" });
          break;
        }
        case "cargoFull": {
          this.audio.play("cargo_full", 0.6);
          this.ui.toast({ text: "CARGO FULL — sell at the works (E at base)", color: "#e05838", icon: "cargo" });
          break;
        }
        case "pickup": {
          const rigPx = this.sim.rig.x * CELL;
          const rigPy = this.sim.rig.y * CELL;
          this.entities.spawnPickupBurst(rigPx, rigPy, e.res);
          this.audio.play("pickup", 0.7, 0.9 + Math.random() * 0.2);
          if (e.vacuum) {
            this.entities.spawnMagnetStreak(rigPx, rigPy);
            this.audio.playMagnetStreak();
          }
          break;
        }
        case "blocked": break;
        case "blockedMarked": {
          this.ui.toast({ text: "Blocked site marked on your map.", color: "#e05838" });
          break;
        }
        case "nowVulnerable": {
          const details = (e as any).details as { x: number; y: number; mat: number }[] | undefined;
          let extra = "";
          if (details && details.length) {
            const groups = new Map<string, number>();
            for (const d of details) { const n = mat(d.mat).name; groups.set(n, (groups.get(n) ?? 0) + 1); }
            extra = [...groups.entries()].map(([k, v]) => `${v}x ${k}`).join(", ");
          }
          this.ui.banner(`${e.count} MARKED SITE${e.count === 1 ? "" : "S"} NOW VULNERABLE`, extra || "Your new capability breaks what stopped you. The map shows where.", 4200);
          this.audio.play("discovery", 0.7);
          this.audio.playBreakthrough();
          if (details) for (const d of details.slice(0, 8)) this.entities.spawnBreakthrough(d.x, d.y);
          break;
        }
        case "landmarkRevealed": {
          this.audio.play("discovery", 0.8);
          this.ui.banner(e.name.toUpperCase(), e.wow ? "What IS that?" : "Landmark discovered", 3000);
          break;
        }
        case "stratumRevealed": {
          const [t, s] = stratumBanner(e.stratum);
          this.ui.banner(t, s, 5000, "stratum");
          this.audio.play("stratum", 0.9);
          break;
        }
        case "blueprint": {
          this.audio.play("blueprint");
          this.ui.banner("BLUEPRINT RECOVERED", e.key.toUpperCase(), 3600);
          break;
        }
        case "relic": {
          this.audio.play("relic", 0.9);
          this.ui.toast({ text: "Relic recovered — displayed at the museum", color: "#b070e8", icon: "loot" });
          break;
        }
        case "geode": {
          this.audio.play("big_loot", 0.8);
          this.entities.spawnPickupBurst(this.sim.rig.x * CELL, this.sim.rig.y * CELL, "geode");
          break;
        }
        case "motherlode": {
          this.audio.play("big_loot");
          this.ui.banner("MOTHERLODE", "The motherlode. You found the motherlode.", 4000);
          break;
        }
        case "liftUnlocked": {
          this.audio.play("lift", 0.8);
          this.ui.toast({ text: `Lift landing unlocked: ${e.stop}`, color: "#d8a83c", icon: "map" });
          break;
        }
        case "baseStage": {
          this.ui.banner("THE WORKS EXPANDS", ["", "Walls go up.", "The refinery stands.", "A gantry over the shaft.", "The freight tower rises.", "This is an excavation campus now."][e.stage] ?? "", 4000);
          this.audio.play("machine", 0.8);
          break;
        }
        case "wow": {
          const b = WOW_BANNERS[e.key as WowKey];
          if (b) {
            this.ui.banner(b[0], b[1], 4600, "wow");
            this.audio.playWow(e.key);
            this.audio.play(b[2], 0.95);
            this.addShake(8);
          }
          if (e.key === "wow12_depth") {
            window.setTimeout(() => {
              if (!this.finaleOpen) {
                this.finaleOpen = true;
                openFinale(this.sim, () => this.closeFinale());
              }
            }, 1200);
          }
          break;
        }
        case "threatDeath": { this.audio.play("dig_metal", 0.4, 0.8); break; }
        case "coreExtracted": { this.audio.play("discovery", 1); break; }
        case "overheat": {
          this.audio.playHazard("overheat", 1);
          this.audio.play("overheat", 0.7);
          this.ui.toast({ text: "OVERHEAT — cooling down", color: "#e85838", icon: "hazard" });
          this.addShake(4);
          break;
        }
        case "overheatEnd": { this.ui.toast({ text: "Heat nominal", color: "#48c8b0" }); break; }
        case "digRecoil": {
          this.audio.playRecoil(e.tier);
          this.addShake(e.recoil * 8);
          break;
        }
        case "jump": break;
        case "heavyLanding": {
          this.entities.spawnHeavyLanding(e.x, e.y, e.tier);
          this.audio.playLanding(30 + e.tier * 5);
          this.audio.play("landing_heavy", 0.5 + e.tier * 0.08);
          this.addShake(2 + e.tier);
          break;
        }
        case "landing": {
          if (e.impact > 12) {
            this.entities.spawnHeavyLanding(this.sim.rig.x, this.sim.rig.y, e.tier);
            this.audio.playLanding(e.impact);
            if (e.impact > 25) this.addShake(e.impact * 0.15);
          }
          break;
        }
        case "pressureRelease": {
          this.entities.spawnPressureRelease(e.x, e.y, e.force);
          this.audio.playHazard("pressure", e.force / 20);
          this.audio.play("pressure_pop", 0.7);
          this.addShake(e.force * 0.2);
          break;
        }
        case "aftermath": {
          this.entities.spawnAftermathMark(e.x, e.y, e.kind);
          break;
        }
        case "hazardWarn": {
          this.entities.spawnHazardWarn(e.x, e.y, e.kind, e.severity);
          this.audio.playHazard(e.kind, e.severity);
          break;
        }
        case "threatSteal": {
          this.ui.toast({ text: `Threat stole ${e.amount}x ${e.res}!`, color: "#e05050", icon: "hazard" });
          this.audio.play("threat_warn", 0.7);
          break;
        }
        case "crystalStabilize": {
          this.entities.spawnCrystalStabilize(e.x, e.y);
          this.audio.play("resonator_pulse", 0.6, 1.1);
          break;
        }
        case "drain": {
          this.audio.play("water", 0.7);
          this.entities.spawnSteam(e.x * CELL, e.y * CELL);
          break;
        }
        case "flood": { this.audio.play("water", 0.5); break; }
        default: break;
      }
    });
  }

  private addShake(amount: number) {
    if (this.audio.reducedMotion) return;
    this.shakeAmount = Math.min(20, this.shakeAmount + amount * this.audio.shake);
  }

  private checkVulnerableAnnounce() {
    this.sim.blocked.reevaluate(this.sim.rig.toolTier);
  }

  override update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.animTime += dt;
    this.frames++; this.fpsTime += dt;
    if (this.fpsTime >= 0.5) { this.fps = this.frames / this.fpsTime; this.frames = 0; this.fpsTime = 0; }

    if (!this.started) {
      if (this.game.registry.get("showTitle") !== false && !this.settingsOpen) {
        this.game.registry.set("showTitle", false);
        this.showTitle();
      }
      this.terrain.flushDirty(2);
      return;
    }

    const menuBlocking = this.paused || this.workshopOpen || this.mapOpen || this.settingsOpen || this.finaleOpen;

    if (!menuBlocking) {
      this.input2.pollGamepad();
      const cam = this.cameras.main;
      this.pointerWorld.set(cam.scrollX + this.input2.pointerX, cam.scrollY + this.input2.pointerY);
      const inp = this.sim.input;
      inp.left = this.input2.left;
      inp.right = this.input2.right;
      inp.jump = this.input2.jump;
      inp.winch = this.input2.up || this.input2.jump;
      inp.dig = this.input2.digActive;
      inp.aimX = this.pointerWorld.x / CELL;
      inp.aimY = this.pointerWorld.y / CELL;
      if (this.input2.utilityPressed && !this.utilPrev) {
        this.sim.useUtilityAt(inp.aimX, inp.aimY);
        const td = tool(this.sim.rig.toolTier);
        if (td.utility === "scan") this.audio.play("scan", 0.7);
      }
      this.utilPrev = this.input2.utilityPressed;

      this.sim.step(dt);
      const stNow = stratumAtRow(Math.floor(this.sim.rig.y));
      this.audio.setDepthTint(Math.min(1, this.sim.rig.y / 800));
      this.audio.setStratum(stNow);
      if (this.sim.pendingHint) {
        const h = this.sim.pendingHint; this.sim.pendingHint = null;
        this.ui.toast({ text: h.text, color: "#48c8b0", icon: "info" });
      }
      this.radarTimer -= dt;
      if (this.radarTimer <= 0) {
        this.radarTimer = 3;
        const near = this.sim.threats.nearest(this.sim.rig.x, this.sim.rig.y, 10);
        if (near && near.elite) this.audio.play("threat_warn", 0.5);
        else if (near) this.audio.play("threat_warn", 0.25, 1.2);
      }
      if (this.sim.stats.scansPulsed !== this.lastScanCount) {
        this.lastScanCount = this.sim.stats.scansPulsed;
        const s = this.sim.lastScan;
        if (s) this.entities.spawnScanRing(s.x * CELL, s.y * CELL);
      }
      this.healTimer -= dt;
      if (this.healTimer <= 0) {
        this.healTimer = 1.2;
        if (this.sim.base.auraRate() > 0 && Math.abs(this.sim.rig.x - BASE_X) < 10) {
          this.entities.spawnHeal(this.sim.rig.x * CELL, this.sim.rig.y * CELL);
        }
      }
      const loopKey = `tool_${tool(this.sim.rig.toolTier).key}`;
      if (inp.dig && this.sim.rig.lastDugCell.x >= 0) {
        if (this.lastDigLoopKey !== loopKey) {
          this.digLoopStop?.stop();
          this.digLoopStop = this.audio.toolLoopStart(this.sim.rig.toolTier);
          this.lastDigLoopKey = loopKey;
        }
      } else if (this.digLoopStop) {
        this.digLoopStop.stop(); this.digLoopStop = null; this.lastDigLoopKey = "";
      }
    } else {
      this.sim.input.dig = false;
      this.sim.input.left = this.sim.input.right = false;
      this.sim.input.jump = false;
    }

    this.terrain.flushDirty(3);
    this.terrain.update(dt);
    this.entities.update(dt, this.animTime);
    this.terrain.drawFog(this.cameras.main, this.sim.rig.x, this.sim.rig.y);

    const cam = this.cameras.main;
    const rigPx = this.sim.rig.x * CELL;
    const rigPy = this.sim.rig.y * CELL;
    cam.centerOn(
      Phaser.Math.Linear(cam.scrollX + cam.width / 2, rigPx + this.sim.rig.facing * 60, 0.08),
      Phaser.Math.Linear(cam.scrollY + cam.height / 2, rigPy, 0.12),
    );
    if (this.shakeAmount > 0.2) {
      cam.shake(80, this.shakeAmount * 0.0006);
      this.shakeAmount *= Math.pow(0.001, dt);
    } else this.shakeAmount = 0;

    this.hudTimer += dt;
    if (this.hudTimer > 0.12) {
      this.hudTimer = 0;
      const rig = this.sim.rig; const f = rig.fx(); const st = stratumAtRow(Math.floor(rig.y));
      let hazard = "";
      if (st === "redfault" && f.heatProt < 1) hazard = "⚠ HEAT — coolant required";
      if (st === "drownedfault" && rig.y > 340 && f.pressureProt < 1) hazard = "⚠ PRESSURE — hull required";
      if (rig.hp < rig.effectiveMaxHp() * 0.3) hazard = "⚠ RIG INTEGRITY LOW";
      if (this.sim.liftChannel) hazard = `◈ LIFT CHANNEL ${Math.round(this.sim.liftChannelProgress * 100)}% — hold still`;
      if (rig.overheated) hazard = "⚠ OVERHEAT";
      const row = Math.floor(rig.y);
      const order = STRATUM_DEPTHS;
      const idx = order.findIndex((s) => s.id === st);
      const next = order[idx + 1];
      const cur0 = order[idx]?.startRow ?? 0;
      const next0 = next?.startRow ?? STRATA_START.bedrock;
      const depthProgress = next ? Math.min(1, Math.max(0, (row - cur0) / Math.max(1, next0 - cur0))) : 1;
      this.ui.hudUpdate({
        money: rig.money,
        cargoUsed: rig.cargoUsed(f.cargoBulkMul),
        cargoCap: f.cargoCap,
        depth: Math.max(0, Math.floor(rig.y) - 8),
        stratum: st,
        tool: tool(rig.toolTier).name,
        toolTier: rig.toolTier,
        hp: rig.hp,
        maxHp: rig.effectiveMaxHp(),
        hazard,
        markers: this.sim.blocked.sites.size,
        vulnerable: [...this.sim.blocked.sites.values()].filter((s) => s.vulnerable).length,
        charges: rig.charges,
        ownedTools: rig.ownedTools,
        depthProgress,
        nextStratum: next?.label,
        liftProgress: this.sim.liftChannelProgress,
        combo: this.sim.resonanceCombo,
        streak: rig.magnetStreak,
        toolNames: TOOLS.map((t) => t.name),
      });
    }

    if (this.diagOn) {
      this.ui.setDiag(this.ui.diagText2({
        fps: this.fps, tick: this.sim.tick, x: this.sim.rig.x, y: this.sim.rig.y,
        chunks: this.sim.world.activeChunks.size, dirty: this.sim.world.dirtyChunks.size,
        particles: (this.entities as any)["particles"].length,
        liquid: this.sim.env.countLiquid(), gas: this.sim.env.countGas(),
        threats: this.sim.threats.threats.length, loot: this.sim.loot.loot.length,
        envMs: this.sim.env.metrics.lastMs, envOver: this.sim.env.metrics.overBudgetTicks,
        cellsSet: this.sim.world.metrics.cellsSet, coalesced: this.sim.world.metrics.batchCoalesced,
        events: this.sim.bus.eventCounts(),
        aftermath: this.sim.aftermath.entries.length,
        steamCells: (this.sim.env as any).steamCells?.length ?? 0,
      } as any));
    }

    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) { this.autosaveTimer = 0; saveGame(this.sim); }
  }

  private utilPrev = false;
  private radarTimer = 0;
  private lastScanCount = 0;
  private healTimer = 0;
  private hudElement = document.getElementById("hud") as HTMLElement;

  private makeQAHook() {
    const scene = this;
    return {
      scene,
      sim: () => scene.sim,
      audio: scene.audio,
      start: (seed?: number) => {
        const s = new GameSim(seed ?? 12345);
        scene.resetWorld(s, true);
      },
      state: () => {
        const s = scene.sim;
        return {
          money: s.rig.money,
          toolTier: s.rig.toolTier,
          ownedTools: s.rig.ownedTools,
          cargoUsed: s.rig.cargoUsed(),
          cargoCap: s.rig.fx().cargoCap,
          hp: s.rig.hp,
          x: s.rig.x,
          y: s.rig.y,
          cellsDestroyed: s.stats.cellsDestroyed,
          markers: s.blocked.sites.size,
          vulnerable: [...s.blocked.sites.values()].filter((v) => v.vulnerable).length,
          upgrades: [...s.rig.upgrades],
          relics: [...s.rig.relics],
          blueprints: [...s.rig.blueprints],
          wow: [...s.wow.seen],
          strata: [...s.stats.strataSeen],
          seed: s.seed,
          tick: s.tick,
          started: scene.started,
          paused: scene.paused,
          digHeld: scene.input2.digHeld,
          inputDig: s.input.dig,
          aftermath: s.aftermath.entries.length,
          heat: s.rig.heat,
          overheat: s.rig.overheated,
          threats: s.threats.threats.length,
        };
      },
      save: () => saveGame(scene.sim),
      pause: (p: boolean) => { scene.paused = p; },
    };
  }
}
