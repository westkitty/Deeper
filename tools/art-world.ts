/**
 * DEEPER asset pipeline — environment props, surface base buildings, VFX, logo.
 */

import { Px, RGBA, hex, shade, mix, hashpix, mulberry } from "./pixutil";

const METAL = hex("#6a7078");
const METAL_L = hex("#8a929a");
const METAL_D = hex("#454b52");
const WOOD = hex("#7a5a33");
const WOOD_D = shade(WOOD, -0.3);
const RUST = hex("#8a4a30");
const YELLOW = hex("#d8a83c");
const DARK = hex("#26282c");
const OUTL = hex("#14121a");

// ---------------------------------------------------------------------------
// PROPS (16-48px, transparent bg, drawn as set dressing inside dug space)
// ---------------------------------------------------------------------------
export function buildProps(add: (name: string, p: Px) => void) {
  // pipe horizontal / vertical
  {
    const p = new Px(16, 16);
    for (let y = 5; y < 11; y++) for (let x = 0; x < 16; x++) p.set(x, y, y < 8 ? METAL_L : METAL);
    for (let x = 3; x < 6; x++) for (let y = 4; y < 12; y++) p.set(x, y, METAL_D);
    p.outline(OUTL);
    add("prop_pipe_h", p);
  }
  {
    const p = new Px(16, 16);
    for (let x = 5; x < 11; x++) for (let y = 0; y < 16; y++) p.set(x, y, x < 8 ? METAL_L : METAL);
    for (let y = 3; y < 6; y++) for (let x = 4; x < 12; x++) p.set(x, y, METAL_D);
    p.outline(OUTL);
    add("prop_pipe_v", p);
  }
  // rail
  {
    const p = new Px(16, 16);
    for (let y = 6; y < 9; y++) for (let x = 0; x < 16; x++) p.set(x, y, y === 6 ? METAL_L : y === 8 ? METAL_D : METAL);
    for (const tx of [2, 9]) for (let y = 9; y < 12; y++) for (let x = tx; x < tx + 5; x++) p.set(x, y, WOOD_D);
    p.outline(OUTL);
    add("prop_rail", p);
  }
  // cable run
  {
    const p = new Px(16, 16);
    for (let x = 0; x < 16; x++) {
      const y = 5 + Math.round(Math.sin(x / 3) * 2);
      p.set(x, y, hex("#c8a03c")); p.set(x, y + 1, hex("#8a6c20"));
    }
    add("prop_cable", p);
  }
  // vent
  {
    const p = new Px(16, 16);
    p.rect(2, 4, 12, 8, METAL); p.rect(2, 4, 12, 1, METAL_L);
    for (let y = 6; y < 11; y += 2) for (let x = 3; x < 13; x++) p.set(x, y, DARK);
    p.outline(OUTL);
    add("prop_vent", p);
  }
  // pump machine (32x32)
  {
    const p = new Px(32, 32);
    p.rect(4, 8, 24, 20, METAL); p.rect(4, 8, 24, 2, METAL_L); p.rect(4, 26, 24, 2, METAL_D);
    p.rect(8, 12, 8, 8, METAL_D);
    p.disc(20, 16, 5, METAL_L); p.disc(20, 16, 2, METAL_D);
    for (let x = 6; x < 28; x += 6) p.set(x, 29, DARK);
    p.rect(12, 2, 8, 7, METAL); p.rect(12, 2, 8, 2, METAL_L);
    p.rect(14, 4, 4, 3, hex("#48c8b0"));
    p.outline(OUTL);
    add("prop_pump", p);
  }
  // valve wheel (16x16)
  {
    const p = new Px(16, 16);
    p.ring(8, 8, 5.4, RUST); p.ring(8, 8, 4, shade(RUST, 0.15));
    p.line(4, 4, 12, 12, RUST); p.line(12, 4, 4, 12, RUST);
    p.disc(8, 8, 1.6, METAL_L);
    p.outline(OUTL);
    add("prop_valve", p);
  }
  // lift car (32x40) + rail (16x16)
  {
    const p = new Px(32, 40);
    p.rect(2, 2, 28, 34, METAL); p.rect(2, 2, 28, 3, METAL_L); p.rect(2, 33, 28, 3, METAL_D);
    p.frame(2, 2, 28, 34, METAL_D);
    for (let x = 6; x < 26; x += 5) for (let y = 8; y < 30; y += 5) p.set(x, y, METAL_L);
    p.rect(10, 36, 12, 3, RUST);
    p.outline(OUTL);
    add("prop_liftcar", p);
    const r = new Px(16, 16);
    for (const x of [3, 12]) for (let y = 0; y < 16; y++) { r.set(x, y, METAL_L); r.set(x + 1, y, METAL_D); }
    add("prop_liftrail", r);
  }
  // machine column (16x48) — engine deep dressing
  {
    const p = new Px(16, 48);
    for (let y = 0; y < 48; y++) for (let x = 2; x < 14; x++) p.set(x, y, (x + y) % 7 === 0 ? METAL_D : METAL);
    for (let y = 4; y < 48; y += 12) { p.rect(2, y, 12, 2, METAL_L); }
    p.rect(6, 20, 4, 4, hex("#e05838"));
    p.rect(6, 36, 4, 4, hex("#48c8b0"));
    p.outline(OUTL);
    add("prop_machine", p);
  }
  // bulkhead door (32x32)
  {
    const p = new Px(32, 32);
    p.rect(2, 2, 28, 28, METAL_D); p.rect(4, 4, 24, 24, METAL);
    for (let x = 4; x < 28; x += 4) if ((x / 4) % 2 === 0) { p.set(x, 4, YELLOW); p.set(x + 1, 4, YELLOW); p.set(x, 5, YELLOW); p.set(x + 1, 5, YELLOW); }
    p.disc(16, 16, 4, METAL_L); p.disc(16, 16, 1.6, METAL_D);
    p.outline(OUTL);
    add("prop_bulkhead", p);
  }
  // crystal clusters (16x24)
  for (let v = 0; v < 2; v++) {
    const p = new Px(16, 24);
    const c1 = hex("#b8e8f0"); const c2 = hex("#8ec4d4"); const c3 = hex("#e8feff");
    const rnd = mulberry(80 + v);
    for (let i = 0; i < 4 + v * 2; i++) {
      const bx = 3 + Math.floor(rnd() * 10);
      const h = 8 + Math.floor(rnd() * 12);
      for (let y = 0; y < h; y++) {
        const w = Math.max(0, Math.round((y / h) * 2.4));
        for (let x = bx - w; x <= bx + w; x++) p.set(x, 23 - y, y > h - 3 ? c3 : (x < bx ? c1 : c2));
      }
    }
    p.outline(OUTL);
    add(`prop_crystal_${v}`, p);
  }
  // fossil bones in wall
  {
    const p = new Px(16, 16);
    p.line(2, 10, 13, 6, hex("#d8d0bc"));
    p.disc(3, 10, 1.4, hex("#d8d0bc")); p.disc(13, 6, 1.4, hex("#d8d0bc"));
    p.line(5, 11, 5, 13, hex("#c8c0a8")); p.line(9, 9, 9, 12, hex("#c8c0a8"));
    add("prop_fossil", p);
  }
  // warning sign
  {
    const p = new Px(12, 12);
    for (let y = 0; y < 12; y++) {
      const w = Math.min(y, 11 - y);
      for (let x = 6 - w; x <= 6 + w; x++) p.set(x, y, YELLOW);
    }
    p.set(6, 3, DARK); p.set(6, 4, DARK); p.set(6, 6, DARK);
    p.set(5, 9, DARK); p.set(6, 9, DARK); p.set(7, 9, DARK);
    p.outline(OUTL);
    add("prop_sign", p);
  }
}

