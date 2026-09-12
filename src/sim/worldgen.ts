/**
 * DEEPER — deterministic world generation.
 * Seeded PRNG + value noise for base strata; authored landmark prefabs injected
 * at fixed or seeded positions. Same seed → same world. Player edits are deltas.
 */

import { BASE_X, CHUNKS_X, SKY_ROWS, STRATA_START, SURFACE_ROW, WORLD_H, WORLD_W, stratumAtRow, type StratumId } from "../config";
import { M } from "./materials";
import { RNG, hash2, rand2 } from "./rng";
import { LIQ_MAGMA, LIQ_NONE, LIQ_OIL, LIQ_WATER, ORE_KEYS, World, oreIndex } from "./world";
import { LANDMARKS, type LandmarkDef } from "./landmarks";

export interface LandmarkInstance {
  key: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  stratum: StratumId;
  discovered: boolean;
  reveal?: string;
}

export type EntityKind = "cache" | "relic" | "blueprint" | "salvage" | "threat" | "valve" | "core" | "lift";
export const BLUEPRINT_BY_LANDMARK: Record<string, string> = {
  minestation: "cipher",
  sealvault: "cipher",
  pumproom: "capacitor",
  bankvault: "servo",
  cathedral: "fork",
  bulkheadgate: "lattice",
  forge: "capacitor",
};

export interface SpawnPoint {
  kind: EntityKind;
  x: number;
  y: number;
  data?: string; // blueprint key / threat family / landmark
}

export interface WorldGenResult {
  landmarks: LandmarkInstance[];
  spawns: SpawnPoint[];
  drainChannel: { x: number; y0: number; y1: number } | null;
  motherlodes: { x: number; y: number }[];
}

/** Base material per stratum (mixed with transitions by noise). */
const STRATUM_BASE: Record<StratumId, number[]> = {
  surface: [M.SOIL],
  rootbed: [M.SOIL, M.CLAY, M.SANDSTONE],
  oldworks: [M.STONE, M.SANDSTONE, M.COALROCK],
  buriedmile: [M.CONCRETE, M.BRICK, M.ASPHALT],
  drownedfault: [M.WETSTONE, M.SLATE, M.CALCITE],
  redfault: [M.BASALT, M.MAGMAROCK, M.SULFURROCK],
  glasschoir: [M.DARKSTONE, M.GEMROCK, M.CRYSTAL],
  enginedeep: [M.COMPOSITE, M.ALLOY, M.DECPANEL],
};

const STRATUM_ROCK: Record<StratumId, number> = {
  surface: M.SOIL,
  rootbed: M.SANDSTONE,
  oldworks: M.STONE,
  buriedmile: M.BRICK,
  drownedfault: M.WETSTONE,
  redfault: M.BASALT,
  glasschoir: M.GEMROCK,
  enginedeep: M.COMPOSITE,
};

const VEIN_TABLE: Record<StratumId, string[]> = {
  surface: ["copper", "coal"],
  rootbed: ["copper", "coal", "iron"],
  oldworks: ["iron", "coal", "silver"],
  buriedmile: ["iron", "gold", "silver"],
  drownedfault: ["gold", "silver", "tungsten"],
  redfault: ["tungsten", "nickel", "gold"],
  glasschoir: ["quartz", "voidgem"],
  enginedeep: ["gold", "voidgem", "nickel"],
};

const GEODE_LOOT: Record<StratumId, string> = {
  surface: "copper",
  rootbed: "amber",
  oldworks: "silver",
  buriedmile: "gold",
  drownedfault: "brinepearl",
  redfault: "obsshard",
  glasschoir: "voidgem",
  enginedeep: "gold",
};

const STRATUM_RANGE: Record<StratumId, [number, number]> = {
  surface: [0, 11],
  rootbed: [12, 107],
  oldworks: [108, 203],
  buriedmile: [204, 319],
  drownedfault: [320, 435],
  redfault: [436, 551],
  glasschoir: [552, 667],
  enginedeep: [668, 855],
};

export const SHAFT_X0 = 27;
export const SHAFT_X1 = 28;
const LIFT_LANDING_TOP: Record<string, number> = {
  liftA: 24, liftB: 120, liftC: 216, liftD: 332, liftE: 448, liftF: 564, liftG: 680,
};
const LIFT_FILL: string[] = ["gravel", "stone", "concrete", "wetstone", "basalt", "darkstone", "bulkhead"];

