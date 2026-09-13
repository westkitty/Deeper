/**
 * DEEPER asset pipeline — all sprite art, deterministically generated.
 * Run: npm run assets  (writes public/assets/*.png + assets/asset-manifest.json)
 *
 * Art bible (short form): 16px terrain tiles, chunky industrial pixel art,
 * 1px dark edge on exposed sides, light from top-left, restrained palettes per
 * stratum, no neon gloss. See ART_BIBLE.md for the long form.
 */

import { Px, RGBA, hex, mix, shade, hashpix, mulberry } from "./pixutil";
import * as fs from "fs";
import * as path from "path";

import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUB = path.join(ROOT, "public", "assets");

// ---------------------------------------------------------------------------
// Sheet packer + manifest
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------
const P = {
  grass: [hex("#4d7a33"), hex("#5f8f3e"), hex("#3c6128"), hex("#6f5a3a")],
  soil: [hex("#6b4a2f"), hex("#7d5a3a"), hex("#543823"), hex("#84653f")],
  clay: [hex("#8a5a3c"), hex("#9c6c48"), hex("#6e4530"), hex("#a87f56")],
  sandstone: [hex("#b08d57"), hex("#c2a06a"), hex("#8f7040"), hex("#d0b27a")],
  rootwood: [hex("#5d4526"), hex("#6f5632"), hex("#463318"), hex("#8a6c3c")],
  pipe: [hex("#7a6a5a"), hex("#8d7d6c"), hex("#5a4d40"), hex("#8a4a30")],
  sand: [hex("#cbb475"), hex("#d9c488"), hex("#b39c60"), hex("#e2d098")],
  gravel: [hex("#857a6a"), hex("#968b7a"), hex("#6a6052"), hex("#a89d8c")],
  fill: [hex("#6e6154"), hex("#7f7263"), hex("#57503f"), hex("#8f8272")],
  stone: [hex("#6f6f78"), hex("#7f7f88"), hex("#565660"), hex("#93939c")],
  timber: [hex("#7a5a33"), hex("#8d6c40"), hex("#5c421f"), hex("#a08050")],
  railiron: [hex("#5a5f66"), hex("#6b7078"), hex("#42464c"), hex("#7d5a3a")],
  coalrock: [hex("#3a3a40"), hex("#48484f"), hex("#26262c"), hex("#151517")],
  concrete: [hex("#8f9094"), hex("#9fa0a4"), hex("#737479"), hex("#b0b1b5")],
  brick: [hex("#9a5a44"), hex("#ad6c52"), hex("#7c4434"), hex("#b8b0a4")],
  asphalt: [hex("#46464e"), hex("#54545c"), hex("#33333a"), hex("#62626a")],
  steel: [hex("#7d8894"), hex("#8e99a5"), hex("#5f6873"), hex("#a5b0bc")],
  conduit: [hex("#6a7078"), hex("#7a8088"), hex("#51565e"), hex("#c8a03c")],
  tile: [hex("#9aa4a8"), hex("#aab4b8"), hex("#7c868a"), hex("#c46a5a")],
  wetstone: [hex("#4a5e63"), hex("#587076"), hex("#36464c"), hex("#6c848a")],
  slate: [hex("#3f4a52"), hex("#4d5860"), hex("#2e3840"), hex("#5f6c74")],
  pressglass: [hex("#6fc8c8"), hex("#8adcd8"), hex("#54a8a8"), hex("#b0ece8")],
  calcite: [hex("#cfd8d0"), hex("#dde6de"), hex("#b0bcb4"), hex("#eef6ee")],
  basalt: [hex("#3c3840"), hex("#4a4650"), hex("#2a262e"), hex("#5a5662")],
  sulfurrock: [hex("#b8a13a"), hex("#cab448"), hex("#94802c"), hex("#e0cc60")],
  obsidian: [hex("#23202c"), hex("#2f2b3a"), hex("#171420"), hex("#4a4258")],
  magmarock: [hex("#4a2c28"), hex("#5a3630"), hex("#361f1c"), hex("#e06030")],
  crystal: [hex("#b8e8f0"), hex("#d0f4f8"), hex("#8ec4d4"), hex("#e8feff")],
  darkstone: [hex("#26242e"), hex("#322f3c"), hex("#1a181f"), hex("#413d4e")],
  gemrock: [hex("#3a3048"), hex("#483c58"), hex("#2a2236"), hex("#9a6ad8")],
  composite: [hex("#4e545c"), hex("#5c636c"), hex("#3a4048"), hex("#707882")],
  alloy: [hex("#8a929c"), hex("#9ca4ae"), hex("#6a727c"), hex("#b8c0ca")],
  cpipe: [hex("#55606a"), hex("#65707a"), hex("#404a52"), hex("#48c8b0")],
  bulkhead: [hex("#5a636e"), hex("#6a7380"), hex("#434b56"), hex("#d8a03c")],
  decpanel: [hex("#565e66"), hex("#666e76"), hex("#41484f"), hex("#8a929a")],
  bedrock: [hex("#17161a"), hex("#201f26"), hex("#0e0d12"), hex("#2a2932")],
  vaultwall: [hex("#6a7480"), hex("#7a8490"), hex("#525c66"), hex("#d8c8a0")],
  geodeshell: [hex("#8a8292"), hex("#9c94a4"), hex("#6e6676"), hex("#b8aec0")],
  rootgold: [hex("#7a5a26"), hex("#8c6a30"), hex("#5c4218"), hex("#e8b84a")],
} as Record<string, RGBA[]>;

