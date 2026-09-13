/**
 * DEEPER — entity & FX rendering: rig assembly, threats, loot, caches,
 * pooled particles, floating texts, charge markers.
 */

import Phaser from "phaser";
import { CELL } from "./terrain";
import type { GameSim } from "../sim/game";
import type { Threat } from "../sim/threats";
import { THREAT_FAMILIES } from "../sim/threats";
import { RESOURCES } from "../sim/resources";
import { mat } from "../sim/materials";
import { tool } from "../sim/tools";
import { stratumAtRow } from "../config";

const CHUNK_FAMILY_COLOR: Record<string, number> = {
  soft: 0x7d5a3a, granular: 0x9a8a6a, organic: 0x7a5a33, brittle: 0xa89a7a,
  dense: 0x6f6f78, metal: 0x8e99a5, structural: 0x9a9ba0, crystal: 0xb8e8f0,
  machine: 0x5c636c, bedrock: 0x333340,
};

export class EntityRenderer {
  scene: Phaser.Scene;
  sim: GameSim;
  // rig assembly
  tracks!: Phaser.GameObjects.Image;
  chassis!: Phaser.GameObjects.Image;
  toolSpr!: Phaser.GameObjects.Image;
  lamp!: Phaser.GameObjects.Image;
  cargoSpr!: Phaser.GameObjects.Image;
  vacuumSpr!: Phaser.GameObjects.Image;
  // pooled
  lootSprites = new Map<number, Phaser.GameObjects.Image>();
  threatSprites = new Map<number, Phaser.GameObjects.Sprite>();
  cacheSprites = new Map<number, Phaser.GameObjects.Image>();
  chargeSprites: Phaser.GameObjects.Image[] = [];
  private particles: { s: Phaser.GameObjects.Image; vx: number; vy: number; life: number; grav: number; spin: number }[] = [];
  private texts: { t: Phaser.GameObjects.Text; life: number; vy: number }[] = [];
  private fireSprites = new Map<string, Phaser.GameObjects.Image>();
  private steamSprites: { s: Phaser.GameObjects.Image; life: number }[] = [];
  reducedMotion = false;

  constructor(scene: Phaser.Scene, sim: GameSim) {
    this.scene = scene;
    this.sim = sim;
    this.buildRig();
    this.syncCaches(true);
  }

