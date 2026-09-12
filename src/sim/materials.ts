/**
 * DEEPER — material registry.
 * The physical world is the progression tree: every material declares which tool
 * tier can break it, how it behaves, what it drops and how it reacts to the
 * environment. Simulation reads this data; rendering reads it for palettes/frames.
 */

export type MaterialFamily =
  | "soft"
  | "granular"
  | "brittle"
  | "dense"
  | "metal"
  | "crystal"
  | "structural" // built things: concrete, brick, asphalt
  | "organic" // roots, timber
  | "machine" // engine-deep constructed material
  | "bedrock";

export type SoundFamily =
  | "dirt"
  | "sand"
  | "rock"
  | "brittle"
  | "metal"
  | "concrete"
  | "crystal"
  | "wood"
  | "heavy"
  | "none";

export interface MaterialDef {
  id: number;
  key: string;
  name: string;
  family: MaterialFamily;
  /** Break-gate: minimum tool tier that can damage this material at all. */
  tier: number;
  /** Hit points of a full cell. Tool damage per second is scaled by affinity. */
  hp: number;
  /** Short behavioral description shown in workshop / blocked-site UI. */
  note?: string;
  drops?: { res: string; min: number; max: number }[];
  sound: SoundFamily;
  granular?: boolean; // falls into open space
  flammable?: boolean; // can ignite → fire event
  explosive?: boolean; // ignites neighbouring gas / produces explosion
  resonant?: boolean; // crystal resonance propagation
  conductive?: boolean; // resonance also fractures this (ultradense gates)
  liquid?: "water" | "magma" | "oil"; // emitters (landmark plumbing)
  emits?: boolean; // cell re-creates its liquid when exposed (source blocks)
  variants: number; // visual variants
  oreVariant?: boolean; // sheet has ore-bearing variants
  palette: string; // palette key in art data
  /** Dig-damage multiplier per tool class; tools outside their class get low or zero. */
  affinity?: Partial<Record<ToolClass, number>>;
}

export type ToolClass =
  | "drill" // T0 auger, T1 twin-tooth
  | "impact" // T2 hammerhead
  | "thermal" // T3 thermic needle
  | "seismic" // T4 charges
  | "rotary" // T5 excavator
  | "resonator" // T6
  | "maw"; // T7

export const M = {
  AIR: 0,
  // surface / rootbed
  GRASS: 1,
  SOIL: 2,
  CLAY: 3,
  SANDSTONE: 4,
  ROOTWOOD: 5,
  PIPE: 6, // old pipes: metal-ish, low tier
  SAND: 7,
  GRAVEL: 8,
  FILLEDIRT: 9,
  // old works
  STONE: 10,
  TIMBER: 11,
  RAILIRON: 12,
  COALROCK: 13,
  // buried mile
  CONCRETE: 14,
  BRICK: 15,
  ASPHALT: 16,
  STEEL: 17,
  CONDUIT: 18,
  TILE: 19, // civic floor tile (decorative structural)
  // drowned fault
  WETSTONE: 20,
  SLATE: 21,
  PRESSGLASS: 22,
  CALCITE: 23,
  // red fault
  BASALT: 24,
  SULFURROCK: 25,
  OBSIDIAN: 26,
  MAGMAROCK: 27,
  // glass choir
  CRYSTAL: 28,
  DARKSTONE: 29,
  GEMROCK: 30,
  // engine deep
  COMPOSITE: 31,
  ALLOY: 32,
  CPipe: 33, // coolant conduit wall
  BULKHEAD: 34,
  // special
  BEDROCK: 35,
  VAULTWALL: 36, // the wall that says no / vault walls (very dense steel)
  GEODESHELL: 37,
  ROOTGOLD: 38, // amber-bearing root heart
  DECPANEL: 39, // machine decorative panel (breaks to composite loot)
} as const;

export type MaterialKey = (typeof M)[keyof typeof M];

const defs: MaterialDef[] = [];