// ---------------------------------------------------------------------------
// SURFACE BUILDINGS — the works grows through 6 stages
// ---------------------------------------------------------------------------
function skyHands(p: Px) { void p; }

export function buildBase(add: (name: string, p: Px) => void) {
  const WALL = hex("#8f7a5c");
  const WALL_D = shade(WALL, -0.25);
  const ROOF = hex("#7d5a3a");
  const CONC = hex("#8f9094");

  // stage 0: the shack (48x36)
  {
    const p = new Px(48, 36);
    p.rect(6, 14, 30, 20, WALL); p.rect(6, 14, 30, 2, shade(WALL, 0.12));
    for (let x = 6; x < 36; x += 6) p.line(x, 16, x, 34, WALL_D);
    p.rect(4, 8, 34, 7, ROOF); p.rect(4, 8, 34, 2, shade(ROOF, 0.15));
    p.rect(26, 22, 8, 12, WOOD_D); // door
    p.rect(12, 20, 6, 5, DARK); p.frame(12, 20, 6, 5, WOOD_D);
    p.rect(38, 24, 6, 10, METAL); // buyer scale post
    p.rect(36, 22, 10, 3, METAL_L);
    p.rect(40, 26, 2, 2, YELLOW);
    p.outline(OUTL);
    add("base_shack", p);
  }
  // stage 1: workshop (64x44) — walls up, canopy, refinery pad
  {
    const p = new Px(64, 44);
    p.rect(4, 12, 40, 30, CONC); p.rect(4, 12, 40, 2, shade(CONC, 0.12));
    for (let y = 16; y < 42; y += 6) p.line(4, y, 44, y, shade(CONC, -0.1));
    p.rect(2, 6, 44, 7, METAL); p.rect(2, 6, 44, 2, METAL_L);
    p.rect(30, 24, 10, 18, WOOD_D);
    p.rect(10, 20, 8, 6, DARK); p.frame(10, 20, 8, 6, METAL_D);
    p.rect(46, 14, 16, 28, METAL); p.rect(46, 14, 16, 2, METAL_L);
    for (let y = 18; y < 42; y += 5) p.line(48, y, 60, y, METAL_D);
    p.rect(50, 18, 8, 6, hex("#48c8b0"));
    p.rect(36, 2, 4, 6, METAL_D); // stack
    p.outline(OUTL);
    add("base_workshop", p);
  }
  // stage 2: refinery (80x52) — physical refinery towers
  {
    const p = new Px(80, 52);
    p.rect(2, 16, 44, 34, CONC); p.rect(2, 16, 44, 2, shade(CONC, 0.12));
    p.rect(0, 10, 48, 7, METAL); p.rect(0, 10, 48, 2, METAL_L);
    p.rect(32, 28, 10, 22, WOOD_D);
    p.rect(8, 24, 9, 7, DARK); p.frame(8, 24, 9, 7, METAL_D);
    // refinery tower 1
    p.rect(52, 4, 12, 46, METAL); p.rect(52, 4, 12, 2, METAL_L);
    for (let y = 8; y < 50; y += 6) p.rect(53, y, 10, 2, METAL_D);
    p.rect(55, 0, 6, 5, METAL_D);
    // refinery tower 2 (shorter)
    p.rect(68, 18, 10, 32, METAL); p.rect(68, 18, 10, 2, METAL_L);
    for (let y = 22; y < 50; y += 6) p.rect(69, y, 8, 2, METAL_D);
    p.rect(58, 6, 3, 3, hex("#f0a040")); // flame
    p.outline(OUTL);
    add("base_refinery", p);
  }
  // stage 3: machine bay (96x48) — gantry over the shaft
  {
    const p = new Px(96, 48);
    p.rect(2, 20, 30, 26, CONC); p.rect(2, 20, 30, 2, shade(CONC, 0.12));
    p.rect(0, 14, 34, 7, METAL);
    p.rect(20, 30, 10, 16, WOOD_D);
    // gantry crane
    for (const gx of [40, 88]) p.rect(gx, 8, 5, 38, METAL);
    p.rect(38, 6, 54, 5, METAL_L); p.rect(38, 11, 54, 2, METAL_D);
    p.rect(58, 11, 4, 14, METAL_D);
    p.rect(54, 25, 12, 8, RUST);
    // hazard stripes
    for (let x = 38; x < 92; x += 8) { p.set(x, 7, DARK); p.set(x + 1, 7, DARK); }
    p.outline(OUTL);
    add("base_machinebay", p);
  }
  // stage 4: freight tower (56x96) — lift headframe
  {
    const p = new Px(56, 96);
    // headframe A shape
    p.line(8, 94, 26, 6, METAL); p.line(48, 94, 30, 6, METAL);
    for (let y = 10; y < 94; y += 10) {
      const t = (y - 6) / 88;
      p.rect(8 + t * 18 - 1, y, 3, 2, METAL_L);
      p.rect(48 - t * 18 - 1, y, 3, 2, METAL_L);
      p.line(20 - t * 4, y, 36 + t * 4, y, METAL_D);
    }
    p.rect(20, 2, 16, 6, METAL_L);
    p.rect(24, 8, 8, 20, METAL_D);
    for (let y = 10; y < 26; y += 4) p.set(28, y, YELLOW);
    // shed at base
    p.rect(2, 72, 24, 22, CONC); p.rect(2, 72, 24, 2, shade(CONC, 0.12));
    p.rect(8, 82, 8, 12, WOOD_D);
    p.outline(OUTL);
    add("base_freight", p);
  }
  // stage 5: excavation campus (160x72)
  {
    const p = new Px(160, 72);
    // main hall
    p.rect(4, 24, 56, 46, CONC); p.rect(4, 24, 56, 2, shade(CONC, 0.12));
    p.rect(2, 16, 60, 9, METAL); p.rect(2, 16, 60, 2, METAL_L);
    for (let x = 8; x < 56; x += 8) p.rect(x, 28, 4, 6, DARK);
    p.rect(40, 44, 12, 26, WOOD_D);
    // second hall
    p.rect(66, 34, 36, 36, CONC); p.rect(64, 28, 40, 7, METAL);
    // refinery cluster
    p.rect(108, 10, 12, 60, METAL); p.rect(124, 26, 10, 44, METAL);
    for (let y = 14; y < 70; y += 6) p.rect(109, y, 10, 2, METAL_D);
    for (let y = 30; y < 70; y += 6) p.rect(125, y, 8, 2, METAL_D);
    p.rect(112, 6, 4, 5, METAL_D);
    p.rect(112, 4, 3, 3, hex("#f0a040"));
    // headframe
    p.line(142, 70, 152, 18, METAL); p.line(158, 70, 152, 18, METAL);
    p.rect(148, 14, 8, 5, METAL_L);
    // pipes between halls
    for (let x = 60; x < 108; x++) { p.set(x, 30, METAL_L); p.set(x, 31, METAL); }
    p.outline(OUTL);
    add("base_campus", p);
  }
  // museum display case (24x20)
  {
    const p = new Px(24, 20);
    p.rect(2, 2, 20, 16, hex("#4a5a6a", 160)); p.frame(2, 2, 20, 16, METAL_L);
    p.rect(2, 16, 20, 2, METAL_D);
    p.set(6, 8, hex("#e8c84a")); p.set(12, 10, hex("#b070e8")); p.set(16, 7, hex("#d07840"));
    add("prop_museum", p);
  }
  // fence segment + lamp
  {
    const p = new Px(16, 20);
    for (const x of [1, 14]) p.rect(x, 4, 2, 16, METAL_D);
    p.rect(0, 7, 16, 1, METAL); p.rect(0, 12, 16, 1, METAL);
    p.rect(0, 16, 16, 1, METAL);
    add("prop_fence", p);
    const l = new Px(12, 36);
    p.rect(0, 0, 0, 0, 0);
    l.rect(5, 4, 2, 30, METAL_D);
    l.rect(3, 0, 6, 5, METAL); l.rect(4, 1, 4, 2, hex("#f8e8b0"));
    l.outline(OUTL);
    add("prop_lamp", l);
  }
  // parallax hills + clouds
  {
    const p = new Px(256, 64);
    const rnd = mulberry(4242);
    for (let x = 0; x < 256; x++) {
      const h = 18 + Math.round(Math.sin(x / 34) * 9 + Math.sin(x / 13.7) * 4 + rnd() * 2);
      for (let y = 64 - h; y < 64; y++) {
        const c = y < 64 - h + 3 ? hex("#5d7a4a") : hex("#4c6a3c");
        p.set(x, y, shade(c, (hashpix(x, y, 9) - 0.5) * 0.12));
      }
    }
    add("bg_hills", p);
    const c = new Px(48, 16);
    for (let i = 0; i < 6; i++) c.disc(8 + i * 7, 10 - (i % 2) * 2, 5 + (i % 3), hex("#e8ecf0", 230));
    add("bg_cloud", c);
  }
}