// ---------------------------------------------------------------------------
// Terrain tile generation
// ---------------------------------------------------------------------------
function speckFill(p: Px, base: RGBA[], seed: number, contrast = 0.16) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const v = hashpix(x, y, seed);
      const c = v < 0.18 ? base[2] : v > 0.86 ? base[1] : v > 0.72 ? base[3] : base[0];
      p.set(x, y, shade(c, (hashpix(x, y, seed + 31) - 0.5) * 2 * contrast));
    }
  }
}

function strataLines(p: Px, base: RGBA[], seed: number, step = 5) {
  for (let y = 0; y < p.h; y++) {
    if (y % step === step - 1) {
      for (let x = 0; x < p.w; x++) {
        if (hashpix(x, y, seed) < 0.8) p.set(x, y, shade(base[2], -0.08));
      }
    } else if (y % step === 0) {
      for (let x = 0; x < p.w; x++) {
        if (hashpix(x, y, seed + 3) < 0.5) p.set(x, y, shade(base[1], 0.06));
      }
    }
  }
}

function brickPattern(p: Px, brick: RGBA, mortar: RGBA, seed: number) {
  p.fill(mortar);
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : 4;
    for (let col = -1; col < 3; col++) {
      const bx = col * 8 + offset;
      const by = row * 4;
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 7; x++) {
          const c = hashpix(bx + x, by + y, seed) < 0.2 ? shade(brick, -0.12) : brick;
          p.set(bx + x, by + y, shade(c, (hashpix(bx + x, by + y, seed + 9) - 0.5) * 0.2));
        }
      }
    }
  }
}

function platePattern(p: Px, base: RGBA[], seed: number, rivets = true) {
  speckFill(p, base, seed, 0.08);
  // brushed horizontal lines
  for (let y = 0; y < p.h; y += 3) {
    for (let x = 0; x < p.w; x++) {
      if (hashpix(x, y, seed + 5) < 0.4) p.set(x, y, shade(base[0], -0.06));
    }
  }
  // panel seam
  for (let x = 0; x < p.w; x++) p.set(x, 7, shade(base[2], -0.1));
  for (let y = 0; y < p.h; y++) p.set(7, y, shade(base[2], -0.1));
  if (rivets) {
    for (const [rx, ry] of [[2, 2], [12, 2], [2, 12], [12, 12], [4, 9], [10, 4]]) {
      p.set(rx, ry, shade(base[1], 0.2));
      p.set(rx + 1, ry, shade(base[2], 0.1));
    }
  }
}