function def(d: Partial<MaterialDef> & { id: number; key: string; name: string; family: MaterialFamily; tier: number; hp: number; palette: string; variants: number }) {
  defs[d.id] = {
    sound: "rock",
    ...d,
  } as MaterialDef;
}

// --- surface / rootbed -------------------------------------------------
def({ id: M.GRASS, key: "grass", name: "Turf", family: "soft", tier: 0, hp: 14, palette: "grass", variants: 3, sound: "dirt" });
def({ id: M.SOIL, key: "soil", name: "Packed soil", family: "soft", tier: 0, hp: 22, palette: "soil", variants: 4, oreVariant: true,
  drops: [{ res: "copper", min: 0, max: 1 }, { res: "coal", min: 0, max: 1 }], sound: "dirt",
  note: "The scrap auger chews through this. Slowly." });
def({ id: M.CLAY, key: "clay", name: "Clay", family: "soft", tier: 0, hp: 34, palette: "clay", variants: 3,
  drops: [{ res: "clay", min: 1, max: 2 }], sound: "dirt" });
def({ id: M.SANDSTONE, key: "sandstone", name: "Sandstone", family: "brittle", tier: 1, hp: 70, palette: "sandstone", variants: 4, oreVariant: true,
  drops: [{ res: "iron", min: 0, max: 1 }], sound: "brittle",
  note: "Brittle. The twin-tooth grinds it apart." });
def({ id: M.ROOTWOOD, key: "rootwood", name: "Deep roots", family: "organic", tier: 0, hp: 30, palette: "rootwood", variants: 3,
  drops: [{ res: "amber", min: 0, max: 1 }], sound: "wood", flammable: true });
def({ id: M.PIPE, key: "pipe", name: "Old pipe", family: "metal", tier: 1, hp: 60, palette: "pipe", variants: 2,
  drops: [{ res: "iron", min: 1, max: 2 }], sound: "metal" });
def({ id: M.SAND, key: "sand", name: "Sand", family: "granular", tier: 0, hp: 6, palette: "sand", variants: 3, sound: "sand", granular: true });
def({ id: M.GRAVEL, key: "gravel", name: "Gravel", family: "granular", tier: 0, hp: 8, palette: "gravel", variants: 3, sound: "sand", granular: true,
  drops: [{ res: "iron", min: 0, max: 1 }] });
def({ id: M.FILLEDIRT, key: "fill", name: "Rubble fill", family: "granular", tier: 0, hp: 10, palette: "fill", variants: 3, sound: "sand", granular: true });
def({ id: M.ROOTGOLD, key: "rootgold", name: "Amber heartwood", family: "organic", tier: 0, hp: 40, palette: "rootgold", variants: 2,
  drops: [{ res: "amber", min: 2, max: 4 }], sound: "wood", flammable: true, oreVariant: true });

// --- old works ----------------------------------------------------------
def({ id: M.STONE, key: "stone", name: "Hard rock", family: "dense", tier: 2, hp: 130, palette: "stone", variants: 4, oreVariant: true,
  drops: [{ res: "iron", min: 1, max: 2 }, { res: "nickel", min: 0, max: 1 }], sound: "rock",
  note: "The scrap auger skates off this. Bring something with teeth." });
def({ id: M.TIMBER, key: "timber", name: "Mine timber", family: "organic", tier: 0, hp: 26, palette: "timber", variants: 3,
  drops: [{ res: "hardwood", min: 1, max: 1 }], sound: "wood", flammable: true,
  note: "Supports old tunnels. Undermining it collapses the span." });
def({ id: M.RAILIRON, key: "railiron", name: "Rail iron", family: "metal", tier: 2, hp: 110, palette: "railiron", variants: 2,
  drops: [{ res: "railsalvage", min: 1, max: 2 }], sound: "metal" });
def({ id: M.COALROCK, key: "coalrock", name: "Coal seam", family: "brittle", tier: 1, hp: 60, palette: "coalrock", variants: 3,
  drops: [{ res: "coal", min: 2, max: 3 }], sound: "brittle", flammable: true, oreVariant: true });

