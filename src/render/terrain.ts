/**
 * DEEPER — terrain renderer.
 * One Blitter per chunk; bobs are rebuilt only for dirty chunks (budgeted per
 * frame). Liquids and gas render as per-chunk Graphics overlays (cheap partial
 * redraws); exploration fog is a screen-space Graphics pass.
 */

import Phaser from "phaser";
import { CHUNK, CHUNKS_X, CHUNKS_Y, TILE, WORLD_H, WORLD_W } from "../config";
import { M, mat } from "../sim/materials";
import { LIQ_MAGMA, LIQ_OIL, LIQ_WATER, ORE_KEYS, World } from "../sim/world";

export const CELL = 40; // world pixels per cell (16px art at 2.5x)

const MAT_FRAME: Record<number, string> = {
  [M.GRASS]: "grass", [M.SOIL]: "soil", [M.CLAY]: "clay", [M.SANDSTONE]: "sandstone",
  [M.ROOTWOOD]: "rootwood", [M.PIPE]: "pipe", [M.SAND]: "sand", [M.GRAVEL]: "gravel",
  [M.FILLEDIRT]: "fill", [M.STONE]: "stone", [M.TIMBER]: "timber", [M.RAILIRON]: "railiron",
  [M.COALROCK]: "coalrock", [M.CONCRETE]: "concrete", [M.BRICK]: "brick", [M.ASPHALT]: "asphalt",
  [M.STEEL]: "steel", [M.CONDUIT]: "conduit", [M.TILE]: "tile", [M.WETSTONE]: "wetstone",
  [M.SLATE]: "slate", [M.PRESSGLASS]: "pressglass", [M.CALCITE]: "calcite", [M.BASALT]: "basalt",
  [M.SULFURROCK]: "sulfurrock", [M.OBSIDIAN]: "obsidian", [M.MAGMAROCK]: "magmarock",
  [M.CRYSTAL]: "crystal", [M.DARKSTONE]: "darkstone", [M.GEMROCK]: "gemrock",
  [M.COMPOSITE]: "composite", [M.ALLOY]: "alloy", [M.CPipe]: "cpipe", [M.BULKHEAD]: "bulkhead",
  [M.DECPANEL]: "decpanel", [M.BEDROCK]: "bedrock", [M.VAULTWALL]: "vaultwall",
  [M.GEODESHELL]: "geodeshell", [M.ROOTGOLD]: "rootgold",
};

const ORE_FRAME: Record<string, string> = {
  copper: "copper", coal: "coal", iron: "iron", silver: "silver", gold: "gold",
  tungsten: "tungsten", quartz: "quartz", voidgem: "voidgem", nickel: "nickel",
  amber: "amber", brinepearl: "brinepearl", obsshard: "obsshard",
};

const LIQ_COLOR: Record<number, number> = {
  [LIQ_WATER]: 0x2e5d6e,
  [LIQ_MAGMA]: 0xe05828,
  [LIQ_OIL]: 0x2a2430,
};

/** Materials with a 4th terrain variant (must match tools/art.ts EXTRA_VARIANT). */
const FOUR_VARIANT = new Set(["soil", "stone", "basalt", "crystal", "concrete", "sandstone"]);
/** High-tier ores with bright variants. */
const BRIGHT_ORE = new Set(["tungsten", "quartz", "voidgem"]);

export class TerrainRenderer {
  scene: Phaser.Scene;
  world: World;
  private blitters: (Phaser.GameObjects.Blitter | null)[] = [];
  private liquidGfx: (Phaser.GameObjects.Graphics | null)[] = [];
  private liquidPhase = 0;
  private liquidTimer = 0;
  fog: Phaser.GameObjects.Graphics;
  private chunkBudget = 3;

  constructor(scene: Phaser.Scene, world: World) {
    this.scene = scene;
    this.world = world;
    for (let i = 0; i < CHUNKS_X * CHUNKS_Y; i++) {
      this.blitters.push(null);
      this.liquidGfx.push(null);
    }
    this.fog = scene.add.graphics().setDepth(20);
  }

  private chunkCx(cy: number, cx: number) {
    const blit = this.blitters[cy * CHUNKS_X + cx];
    return blit;
  }

