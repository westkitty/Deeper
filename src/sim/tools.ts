/**
 * DEEPER — excavation systems (the 8 tool tiers) and the upgrade tree.
 * Every tool must change BEHAVIOR, not just numbers: area, rate, material
 * access, collection, sound identity and animation all shift per tier.
 */

import type { ToolClass } from "./materials";

export interface ToolDef {
  tier: number;
  key: string;
  name: string;
  cls: ToolClass;
  /** Seconds per excavation action. */
  interval: number;
  /** Damage dealt per second to a single cell of the tool's best-fit material. */
  dps: number;
  /** Cells removed per action for each hit (area shape around the impact point). */
  shape: [number, number][]; // offsets in cells (dx,dy), impact point is the blocked cell
  reach: number; // cells
  /** Utility action (RMB): "scan" | "charge" | "resonate" | null */
  utility?: "scan" | "charge" | "resonate";
  vacuum: number; // passive loot collection radius in cells
  /** Cost. blueprints are required blueprint keys. */
  cost: { money: number; mats?: Record<string, number>; blueprints?: string[] };
  blurb: string; // behavioral description for the workshop UI
  sound: string; // audio identity key
}

export const TOOLS: ToolDef[] = [
  {
    tier: 0, key: "auger", name: "Scrap Auger", cls: "drill",
    interval: 0.55, dps: 34, shape: [[-1, 0], [0, 0], [1, 0]], reach: 4.6, utility: "scan", vacuum: 2.2,
    cost: { money: 0 },
    blurb: "Cuts a slow, machine-wide swipe through soft ground. Sandstone stops it cold.",
    sound: "auger",
  },
  {
    tier: 1, key: "twin", name: "Twin-Tooth", cls: "drill",
    interval: 0.34, dps: 95, shape: [[0, 0], [0, 1]], reach: 5.2, utility: "scan", vacuum: 1.8,
    cost: { money: 320, mats: { iron: 12, copper: 8 } },
    blurb: "Sandstone and common rock stop being a problem. Soil opens in 2-cell bites.",
    sound: "twin",
  },
  {
    tier: 2, key: "hammer", name: "Hammerhead", cls: "impact",
    interval: 0.5, dps: 150, shape: [[0, 0], [-1, 0], [1, 0]], reach: 5.6, utility: "scan", vacuum: 2.0,
    cost: { money: 900, mats: { iron: 20, steel: 6 } },
    blurb: "Impact mining. Hard rock cracks — and connected brittle rock cracks with it.",
    sound: "hammer",
  },
  {
    tier: 3, key: "thermal", name: "Thermic Needle", cls: "thermal",
    interval: 0.42, dps: 260, shape: [[0, 0], [0, 1]], reach: 6.0, utility: "scan", vacuum: 2.2,
    cost: { money: 2600, mats: { steel: 18, silver: 8 }, blueprints: ["cipher"] },
    blurb: "Cuts reinforced concrete, structural steel and vault plate. The buried city opens.",
    sound: "thermal",
  },
  {
    tier: 4, key: "seismic", name: "Seismic Rig", cls: "seismic",
    interval: 0.55, dps: 320, shape: [[0, 0]], reach: 6.4, utility: "charge", vacuum: 2.6,
    cost: { money: 6400, mats: { tungsten: 22, steel: 30 }, blueprints: ["capacitor"] },
    blurb: "Drill as normal; place seismic charges with the utility trigger. A charge fractures everything brittle-to-basalt in a wide dome.",
    sound: "seismic",
  },
  {
    tier: 5, key: "rotary", name: "Rotary Excavator", cls: "rotary",
    interval: 0.16, dps: 520, shape: [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1]], reach: 6.8, utility: "charge", vacuum: 4.2,
    cost: { money: 15000, mats: { alloy: 8, composite: 12 }, blueprints: ["servo"] },
    blurb: "Continuous multi-cell removal. Tunnels become corridors. Old strata become afterthoughts.",
    sound: "rotary",
  },
  {
    tier: 6, key: "resonator", name: "Resonator", cls: "resonator",
    interval: 0.5, dps: 640, shape: [[0, 0], [-1, 0], [1, 0]], reach: 7.2, utility: "resonate", vacuum: 4.6,
    cost: { money: 34000, mats: { quartz: 30, voidgem: 8, tungsten: 10 }, blueprints: ["fork"] },
    blurb: "Fracture waves propagate through connected crystal — and through ultradense conductive stone. The Glass Choir falls in sequence.",
    sound: "resonator",
  },
  {
    tier: 7, key: "maw", name: "THE MAW", cls: "maw",
    interval: 0.25, dps: 1600, shape: [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [0, -1], [1, -1], [-2, -1], [2, -1], [0, 1], [-2, 1], [2, 1], [0, 2], [-1, 2], [1, 2]], reach: 8.0, vacuum: 7.5,
    cost: { money: 80000, mats: { composite: 40, alloy: 30, coolant: 15 }, blueprints: ["lattice"] },
    blurb: "Area deletion. Seven cells of geography per bite. Collection radius measured in screens. The opening layers of this world are a rumor to it now.",
    sound: "maw",
  },
];