const MAT_BY_CHAR: Record<string, number> = {
  g: M.GRASS, s: M.SOIL, c: M.CLAY, n: M.SANDSTONE, S: M.STONE, t: M.TIMBER, r: M.RAILIRON,
  k: M.COALROCK, C: M.CONCRETE, B: M.BRICK, A: M.ASPHALT, L: M.STEEL, u: M.CONDUIT, i: M.TILE,
  w: M.WETSTONE, l: M.SLATE, a: M.CALCITE, p: M.PRESSGLASS, b: M.BASALT, y: M.SULFURROCK,
  o: M.OBSIDIAN, m: M.MAGMAROCK, X: M.CRYSTAL, d: M.DARKSTONE, G: M.GEMROCK, M: M.COMPOSITE,
  Y: M.ALLOY, P: M.CPipe, K: M.BULKHEAD, D: M.DECPANEL, V: M.VAULTWALL, E: M.GEODESHELL,
  H: M.ROOTGOLD, "0": M.PIPE,
};
const ORE_CHAR: Record<string, string> = {
  "1": "copper", "2": "coal", "3": "iron", "4": "silver", "5": "gold", "6": "tungsten",
  "7": "quartz", "8": "voidgem",
};

const MAT_BY_KEYNAME: Record<string, number> = {
  gravel: M.GRAVEL, stone: M.STONE, concrete: M.CONCRETE, wetstone: M.WETSTONE,
  basalt: M.BASALT, darkstone: M.DARKSTONE, bulkhead: M.BULKHEAD,
};