// --- buried mile ----------------------------------------------------------
def({ id: M.CONCRETE, key: "concrete", name: "Reinforced concrete", family: "structural", tier: 3, hp: 210, palette: "concrete", variants: 4,
  drops: [{ res: "aggregate", min: 1, max: 2 }], sound: "concrete",
  note: "Nothing in the first two tool tiers marks this. Thermic work only." });
def({ id: M.BRICK, key: "brick", name: "Aged brick", family: "structural", tier: 2, hp: 120, palette: "brick", variants: 4, oreVariant: true,
  drops: [{ res: "aggregate", min: 0, max: 1 }], sound: "concrete" });
def({ id: M.ASPHALT, key: "asphalt", name: "Buried asphalt", family: "brittle", tier: 2, hp: 90, palette: "asphalt", variants: 3, sound: "brittle" });
def({ id: M.STEEL, key: "steel", name: "Structural steel", family: "metal", tier: 3, hp: 190, palette: "steel", variants: 3,
  drops: [{ res: "steel", min: 1, max: 2 }], sound: "metal",
  note: "The twin-tooth bends on this. Thermic work only." });
def({ id: M.CONDUIT, key: "conduit", name: "Utility conduit", family: "metal", tier: 2, hp: 80, palette: "conduit", variants: 2,
  drops: [{ res: "conduit", min: 1, max: 2 }], sound: "metal" });
def({ id: M.TILE, key: "tile", name: "Civic tile", family: "structural", tier: 1, hp: 55, palette: "tile", variants: 3,
  drops: [{ res: "aggregate", min: 0, max: 1 }], sound: "concrete" });

// --- drowned fault ----------------------------------------------------------
def({ id: M.WETSTONE, key: "wetstone", name: "Waterlogged stone", family: "dense", tier: 3, hp: 170, palette: "wetstone", variants: 4, oreVariant: true,
  drops: [{ res: "iron", min: 1, max: 1 }], sound: "rock" });
def({ id: M.SLATE, key: "slate", name: "Deep slate", family: "brittle", tier: 3, hp: 150, palette: "slate", variants: 3, sound: "brittle",
  drops: [{ res: "tungsten", min: 0, max: 1 }] });
def({ id: M.PRESSGLASS, key: "pressglass", name: "Pressure glass", family: "crystal", tier: 4, hp: 160, palette: "pressglass", variants: 3,
  drops: [{ res: "pressglass", min: 1, max: 2 }], sound: "crystal", resonant: true });
def({ id: M.CALCITE, key: "calcite", name: "Mineral calcite", family: "brittle", tier: 3, hp: 130, palette: "calcite", variants: 3,
  drops: [{ res: "brinepearl", min: 0, max: 1 }], sound: "crystal" });

// --- red fault ----------------------------------------------------------
def({ id: M.BASALT, key: "basalt", name: "Basalt", family: "dense", tier: 4, hp: 260, palette: "basalt", variants: 4, oreVariant: true,
  drops: [{ res: "nickel", min: 1, max: 2 }], sound: "rock" });
def({ id: M.SULFURROCK, key: "sulfurrock", name: "Sulfur deposit", family: "brittle", tier: 3, hp: 110, palette: "sulfurrock", variants: 3,
  drops: [{ res: "sulfur", min: 2, max: 3 }], sound: "brittle", flammable: true, explosive: true });
def({ id: M.OBSIDIAN, key: "obsidian", name: "Obsidian", family: "dense", tier: 5, hp: 380, palette: "obsidian", variants: 3,
  drops: [{ res: "obsshard", min: 1, max: 2 }], sound: "crystal",
  note: "Impact tools chip it. Anything less is decoration." });
def({ id: M.MAGMAROCK, key: "magmarock", name: "Magmarock", family: "dense", tier: 4, hp: 240, palette: "magmarock", variants: 3,
  sound: "heavy", liquid: "magma", emits: true });

// --- glass choir ----------------------------------------------------------
def({ id: M.CRYSTAL, key: "crystal", name: "Resonant crystal", family: "crystal", tier: 5, hp: 300, palette: "crystal", variants: 4,
  drops: [{ res: "quartz", min: 2, max: 3 }], sound: "crystal", resonant: true,
  note: "Connected crystal transmits fracture. One good note shatters the choir." });
