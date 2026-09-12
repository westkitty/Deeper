/**
 * DEEPER — main world scene. Drives the headless sim, renders terrain/entities,
 * handles input, HUD, menus, wow staging, save/load and diagnostics.
 */

import Phaser from "phaser";
import { CAM_ZOOM, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { GameSim } from "../sim/game";
import { stratumAtRow } from "../config";
import { tool } from "../sim/tools";
import { mat } from "../sim/materials";
import { TerrainRenderer, CELL } from "../render/terrain";
import { EntityRenderer } from "../render/entities";
import { loadSheets, sliceAll } from "../render/slices";
import { AudioEngine } from "../audio";
import { InputManager } from "../input";
import { UI } from "../ui/dom";
import { openMap, openWorkshop, openFinale, stratumBanner } from "../ui/menus";
import { hasSave, loadSaveData, saveGame } from "../sim/save";
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

  constructor() {
    super("world");
  }

  preload() {
    loadSheets(this);
    this.load.image("bg_hills", "assets/props.png"); // full sheet not used directly; hills sliced below
  }

  create() {
    sliceAll(this);
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
    void CAM_ZOOM;
    void GAME_WIDTH;
    void GAME_HEIGHT;

    this.terrain = new TerrainRenderer(this, this.sim.world);
    this.entities = new EntityRenderer(this, this.sim);
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

  private onResize(size: Phaser.Structs.Size) {
    this.scale.resize(size.width, size.height);
  }

  /** Start/resume gameplay after menu flow. */
  beginPlay(fresh: boolean) {
    this.started = true;
    this.paused = false;
    this.ui.clearMenu();
    this.audio.ensure();
    if (fresh) {
      this.ui.banner("THE WORKS", "Dig. Fill the hopper. Sell at the works. Go deeper.", 4200);
      this.ui.toast({ text: "LEFT CLICK to dig · A/D to drive · E at the works to sell" });
    } else {
      this.ui.toast({ text: "Welcome back. The world is how you left it." });
    }
  }

  // -------------------------------------------------------------------------
  private pressUnsub?: () => void;

  private wireInput() {
    // scene restart re-runs create(): drop the previous key handler first
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
        }
      }
      if (k === "q") {
        const next = (this.sim.rig.toolTier + 1) % (this.sim.rig.ownedTools + 1);
        this.sim.rig.toolTier = next;
        this.ui.toast({ text: `${tool(next).name} selected`, color: "#d8a83c" });
      }
    });
  }

  private interact() {
    const t = this.sim.interactTarget();
    if (!t) return;
    if (t.kind === "base") {
      this.openWorkshop();
      return;
    }
    this.sim.interact();
    if (t.kind === "core") {
      // finale handled via wow event
    }
  }

  private togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.ui.showPause(
        () => this.togglePause(),
        () => {
          this.openSettings("pause");
        },
        () => {
          saveGame(this.sim);
          this.scene.restart();
          this.game.registry.set("showTitle", true);
          window.location.reload();
        },
      );
    } else {
      this.ui.clearMenu();
    }
  }

  private openSettings(from: string) {
    this.settingsOpen = true;
    this.ui.showSettings(
      {
        master: this.audio.vol.master, sfx: this.audio.vol.sfx, ambient: this.audio.vol.ambient,
        shake: this.audio.shake, reducedMotion: this.audio.reducedMotion,
      },
      (s) => {
        this.audio.setVolumes(s);
        this.audio.shake = s.shake;
        this.audio.reducedMotion = s.reducedMotion;
        this.entities.reducedMotion = s.reducedMotion;
        localStorage.setItem("deeper.settings", JSON.stringify(s));
      },
      () => {
        this.settingsOpen = false;
        this.ui.clearMenu();
        if (from === "title") {
          this.showTitle();
        }
      },
    );
  }

  private showTitle() {
    this.paused = true;
    this.ui.showTitle(
      () => {
        const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
        this.scene.restart();
        this.game.registry.set("pendingSeed", seed);
        this.game.registry.set("autostart", true);
      },
      () => {
        this.scene.restart();
        this.game.registry.set("pendingLoad", true);
        this.game.registry.set("autostart", true);
      },
      () => this.openSettings("title"),
      () => this.ui.showCredits(() => this.showTitle()),
      hasSave(),
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

  private closeWorkshop() {
    this.workshopOpen = false;
    this.workshop = null;
    this.ui.clearMenu();
  }

  private openMap() {
    if (this.mapOpen) return;
    this.mapOpen = true;
    this.mapView = openMap(this.sim, () => this.closeMap());
  }

  private closeMap() {
    this.mapOpen = false;
    this.mapView = null;
    this.ui.clearMenu();
  }

  private closeSettings() {
    this.settingsOpen = false;
    this.ui.clearMenu();
    if (!this.started) this.showTitle();
  }

  private closeFinale() {
    this.finaleOpen = false;
    this.ui.clearMenu();
  }

  // -------------------------------------------------------------------------
  private wireSimEvents() {
    this.sim.bus.on((e) => {
      switch (e.type) {
        case "drillHit": {
          const [wx, wy] = [e.x * CELL + CELL / 2, e.y * CELL + CELL / 2];
          if (e.effective) {
            if (Math.random() < 0.5) this.entities.spawnSparks(wx, wy, 2);
            this.audio.digSound(mat(e.mat).sound, true);
          } else {
            this.audio.digSound(mat(e.mat).sound, false);
            this.entities.spawnSparks(wx, wy, 1);
          }
          break;
        }
        case "break": {
          this.entities.spawnBreakDebris(e.x, e.y, e.mat, (e.count ?? 1) > 2);
          break;
        }
        case "pickup": {
          // burst at rig
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
        case "death": {
          this.audio.play("extract", 0.9);
          break;
        }
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
          this.ui.toast({ text: `Sold cargo: +¤${e.money.toLocaleString()}`, color: "#d8a83c" });
          break;
        }
        case "cargoFull": {
          this.audio.play("cargo_full", 0.6);
          this.ui.toast({ text: "CARGO FULL — sell at the works (E at base)", color: "#e05838" });
          break;
        }
        case "pickup": break;
        case "blocked": break;
        case "blockedMarked": {
          this.ui.toast({ text: "Blocked site marked on your map.", color: "#e05838" });
          break;
        }
        case "nowVulnerable": {
          this.ui.banner(`${e.count} MARKED SITE${e.count === 1 ? "" : "S"} NOW VULNERABLE`, "Your new capability breaks what stopped you. The map shows where.", 4200);
          this.audio.play("discovery", 0.7);
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
          this.audio.play("big_loot");
          this.ui.banner("BLUEPRINT RECOVERED", e.key.toUpperCase(), 3600);
          break;
        }
        case "relic": {
          this.audio.play("discovery", 0.9);
          this.ui.toast({ text: "Relic recovered — displayed at the museum", color: "#b070e8" });
          break;
        }
        case "geode": {
          this.audio.play("big_loot", 0.8);
          break;
        }
        case "motherlode": {
          this.audio.play("big_loot");
          this.ui.banner("MOTHERLODE", "The motherlode. You found the motherlode.", 4000);
          break;
        }
        case "liftUnlocked": {
          this.ui.toast({ text: `Lift landing unlocked: ${e.stop}`, color: "#d8a83c" });
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
            this.audio.play(b[2], 0.95);
            this.addShake(6);
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
        case "threatDeath": {
          this.audio.play("dig_metal", 0.4, 0.8);
          break;
        }
        case "coreExtracted": {
          this.audio.play("discovery", 1);
          break;
        }
        default:
          break;
      }
    });
  }

  private addShake(amount: number) {
    if (this.audio.reducedMotion) return;
    this.shakeAmount = Math.min(20, this.shakeAmount + amount * this.audio.shake);
  }

  private checkVulnerableAnnounce() {
    // handled via economy events; re-evaluate markers on any capability gain
    this.sim.blocked.reevaluate(this.sim.rig.toolTier);
  }

  // -------------------------------------------------------------------------
  override update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.animTime += dt;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0;
      this.fpsTime = 0;
    }

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
      // input → sim
      const cam = this.cameras.main;
      this.pointerWorld.set(
        cam.scrollX + this.input2.pointerX,
        cam.scrollY + this.input2.pointerY,
      );
      const inp = this.sim.input;
      inp.left = this.input2.left;
      inp.right = this.input2.right;
      inp.jump = this.input2.jump;
      inp.winch = this.input2.up || this.input2.jump;
      inp.dig = this.input2.digHeld;
      inp.aimX = this.pointerWorld.x / CELL;
      inp.aimY = this.pointerWorld.y / CELL;
      // utility on press edge
      if (this.input2.utilityPressed && !this.utilPrev) {
        this.sim.useUtilityAt(inp.aimX, inp.aimY);
      }
      this.utilPrev = this.input2.utilityPressed;

      this.sim.step(dt);
      this.audio.setDepthTint(Math.min(1, this.sim.rig.y / 800));
      // dig loop audio
      const loopKey = `tool_${tool(this.sim.rig.toolTier).key}`;
      if (inp.dig && this.sim.rig.lastDugCell.x >= 0) {
        if (this.lastDigLoopKey !== loopKey) {
          this.digLoopStop?.stop();
          this.digLoopStop = this.audio.toolLoopStart(loopKey);
          this.lastDigLoopKey = loopKey;
        }
      } else if (this.digLoopStop) {
        this.digLoopStop.stop();
        this.digLoopStop = null;
        this.lastDigLoopKey = "";
      }
    } else {
      this.sim.input.dig = false;
      this.sim.input.left = this.sim.input.right = false;
      this.sim.input.jump = false;
    }

    // ---- rendering sync
    this.terrain.flushDirty(3);
    this.terrain.update(dt);
    this.entities.update(dt, this.animTime);
    this.terrain.drawFog(this.cameras.main, this.sim.rig.x, this.sim.rig.y);

    // camera follow
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
    } else {
      this.shakeAmount = 0;
    }

    // ---- HUD
    this.hudTimer += dt;
    if (this.hudTimer > 0.12) {
      this.hudTimer = 0;
      const rig = this.sim.rig;
      const f = rig.fx();
      const st = stratumAtRow(Math.floor(rig.y));
      let hazard = "";
      if (st === "redfault" && f.heatProt < 1) hazard = "⚠ HEAT — coolant required";
      if (st === "drownedfault" && rig.y > 340 && f.pressureProt < 1) hazard = "⚠ PRESSURE — hull required";
      if (rig.hp < 30) hazard = "⚠ RIG INTEGRITY LOW";
      this.ui.hudUpdate({
        money: rig.money,
        cargoUsed: rig.cargoUsed(f.cargoBulkMul),
        cargoCap: f.cargoCap,
        depth: Math.max(0, Math.floor(rig.y) - 8),
        stratum: st,
        tool: tool(rig.toolTier).name,
        toolTier: rig.toolTier,
        hp: rig.hp,
        maxHp: rig.maxHp,
        hazard,
        markers: this.sim.blocked.sites.size,
        vulnerable: [...this.sim.blocked.sites.values()].filter((s) => s.vulnerable).length,
        charges: rig.charges,
      });
    }

    // ---- diagnostics
    if (this.diagOn) {
      this.ui.setDiag(this.ui.diagText(
        this.fps,
        this.sim.world.activeChunks.size,
        this.entities["particles"].length,
        this.sim.env.countLiquid(),
        this.sim.env.countGas(),
        0,
      ));
    }

    // ---- autosave
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 30) {
      this.autosaveTimer = 0;
      saveGame(this.sim);
    }
  }

  private utilPrev = false;
  private hudElement = document.getElementById("hud") as HTMLElement;

  private makeQAHook() {
    const scene = this;
    return {
      scene,
      sim: () => scene.sim,
      audio: scene.audio,
      start: (seed?: number) => {
        scene.game.registry.set("pendingSeed", seed ?? 12345);
        scene.game.registry.set("autostart", true);
        scene.scene.restart();
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
        };
      },
      save: () => saveGame(scene.sim),
      pause: (p: boolean) => {
        scene.paused = p;
      },
    };
  }
}
