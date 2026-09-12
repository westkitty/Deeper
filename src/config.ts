/**
 * DEEPER — global configuration and world layout constants.
 * All cell counts are in world cells (1 cell = 16 px art, displayed at 2.5x zoom).
 */

export const TILE = 16;

export const WORLD_W = 160;
export const WORLD_H = 864;

/** Chunk size in cells (authoritative simulation/render granularity). */
export const CHUNK = 32;
export const CHUNKS_X = WORLD_W / CHUNK; // 5
export const CHUNKS_Y = WORLD_H / CHUNK; // 27

/** Sky rows; ground level row (first solid surface row around the works). */
export const SKY_ROWS = 8;
export const SURFACE_ROW = 8;

/** Stratum layout: inclusive start row of each stratum. */
export const STRATA_START = {
  rootbed: 12,
  oldworks: 108,
  buriedmile: 204,
  drownedfault: 320,
  redfault: 436,
  glasschoir: 552,
  enginedeep: 668,
  bedrock: 856,
} as const;

export type StratumId =
  | "surface"
  | "rootbed"
  | "oldworks"
  | "buriedmile"
  | "drownedfault"
  | "redfault"
  | "glasschoir"
  | "enginedeep";

export const STRATUM_ORDER: StratumId[] = [
  "surface",
  "rootbed",
  "oldworks",
  "buriedmile",
  "drownedfault",
  "redfault",
  "glasschoir",
  "enginedeep",
];

export function stratumAtRow(row: number): StratumId {
  if (row < STRATA_START.rootbed) return "surface";
  if (row < STRATA_START.oldworks) return "rootbed";
  if (row < STRATA_START.buriedmile) return "oldworks";
  if (row < STRATA_START.drownedfault) return "buriedmile";
  if (row < STRATA_START.redfault) return "drownedfault";
  if (row < STRATA_START.glasschoir) return "redfault";
  if (row < STRATA_START.enginedeep) return "glasschoir";
  if (row < STRATA_START.bedrock) return "enginedeep";
  return "enginedeep";
}

/** Simulation tick rate (fixed step). */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Rig physics (cells & seconds). */
export const RIG = {
  w: 2.6, // collision width in cells (art is 80x48 → ~3x5 cells incl. drill)
  h: 2.9,
  accel: 34,
  maxRun: 8.6,
  friction: 26,
  gravity: 62,
  maxFall: 46,
  jump: 21.5,
  stepUp: 1.05, // auto step-up height in cells
  fallSafeSpeed: 30, // below this landing speed: no damage
};

/** Base position (works). */
export const BASE_X = 24; // cells
export const BASE_ROW = 8;

/** Camera zoom for chunky pixels. */
export const CAM_ZOOM = 2.5;

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const SAVE_KEY = "deeper.save.v1";

/** Input bindings (centrally defined; UI documents these). */
export const CONTROLS = [
  { keys: "A / D", action: "Drive left / right" },
  { keys: "SPACE", action: "Jump / boost" },
  { keys: "Mouse", action: "Aim excavation head" },
  { keys: "LMB", action: "Primary excavation" },
  { keys: "RMB", action: "Utility tool (scanner ping / seismic charge / resonance pulse)" },
  { keys: "E", action: "Interact (sell, lift, valve, salvage, extract)" },
  { keys: "1-8 / Q", action: "Select excavation system" },
  { keys: "M or TAB", action: "Map" },
  { keys: "F3", action: "Developer diagnostics" },
  { keys: "ESC", action: "Pause" },
] as const;