// ---------------------------------------------------------------------------
// VFX textures
// ---------------------------------------------------------------------------
export function buildVFX(add: (name: string, p: Px) => void) {
  // dust puffs (3 frames)
  for (let f = 0; f < 3; f++) {
    const p = new Px(10, 10);
    const rnd = mulberry(60 + f);
    const n = 6 - f;
    for (let i = 0; i < n; i++) {
      const x = 2 + rnd() * 6;
      const y = 2 + rnd() * 6;
      p.disc(x, y, 1 + rnd() * (2 - f * 0.5), hex("#a89a84", 200 - f * 50));
    }
    add(`vfx_dust_${f}`, p);
  }
  // rock chunks (3 color families)
  const chunkCols = [hex("#8a7a64"), hex("#6f6f78"), hex("#4a4650")];
  for (let v = 0; v < 3; v++) {
    const p = new Px(6, 6);
    p.rect(1, 1, 4, 4, chunkCols[v]);
    p.rect(1, 1, 4, 1, shade(chunkCols[v], 0.25));
    p.set(4, 4, shade(chunkCols[v], -0.3));
    p.set(1, 4, 0); p.set(4, 1, 0);
    add(`vfx_chunk_${v}`, p);
  }
  // spark
  {
    const p = new Px(6, 6);
    p.set(2, 2, hex("#f8f0b0")); p.set(3, 2, hex("#f0a040"));
    p.set(2, 3, hex("#f0a040")); p.set(3, 3, hex("#e05828"));
    add("vfx_spark", p);
  }
  // water splash
  {
    const p = new Px(8, 8);
    p.set(2, 2, hex("#8ec8d8")); p.set(5, 2, hex("#8ec8d8"));
    p.set(3, 1, hex("#b0e0ec")); p.set(4, 1, hex("#b0e0ec"));
    p.set(3, 4, hex("#5690a8")); p.set(4, 4, hex("#5690a8"));
    add("vfx_splash", p);
  }
  // steam (3 frames)
  for (let f = 0; f < 3; f++) {
    const p = new Px(14, 14);
    const rnd = mulberry(90 + f);
    for (let i = 0; i < 5; i++) {
      p.disc(3 + rnd() * 8, 10 - f * 3 - rnd() * 4, 2 + rnd() * 2, hex("#e8f0f2", 170 - f * 40));
    }
    add(`vfx_steam_${f}`, p);
  }
  // fire (3 frames)
  for (let f = 0; f < 3; f++) {
    const p = new Px(10, 14);
    const rnd = mulberry(120 + f);
    for (let x = 1; x < 9; x++) {
      const h = 6 + Math.round(rnd() * 6 + Math.sin(x + f * 2) * 2);
      for (let y = 0; y < h; y++) {
        const c = y < 2 ? hex("#f8f0b0") : y < 5 ? hex("#f0a040") : hex("#e05828");
        p.set(x, 13 - y, c, );
      }
    }
    add(`vfx_fire_${f}`, p);
  }
  // explosion (4 frames 32x32)
  for (let f = 0; f < 4; f++) {
    const p = new Px(32, 32);
    const r = 4 + f * 6;
    for (let a = 0; a < 26; a++) {
      const ang = (a / 26) * Math.PI * 2;
      const rr = r * (0.7 + mulberry(f * 31 + a)() * 0.5);
      for (let k = 0; k < rr; k += 1) {
        const x = 16 + Math.cos(ang) * k;
        const y = 16 + Math.sin(ang) * k;
        const c = k < rr * 0.4 ? hex("#f8f0b0", 240 - f * 40) : k < rr * 0.75 ? hex("#f0a040", 230 - f * 45) : hex("#e05828", 220 - f * 50);
        p.set(x, y, c);
      }
    }
    if (f >= 2) {
      const rnd = mulberry(140 + f);
      for (let i = 0; i < 6; i++) {
        p.disc(16 + (rnd() - 0.5) * 26, 16 + (rnd() - 0.5) * 26, 2 + rnd() * 2, hex("#4a4448", 190 - f * 40));
      }
    }
    add(`vfx_explosion_${f}`, p);
  }
  // gas cloud (2 frames)
  for (let f = 0; f < 2; f++) {
    const p = new Px(12, 12);
    const rnd = mulberry(160 + f);
    for (let i = 0; i < 6; i++) {
      p.disc(2 + rnd() * 8, 2 + rnd() * 8, 2 + rnd() * 2, hex("#c8d8b0", 60 + f * 25));
    }
    add(`vfx_gas_${f}`, p);
  }
  // crystal shard
  {
    const p = new Px(8, 8);
    p.line(2, 7, 4, 1, hex("#b8e8f0")); p.line(4, 1, 6, 6, hex("#8ec4d4"));
    p.line(6, 6, 2, 7, hex("#8ec4d4")); p.set(4, 3, hex("#e8feff"));
    add("vfx_shard", p);
  }
  // loot sparkle
  {
    const p = new Px(8, 8);
    p.line(4, 1, 4, 6, hex("#f8f0b0", 220)); p.line(1, 4, 6, 4, hex("#f8f0b0", 220));
    p.set(4, 4, hex("#ffffff"));
    add("vfx_sparkle", p);
  }
  // vacuum streak (horizontal)
  {
    const p = new Px(16, 4);
    for (let x = 0; x < 16; x++) {
      p.set(x, 1, hex("#bfe8f0", Math.round(150 * (x / 16))));
      p.set(x, 2, hex("#bfe8f0", Math.round(150 * (x / 16) * 0.7)));
    }
    add("vfx_streak", p);
  }
  // smoke (2 frames)
  for (let f = 0; f < 2; f++) {
    const p = new Px(10, 10);
    const rnd = mulberry(200 + f);
    for (let i = 0; i < 4; i++) p.disc(2 + rnd() * 6, 3 + rnd() * 5, 2 + rnd() * 1.6, hex("#3a3a40", 170 - f * 60));
    add(`vfx_smoke_${f}`, p);
  }
  // big debris (maw)
  {
    const p = new Px(10, 10);
    p.rect(1, 2, 8, 6, hex("#5a5248"));
    p.rect(1, 2, 8, 2, hex("#6f665a"));
    p.set(8, 7, hex("#3a342e")); p.set(1, 7, 0);
    add("vfx_debris", p);
  }
}