function columnPattern(p: Px, base: RGBA[], seed: number) {
  speckFill(p, base, seed, 0.12);
  for (let x = 2; x < p.w; x += 5) {
    for (let y = 0; y < p.h; y++) {
      p.set(x, y, shade(base[2], -0.1));
      if (hashpix(x, y, seed) < 0.3) p.set(x + 1, y, shade(base[1], 0.05));
    }
  }
}

function facetPattern(p: Px, base: RGBA[], seed: number) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const facet = ((x >> 2) + (y >> 2)) % 3;
      const c = facet === 0 ? base[1] : facet === 1 ? base[0] : base[2];
      p.set(x, y, shade(c, (hashpix(x, y, seed) - 0.5) * 0.1));
    }
  }
  // diagonal glints
  for (let i = 0; i < 3; i++) {
    let x = (i * 5 + 2) % 14;
    let y = 1 + i;
    for (let k = 0; k < 5; k++) {
      p.set(x + k, y + k, base[3]);
    }
  }
}

function chunkPattern(p: Px, base: RGBA[], chunk: RGBA, seed: number, density = 0.3) {
  speckFill(p, base, seed);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(hashpix(i, 1, seed) * 14) + 1;
    const y = Math.floor(hashpix(1, i, seed) * 14) + 1;
    if (hashpix(x, y, seed + 2) > density) continue;
    p.set(x, y, chunk);
    p.set(x + 1, y, shade(chunk, -0.2));
    p.set(x, y + 1, shade(chunk, 0.1));
  }
}