def({ id: M.DARKSTONE, key: "darkstone", name: "Darkstone", family: "dense", tier: 5, hp: 420, palette: "darkstone", variants: 3,
  drops: [{ res: "voidgem", min: 0, max: 1 }], sound: "heavy", conductive: true,
  note: "Ultradense. Only resonance-class tools argue with it." });
def({ id: M.GEMROCK, key: "gemrock", name: "Gem-bearing rock", family: "dense", tier: 5, hp: 340, palette: "gemrock", variants: 3,
  drops: [{ res: "voidgem", min: 1, max: 2 }], sound: "crystal", oreVariant: true });

// --- engine deep ----------------------------------------------------------
def({ id: M.COMPOSITE, key: "composite", name: "Dense composite", family: "machine", tier: 6, hp: 520, palette: "composite", variants: 4, oreVariant: true,
  drops: [{ res: "composite", min: 1, max: 2 }], sound: "heavy" });
def({ id: M.ALLOY, key: "alloy", name: "Machine alloy", family: "machine", tier: 6, hp: 560, palette: "alloy", variants: 3,
  drops: [{ res: "alloy", min: 1, max: 2 }], sound: "metal" });
def({ id: M.CPipe, key: "cpipe", name: "Coolant conduit", family: "machine", tier: 5, hp: 300, palette: "cpipe", variants: 2,
  drops: [{ res: "coolant", min: 1, max: 2 }], sound: "metal", liquid: "water", emits: true });
def({ id: M.BULKHEAD, key: "bulkhead", name: "Sealed bulkhead", family: "machine", tier: 6, hp: 640, palette: "bulkhead", variants: 2,
  drops: [{ res: "alloy", min: 2, max: 3 }], sound: "heavy", conductive: true,
  note: "A constructed seal. This deep, that means somebody built it to keep something out." });
def({ id: M.DECPANEL, key: "decpanel", name: "Machine panel", family: "machine", tier: 5, hp: 260, palette: "decpanel", variants: 3,
  drops: [{ res: "composite", min: 1, max: 1 }], sound: "metal" });

// --- special ----------------------------------------------------------
def({ id: M.BEDROCK, key: "bedrock", name: "World base", family: "bedrock", tier: 99, hp: 99999, palette: "bedrock", variants: 2, sound: "heavy",
  note: "The world ends here." });
def({ id: M.VAULTWALL, key: "vaultwall", name: "Vault plate", family: "metal", tier: 3, hp: 480, palette: "vaultwall", variants: 2,
  drops: [{ res: "steel", min: 2, max: 3 }], sound: "metal", conductive: false,
  note: "Purpose-built to say no. Thermic cutting is the only polite answer." });
def({ id: M.GEODESHELL, key: "geodeshell", name: "Geode shell", family: "dense", tier: 1, hp: 90, palette: "geodeshell", variants: 2,
  sound: "crystal" });

export const MATERIALS: MaterialDef[] = defs;
export const MAT_COUNT = defs.length;

export function mat(id: number): MaterialDef {
  return defs[id] ?? defs[M.BEDROCK];
}
export function isSolid(id: number): boolean {
  return id !== M.AIR;
}
export function isDiggableGate(id: number, toolTier: number): boolean {
  return mat(id).tier <= toolTier;
}

/** Tool classes with escalating material access — the physical progression tree. */
export const TOOL_TIER_ACCESS: Record<ToolClass, number> = {
  drill: 0, // per-tool override (T0: tier 0 only; T1: tier 1)
  impact: 2,
  thermal: 3,
  seismic: 4,
  rotary: 5,
  resonator: 6,
  maw: 8,
};

/** Highest material tier a tool tier can damage (tool tiers 0..7). */
export function toolMaxTier(toolTier: number): number {
  return [0, 1, 2, 3, 4, 5, 6, 8][toolTier] ?? 0;
}