export function generateWorld(world: World): WorldGenResult {
  const seed = world.seed;
  const rng = new RNG(seed ^ 0x9e3779b9);
  const landmarks: LandmarkInstance[] = [];
  const spawns: SpawnPoint[] = [];
  const motherlodes: { x: number; y: number }[] = [];

  const set = (x: number, y: number, id: number) => {
    if (x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H) world.set(x, y, id);
  };

  // ---- 1. bedrock frame + sky -------------------------------------------
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      let id: number = M.AIR;
      if (x < 2 || x >= WORLD_W - 2 || y >= STRATA_START.bedrock) id = M.BEDROCK;
      else if (y >= SURFACE_ROW && y < STRATA_START.rootbed) {
        id = y === SURFACE_ROW ? M.GRASS : M.SOIL;
      }
      world.set(x, y, id);
      world.variant[x + y * WORLD_W] = hash2(x, y, seed) & 3;
    }
  }

  // ---- 2. strata base terrain + caves ------------------------------------
  for (let y = STRATA_START.rootbed; y < STRATA_START.bedrock; y++) {
    const st = stratumAtRow(y);
    const [y0, y1] = STRATUM_RANGE[st];
    const depthT = (y - y0) / Math.max(1, y1 - y0);
    for (let x = 2; x < WORLD_W - 2; x++) {
      const i = x + y * WORLD_W;
      // stratum material selection with banding + noise
      const band = fbmBand(x, y, seed, st);
      let id: number = STRATUM_BASE[st][band % STRATUM_BASE[st].length];
      // rootbed top: welcoming soft soil so the first minutes dig fast
      if (st === "rootbed" && y < STRATA_START.rootbed + 26) {
        const r = rand2(x, y, seed + 505);
        id = r < 0.78 ? M.SOIL : r < 0.93 ? M.CLAY : M.SANDSTONE;
      }
      // glass choir: large crystal formations via ridged noise
      if (st === "glasschoir") {
        const ridge = Math.abs(fbm2(x * 0.05, y * 0.09, seed + 771) - 0.5);
        if (ridge < 0.06 && (y & 3) !== 0) id = M.CRYSTAL;
      }
      // engine deep: constructed struts and panels
      if (st === "enginedeep") {
        const gridy = ((y - STRATA_START.enginedeep) % 14) < 2;
        const gridx = x % 18 < 2;
        if (gridy && gridx) id = M.ALLOY;
        else if (gridy || (hash2(x >> 3, y >> 3, seed + 5) & 7) === 0) id = M.DECPANEL;
      }
      // old works: tunnel galleries with timber supports
      if (st === "oldworks") {
        const gallery = (y - STRATA_START.oldworks) % 24;
        if (gallery >= 10 && gallery < 13) {
          id = M.AIR;
          if (x % 12 === 0 || (x + 1) % 12 === 0) id = M.TIMBER;
          if (gallery === 12 && x % 6 < 2) id = M.RAILIRON;
        }
      }
      // buried mile: procedural city blocks with hollow interiors
      if (st === "buriedmile") {
        const bx = Math.floor(x / 26);
        const by = Math.floor((y - STRATA_START.buriedmile) / 22);
        const ox = x - bx * 26;
        const oy = (y - STRATA_START.buriedmile) - by * 22;
        const blockSeed = hash2(bx, by, seed + 31);
        if (blockSeed % 5 !== 0) {
          // a building stands here
          const w = 14 + (blockSeed % 8);
          const h = 12 + ((blockSeed >> 3) % 8);
          if (ox < w && oy < h) {
            const edge = ox === 0 || oy === 0 || ox === w - 1 || oy === h - 1;
            if (edge) id = (blockSeed >> 5) % 3 === 0 ? M.BRICK : M.CONCRETE;
            else if ((oy === 3 || oy === 8) && ox % 5 !== 0) id = M.AIR; // floor slabs
            else if (oy > 3 && hash2(x, y, seed + 41) % 23 === 0) id = M.AIR; // rooms
            else if (oy === 2 && ox % 7 === 3) id = M.TILE;
            else if (oy === 3) id = M.TILE;
          } else if (oy === h && ox < w) id = M.ASPHALT; // street level
        }
      }
      // caves via fractal noise (fewer in the built city and engine)
      const caveThresh =
        st === "rootbed" ? 0.70 : st === "oldworks" ? 0.665 : st === "buriedmile" ? 0.72 :
        st === "drownedfault" ? 0.615 : st === "redfault" ? 0.64 : st === "glasschoir" ? 0.655 :
        st === "enginedeep" ? 0.715 : 0.72;
      if (id !== M.AIR && fbm2(x * 0.052, y * 0.052, seed + 999) > caveThresh) {
        id = M.AIR;
      }
      world.tiles[i] = id;
      if (id !== M.AIR && world.variant[i] === 0) world.variant[i] = hash2(x, y, seed + 3) & 3;
    }
  }

  // ---- 3. drowned fault: flood caves + cistern ---------------------------
  const absorb = { x0: 64, x1: 112, y0: 426, y1: 440 };
  for (let y = STRATA_START.drownedfault; y < 420; y++) {
    for (let x = 2; x < WORLD_W - 2; x++) {
      const i = x + y * WORLD_W;
      if (world.tiles[i] === M.AIR && world.liquid[i] === LIQ_NONE) {
        world.liquid[i] = LIQ_WATER;
        world.liqLevel[i] = 8;
        // sparse sustaining sources in cave walls (deterministic)
        if ((x * 31 + y * 17 + seed) % 61 === 0) world.liqSrc[i] = 1;
      }
    }
  }
  // cistern: open absorbing basin at the bottom of the drowned fault
  for (let y = absorb.y0; y <= absorb.y1; y++) {
    for (let x = absorb.x0; x <= absorb.x1; x++) {
      const i = x + y * WORLD_W;
      if (world.tiles[i] !== M.BEDROCK) {
        world.tiles[i] = y > absorb.y1 - 3 ? M.GRAVEL : M.AIR;
        world.liquid[i] = LIQ_NONE;
        world.liqLevel[i] = 0;
        world.liqSrc[i] = 0;
      }
    }
  }

  // ---- 4. red fault: magma lakes + oil pockets ---------------------------
  placeLiquidLake(world, rng, "redfault", LIQ_MAGMA, 2, 7);
  placeLiquidLake(world, rng, "redfault", LIQ_OIL, 2, 5);
  placeLiquidLake(world, rng, "redfault", LIQ_MAGMA, 2, 6);

  // ---- 5. ore veins (connected random walks) ------------------------------
  for (const st of Object.keys(STRATUM_RANGE) as StratumId[]) {
    if (st === "surface") continue;
    const [y0, y1] = STRATUM_RANGE[st];
    const veinCount = st === "rootbed" ? 14 : 10;
    for (let v = 0; v < veinCount; v++) {
      const res = rng.pick(VEIN_TABLE[st]);
      const oi = oreIndex(res);
      if (oi < 0) continue;
      let vx = rng.int(6, WORLD_W - 6);
      let vy = rng.int(y0 + 4, y1 - 4);
      const len = rng.int(8, 26);
      for (let s = 0; s < len; s++) {
        const i = vx + vy * WORLD_W;
        if (world.tiles[i] !== M.AIR && world.tiles[i] !== M.BEDROCK) {
          world.ore[i] = oi + 1;
        }
        const dir = rng.next();
        if (dir < 0.4) vx += rng.chance(0.5) ? 1 : -1;
        else if (dir < 0.8) vy += rng.chance(0.6) ? 1 : -1;
        else vx += rng.chance(0.5) ? 1 : -1;
        vx = Math.max(3, Math.min(WORLD_W - 4, vx));
        vy = Math.max(y0 + 2, Math.min(y1 - 2, vy));
      }
    }
  }

  // ---- 6. geodes -----------------------------------------------------------
  for (const st of Object.keys(STRATUM_RANGE) as StratumId[]) {
    if (st === "surface") continue;
    const [y0, y1] = STRATUM_RANGE[st];
    for (let g = 0; g < 4; g++) {
      const cx = rng.int(8, WORLD_W - 8);
      const cy = rng.int(y0 + 6, y1 - 6);
      const r = rng.int(2, 3);
      const loot = oreIndex(GEODE_LOOT[st]);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          const x = cx + dx;
          const y = cy + dy;
          if (x < 3 || y < STRATA_START.rootbed || x >= WORLD_W - 3 || y >= STRATA_START.bedrock) continue;
          const i = x + y * WORLD_W;
          if (world.tiles[i] === M.BEDROCK) continue;
          if (dist > r - 0.3) {
            world.tiles[i] = M.GEODESHELL;
            world.ore[i] = 0;
          } else if (dist > 0.4) {
            world.tiles[i] = STRATUM_ROCK[st];
            world.ore[i] = loot + 1;
          }
        }
      }
    }
  }

  // ---- 7. gas pockets -------------------------------------------------------
  const gasCount: Record<StratumId, number> = {
    surface: 0, rootbed: 3, oldworks: 5, buriedmile: 4, drownedfault: 4,
    redfault: 14, glasschoir: 5, enginedeep: 6,
  };
  for (const st of Object.keys(STRATUM_RANGE) as StratumId[]) {
    const [y0, y1] = STRATUM_RANGE[st];
    for (let p = 0; p < gasCount[st]; p++) {
      const cx = rng.int(8, WORLD_W - 8);
      const cy = rng.int(y0 + 5, y1 - 5);
      const rx = rng.int(2, 4);
      const ry = rng.int(1, 3);
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.1) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 3 || y < STRATA_START.rootbed || x >= WORLD_W - 3 || y >= STRATA_START.bedrock) continue;
            const i = x + y * WORLD_W;
            if (world.tiles[i] !== M.BEDROCK) {
              world.tiles[i] = M.AIR;
              world.ore[i] = 0;
              world.gas[i] = 8;
              world.gasSeed[i] = 1;
            }
          }
        }
      }
    }
  }

  // ---- 8. guaranteed motherlodes (2 per stratum) ----------------------------
  for (const st of Object.keys(STRATUM_RANGE) as StratumId[]) {
    if (st === "surface") continue;
    const [y0, y1] = STRATUM_RANGE[st];
    for (let mn = 0; mn < 2; mn++) {
      const cx = rng.int(10, WORLD_W - 10);
      const cy = rng.int(y0 + 10, y1 - 10);
      stampMotherlode(world, cx, cy, st, motherlodes);
    }
  }

  // ---- 9. landmarks ----------------------------------------------------------
  const result = injectLandmarks(world, rng, landmarks, spawns, motherlodes);
  ensureBaseClearing(world);

  // ---- 10. lift shaft segments -------------------------------------------------
  const landingKeys = Object.keys(LIFT_LANDING_TOP);
  for (let li = 0; li < landingKeys.length; li++) {
    const key = landingKeys[li];
    const top = LIFT_LANDING_TOP[key];
    const fillId = MAT_BY_KEYNAME[LIFT_FILL[li]];
    const prevBottom = li === 0 ? STRATA_START.rootbed - 1 : LIFT_LANDING_TOP[landingKeys[li - 1]] + 3;
    for (let y = prevBottom + 1; y < top; y++) {
      for (let x = SHAFT_X0; x <= SHAFT_X1; x++) {
        set(x, y, fillId);
      }
    }
  }

  // ---- 11. base surface polish ---------------------------------------------------
  for (let x = BASE_X - 10; x <= BASE_X + 14; x++) {
    for (let y = SURFACE_ROW; y < STRATA_START.rootbed; y++) {
      const i = x + y * WORLD_W;
      world.tiles[i] = y === SURFACE_ROW ? M.GRASS : M.SOIL;
      world.liquid[i] = LIQ_NONE;
    }
    for (let y = SKY_ROWS - 1; y >= 0; y--) world.tiles[x + y * WORLD_W] = M.AIR;
  }

  return { ...result, motherlodes };
}