const TERRAIN_GENERATORS: Record<string, (p: Px, base: RGBA[], seed: number) => void> = {
  grass: (p, base, seed) => {
    speckFill(p, [base[3], base[3], shade(base[3], -0.1), base[3]], seed, 0.1);
    for (let x = 0; x < 16; x++) {
      const h = 2 + Math.floor(hashpix(x, 0, seed) * 3);
      for (let y = 0; y < h; y++) p.set(x, y, y === 0 ? base[1] : base[0]);
    }
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(hashpix(i, 7, seed) * 15);
      p.set(x, 1, base[1]);
    }
  },
  soil: (p, base, seed) => { speckFill(p, base, seed, 0.2); chunkPattern(p, base, base[3], seed + 1, 0.18); },
  clay: (p, base, seed) => {
    speckFill(p, base, seed, 0.08);
    for (let y = 3; y < 16; y += 6) for (let x = 0; x < 16; x++) if (hashpix(x, y, seed) < 0.6) p.set(x, y, shade(base[2], -0.04));
  },
  sandstone: (p, base, seed) => { speckFill(p, base, seed, 0.1); strataLines(p, base, seed, 5); },
  rootwood: (p, base, seed) => {
    speckFill(p, base, seed, 0.14);
    for (let i = 0; i < 3; i++) {
      let x = 2 + i * 5;
      for (let y = 0; y < 16; y++) {
        x += hashpix(x, y, seed) < 0.3 ? (hashpix(y, x, seed) < 0.5 ? -1 : 1) : 0;
        x = Math.max(1, Math.min(14, x));
        p.set(x, y, shade(base[2], -0.05));
        p.set(x + 1, y, shade(base[1], 0.04));
      }
    }
  },
  pipe: (p, base, seed) => {
    p.fill(0);
    // horizontal pipe segment
    for (let y = 5; y < 11; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(y < 8 ? base[1] : base[0], (hashpix(x, y, seed) - 0.5) * 0.12));
    for (let x = 0; x < 16; x++) { p.set(x, 5, shade(base[1], 0.15)); p.set(x, 10, shade(base[2], -0.1)); }
    if (hashpix(1, 1, seed) < 0.6) for (let y = 5; y < 11; y++) for (let x = 3; x < 6; x++) p.set(x, y, mix(base[0], base[3], 0.5));
    for (let x = 7; x < 9; x++) for (let y = 4; y < 12; y++) p.set(x, y, shade(base[2], 0.05)); // coupling ring
  },
  sand: (p, base, seed) => { speckFill(p, base, seed, 0.1); },
  gravel: (p, base, seed) => {
    speckFill(p, base, seed, 0.1);
    for (let i = 0; i < 9; i++) {
      const x = 1 + Math.floor(hashpix(i, 3, seed) * 13);
      const y = 1 + Math.floor(hashpix(3, i, seed) * 13);
      p.disc(x, y, 1 + (i % 2), i % 2 ? base[1] : base[2]);
      p.set(x, y, shade(base[1], 0.15));
    }
  },
  fill: (p, base, seed) => { chunkPattern(p, base, base[1], seed, 0.4); chunkPattern(p, base, base[2], seed + 4, 0.3); },
  stone: (p, base, seed) => {
    speckFill(p, base, seed, 0.12);
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(hashpix(i, 9, seed) * 12) + 2;
      let y = Math.floor(hashpix(9, i, seed) * 12) + 2;
      for (let k = 0; k < 4 + i; k++) {
        p.set(x, y, shade(base[2], -0.12));
        x += hashpix(x, y, seed + k) < 0.5 ? 1 : 0;
        y += hashpix(y, x, seed + k) < 0.5 ? 1 : 0;
      }
    }
  },
  timber: (p, base, seed) => {
    speckFill(p, base, seed, 0.1);
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x++) p.set(x, y, shade(base[2], -0.12));
      for (let x = 0; x < 16; x++) if (hashpix(x, y + 1, seed) < 0.3) p.set(x, y + 1, shade(base[1], 0.08));
    }
  },
  railiron: (p, base, seed) => {
    p.fill(0);
    for (let y = 4; y < 12; y++) for (let x = 0; x < 16; x++) p.set(x, y, shade(y < 6 ? base[1] : y < 9 ? base[0] : base[2], (hashpix(x, y, seed) - 0.5) * 0.1));
    if (hashpix(3, 3, seed) < 0.5) for (let y = 4; y < 12; y++) for (let x = 4; x < 7; x++) p.set(x, y, mix(base[0], hex("#8a4a30"), 0.6));
    if (hashpix(9, 9, seed) < 0.5) for (let y = 4; y < 12; y++) for (let x = 10; x < 13; x++) p.set(x, y, mix(base[0], hex("#8a4a30"), 0.4));
  },
  coalrock: (p, base, seed) => { chunkPattern(p, base, base[3], seed, 0.42); },
  concrete: (p, base, seed) => {
    speckFill(p, base, seed, 0.09);
    chunkPattern(p, base, base[2], seed + 8, 0.2);
    for (let x = 0; x < 16; x++) p.set(x, 0, shade(base[1], 0.1));
  },
  brick: (p, base, seed) => brickPattern(p, base[0], base[3], seed),
  asphalt: (p, base, seed) => {
    speckFill(p, base, seed, 0.1);
    chunkPattern(p, base, base[1], seed + 2, 0.25);
    if (hashpix(0, 0, seed) < 0.3) for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, shade(base[0], 0.06));
  },
  steel: (p, base, seed) => platePattern(p, base, seed),
  conduit: (p, base, seed) => {
    platePattern(p, base, seed, false);
    for (let y = 2; y < 14; y += 4) for (let x = 2; x < 14; x++) p.set(x, y, base[3]);
  },
  tile: (p, base, seed) => {
    speckFill(p, base, seed, 0.05);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x >> 2) % 2 === (y >> 2) % 2) p.set(x, y, shade(base[0], -0.05));
      if (x % 4 === 3 || y % 4 === 3) p.set(x, y, shade(base[2], -0.06));
    }
    if (hashpix(5, 5, seed) < 0.5) { for (let y = 4; y < 8; y++) for (let x = 8; x < 12; x++) p.set(x, y, mix(base[0], base[3], 0.35)); }
  },
  wetstone: (p, base, seed) => {
    speckFill(p, base, seed, 0.12);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(hashpix(i, 2, seed) * 14) + 1;
      const y = Math.floor(hashpix(2, i, seed) * 14) + 1;
      p.set(x, y, base[3]);
      p.set(x + 1, y, shade(base[3], -0.1));
    }
  },
  slate: (p, base, seed) => { speckFill(p, base, seed, 0.1); strataLines(p, base, seed, 4); },
  pressglass: (p, base, seed) => facetPattern(p, base, seed),
  calcite: (p, base, seed) => {
    speckFill(p, base, seed, 0.06);
    for (let i = 0; i < 3; i++) {
      const x = 2 + i * 5;
      for (let y = 0; y < 16; y++) p.set(x + (y % 3 === 0 ? 1 : 0), y, shade(base[2], -0.04));
    }
  },
  basalt: (p, base, seed) => columnPattern(p, base, seed),
  sulfurrock: (p, base, seed) => { chunkPattern(p, base, base[3], seed, 0.5); },
  obsidian: (p, base, seed) => {
    speckFill(p, base, seed, 0.08);
    for (let i = 0; i < 3; i++) {
      let x = 2 + i * 4;
      let y = 13 - i * 4;
      for (let k = 0; k < 6; k++) { p.set(x + k, y - k, base[3]); }
    }
  },
  magmarock: (p, base, seed) => {
    speckFill(p, [base[0], base[1], base[2], base[0]], seed, 0.12);
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(hashpix(i, 4, seed) * 14) + 1;
      let y = Math.floor(hashpix(4, i, seed) * 14) + 1;
      for (let k = 0; k < 5; k++) {
        p.set(x, y, i === 0 ? base[3] : shade(base[3], -0.25));
        x += hashpix(x, y, seed + k) < 0.6 ? 1 : -1;
        y += 1;
      }
    }
  },
  crystal: (p, base, seed) => facetPattern(p, base, seed),
  darkstone: (p, base, seed) => {
    speckFill(p, base, seed, 0.1);
    for (let x = 0; x < 16; x += 8) for (let y = 0; y < 16; y += 8) p.disc(x + 4, y + 4, 1.6, shade(base[1], 0.06));
  },
  gemrock: (p, base, seed) => {
    speckFill(p, base, seed, 0.12);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(hashpix(i, 6, seed) * 14);
      const y = 1 + Math.floor(hashpix(6, i, seed) * 14);
      p.set(x, y, base[3]);
      p.set(x + 1, y, shade(base[3], -0.3));
      p.set(x, y + 1, shade(base[3], -0.15));
    }
  },
  composite: (p, base, seed) => platePattern(p, base, seed, false),
  alloy: (p, base, seed) => platePattern(p, base, seed),
  cpipe: (p, base, seed) => {
    platePattern(p, base, seed, false);
    for (let y = 6; y < 10; y++) for (let x = 0; x < 16; x++) p.set(x, y, y === 7 ? base[3] : shade(base[3], -0.4));
  },
  bulkhead: (p, base, seed) => {
    platePattern(p, base, seed);
    for (let x = 0; x < 16; x++) if (x % 4 < 2) { p.set(x, 1, base[3]); p.set(x, 2, base[3]); }
  },
  decpanel: (p, base, seed) => {
    platePattern(p, base, seed, false);
    for (let y = 3; y < 13; y += 3) for (let x = 3; x < 13; x++) p.set(x, y, shade(base[2], -0.08));
  },
  bedrock: (p, base, seed) => { speckFill(p, base, seed, 0.06); },
  vaultwall: (p, base, seed) => {
    platePattern(p, base, seed);
    p.frame(0, 0, 16, 16, shade(base[2], -0.05));
    for (const [rx, ry] of [[1, 1], [14, 1], [1, 14], [14, 14]]) { p.set(rx, ry, base[3]); p.set(rx + 1, ry, shade(base[3], -0.3)); }
  },
  geodeshell: (p, base, seed) => {
    speckFill(p, base, seed, 0.1);
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(hashpix(i, 8, seed) * 14);
      const y = 1 + Math.floor(hashpix(8, i, seed) * 14);
      p.disc(x, y, 1.6, base[1]);
      p.set(x, y - 1, base[3]);
    }
  },
  rootgold: (p, base, seed) => {
    speckFill(p, [base[0], base[1], base[2], base[0]], seed, 0.14);
    for (let i = 0; i < 4; i++) {
      const x = 2 + Math.floor(hashpix(i, 5, seed) * 12);
      const y = 2 + Math.floor(hashpix(5, i, seed) * 12);
      p.disc(x, y, 1.4, base[3]);
      p.set(x + 1, y, shade(base[3], -0.2));
    }
  },
};