  private ensureChunk(cx: number, cy: number): Phaser.GameObjects.Blitter {
    const key = cy * CHUNKS_X + cx;
    let b = this.blitters[key];
    if (!b) {
      b = this.scene.add.blitter(0, 0, "sheet_terrain").setDepth(0);
      this.blitters[key] = b;
    }
    return b;
  }

  private buildChunk(cx: number, cy: number) {
    const key = cy * CHUNKS_X + cx;
    const b = this.ensureChunk(cx, cy);
    b.clear();
    const g = this.liquidGfx[key];
    if (g) g.clear();
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    for (let y = y0; y < y0 + CHUNK; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        if (x >= WORLD_W || y >= WORLD_H) continue;
        const i = x + y * WORLD_W;
        const t = this.world.tiles[i];
        const px = x * CELL;
        const py = y * CELL;
        if (t !== M.AIR) {
          const frameKey = MAT_FRAME[t];
          if (frameKey) {
            const v = this.world.variant[i] % (FOUR_VARIANT.has(frameKey) ? 4 : 3);
            b.create(px, py, `t_${frameKey}_${v}`);
          }
          // ore overlay (bright variants for high-tier ores, sparkles on rich cells)
          const oi = this.world.ore[i];
          if (oi > 0) {
            const res = ORE_KEYS[oi - 1];
            const of = ORE_FRAME[res];
            if (of) {
              if (BRIGHT_ORE.has(of) && (x * 7 + y * 13) % 3 === 0) b.create(px, py, `ore_${of}_bright`);
              else b.create(px, py, `ore_${of}_${(x + y) % 2}`);
              if ((x * 5 + y * 11) % 7 === 0) b.create(px, py, `ore_sparkle_${(x + y) % 2}`);
            }
          }
          // rare fossil decals in deep sedimentary bands
          if (y > 200 && y < 460 && (x * 13 + y * 7) % 61 === 0) {
            b.create(px, py, `decal_fossil_${(x + y) % 3}`);
          }
          // damage cracks
          const d = mat(t);
          const ratio = this.world.damage[i] / d.hp;
          if (ratio > 0.34) {
            b.create(px, py, `crack_${ratio > 0.67 ? 1 : 0}`);
          }
        }
      }
    }
    // liquid + gas graphics
    if (!g) {
      const gfx = this.scene.add.graphics().setDepth(1);
      this.liquidGfx[key] = gfx;
    }
    this.drawLiquid(cx, cy);
  }

  private drawLiquid(cx: number, cy: number) {
    const g = this.liquidGfx[cy * CHUNKS_X + cx];
    if (!g) return;
    g.clear();
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const ph = this.liquidPhase;
    for (let y = y0; y < y0 + CHUNK; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const i = x + y * WORLD_W;
        const liq = this.world.liquid[i];
        if (liq === 0) continue;
        const level = this.world.liqLevel[i] / 8;
        const px = x * CELL;
        const py = y * CELL;
        const h = Math.max(6, CELL * level);
        const color = LIQ_COLOR[liq];
        const isMagma = liq === LIQ_MAGMA;
        const isOil = liq === LIQ_OIL;
        g.fillStyle(color, isMagma ? 0.96 : isOil ? 0.92 : 0.72);
        g.fillRect(px, py + CELL - h, CELL, h);
        // surface highlight with animated wave
        const wob = Math.sin((x * 0.9 + ph) * 0.9) * 3;
        g.fillStyle(isMagma ? 0xf8d048 : isOil ? 0x5a4e66 : 0x8ec8d8, 0.8);
        g.fillRect(px, py + CELL - h + wob * 0.4, CELL, 4);
        if (isMagma) {
          g.fillStyle(0xf08030, 0.5);
          g.fillRect(px + 8, py + CELL - h + 10 + wob * 0.3, CELL - 16, 5);
        }
      }
    }
    // gas haze
    for (let y = y0; y < y0 + CHUNK; y++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const gas = this.world.gas[x + y * WORLD_W];
        if (gas <= 0) continue;
        g.fillStyle(0xc8d8b0, 0.05 + gas * 0.035);
        const px = x * CELL;
        const py = y * CELL;
        g.fillCircle(px + CELL / 2 + Math.sin(ph + x) * 4, py + CELL / 2, CELL * 0.55);
      }
    }
  }

  /** Rebuild up to budget dirty chunks per call; returns work done. */
  flushDirty(budget = this.chunkBudget): number {
    let n = 0;
    // prioritize chunks near the camera
    const cam = this.scene.cameras.main;
    const ccx = Math.floor((cam.scrollX + cam.width / 2) / (CHUNK * CELL));
    const ccy = Math.floor((cam.scrollY + cam.height / 2) / (CHUNK * CELL));
    const dirty = [...this.world.dirtyChunks].sort((a, b) => {
      const ax = a % CHUNKS_X;
      const ay = (a / CHUNKS_X) | 0;
      const bx = b % CHUNKS_X;
      const by = (b / CHUNKS_X) | 0;
      const da = Math.abs(ax - ccx) + Math.abs(ay - ccy);
      const db = Math.abs(bx - ccx) + Math.abs(by - ccy);
      return da - db;
    });
    for (const key of dirty) {
      if (n >= budget) break;
      this.world.dirtyChunks.delete(key);
      const cx = key % CHUNKS_X;
      const cy = (key / CHUNKS_X) | 0;
      this.buildChunk(cx, cy);
      n++;
    }
    return n;
  }

  private fpsAvg = 60;
  private degraded = false;

  update(dt: number) {
    // FPS tracking → auto-degrade liquid redraw rate when slow
    this.fpsAvg = this.fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;
    const wantDegraded = this.fpsAvg < 30;
    if (wantDegraded !== this.degraded) {
      this.degraded = wantDegraded;
      this.chunkBudget = wantDegraded ? 1 : 3;
    }
    this.liquidTimer += dt;
    const interval = this.degraded ? 0.6 : 0.25;
    if (this.liquidTimer > interval) {
      this.liquidTimer = 0;
      this.liquidPhase += 0.8;
      // cull: only redraw liquid for chunks near the camera
      const cam = this.scene.cameras.main;
      const x0 = Math.max(0, Math.floor(cam.scrollX / (CHUNK * CELL)) - 1);
      const y0 = Math.max(0, Math.floor(cam.scrollY / (CHUNK * CELL)) - 1);
      const x1 = Math.min(CHUNKS_X - 1, Math.ceil((cam.scrollX + cam.width) / (CHUNK * CELL)) + 1);
      const y1 = Math.min(CHUNKS_Y - 1, Math.ceil((cam.scrollY + cam.height) / (CHUNK * CELL)) + 1);
      for (let cy = 0; cy < CHUNKS_Y; cy++) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
          const b = this.blitters[cy * CHUNKS_X + cx];
          const g = this.liquidGfx[cy * CHUNKS_X + cx];
          const visible = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
          if (b) b.setVisible(visible);
          if (g) g.setVisible(visible);
          if (b && g && visible) this.drawLiquid(cx, cy);
        }
      }
    }
  }

  /** Draw exploration fog over the visible region. */
  drawFog(cam: Phaser.Cameras.Scene2D.Camera, rigX: number, rigY: number) {
    const g = this.fog;
    g.clear();
    const x0 = Math.max(0, Math.floor(cam.scrollX / CELL) - 1);
    const y0 = Math.max(0, Math.floor(cam.scrollY / CELL) - 1);
    const x1 = Math.min(WORLD_W - 1, Math.ceil((cam.scrollX + cam.width) / CELL) + 1);
    const y1 = Math.min(WORLD_H - 1, Math.ceil((cam.scrollY + cam.height) / CELL) + 1);
    g.fillStyle(0x05050a, 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = x + y * WORLD_W;
        if (this.world.explored[i]) continue;
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
    // dim remembered terrain at the light edge
    const rx = Math.floor(rigX);
    const ry = Math.floor(rigY);
    g.fillStyle(0x05050a, 0.45);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = x + y * WORLD_W;
        if (!this.world.explored[i]) continue;
        const d = Math.hypot(x - rx, y - ry);
        if (d > 10.5) {
          g.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
    }
  }

  /** Seed initial chunk builds around a world position (blocking). */
  warmup(px: number, py: number, radiusChunks: number) {
    const cx = Math.floor(px / (CHUNK * CELL));
    const cy = Math.floor(py / (CHUNK * CELL));
    for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        const ax = cx + dx;
        const ay = cy + dy;
        if (ax < 0 || ay < 0 || ax >= CHUNKS_X || ay >= CHUNKS_Y) continue;
        this.world.dirtyChunks.add(ay * CHUNKS_X + ax);
      }
    }
    while (this.flushDirty(8) > 0) { /* build all */ }
  }
}