function fbmBand(x: number, y: number, seed: number, st: StratumId): number {
  const n = rand2((x * 7919) ^ seed, (y * 6271) ^ (seed + (st.length * 131)), seed);
  const n2 = rand2(x >> 2, y >> 2, seed + 17);
  return ((n * 0.6 + n2 * 0.4) * 3) | 0;
}

function fbm2(x: number, y: number, seed: number): number {
  // cheap 2-octave value noise (see rng.ts for the full version)
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = rand2(xi, yi, seed);
  const b = rand2(xi + 1, yi, seed);
  const c = rand2(xi, yi + 1, seed);
  const d = rand2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  let v = top + (bot - top) * sy;
  // second octave
  v = v * 0.72 + 0.28 * (rand2(xi >> 1, yi >> 1, seed + 7) * 0.5 + 0.25);
  return v;
}

function stampMotherlode(world: World, cx: number, cy: number, st: StratumId, collect?: { x: number; y: number }[]) {
  if (collect) collect.push({ x: cx, y: cy });
  const res = GEODE_LOOT[st];
  const oi = oreIndex(res);
  for (let dy = -2; dy <= 1; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 4 || y < STRATA_START.rootbed || x >= WORLD_W - 4 || y >= STRATA_START.bedrock) continue;
      const i = x + y * WORLD_W;
      if (world.tiles[i] === M.AIR || world.tiles[i] === M.BEDROCK) continue;
      world.tiles[i] = STRATUM_ROCK[st];
      world.ore[i] = oi + 1;
    }
  }
}