// ---------------------------------------------------------------------------
export function buildTerrain(add: (name: string, p: Px) => void) {
  const MAT_KEYS: [string, string][] = [
    ["grass", "grass"], ["soil", "soil"], ["clay", "clay"], ["sandstone", "sandstone"],
    ["rootwood", "rootwood"], ["pipe", "pipe"], ["sand", "sand"], ["gravel", "gravel"],
    ["fill", "fill"], ["rootgold", "rootgold"], ["stone", "stone"], ["timber", "timber"],
    ["railiron", "railiron"], ["coalrock", "coalrock"], ["concrete", "concrete"],
    ["brick", "brick"], ["asphalt", "asphalt"], ["steel", "steel"], ["conduit", "conduit"],
    ["tile", "tile"], ["wetstone", "wetstone"], ["slate", "slate"], ["pressglass", "pressglass"],
    ["calcite", "calcite"], ["basalt", "basalt"], ["sulfurrock", "sulfurrock"],
    ["obsidian", "obsidian"], ["magmarock", "magmarock"], ["crystal", "crystal"],
    ["darkstone", "darkstone"], ["gemrock", "gemrock"], ["composite", "composite"],
    ["alloy", "alloy"], ["cpipe", "cpipe"], ["bulkhead", "bulkhead"], ["decpanel", "decpanel"],
    ["bedrock", "bedrock"], ["vaultwall", "vaultwall"], ["geodeshell", "geodeshell"],
  ];
  let seedBase = 101;
  // high-traffic materials get a 4th variant for extra visual variety
  const EXTRA_VARIANT = new Set(["soil", "stone", "basalt", "crystal", "concrete", "sandstone"]);
  for (const [key, palKey] of MAT_KEYS) {
    const base = P[palKey];
    const variants = EXTRA_VARIANT.has(key) ? 4 : 3;
    for (let v = 0; v < variants; v++) {
      const p = new Px(16, 16);
      (TERRAIN_GENERATORS[key] ?? ((pp, bb, ss) => speckFill(pp, bb, ss)))(p, base, seedBase + v * 977);
      p.bevel(0.14);
      add(`t_${key}_${v}`, p);
    }
    seedBase += 313;
  }
  // ---- fossil / strata detail decals (rare inlay variety) -------------------
  for (let v = 0; v < 3; v++) {
    const p = new Px(16, 16);
    const rnd = mulberry(950 + v);
    // faint fossil spiral
    const cx = 5 + Math.floor(rnd() * 6);
    const cy = 5 + Math.floor(rnd() * 6);
    p.ring(cx, cy, 3, hex("#d8cfae", 90));
    p.ring(cx, cy, 1.6, hex("#d8cfae", 110));
    p.set(cx, cy, hex("#d8cfae", 130));
    add(`decal_fossil_${v}`, p);
  }
  // ---- crack overlays (shared damage states) ------------------------------
  for (let d = 0; d < 2; d++) {
    const p = new Px(16, 16);
    const rnd = mulberry(500 + d);
    const cracks = d === 0 ? 2 : 4;
    for (let c = 0; c < cracks; c++) {
      let x = Math.floor(rnd() * 12) + 2;
      let y = Math.floor(rnd() * 12) + 2;
      const len = 4 + Math.floor(rnd() * 6);
      for (let k = 0; k < len; k++) {
        p.set(x, y, hex("#0a0a0c", 190));
        if (rnd() < 0.5) p.set(x + 1, y, hex("#0a0a0c", 120));
        x += rnd() < 0.5 ? 1 : rnd() < 0.5 ? -1 : 0;
        y += rnd() < 0.6 ? 1 : rnd() < 0.5 ? -1 : 0;
        x = Math.max(0, Math.min(15, x));
        y = Math.max(0, Math.min(15, y));
      }
    }
    add(`crack_${d}`, p);
  }
  // ---- ore overlays --------------------------------------------------------
  const ORES: [string, string, "nugget" | "crystal" | "chunk" | "drop" | "sphere" | "shard"][] = [
    ["copper", "#d07840", "nugget"], ["coal", "#141418", "chunk"], ["iron", "#c08860", "chunk"],
    ["silver", "#d8dce4", "crystal"], ["gold", "#e8c84a", "nugget"], ["tungsten", "#a8b4c0", "chunk"],
    ["quartz", "#a8e8f0", "crystal"], ["voidgem", "#b070e8", "crystal"], ["nickel", "#8aa878", "nugget"],
    ["amber", "#e8a83c", "drop"], ["brinepearl", "#e8f0ec", "sphere"], ["obsshard", "#3a3450", "shard"],
  ];
  for (const [key, col, shape] of ORES) {
    for (let v = 0; v < 2; v++) {
      const p = new Px(16, 16);
      const c = hex(col);
      const rnd = mulberry(700 + key.length * 31 + v);
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const x = 2 + Math.floor(rnd() * 12);
        const y = 2 + Math.floor(rnd() * 12);
        switch (shape) {
          case "nugget":
            p.disc(x, y, 1.6, c); p.set(x, y - 1, shade(c, 0.3)); p.set(x + 1, y + 1, shade(c, -0.3));
            break;
          case "chunk":
            p.rect(x - 1, y - 1, 2 + (rnd() < 0.5 ? 1 : 0), 2, c); p.set(x, y, shade(c, 0.35)); break;
          case "crystal":
            p.set(x, y, c); p.set(x, y - 1, shade(c, 0.3)); p.set(x, y + 1, shade(c, -0.2));
            p.set(x + 1, y, shade(c, -0.35)); p.set(x - 1, y, shade(c, -0.35));
            if (rnd() < 0.6) { p.set(x - 1, y - 1, shade(c, 0.1)); p.set(x + 1, y - 1, c); }
            break;
          case "drop":
            p.set(x, y, c); p.set(x, y - 1, c); p.set(x, y + 1, shade(c, -0.2));
            p.set(x + 1, y, shade(c, 0.25)); break;
          case "sphere":
            p.disc(x, y, 1.4, c); p.set(x - 1, y - 1, shade(c, 0.4)); break;
          case "shard":
            p.line(x - 1, y + 1, x + 1, y - 2, c); p.set(x, y + 1, shade(c, -0.3)); break;
        }
      }
      add(`ore_${key}_${v}`, p);
    }
  }
  // ---- ore sparkle overlays (bright glints for rich veins) ------------------
  for (let v = 0; v < 2; v++) {
    const p = new Px(16, 16);
    const rnd = mulberry(810 + v);
    for (let i = 0; i < 4; i++) {
      const x = 2 + Math.floor(rnd() * 12);
      const y = 2 + Math.floor(rnd() * 12);
      p.set(x, y, hex("#ffffff", 220));
      p.set(x + 1, y, hex("#fff8d0", 140));
      p.set(x, y + 1, hex("#fff8d0", 140));
    }
    add(`ore_sparkle_${v}`, p);
  }
  // bright high-tier ore variants (tungsten / quartz / voidgem pop at depth)
  for (const [key, col] of [["tungsten", "#d8e4f0"], ["quartz", "#e8feff"], ["voidgem", "#d8a0ff"]] as const) {
    const p = new Px(16, 16);
    const c = hex(col);
    const rnd = mulberry(820 + key.length * 17);
    for (let i = 0; i < 5; i++) {
      const x = 2 + Math.floor(rnd() * 12);
      const y = 2 + Math.floor(rnd() * 12);
      p.set(x, y, c);
      p.set(x, y - 1, shade(c, 0.3));
      p.set(x + 1, y, shade(c, -0.2));
    }
    add(`ore_${key}_bright`, p);
  }
  // ---- liquids --------------------------------------------------------------
  const waterCols = [hex("#2e5d6e", 190), hex("#3a708a", 190), hex("#5690a8", 200), hex("#8ec8d8", 210)];
  for (let f = 0; f < 3; f++) {
    const p = new Px(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const depth = y / 15;
        const c = mix(waterCols[0], waterCols[1], depth);
        p.set(x, y, c);
      }
    }
    // surface highlight wave
    for (let x = 0; x < 16; x++) {
      const wave = Math.sin((x / 16) * Math.PI * 2 + (f * Math.PI) / 3);
      const sy = 1 + Math.round(wave);
      p.set(x, sy, waterCols[3]);
      p.set(x, sy + 1, waterCols[2]);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(mulberry(f * 31 + i)() * 16);
      const y = 5 + Math.floor(mulberry(i * 7 + f)() * 9);
      p.set(x, y, shade(waterCols[2], 0.15));
    }
    add(`liq_water_${f}`, p);
  }
  const magmaCols = [hex("#e05828", 235), hex("#f08030", 235), hex("#a83018", 235), hex("#f8d048", 245)];
  for (let f = 0; f < 3; f++) {
    const p = new Px(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        p.set(x, y, mix(magmaCols[2], magmaCols[0], y / 15));
      }
    }
    const rnd = mulberry(900 + f);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(rnd() * 16);
      const y = Math.floor(rnd() * 16);
      p.disc(x, y, 1.2 + rnd(), f % 2 ? magmaCols[1] : magmaCols[3]);
    }
    for (let x = 0; x < 16; x++) {
      const sy = Math.round(1 + Math.sin((x / 16) * Math.PI * 2 + (f * Math.PI * 2) / 3));
      p.set(x, sy, magmaCols[3]);
    }
    add(`liq_magma_${f}`, p);
  }
  for (let f = 0; f < 2; f++) {
    const p = new Px(16, 16);
    const oil = hex("#2a2430", 225);
    p.fill(oil);
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(mulberry(f * 13 + i + 41)() * 16);
      const y = Math.floor(mulberry(i * 17 + f + 43)() * 16);
      p.set(x, y, hex("#4a4054", 225));
    }
    for (let x = 0; x < 16; x++) p.set(x, f, hex("#5a4e66", 225));
    add(`liq_oil_${f}`, p);
  }
  // ---- gas -------------------------------------------------------------------
  for (let f = 0; f < 2; f++) {
    const p = new Px(16, 16);
    const rnd = mulberry(950 + f);
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * 16);
      const y = Math.floor(rnd() * 16);
      p.disc(x, y, 1.5 + rnd() * 2, hex("#c8d8b0", 34 + f * 12));
    }
    add(`gas_${f}`, p);
  }
}

// Convenience export for tests
export { P as PALETTES };