  private buildRig() {
    this.lamp = this.scene.add.image(0, 0, "sheet_rig", "lamp").setAlpha(0.22).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.tracks = this.scene.add.image(0, 0, "sheet_rig", "tracks_0").setDepth(8);
    this.chassis = this.scene.add.image(0, 0, "sheet_rig", "chassis_0").setDepth(10);
    this.toolSpr = this.scene.add.image(0, 0, "sheet_rig", "tool_auger_0").setDepth(11);
    this.cargoSpr = this.scene.add.image(0, 0, "sheet_rig", "cargo_full").setDepth(12).setVisible(false);
    this.vacuumSpr = this.scene.add.image(0, 0, "sheet_rig", "vacuum_1").setDepth(4).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Convert rig/sim cells to world pixels. */
  private wp(x: number, y: number): [number, number] {
    return [x * CELL, y * CELL];
  }

  update(dt: number, animTime: number) {
    const sim = this.sim;
    const rig = sim.rig;
    // ---- rig assembly
    const [rx, ry] = this.wp(rig.x, rig.y);
    const damageVariant = rig.hp > 66 ? 0 : rig.hp > 33 ? 1 : 2;
    this.chassis.setFrame(`chassis_${damageVariant}`);
    this.chassis.setPosition(rx, ry).setFlipX(rig.facing < 0);
    const trackFrame = Math.abs(rig.vx) > 0.4 ? `tracks_${Math.floor(animTime * 10) % 4}` : "tracks_0";
    this.tracks.setFrame(trackFrame).setPosition(rx, ry).setFlipX(rig.facing < 0);
    // tool aims at pointer
    const td = tool(rig.toolTier);
    const ang = rig.aimAngle;
    const frames = td.key === "maw" ? 3 : 3;
    const frameIdx = rig.digCooldown > 0 || sim.input.dig ? Math.floor(animTime * 14) % frames : 0;
    this.toolSpr.setFrame(`tool_${td.key}_${frameIdx}`);
    const pivot = 26;
    const [tx, ty] = [rx + Math.cos(ang) * pivot, ry + Math.sin(ang) * pivot * 0.55 + 2];
    this.toolSpr.setPosition(tx, ty).setRotation(ang);
    this.toolSpr.setScale(1);
    if (rig.facing < 0 && Math.abs(ang) > Math.PI / 2) {
      this.toolSpr.setFlipY(true);
    } else {
      this.toolSpr.setFlipY(false);
    }
    // lamp: front of chassis
    const lx = rx + (rig.facing > 0 ? 40 : -40);
    this.lamp.setPosition(lx - (rig.facing > 0 ? 0 : 46), ry - 6).setFlipX(rig.facing < 0);
    // cargo visual
    const used = rig.cargoUsed(rig.fx().cargoBulkMul);
    const cap = rig.fx().cargoCap;
    this.cargoSpr.setVisible(used >= cap * 0.85).setPosition(rx + (rig.facing > 0 ? -52 : 52), ry - 6).setFlipX(rig.facing < 0);
    // vacuum ring
    const vac = Math.max(rig.fx().vacuum, td.vacuum);
    const showVac = rig.upgrades.has("vacuum1") || rig.toolTier >= 5;
    this.vacuumSpr.setVisible(showVac).setPosition(rx, ry).setScale(vac / 10);
    if (showVac) this.vacuumSpr.setRotation(animTime * 1.2);

    // ---- loot
    const seen = new Set<number>();
    for (const l of sim.loot.loot) {
      seen.add(l.id);
      let spr = this.lootSprites.get(l.id);
      if (!spr) {
        spr = this.scene.add.image(0, 0, "sheet_icons", `res_${l.res}`).setDepth(6);
        spr.setScale(1.4);
        this.lootSprites.set(l.id, spr);
      }
      const [lx2, ly2] = this.wp(l.x, l.y);
      spr.setPosition(lx2, ly2);
      spr.setRotation(this.reducedMotion ? 0 : l.pulled ? Math.atan2(l.vy, l.vx) + Math.PI / 2 : Math.sin(animTime * 3 + l.id) * 0.2);
    }
    for (const [id, spr] of this.lootSprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.lootSprites.delete(id);
      }
    }

    // ---- threats
    const tseen = new Set<number>();
    for (const t of sim.threats.threats) {
      tseen.add(t.id);
      let spr = this.threatSprites.get(t.id);
      if (!spr) {
        spr = this.scene.add.sprite(0, 0, "sheet_enemies", `${t.family}_move_0`).setDepth(7);
        this.threatSprites.set(t.id, spr);
      }
      const [sx, sy] = this.wp(t.x, t.y);
      spr.setPosition(sx, sy);
      const f = THREAT_FAMILIES[t.family];
      if (t.hurtFlash > 0.6) {
        spr.setFrame(`${t.family}_hit`);
      } else if (t.cooldown > 0.7) {
        spr.setFrame(`${t.family}_attack`);
      } else {
        spr.setFrame(`${t.family}_move_${Math.floor(animTime * 5 + t.id) % 2}`);
      }
      spr.setFlipX(sim.rig.x > t.x ? (f.behavior === "walker" || f.behavior === "jumper") : (f.behavior !== "walker" && f.behavior !== "jumper"));
      spr.setTint(t.hurtFlash > 0 ? 0xff6060 : 0xffffff);
    }
    for (const [id, spr] of this.threatSprites) {
      if (!tseen.has(id)) {
        spr.destroy();
        this.threatSprites.delete(id);
      }
    }

    // ---- caches
    this.syncCaches(false);

    // ---- charges
    while (this.chargeSprites.length < sim.charges.length) {
      this.chargeSprites.push(this.scene.add.image(0, 0, "sheet_rig", "charge").setDepth(5));
    }
    while (this.chargeSprites.length > sim.charges.length) {
      this.chargeSprites.pop()!.destroy();
    }
    sim.charges.forEach((c, i) => {
      const [cx2, cy2] = this.wp(c.x, c.y);
      const spr = this.chargeSprites[i];
      spr.setPosition(cx2, cy2);
      spr.setAlpha(0.7 + 0.3 * Math.sin(animTime * 20));
    });

    // ---- fires
    const fireSeen = new Set<string>();
    for (const f of sim.env.fires) {
      const key = `${f.x},${f.y}`;
      fireSeen.add(key);
      let spr = this.fireSprites.get(key);
      if (!spr) {
        spr = this.scene.add.image(0, 0, "sheet_vfx", "vfx_fire_0").setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
        this.fireSprites.set(key, spr);
      }
      const [fx2, fy2] = this.wp(f.x + 0.5, f.y + 0.5);
      spr.setPosition(fx2, fy2 - 14);
      spr.setFrame(`vfx_fire_${Math.floor(animTime * 8 + f.x) % 3}`);
    }
    for (const [key, spr] of this.fireSprites) {
      if (!fireSeen.has(key)) {
        spr.destroy();
        this.fireSprites.delete(key);
      }
    }

    // ---- steam puffs
    for (let i = this.steamSprites.length - 1; i >= 0; i--) {
      const s = this.steamSprites[i];
      s.life -= dt;
      s.s.y -= 60 * dt;
      s.s.setAlpha(Math.min(0.8, s.life));
      if (s.life <= 0) {
        s.s.destroy();
        this.steamSprites.splice(i, 1);
      }
    }

    // ---- particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.setRotation(p.s.rotation + p.spin * dt);
      p.s.setAlpha(Math.min(1, p.life * 2));
    }