export function tool(tier: number): ToolDef {
  return TOOLS[Math.max(0, Math.min(7, tier))];
}

// ---------------------------------------------------------------------------
// Upgrade families — minor upgrades adjust numbers; MAJOR upgrades change play.
// ---------------------------------------------------------------------------

export type UpgradeFamily = "excavation" | "cargo" | "mobility" | "protection" | "scanner" | "logistics";

export interface UpgradeDef {
  key: string;
  family: UpgradeFamily;
  name: string;
  major: boolean;
  cost: { money: number; mats?: Record<string, number> };
  requires?: string; // upgrade key
  desc: string; // behavioral language
  /** Applied effect knobs read by the sim. */
  fx: Partial<{
    cargoCap: number;
    cargoBulkMul: number;
    vacuum: number;
    jump: number;
    run: number;
    damper: boolean; // fall damage immunity
    winch: boolean; // slow self-rescue climb
    heatProt: number; // 0..2
    pressureProt: number; // 0..2
    scanTier: number; // 0..4
    refinery: number; // sell bonus tiers 0..2
    lift: boolean; // freight lift network
    caches: boolean; // deep supply caches at lift stops
    chargeCap: number; // seismic charges carried
  }>;
}

export const UPGRADES: UpgradeDef[] = [
  // CARGO -------------------------------------------------------------------
  { key: "hopper1", family: "cargo", name: "Hopper Extension I", major: false, cost: { money: 220, mats: { iron: 6 } },
    desc: "Cargo 30 → 48 units.", fx: { cargoCap: 48 } },
  { key: "hopper2", family: "cargo", name: "Hopper Extension II", major: false, cost: { money: 1200, mats: { steel: 8 } }, requires: "hopper1",
    desc: "Cargo 48 → 80 units.", fx: { cargoCap: 80 } },
  { key: "compress", family: "cargo", name: "Stack Compression", major: true, cost: { money: 3800, mats: { steel: 14, conduit: 10 } }, requires: "hopper2",
    desc: "Ore is crushed and stacked: every resource's bulk is halved. Trips get longer before the hopper complains.", fx: { cargoBulkMul: 0.5 } },
  { key: "vacuum1", family: "cargo", name: "Loot Vacuum I", major: true, cost: { money: 1500, mats: { iron: 10, conduit: 6 } },
    desc: "Loose loot within 4 cells is pulled into the rig. You stop chasing pebbles.", fx: { vacuum: 4 } },
  { key: "vacuum2", family: "cargo", name: "Loot Vacuum II", major: true, cost: { money: 7200, mats: { alloy: 4, composite: 6 } }, requires: "vacuum1",
    desc: "Collection radius 4 → 6.5 cells, with a hungrier sound.", fx: { vacuum: 6.5 } },
  // MOBILITY ----------------------------------------------------------------
  { key: "treads1", family: "mobility", name: "Aggressive Treads", major: false, cost: { money: 260, mats: { iron: 8 } },
    desc: "Top speed +25%. Slopes stop slowing you down.", fx: { run: 10.6 } },
  { key: "treads2", family: "mobility", name: "Overdrive Treads", major: false, cost: { money: 2100, mats: { steel: 10 } }, requires: "treads1",
    desc: "Top speed +50% over stock.", fx: { run: 12.6 } },
  { key: "boost", family: "mobility", name: "Suspension Boost", major: true, cost: { money: 900, mats: { iron: 12 } },
    desc: "Jump clears 4+ cells of shaft. Shafts you dug become ladders.", fx: { jump: 27.5 } },
  { key: "dampers", family: "mobility", name: "Fall Dampers", major: true, cost: { money: 2600, mats: { steel: 12, conduit: 6 } }, requires: "boost",
    desc: "Landing damage is gone. Gravity is now a suggestion.", fx: { damper: true } },
  { key: "winch", family: "mobility", name: "Emergency Winch", major: true, cost: { money: 4200, mats: { steel: 16, tungsten: 6 } }, requires: "dampers",
    desc: "Hold SPACE against a wall to winch straight up. Your deepest shaft is always survivable.", fx: { winch: true } },
  // PROTECTION --------------------------------------------------------------
  { key: "coolant1", family: "protection", name: "Coolant Loop I", major: true, cost: { money: 3200, mats: { conduit: 8, sulfur: 4 } },
    desc: "Survives Red Fault ambient heat. Heat vents glow and the rig stops cooking.", fx: { heatProt: 1 } },
  { key: "coolant2", family: "protection", name: "Coolant Loop II", major: false, cost: { money: 12000, mats: { coolant: 6, alloy: 4 } }, requires: "coolant1",
    desc: "Magma adjacency no longer deals contact damage.", fx: { heatProt: 2 } },
  { key: "hull1", family: "protection", name: "Pressure Hull I", major: true, cost: { money: 3400, mats: { steel: 14, pressglass: 4 } },
    desc: "Drowned Fault depth no longer crushes the rig.", fx: { pressureProt: 1 } },
  { key: "hull2", family: "protection", name: "Pressure Hull II", major: false, cost: { money: 11500, mats: { brinepearl: 6, steel: 20 } }, requires: "hull1",
    desc: "Full-depth pressure immunity, flooded ruins included.", fx: { pressureProt: 2 } },
  // SCANNER -----------------------------------------------------------------
  { key: "scan1", family: "scanner", name: "Density Ping", major: false, cost: { money: 400, mats: { copper: 10 } },
    desc: "RMB pulses a density ring: nearby ore shows as faint shimmer.", fx: { scanTier: 1 } },
  { key: "scan2", family: "scanner", name: "Resource Hints", major: false, cost: { money: 1800, mats: { conduit: 8 } }, requires: "scan1",
    desc: "The ping names resource categories it finds.", fx: { scanTier: 2 } },
  { key: "scan3", family: "scanner", name: "Vein Outlines", major: true, cost: { money: 5600, mats: { silver: 8, conduit: 10 } }, requires: "scan2",
    desc: "Ping outlines whole veins within 12 cells on the map.", fx: { scanTier: 3 } },
  { key: "scan4", family: "scanner", name: "Anomaly Detector", major: true, cost: { money: 16000, mats: { voidgem: 4, quartz: 12 } }, requires: "scan3",
    desc: "Flags geodes, motherlodes and unusual structures near the ping.", fx: { scanTier: 4 } },
  // LOGISTICS ---------------------------------------------------------------
  { key: "refinery1", family: "logistics", name: "Refinery", major: true, cost: { money: 2600, mats: { iron: 16, coal: 12 } },
    desc: "The works builds a refinery: all sell prices +25%. The surface changes.", fx: { refinery: 1 } },
  { key: "refinery2", family: "logistics", name: "Refinery Expansion", major: false, cost: { money: 14000, mats: { alloy: 5, steel: 24 } }, requires: "refinery1",
    desc: "Sell prices +50% total. The refinery grows a second stack.", fx: { refinery: 2 } },
  { key: "lift", family: "logistics", name: "Freight Lift Network", major: true, cost: { money: 5200, mats: { steel: 20, railsalvage: 12 } },
    desc: "Old lift shafts become a travel network between discovered landings. Return trips stop costing minutes.", fx: { lift: true } },
  { key: "caches", family: "logistics", name: "Deep Supply Caches", major: true, cost: { money: 9800, mats: { conduit: 14, alloy: 3 } }, requires: "lift",
    desc: "Every discovered lift landing gets repair + charge infrastructure.", fx: { caches: true } },
];

export function upgrade(key: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.key === key);
}