function placeLiquidLake(world: World, rng: RNG, st: StratumId, kind: number, count: number, maxR: number) {
  const [y0, y1] = STRATUM_RANGE[st];
  for (let n = 0; n < count; n++) {
    const cx = rng.int(10, WORLD_W - 10);
    const cy = rng.int(y0 + 10, y1 - 12);
    const rx = rng.int(3, maxR);
    const ry = rng.int(2, Math.max(2, maxR - 2));
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 4 || y < y0 + 4 || x >= WORLD_W - 4 || y >= y1 - 3) continue;
          const i = x + y * WORLD_W;
          if (world.tiles[i] === M.AIR || MAT_FLUID_FILL.has(world.tiles[i])) {
            world.tiles[i] = M.AIR;
            world.liquid[i] = kind;
            world.liqLevel[i] = 8;
            if (dy >= ry - 1 || (kind === LIQ_MAGMA && dy >= ry - 2)) {
              world.liqSrc[i] = kind === LIQ_WATER ? 1 : 2;
            }
          }
        }
      }
    }
  }
}

const MAT_FLUID_FILL = new Set<number>([M.SOIL, M.CLAY, M.SANDSTONE, M.STONE, M.COALROCK, M.BRICK, M.WETSTONE, M.SLATE, M.CALCITE, M.BASALT, M.MAGMAROCK, M.SULFURROCK, M.DARKSTONE, M.GEMROCK, M.COMPOSITE, M.DECPANEL]);