// ---------------------------------------------------------------------------
// LOGO — "DEEPER" in chunky bevelled letters with drill bit accent
// ---------------------------------------------------------------------------
const FONT_5x7: Record<string, string[]> = {
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "###..", "#....", "#....", "#####"],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
};

export function logo(): Px {
  const letters = "DEEPER";
  const scale = 7;
  const p = new Px(6 * 8 * scale + 20, 9 * scale + 8);
  let ox = 10;
  for (const ch of letters) {
    const glyph = FONT_5x7[ch];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 5; x++) {
        if (glyph[y][x] !== "#") continue;
        // bevel: light top-left, dark bottom-right, drill-orange fill
        const t = y / 7;
        const base = mix(hex("#e05828"), hex("#f8d048"), 1 - t);
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            let c = base;
            if (sy === 0 || sx === 0) c = shade(base, 0.25);
            if (sy === scale - 1 || sx === scale - 1) c = shade(base, -0.3);
            p.set(ox + x * scale + sx, 4 + y * scale + sy, c);
          }
        }
      }
    }
    ox += 6 * scale + 2;
  }
  // drill bit under the last E
  const dx = p.w - 24;
  for (let y = 0; y < 14; y++) {
    const w = Math.max(1, Math.round(4 * (1 - y / 14)));
    for (let x = -w; x <= w; x++) p.set(dx + x, p.h - 14 + y, y % 3 === 0 ? hex("#8a929a") : hex("#6a7078"));
  }
  p.outline(hex("#1a0e08"));
  return p;
}

/** Favicon 32x32: drill bit on works-orange. */
export function favicon(): Px {
  const p = new Px(32, 32);
  p.fill(hex("#1a140e"));
  for (let y = 4; y < 28; y++) {
    const t = (y - 4) / 24;
    const w = Math.max(1, Math.round(9 * (1 - t)));
    for (let x = 16 - w; x <= 16 + w; x++) {
      p.set(x, y, y % 4 === (x > 16 ? 1 : 0) ? hex("#8a929a") : hex("#6a7078"));
    }
  }
  p.rect(12, 0, 8, 5, hex("#e05828"));
  p.rect(12, 0, 8, 1, hex("#f8d048"));
  return p;
}