    // ---- floating texts
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const ft = this.texts[i];
      ft.life -= dt;
      ft.t.y += ft.vy * dt;
      ft.t.setAlpha(Math.min(1, ft.life * 1.5));
      if (ft.life <= 0) {
        ft.t.destroy();
        this.texts.splice(i, 1);
      }
    }
  }

  private syncCaches(force: boolean) {
    const seen = new Set<number>();
    for (const c of this.sim.loot.caches) {
      if (c.used) continue;
      seen.add(c.id);
      if (force || !this.cacheSprites.has(c.id)) {
        let frame = "res_blueprint";
        let tex = "sheet_icons";
        if (c.kind === "cache") { frame = "prop_vent"; tex = "sheet_props"; }
        else if (c.kind === "relic") { frame = "vfx_sparkle"; tex = "sheet_vfx"; }
        else if (c.kind === "salvage") { frame = "prop_pump"; tex = "sheet_props"; }
        else if (c.kind === "valve") { frame = "prop_valve"; tex = "sheet_props"; }
        else if (c.kind === "core") { frame = "ui_core"; tex = "sheet_icons"; }
        else if (c.kind === "lift") { frame = "prop_liftrail"; tex = "sheet_props"; }
        if (c.kind === "blueprint") { frame = "res_blueprint"; tex = "sheet_icons"; }
        const spr = this.scene.add.image(0, 0, tex, frame).setDepth(5);
        this.cacheSprites.set(c.id, spr);
      }
      const spr = this.cacheSprites.get(c.id)!;
      const [x, y] = [c.x * CELL + CELL / 2, c.y * CELL + CELL / 2];
      spr.setPosition(x, y).setVisible(true);
      if (c.kind === "relic") {
        spr.setScale(2 + Math.sin(this.scene.time.now / 300 + c.id) * 0.3);
      }
    }
    for (const [id, spr] of this.cacheSprites) {
      if (!seen.has(id)) {
        spr.destroy();
        this.cacheSprites.delete(id);
      }
    }
  }

  // ---- FX spawners ---------------------------------------------------------
  spawnBreakDebris(cx: number, cy: number, matId: number, big = false) {
    if (this.reducedMotion && !big) return;
    const fam = mat(matId).family;
    const color = CHUNK_FAMILY_COLOR[fam] ?? 0x888888;
    const n = big ? 8 : 3;
    for (let i = 0; i < n; i++) {
      const frame = `vfx_chunk_${i % 3}`;
      const s = this.scene.add.image(cx * CELL + CELL / 2, cy * CELL + CELL / 2, "sheet_vfx", frame).setDepth(12);
      s.setTint(color).setScale(big ? 1.6 : 0.9 + Math.random() * 0.5);
      this.particles.push({
        s,
        vx: (Math.random() - 0.5) * (big ? 460 : 260),
        vy: -Math.random() * (big ? 380 : 240) - 40,
        life: 0.7 + Math.random() * 0.5,
        grav: 900,
        spin: (Math.random() - 0.5) * 10,
      });
    }
    // dust
    const d = this.scene.add.image(cx * CELL + CELL / 2, cy * CELL + CELL / 2, "sheet_vfx", `vfx_dust_${Math.floor(Math.random() * 3)}`).setDepth(11).setAlpha(0.7);
    this.particles.push({ s: d, vx: (Math.random() - 0.5) * 60, vy: -30, life: 0.6, grav: -20, spin: 0 });
  }

  spawnSparks(x: number, y: number, n = 5) {
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_spark").setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
      this.particles.push({ s, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.7) * 380, life: 0.4, grav: 700, spin: 0 });
    }
  }

  spawnSteam(x: number, y: number) {
    const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_steam_0").setDepth(13).setAlpha(0.8);
    this.steamSprites.push({ s, life: 1.2 });
    const iv = this.scene.time.addEvent({
      delay: 100, repeat: 3, callback: () => {
        if (s.active) s.setFrame(`vfx_steam_${1 + (Math.floor(this.scene.time.now / 100) % 2)}`);
      },
    });
    void iv;
  }

  spawnExplosion(x: number, y: number, scale: number) {
    const spr = this.scene.add.image(x, y, "sheet_vfx", "vfx_explosion_0").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setScale(scale);
    let f = 0;
    const ev = this.scene.time.addEvent({
      delay: 60, repeat: 3, callback: () => {
        f++;
        if (f >= 4) {
          spr.destroy();
          ev.remove();
        } else {
          spr.setFrame(`vfx_explosion_${f}`);
        }
      },
    });
    // chunk debris ring
    for (let i = 0; i < 10; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", `vfx_chunk_${i % 3}`).setDepth(13).setScale(1.5);
      this.particles.push({ s, vx: Math.cos((i / 10) * Math.PI * 2) * 420, vy: Math.sin((i / 10) * Math.PI * 2) * 420 - 120, life: 0.9, grav: 800, spin: 8 });
    }
  }

  spawnResonanceWave(x: number, y: number) {
    const ring = this.scene.add.image(x, y, "sheet_rig", "vacuum_2").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9).setScale(1);
    this.scene.tweens.add({
      targets: ring, scale: 16, alpha: 0, duration: this.reducedMotion ? 200 : 700,
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 8; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_shard").setDepth(13);
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({ s, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300, life: 0.8, grav: 300, spin: 6 });
    }
  }

  floatText(x: number, y: number, msg: string, color = "#f8e8b0", size = 15) {
    const t = this.scene.add.text(x, y, msg, {
      fontFamily: "monospace", fontSize: `${size}px`, color, stroke: "#14121a", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30);
    this.texts.push({ t, life: 1.6, vy: -46 });
  }

  spawnPickupBurst(x: number, y: number, res: string) {
    if (this.reducedMotion) return;
    const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_sparkle").setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    const resDef = RESOURCES[res];
    const tint = resDef ? (resDef.tier >= 5 ? 0xb070e8 : resDef.tier >= 3 ? 0xf8d048 : 0xbfe8f0) : 0xffffff;
    s.setTint(tint);
    this.particles.push({ s, vx: (Math.random() - 0.5) * 80, vy: -120, life: 0.5, grav: -60, spin: 4 });
  }
}