/** Apply all landmark prefabs; returns instances + spawn points. */
function injectLandmarks(
  world: World, rng: RNG, landmarks: LandmarkInstance[], spawns: SpawnPoint[],
  motherlodes: { x: number; y: number }[],
): WorldGenResult {
  let drainChannel: WorldGenResult["drainChannel"] = null;

  const apply = (def: LandmarkDef, ox: number, oy: number) => {
    const w = Math.max(...def.rows.map((r) => r.length));
    const inst: LandmarkInstance = {
      key: def.key, name: def.name, x: ox, y: oy, w, h: def.rows.length,
      stratum: stratumAtRow(oy) as StratumId, discovered: false, reveal: def.reveal,
    };
    landmarks.push(inst);
    for (let ry = 0; ry < def.rows.length; ry++) {
      const row = def.rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        const x = ox + rx;
        const y = oy + ry;
        if (x < 2 || x >= WORLD_W - 2 || y < 0 || y >= WORLD_H) continue;
        const i = x + y * WORLD_W;
        if (ch === " ") {
          if (world.tiles[i] !== M.BEDROCK) { world.tiles[i] = M.AIR; world.ore[i] = 0; }
          world.liquid[i] = LIQ_NONE; world.liqSrc[i] = 0;
        } else if (ch === ".") {
          // keep generated terrain
        } else if (ch === "@") {
          if (world.tiles[i] !== M.BEDROCK) { world.tiles[i] = M.AIR; world.ore[i] = 0; }
          world.gas[i] = 8; world.gasSeed[i] = 1; world.liquid[i] = LIQ_NONE;
        } else if (ch === "~") {
          if (world.tiles[i] !== M.BEDROCK) { world.tiles[i] = M.AIR; world.ore[i] = 0; }
          world.liquid[i] = LIQ_WATER; world.liqLevel[i] = 8; world.liqSrc[i] = 1;
        } else if (ch === "!") {
          if (world.tiles[i] !== M.BEDROCK) { world.tiles[i] = M.AIR; world.ore[i] = 0; }
          world.liquid[i] = LIQ_MAGMA; world.liqLevel[i] = 8; world.liqSrc[i] = 2;
        } else if (ch === "=") {
          world.tiles[i] = M.SULFURROCK; world.ore[i] = 0;
        } else if (MAT_BY_CHAR[ch] !== undefined) {
          world.tiles[i] = MAT_BY_CHAR[ch];
          world.ore[i] = 0;
          if (world.tiles[i] === M.MAGMAROCK) world.liqSrc[i] = 0;
        } else if (ORE_CHAR[ch]) {
          if (world.tiles[i] === M.AIR || world.tiles[i] === M.BEDROCK) world.tiles[i] = STRATUM_ROCK[inst.stratum];
          world.ore[i] = (oreIndex(ORE_CHAR[ch]) ?? 0) + 1;
        } else if (ch === "v") {
          world.tiles[i] = M.AIR;
          world.liquid[i] = LIQ_NONE; world.liqSrc[i] = 0; world.ore[i] = 0;
          if (rx === 2 && ry === 1) spawns.push({ kind: "lift", x, y, data: def.key });
        } else if (ch === "$") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          spawns.push({ kind: "cache", x, y });
        } else if (ch === "%") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          spawns.push({ kind: "relic", x, y });
        } else if (ch === "&") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          const bp = BLUEPRINT_BY_LANDMARK[def.key] ?? "cipher";
          spawns.push({ kind: "blueprint", x, y, data: bp });
        } else if (ch === "Q") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          spawns.push({ kind: "salvage", x, y });
        } else if (ch === "T") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          spawns.push({ kind: "threat", x, y, data: threatFamilyFor(inst.stratum) });
        } else if (ch === "F") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          spawns.push({ kind: "valve", x, y, data: def.key });
          drainChannel = { x: 88, y0: 324, y1: 425 };
        } else if (ch === "Z") {
          world.tiles[i] = M.AIR; world.liquid[i] = LIQ_NONE; world.ore[i] = 0;
          spawns.push({ kind: "core", x, y, data: def.key });
        } else if (ch === "^") {
          stampMotherlode(world, x, y, inst.stratum, motherlodes);
        }
      }
    }
  };

  // fixed-x landmarks
  for (const def of LANDMARKS) {
    if (def.x !== undefined) {
      const yTop = def.stratum === "surface" ? SURFACE_ROW - 3 : anchorRow(def.key);
      apply(def, def.x, yTop);
    }
  }
  // seeded scatter landmarks
  for (const def of LANDMARKS) {
    if (def.count && def.stratum !== "surface") {
      const [y0, y1] = STRATUM_RANGE[def.stratum as StratumId];
      for (let n = 0; n < def.count; n++) {
        const ox = rng.int(8, WORLD_W - 8 - def.rows[0].length);
        const oy = rng.int(y0 + 6, y1 - def.rows.length - 6);
        apply(def, ox, oy);
      }
    }
  }

  // reservoir connection: link reservoir underside into the flooded cave network
  for (let y = 324; y < 330; y++) {
    for (let x = 70; x < 74; x++) {
      const i = x + y * WORLD_W;
      if (world.tiles[i] !== M.BEDROCK) {
        world.tiles[i] = M.AIR;
        world.liquid[i] = LIQ_WATER;
        world.liqLevel[i] = 8;
      }
    }
  }

  return { landmarks, spawns, drainChannel, motherlodes };
}

