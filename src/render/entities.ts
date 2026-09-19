/**
 * DEEPER — entity & FX rendering: rig assembly, threats, loot, caches,
 * pooled particles, floating texts, charge markers.
 * v1.2: bounded active sets, recoil/landing/breakthrough/tier acquire FX,
 * aftermath scars, hazard warnings, chain reaction feedback, long-session cleanup.
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

const AFTERMATH_TINT: Record<string, number> = {
  drained: 0x6a8a9a, flooded: 0x4a6a9a, cooledMagma: 0x5a5a5a,
  burnedGas: 0x3a3a3a, burnedOil: 0x2a2a2a, collapsed: 0x8a7a6a,
  pressureRelease: 0x9a9a5a, crystalFracture: 0x9ad0e8, crystalStabilized: 0x6ae8a0,
  seismicScar: 0x6a5a4a, thermalScar: 0x8a4a3a, mawExcavated: 0x4a3a2a,
};

export class EntityRenderer {
  scene: Phaser.Scene;
  sim: GameSim;
  tracks!: Phaser.GameObjects.Image;
  chassis!: Phaser.GameObjects.Image;
  toolSpr!: Phaser.GameObjects.Image;
  lamp!: Phaser.GameObjects.Image;
  cargoSpr!: Phaser.GameObjects.Image;
  vacuumSpr!: Phaser.GameObjects.Image;
  liftRing!: Phaser.GameObjects.Image;
  lootSprites = new Map<number, Phaser.GameObjects.Image>();
  threatSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private threatFxMap = new Map<number, { aura: Phaser.GameObjects.Image; tele: Phaser.GameObjects.Image }>();
  cacheSprites = new Map<number, Phaser.GameObjects.Image>();
  chargeSprites: Phaser.GameObjects.Image[] = [];
  private scanSprites: Phaser.GameObjects.Image[] = [];
  private deathSprites = new Map<number, Phaser.GameObjects.Image>();
  private mapSprites = new Map<number, Phaser.GameObjects.Image>();
  private particles: { s: Phaser.GameObjects.Image; vx: number; vy: number; life: number; grav: number; spin: number }[] = [];
  private texts: { t: Phaser.GameObjects.Text; life: number; vy: number }[] = [];
  private fireSprites = new Map<string, Phaser.GameObjects.Image>();
  private steamSprites: { s: Phaser.GameObjects.Image; life: number }[] = [];
  private aftermathSprites = new Map<string, Phaser.GameObjects.Image>();
  private hazardSprites: { s: Phaser.GameObjects.Image; life: number }[] = [];
  reducedMotion = false;

  // performance caps
  private readonly MAX_PARTICLES = 120;
  private readonly MAX_STEAM = 24;
  private readonly MAX_TEXTS = 18;
  private readonly MAX_HAZARD = 12;
  private readonly MAX_AFTERMATH_SPRITES = 200;

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
    this.liftRing = this.scene.add.image(0, 0, "sheet_vfx", "vfx_scan_0").setDepth(4).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
  }

  private threatFx(id: number): { aura: Phaser.GameObjects.Image; tele: Phaser.GameObjects.Image } {
    let fx = this.threatFxMap.get(id);
    if (!fx) {
      const aura = this.scene.add.image(0, 0, "sheet_vfx", "vfx_elite_aura").setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
      const tele = this.scene.add.image(0, 0, "sheet_vfx", "vfx_telegraph").setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
      fx = { aura, tele };
      this.threatFxMap.set(id, fx);
    }
    return fx;
  }

  private wp(x: number, y: number): [number, number] { return [x * CELL, y * CELL]; }

  private boundParticles() {
    while (this.particles.length > this.MAX_PARTICLES) {
      const p = this.particles.shift(); p?.s.destroy();
    }
    while (this.steamSprites.length > this.MAX_STEAM) {
      const s = this.steamSprites.shift(); s?.s.destroy();
    }
    while (this.texts.length > this.MAX_TEXTS) {
      const t = this.texts.shift(); t?.t.destroy();
    }
    while (this.hazardSprites.length > this.MAX_HAZARD) {
      const h = this.hazardSprites.shift(); h?.s.destroy();
    }
  }

  update(dt: number, animTime: number) {
    const sim = this.sim;
    const rig = sim.rig;
    const [rx, ry] = this.wp(rig.x, rig.y);
    const hpFrac = rig.hp / rig.effectiveMaxHp();
    const damageVariant = hpFrac > 0.66 ? 0 : hpFrac > 0.4 ? 1 : hpFrac > 0.15 ? 2 : 3;
    this.chassis.setFrame(`chassis_${damageVariant}`);
    this.chassis.setPosition(rx, ry).setFlipX(rig.facing < 0);
    const trackFrame = Math.abs(rig.vx) > 0.4 ? `tracks_${Math.floor(animTime * 10) % 4}` : "tracks_0";
    this.tracks.setFrame(trackFrame).setPosition(rx, ry).setFlipX(rig.facing < 0);
    const td = tool(rig.toolTier);
    const ang = rig.aimAngle;
    const frames = td.key === "maw" ? 3 : 3;
    const frameIdx = rig.digCooldown > 0 || sim.input.dig ? Math.floor(animTime * 14) % frames : 0;
    this.toolSpr.setFrame(`tool_${td.key}_${frameIdx}`);
    const pivot = 26;
    const [tx, ty] = [rx + Math.cos(ang) * pivot, ry + Math.sin(ang) * pivot * 0.55 + 2];
    this.toolSpr.setPosition(tx, ty).setRotation(ang);
    this.toolSpr.setScale(1 + (td.recoil > 0.2 ? Math.sin(animTime * 30) * td.recoil * 0.04 : 0));
    this.toolSpr.setFlipY(rig.facing < 0 && Math.abs(ang) > Math.PI / 2);

    const lx = rx + (rig.facing > 0 ? 40 : -40);
    this.lamp.setPosition(lx - (rig.facing > 0 ? 0 : 46), ry - 6).setFlipX(rig.facing < 0);
    const used = rig.cargoUsed(rig.fx().cargoBulkMul);
    const cap = rig.fx().cargoCap;
    this.cargoSpr.setVisible(used >= cap * 0.85).setPosition(rx + (rig.facing > 0 ? -52 : 52), ry - 6).setFlipX(rig.facing < 0);
    const vac = rig.effectiveVacuum();
    const showVac = rig.upgrades.has("vacuum1") || rig.toolTier >= 5 || rig.magnetStreak >= 5;
    const vacFrame = rig.magnetStreak >= 5 ? "vacuum_3" : vac >= 6 ? "vacuum_2" : "vacuum_1";
    this.vacuumSpr.setFrame(vacFrame);
    this.vacuumSpr.setVisible(showVac).setPosition(rx, ry).setScale(vac / 10);
    if (showVac) this.vacuumSpr.setRotation(animTime * 1.2);

    if (sim.liftChannel) {
      this.liftRing.setVisible(true).setPosition(rx, ry).setScale(2 + sim.liftChannelProgress * 3);
      this.liftRing.setAlpha(0.35 + sim.liftChannelProgress * 0.5);
    } else {
      this.liftRing.setVisible(false);
    }

    // loot
    const seen = new Set<number>();
    for (const l of sim.loot.loot) {
      seen.add(l.id);
      let spr = this.lootSprites.get(l.id);
      if (!spr) {
        spr = this.scene.add.image(0, 0, "sheet_icons", `res_${l.res}`).setDepth(6).setScale(1.4);
        this.lootSprites.set(l.id, spr);
      }
      const [lx2, ly2] = this.wp(l.x, l.y);
      spr.setPosition(lx2, ly2);
      spr.setRotation(this.reducedMotion ? 0 : l.pulled ? Math.atan2(l.vy, l.vx) + Math.PI / 2 : Math.sin(animTime * 3 + l.id) * 0.2);
    }
    for (const [id, spr] of this.lootSprites) {
      if (!seen.has(id)) { spr.destroy(); this.lootSprites.delete(id); }
    }

    // threats
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
      if (t.telegraph > 0) spr.setFrame(`${t.family}_telegraph`);
      else if (t.elite && t.hurtFlash <= 0 && !(t.cooldown > 0.7)) spr.setFrame(`${t.family}_elite`);
      else if (t.hurtFlash > 0.6) spr.setFrame(`${t.family}_hit`);
      else if (t.cooldown > 0.7) spr.setFrame(`${t.family}_attack`);
      else spr.setFrame(`${t.family}_move_${Math.floor(animTime * 5 + t.id) % 2}`);
      spr.setFlipX(sim.rig.x > t.x ? (f.behavior === "walker" || f.behavior === "jumper") : (f.behavior !== "walker" && f.behavior !== "jumper"));
      spr.setTint(t.hurtFlash > 0 ? 0xff6060 : t.fleeing ? 0xa0c8ff : t.elite ? 0xffd070 : 0xffffff);
      const fx = this.threatFx(t.id);
      fx.aura.setVisible(t.elite).setPosition(sx, sy);
      fx.tele.setVisible(t.telegraph > 0).setPosition(sx, sy);
      if (t.telegraph > 0) fx.tele.setAlpha(0.5 + 0.5 * Math.sin(animTime * 20));
      // ambusher hidden dim
      if ((t as any).ambushState === "hidden") spr.setAlpha(0.35); else spr.setAlpha(1);
    }
    for (const [id, spr] of this.threatSprites) {
      if (!tseen.has(id)) {
        spr.destroy(); this.threatSprites.delete(id);
        const fx = this.threatFxMap.get(id);
        if (fx) { fx.aura.destroy(); fx.tele.destroy(); this.threatFxMap.delete(id); }
      }
    }

    this.syncCaches(false);

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
      spr.setFrame(i === 0 && sim.charges.length > 1 ? "charge_armed" : "charge");
      spr.setAlpha(0.7 + 0.3 * Math.sin(animTime * 20));
      spr.setScale(c.fuse < 0.3 ? 1.4 : 1);
    });

    while (this.scanSprites.length < sim.scanOverlays.length) {
      this.scanSprites.push(this.scene.add.image(0, 0, "sheet_vfx", "vfx_scan_0").setDepth(4).setBlendMode(Phaser.BlendModes.ADD));
    }
    while (this.scanSprites.length > sim.scanOverlays.length) {
      this.scanSprites.pop()!.destroy();
    }
    sim.scanOverlays.forEach((o, i) => {
      const [ox, oy] = this.wp(o.x, o.y);
      const spr = this.scanSprites[i];
      spr.setPosition(ox, oy).setScale(8);
      spr.setAlpha(Math.min(0.7, o.expiresIn / 8));
      spr.setFrame(`vfx_scan_${Math.floor(animTime * 3) % 2}`);
    });

    const dseen = new Set<number>();
    sim.deathCaches.forEach((dc, i) => {
      dseen.add(i);
      let spr = this.deathSprites.get(i);
      if (!spr) {
        spr = this.scene.add.image(0, 0, "sheet_props", "prop_deathcache").setDepth(5);
        this.deathSprites.set(i, spr);
      }
      const [dx2, dy2] = this.wp(dc.x, dc.y);
      spr.setPosition(dx2, dy2).setScale(2 + Math.sin(animTime * 4) * 0.15);
    });
    for (const [id, spr] of this.deathSprites) {
      if (!dseen.has(id)) { spr.destroy(); this.deathSprites.delete(id); }
    }

    const mseen = new Set<number>();
    sim.loot.cacheMaps.forEach((m, i) => {
      mseen.add(i);
      let spr = this.mapSprites.get(i);
      if (!spr) {
        spr = this.scene.add.image(0, 0, "sheet_props", "prop_cachemap").setDepth(5);
        this.mapSprites.set(i, spr);
      }
      const [mx, my] = this.wp(m.x, m.y);
      spr.setPosition(mx, my + Math.sin(animTime * 3 + i) * 6);
    });
    for (const [id, spr] of this.mapSprites) {
      if (!mseen.has(id)) { spr.destroy(); this.mapSprites.delete(id); }
    }

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
      spr.setPosition(fx2, fy2 - 14).setFrame(`vfx_fire_${Math.floor(animTime * 8 + f.x) % 3}`);
    }
    for (const [key, spr] of this.fireSprites) {
      if (!fireSeen.has(key)) { spr.destroy(); this.fireSprites.delete(key); }
    }

    // aftermath scars near rig (bounded)
    this.syncAftermath();

    for (let i = this.steamSprites.length - 1; i >= 0; i--) {
      const s = this.steamSprites[i];
      s.life -= dt;
      s.s.y -= 60 * dt;
      s.s.setAlpha(Math.min(0.8, s.life));
      if (s.life <= 0) { s.s.destroy(); this.steamSprites.splice(i, 1); }
    }
    for (let i = this.hazardSprites.length - 1; i >= 0; i--) {
      const h = this.hazardSprites[i];
      h.life -= dt;
      h.s.y -= 20 * dt;
      h.s.setAlpha(h.life);
      if (h.life <= 0) { h.s.destroy(); this.hazardSprites.splice(i, 1); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { p.s.destroy(); this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.s.x += p.vx * dt; p.s.y += p.vy * dt;
      p.s.setRotation(p.s.rotation + p.spin * dt);
      p.s.setAlpha(Math.min(1, p.life * 2));
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const ft = this.texts[i];
      ft.life -= dt;
      ft.t.y += ft.vy * dt;
      ft.t.setAlpha(Math.min(1, ft.life * 1.5));
      if (ft.life <= 0) { ft.t.destroy(); this.texts.splice(i, 1); }
    }
    this.boundParticles();
  }

  private syncCaches(force: boolean) {
    const seen = new Set<number>();
    for (const c of this.sim.loot.caches) {
      if (c.used) continue;
      seen.add(c.id);
      if (force || !this.cacheSprites.has(c.id)) {
        let frame = "res_blueprint"; let tex = "sheet_icons";
        if (c.kind === "cache") { frame = "prop_vent"; tex = "sheet_props"; }
        else if (c.kind === "relic") { frame = "vfx_sparkle"; tex = "sheet_vfx"; }
        else if (c.kind === "salvage") { frame = "prop_pump"; tex = "sheet_props"; }
        else if (c.kind === "valve") { frame = this.sim.drainOpen ? "prop_valve_open" : "prop_valve"; tex = "sheet_props"; }
        else if (c.kind === "core") { frame = "prop_core"; tex = "sheet_props"; }
        else if (c.kind === "lift") { frame = "prop_liftcar"; tex = "sheet_props"; }
        else if (c.kind === "blueprint") { frame = "res_blueprint"; tex = "sheet_icons"; }
        const spr = this.scene.add.image(0, 0, tex, frame).setDepth(5);
        this.cacheSprites.set(c.id, spr);
      }
      const spr = this.cacheSprites.get(c.id)!;
      const [x, y] = [c.x * CELL + CELL / 2, c.y * CELL + CELL / 2];
      spr.setPosition(x, y).setVisible(true);
      if (c.kind === "relic") spr.setScale(2 + Math.sin(this.scene.time.now / 300 + c.id) * 0.3);
    }
    for (const [id, spr] of this.cacheSprites) {
      if (!seen.has(id)) { spr.destroy(); this.cacheSprites.delete(id); }
    }
  }

  private syncAftermath() {
    // only render aftermath within 32 cells of rig, capped
    const rigX = Math.floor(this.sim.rig.x);
    const rigY = Math.floor(this.sim.rig.y);
    const nearby = this.sim.aftermath.nearby(rigX, rigY, 28);
    const seen = new Set<string>();
    for (let i = 0; i < Math.min(nearby.length, this.MAX_AFTERMATH_SPRITES); i++) {
      const a = nearby[i];
      const key = `${a.x},${a.y},${a.kind}`;
      seen.add(key);
      if (this.aftermathSprites.has(key)) continue;
      const tint = AFTERMATH_TINT[a.kind] ?? 0x777777;
      const spr = this.scene.add.image(a.x * CELL + CELL / 2, a.y * CELL + CELL / 2, "sheet_vfx", "vfx_dust_0")
        .setDepth(3).setTint(tint).setAlpha(0.35).setScale(1.2);
      this.aftermathSprites.set(key, spr);
    }
    // cull distant
    for (const [k, spr] of this.aftermathSprites) {
      if (!seen.has(k)) { spr.destroy(); this.aftermathSprites.delete(k); }
    }
    if (this.aftermathSprites.size > this.MAX_AFTERMATH_SPRITES) {
      const keys = [...this.aftermathSprites.keys()];
      for (let i = 0; i < keys.length - this.MAX_AFTERMATH_SPRITES; i++) {
        const k = keys[i]; const s = this.aftermathSprites.get(k); s?.destroy(); this.aftermathSprites.delete(k);
      }
    }
  }

  // FX spawners
  spawnBreakDebris(cx: number, cy: number, matId: number, big = false) {
    if (this.reducedMotion && !big) return;
    const fam = mat(matId).family;
    const color = CHUNK_FAMILY_COLOR[fam] ?? 0x888888;
    const n = big ? 8 : 3;
    for (let i = 0; i < n; i++) {
      const frame = `vfx_chunk_${i % 3}`;
      const s = this.scene.add.image(cx * CELL + CELL / 2, cy * CELL + CELL / 2, "sheet_vfx", frame).setDepth(12);
      s.setTint(color).setScale(big ? 1.6 : 0.9 + Math.random() * 0.5);
      this.particles.push({ s, vx: (Math.random() - 0.5) * (big ? 460 : 260), vy: -Math.random() * (big ? 380 : 240) - 40, life: 0.7 + Math.random() * 0.5, grav: 900, spin: (Math.random() - 0.5) * 10 });
    }
    const d = this.scene.add.image(cx * CELL + CELL / 2, cy * CELL + CELL / 2, "sheet_vfx", `vfx_dust_${Math.floor(Math.random() * 3)}`).setDepth(11).setAlpha(0.7);
    this.particles.push({ s: d, vx: (Math.random() - 0.5) * 60, vy: -30, life: 0.6, grav: -20, spin: 0 });
    this.boundParticles();
  }

  spawnSparks(x: number, y: number, n = 5) {
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_spark").setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
      this.particles.push({ s, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.7) * 380, life: 0.4, grav: 700, spin: 0 });
    }
    this.boundParticles();
  }

  spawnSteam(x: number, y: number) {
    const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_steam_0").setDepth(13).setAlpha(0.8);
    this.steamSprites.push({ s, life: 1.2 });
    const iv = this.scene.time.addEvent({
      delay: 100, repeat: 3, callback: () => { if (s.active) s.setFrame(`vfx_steam_${1 + (Math.floor(this.scene.time.now / 100) % 2)}`); },
    }); void iv;
    this.boundParticles();
  }

  spawnScanRing(x: number, y: number) {
    const ring = this.scene.add.image(x, y, "sheet_vfx", "vfx_scan_0").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9);
    this.scene.tweens.add({ targets: ring, scale: 10, alpha: 0, duration: this.reducedMotion ? 200 : 800, onComplete: () => ring.destroy() });
  }

  spawnHeal(x: number, y: number) {
    const s = this.scene.add.image(x, y - 20, "sheet_vfx", "vfx_heal").setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
    this.particles.push({ s, vx: 0, vy: -60, life: 0.8, grav: -40, spin: 0 });
  }

  spawnExplosion(x: number, y: number, scale: number) {
    const spr = this.scene.add.image(x, y, "sheet_vfx", "vfx_ignite").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setScale(scale);
    const seq = ["vfx_explosion_0", "vfx_explosion_1", "vfx_explosion_2", "vfx_explosion_3"];
    let f = -1;
    const ev = this.scene.time.addEvent({
      delay: 60, repeat: 4, callback: () => {
        f++; if (f >= seq.length) { spr.destroy(); ev.remove(); } else spr.setFrame(seq[f]);
      },
    });
    for (let i = 0; i < 10; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", `vfx_chunk_${i % 3}`).setDepth(13).setScale(1.5);
      this.particles.push({ s, vx: Math.cos((i / 10) * Math.PI * 2) * 420, vy: Math.sin((i / 10) * Math.PI * 2) * 420 - 120, life: 0.9, grav: 800, spin: 8 });
    }
    this.boundParticles();
  }

  spawnResonanceWave(x: number, y: number) {
    const ring = this.scene.add.image(x, y, "sheet_vfx", "vfx_reswave_0").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9).setScale(1);
    this.scene.tweens.add({
      targets: ring, scale: 16, alpha: 0, duration: this.reducedMotion ? 200 : 700,
      onUpdate: () => { if (ring.scaleX > 8) ring.setFrame("vfx_reswave_1"); },
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 8; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_shard").setDepth(13);
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({ s, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300, life: 0.8, grav: 300, spin: 6 });
    }
    this.boundParticles();
  }

  // v1.2 new FX
  spawnRecoil(x: number, y: number, recoil: number) {
    if (this.reducedMotion) return;
    const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_dust_1").setDepth(12).setAlpha(0.6).setScale(0.5 + recoil);
    this.particles.push({ s, vx: (Math.random() - 0.5) * 120, vy: -40 - recoil * 40, life: 0.3, grav: -10, spin: 2 });
    this.boundParticles();
  }

  spawnHeavyLanding(x: number, y: number, tier: number) {
    const ring = this.scene.add.image(x * CELL, y * CELL, "sheet_vfx", "vfx_scan_0").setDepth(13).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7).setScale(1);
    this.scene.tweens.add({ targets: ring, scale: 2 + tier, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
    for (let i = 0; i < 6 + tier; i++) {
      const s = this.scene.add.image(x * CELL, y * CELL, "sheet_vfx", `vfx_chunk_${i % 3}`).setDepth(12).setScale(0.8 + Math.random() * 0.6);
      this.particles.push({ s, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 180, life: 0.6, grav: 600, spin: (Math.random() - 0.5) * 8 });
    }
    this.boundParticles();
  }

  spawnBreakthrough(x: number, y: number) {
    const burst = this.scene.add.image(x * CELL, y * CELL, "sheet_vfx", "vfx_sparkle").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setScale(2);
    this.scene.tweens.add({ targets: burst, scale: 4, alpha: 0, duration: 600, onComplete: () => burst.destroy() });
    for (let i = 0; i < 10; i++) {
      const s = this.scene.add.image(x * CELL, y * CELL, "sheet_vfx", "vfx_shard").setDepth(13);
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({ s, vx: Math.cos(ang) * 360, vy: Math.sin(ang) * 360 - 60, life: 0.7, grav: 400, spin: 10 });
    }
    this.boundParticles();
  }

  spawnTierAcquire(x: number, y: number, tier: number) {
    const colors = [0xd8a83c, 0xf8d048, 0xb070e8, 0x48c8b0];
    const ring = this.scene.add.image(x, y, "sheet_vfx", "vfx_elite_aura").setDepth(14).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setTint(colors[tier % colors.length]);
    this.scene.tweens.add({ targets: ring, scale: 3 + tier * 0.4, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
  }

  spawnDebrisBurst(x: number, y: number, mul: number) {
    const n = Math.floor(2 * mul);
    for (let i = 0; i < n; i++) {
      const s = this.scene.add.image(x, y, "sheet_vfx", `vfx_chunk_${i % 3}`).setDepth(11).setScale(0.7 * mul);
      this.particles.push({ s, vx: (Math.random() - 0.5) * 200 * mul, vy: -Math.random() * 200 * mul, life: 0.5, grav: 500, spin: 4 });
    }
    this.boundParticles();
  }

  spawnMagnetStreak(x: number, y: number) {
    const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_sparkle").setDepth(12).setBlendMode(Phaser.BlendModes.ADD).setScale(1.2);
    this.particles.push({ s, vx: 0, vy: -80, life: 0.4, grav: -20, spin: 6 });
  }

  spawnAftermathMark(x: number, y: number, kind: string) {
    const tint = AFTERMATH_TINT[kind] ?? 0x888888;
    const s = this.scene.add.image(x * CELL + CELL / 2, y * CELL + CELL / 2, "sheet_vfx", "vfx_dust_2").setDepth(4).setTint(tint).setAlpha(0.7).setScale(1.5);
    this.scene.tweens.add({ targets: s, alpha: 0.25, scale: 1, duration: 1200, onComplete: () => {
      // keep faint persistent via syncAftermath; destroy temp burst
      s.destroy();
    }});
  }

  spawnHazardWarn(x: number, y: number, kind: string, severity: number) {
    const color = kind === "steam" ? 0x9ad0e8 : kind.includes("gas") ? 0x7ae88a : kind === "pressure" ? 0xe8d05a : 0xe86838;
    const txt = this.scene.add.text(x * CELL, y * CELL - 12, `⚠ ${kind.toUpperCase()}`, { fontFamily: "monospace", fontSize: "12px", color: `#${color.toString(16).padStart(6, "0")}` }).setDepth(20).setOrigin(0.5);
    this.hazardSprites.push({ s: txt as unknown as Phaser.GameObjects.Image, life: 1.2 + severity });
  }

  spawnPressureRelease(x: number, y: number, force: number) {
    const ring = this.scene.add.image(x * CELL, y * CELL, "sheet_vfx", "vfx_scan_0").setDepth(13).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8).setScale(0.5);
    this.scene.tweens.add({ targets: ring, scale: force / 6, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
  }

  spawnCrystalStabilize(x: number, y: number) {
    const s = this.scene.add.image(x * CELL, y * CELL, "sheet_vfx", "vfx_reswave_0").setDepth(13).setBlendMode(Phaser.BlendModes.ADD).setTint(0x6ae8a0).setScale(0.5);
    this.scene.tweens.add({ targets: s, scale: 3, alpha: 0, duration: 700, onComplete: () => s.destroy() });
  }

  floatText(x: number, y: number, msg: string, color = "#f8e8b0", size = 15) {
    const t = this.scene.add.text(x, y, msg, {
      fontFamily: "monospace", fontSize: `${size}px`, color, stroke: "#14121a", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30);
    this.texts.push({ t, life: 1.6, vy: -46 });
    this.boundParticles();
  }

  spawnPickupBurst(x: number, y: number, res: string) {
    if (this.reducedMotion) return;
    const s = this.scene.add.image(x, y, "sheet_vfx", "vfx_sparkle").setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    const resDef = RESOURCES[res];
    const tint = resDef ? (resDef.tier >= 5 ? 0xb070e8 : resDef.tier >= 3 ? 0xf8d048 : 0xbfe8f0) : 0xffffff;
    s.setTint(tint);
    this.particles.push({ s, vx: (Math.random() - 0.5) * 80, vy: -120, life: 0.5, grav: -60, spin: 4 });
    this.boundParticles();
  }
}