/** Fixed vertical anchors for fixed-x landmarks, per stratum. */
function anchorRow(key: string): number {
  switch (key) {
    case "liftA": return LIFT_LANDING_TOP.liftA;
    case "liftB": return LIFT_LANDING_TOP.liftB;
    case "liftC": return LIFT_LANDING_TOP.liftC;
    case "liftD": return LIFT_LANDING_TOP.liftD;
    case "liftE": return LIFT_LANDING_TOP.liftE;
    case "liftF": return LIFT_LANDING_TOP.liftF;
    case "liftG": return LIFT_LANDING_TOP.liftG;
    case "cellar": case "oldpipes": case "fossilbed": return 0; // scatter only
    case "firstvein": return 26;
    case "sealvault": return 60;
    case "minestation": return 132;
    case "excavator": return 156;
    case "subway": return 226;
    case "bankvault": return 262;
    case "reservoir": return 320;
    case "pumproom": return 348;
    case "sunkenbell": return 366;
    case "gaschamber": return 470;
    case "cathedral": return 576;
    case "bulkheadgate": return 712;
    case "machineheart": return 790;
    default: return 0;
  }
}

export function threatFamilyFor(st: StratumId): string {
  switch (st) {
    case "rootbed": return "grubble";
    case "oldworks": return "shellsnout";
    case "buriedmile": return "crawler";
    case "drownedfault": return "lurker";
    case "redfault": return "embermite";
    case "glasschoir": return "prismite";
    case "enginedeep": return "drone";
    default: return "grubble";
  }
}

/** Guarantee a clean, flat, cave-free worksite at the surface base. */
function ensureBaseClearing(world: World) {
  for (let x = BASE_X - 9; x <= BASE_X + 13; x++) {
    for (let y = STRATA_START.rootbed; y < STRATA_START.rootbed + 3; y++) {
      const i = x + y * WORLD_W;
      if (world.tiles[i] === M.AIR) world.tiles[i] = M.SOIL;
    }
    // remove trees/obstacles implicitly — surface rows are just sky + grass
    for (let y = SURFACE_ROW + 1; y < STRATA_START.rootbed; y++) {
      world.tiles[x + y * WORLD_W] = M.SOIL;
    }
    world.tiles[x + SURFACE_ROW * WORLD_W] = M.GRASS;
  }
  // gentle terrain variance left and right of the works
  for (let x = 2; x < WORLD_W - 2; x++) {
    if (x >= BASE_X - 9 && x <= BASE_X + 13) continue;
    const h = (hash2(x, 7, world.seed) % 3);
    for (let y = SURFACE_ROW; y < SURFACE_ROW + 4; y++) {
      world.tiles[x + y * WORLD_W] = y <= SURFACE_ROW + h
        ? (y === SURFACE_ROW + h ? M.GRASS : M.SOIL)
        : M.AIR;
    }
  }
}

/** Water entering the cistern basin is absorbed (bounded sim). */
export function absorbCheck(x: number, y: number): boolean {
  return x >= 64 && x <= 112 && y >= 426 && y <= 440;
}
