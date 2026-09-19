/**
 * DEEPER — excavation systems (the 8 tool tiers) and the upgrade tree.
 * Every tool must change BEHAVIOR, not just numbers: area, rate, material
 * access, collection, sound identity and animation all shift per tier.
 * v1.2: each tier now has explicit machine identity (footprint, cadence,
 * movement feel, heat/cooling, cargo, terrain interaction, utility, audio,
 * visual, access) to make progression materially clearer in play.
 * Balanced to preserve >=20x throughput fantasy and digflow >20 cells.
 */

import type { ToolClass } from "./materials";

export interface ToolDef {
  tier: number;
  key: string;
  name: string;
  cls: ToolClass;
  interval: number;
  dps: number;
  shape: [number, number][];
  reach: number;
  utility?: "scan" | "charge" | "resonate";
  vacuum: number;
  cost: { money: number; mats?: Record<string, number>; blueprints?: string[] };
  blurb: string;
  sound: string;
  identity: {
    footprint: string;
    cadence: string;
    power: string;
    movement: string;
    heat: string;
    cargo: string;
    terrain: string;
    utility: string;
    audio: string;
    visual: string;
    access: string;
  };
  move: { runMul: number; accelMul: number; jumpMul: number; weight: number };
  heat: { gen: number; cool: number; overheatAt: number };
  recoil: number;
  debrisMul: number;
  specials: string[];
}

export const TOOLS: ToolDef[] = [
  {
    tier: 0, key: "auger", name: "Scrap Auger", cls: "drill",
    interval: 0.42, dps: 42, shape: [[-1, 0], [0, 0], [1, 0]], reach: 4.6, utility: "scan", vacuum: 2.2,
    cost: { money: 0 },
    blurb: "Cuts a slow, machine-wide swipe through soft ground. Sandstone stops it cold.",
    sound: "auger",
    identity: {
      footprint: "3-wide horizontal swipe",
      cadence: "slow 0.42s chug, coughs between bites",
      power: "42 DPS, struggles on anything harder than soil",
      movement: "light chassis, nimble 1.0× run, quick jump",
      heat: "cold, 0.2 gen, cools fast",
      cargo: "2.2 vacuum, hopper fills fast",
      terrain: "soft/granular only, no chain",
      utility: "scan ping only",
      audio: "auger cough, low dirt thud",
      visual: "small sparks, light debris",
      access: "soil/clay/sand — walls laugh",
    },
    move: { runMul: 1.0, accelMul: 1.0, jumpMul: 1.0, weight: 1.0 },
    heat: { gen: 0.2, cool: 4.5, overheatAt: 100 },
    recoil: 0.6,
    debrisMul: 0.8,
    specials: [],
  },
  {
    tier: 1, key: "twin", name: "Twin-Tooth", cls: "drill",
    interval: 0.34, dps: 95, shape: [[0, 0], [0, 1]], reach: 5.2, utility: "scan", vacuum: 1.8,
    cost: { money: 320, mats: { iron: 12, copper: 8 } },
    blurb: "Sandstone and common rock stop being a problem. Soil opens in 2-cell bites.",
    sound: "twin",
    identity: {
      footprint: "2-tall vertical bite — shaft carving",
      cadence: "fast 0.34s twin-chatter, double tap",
      power: "95 DPS, sandstone now trivial, soil 1-hit",
      movement: "still light, 1.05× run, slightly heavier drill head",
      heat: "warm, 0.5 gen, still cool",
      cargo: "1.8 vacuum — trades reach for speed",
      terrain: "brittle sandstone cracks, soil vaporizes",
      utility: "scan ping, faster cycle",
      audio: "twin-tooth whine, sharper impact",
      visual: "vertical sparks, twin debris",
      access: "sandstone/brick/tile — first real gate break",
    },
    move: { runMul: 1.05, accelMul: 1.1, jumpMul: 1.02, weight: 1.1 },
    heat: { gen: 0.5, cool: 4.2, overheatAt: 100 },
    recoil: 0.9,
    debrisMul: 1.0,
    specials: ["verticalBite"],
  },
  {
    tier: 2, key: "hammer", name: "Hammerhead", cls: "impact",
    interval: 0.5, dps: 150, shape: [[0, 0], [-1, 0], [1, 0]], reach: 5.6, utility: "scan", vacuum: 2.0,
    cost: { money: 900, mats: { iron: 20, steel: 6 } },
    blurb: "Impact mining. Hard rock cracks — and connected brittle rock cracks with it.",
    sound: "hammer",
    identity: {
      footprint: "3-wide impact, hammer slam",
      cadence: "0.5s piston thud, wind-up + slam",
      power: "150 DPS + brittle chain fracture",
      movement: "heavy 0.9× run, 0.85× jump, weight 1.6 — lands hard",
      heat: "moderate 1.2 gen, impact friction",
      cargo: "2.0 vacuum, chain drops",
      terrain: "brittle chain cracks up to 12 cells, stuns threats",
      utility: "scan, plus impact stun",
      audio: "hammer piston + rock crack",
      visual: "heavy recoil, large debris, crack lines",
      access: "stone/coalrock/asphalt — old works opens",
    },
    move: { runMul: 0.9, accelMul: 0.85, jumpMul: 0.85, weight: 1.6 },
    heat: { gen: 1.2, cool: 3.5, overheatAt: 90 },
    recoil: 2.2,
    debrisMul: 1.4,
    specials: ["chainCrack", "impactStun", "heavyLanding"],
  },
  {
    tier: 3, key: "thermal", name: "Thermic Needle", cls: "thermal",
    interval: 0.42, dps: 260, shape: [[0, 0], [0, 1]], reach: 6.0, utility: "scan", vacuum: 2.2,
    cost: { money: 2600, mats: { steel: 18, silver: 8 }, blueprints: ["cipher"] },
    blurb: "Cuts reinforced concrete, structural steel and vault plate. The buried city opens.",
    sound: "thermal",
    identity: {
      footprint: "2-tall needle pierce, focused heat",
      cadence: "0.42s hiss + cut, continuous thermal whine",
      power: "260 DPS metal affinity, concrete/steel/vault plate",
      movement: "medium 0.95× run, 0.95× jump, weight 1.3 — hot chassis",
      heat: "hot 3.5 gen, needs coolant loop, glows when hot",
      cargo: "2.2 vacuum, molten drops",
      terrain: "ignites gas/oil, melts metal, thermal scar",
      utility: "scan + thermal ignite",
      audio: "thermal hiss + metal sizzle",
      visual: "heat shimmer, orange sparks, overheat glow",
      access: "concrete/steel/vaultwall — buried city",
    },
    move: { runMul: 0.95, accelMul: 0.95, jumpMul: 0.95, weight: 1.3 },
    heat: { gen: 3.5, cool: 2.8, overheatAt: 75 },
    recoil: 1.0,
    debrisMul: 1.1,
    specials: ["thermalIgnite", "thermalScar", "metalMelt"],
  },
  {
    tier: 4, key: "seismic", name: "Seismic Rig", cls: "seismic",
    interval: 0.55, dps: 320, shape: [[0, 0]], reach: 6.4, utility: "charge", vacuum: 2.6,
    cost: { money: 6400, mats: { tungsten: 22, steel: 30 }, blueprints: ["capacitor"] },
    blurb: "Drill as normal; place seismic charges with the utility trigger. A charge fractures everything brittle-to-basalt in a wide dome.",
    sound: "seismic",
    identity: {
      footprint: "single-point precision + 3.4r dome charges",
      cadence: "0.55s single bite + 0.9s fuse charges, remote detonate",
      power: "320 DPS + dome fracture, destabilizes granular",
      movement: "heavy 0.85× run, 0.8× jump, weight 1.8 — seismic mass",
      heat: "low 0.8 gen, charge heat separate",
      cargo: "2.6 vacuum, blast clears",
      terrain: "explosions destabilize granular, open pressure pockets",
      utility: "charge placement + remote detonate oldest",
      audio: "seismic thump + charge beep + dome blast",
      visual: "charge blink, blast ring, granular collapse",
      access: "basalt/sulfurrock/magmarock — red fault",
    },
    move: { runMul: 0.85, accelMul: 0.8, jumpMul: 0.8, weight: 1.8 },
    heat: { gen: 0.8, cool: 3.8, overheatAt: 95 },
    recoil: 1.4,
    debrisMul: 1.6,
    specials: ["seismicDestabilize", "pressureOpen", "charge"],
  },
  {
    tier: 5, key: "rotary", name: "Rotary Excavator", cls: "rotary",
    interval: 0.11, dps: 620, shape: [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1]], reach: 6.8, utility: "charge", vacuum: 4.2,
    cost: { money: 15000, mats: { alloy: 8, composite: 12 }, blueprints: ["servo"] },
    blurb: "Continuous multi-cell removal. Tunnels become corridors. Old strata become afterthoughts.",
    sound: "rotary",
    identity: {
      footprint: "7-cell cross + corners, continuous 0.11s grind",
      cadence: "0.11s continuous multi-bite, corridor carving",
      power: "620 DPS rotary — 13× soil, obsidian viable",
      movement: "very heavy 0.78× run, 0.7× jump, weight 2.2 — momentum, unstoppable",
      heat: "moderate 1.8 gen, rotary friction, needs cooling at depth",
      cargo: "4.2 vacuum, bulk clear, magnet streak synergy",
      terrain: "clears granular instantly, leaves clean walls, rotary scar",
      utility: "charge + continuous grind",
      audio: "rotary grind + whine, heavy motor",
      visual: "continuous debris stream, heavy recoil, weighty landing",
      access: "obsidian/darkstone/cpipe — choir approaches, old soil trivial",
    },
    move: { runMul: 0.78, accelMul: 0.7, jumpMul: 0.7, weight: 2.2 },
    heat: { gen: 1.8, cool: 3.2, overheatAt: 85 },
    recoil: 1.8,
    debrisMul: 2.0,
    specials: ["rotaryClear", "heavyLanding", "charge"],
  },
  {
    tier: 6, key: "resonator", name: "Resonator", cls: "resonator",
    interval: 0.5, dps: 640, shape: [[0, 0], [-1, 0], [1, 0]], reach: 7.2, utility: "resonate", vacuum: 4.6,
    cost: { money: 34000, mats: { quartz: 30, voidgem: 8, tungsten: 10 }, blueprints: ["fork"] },
    blurb: "Fracture waves propagate through connected crystal — and through ultradense conductive stone. The Glass Choir falls in sequence.",
    sound: "resonator",
    identity: {
      footprint: "3-wide resonator pulse, crystal shatter",
      cadence: "0.5s pulse, 4s combo window, sequential fracture staging",
      power: "640 DPS crystal 1.6×, conductive darkstone, choir falls",
      movement: "light 1.1× run, 1.15× jump, weight 0.9 — crystal-tuned, floats",
      heat: "cold 0.1 gen, crystal resonance is cold",
      cargo: "4.6 vacuum, resonance pulls crystal shards",
      terrain: "resonance propagates through connected crystal + conductive, fracture cascade",
      utility: "resonate pulse — flood-fill connected resonant",
      audio: "resonator hum + choir chime cascade",
      visual: "resonance wavefront, shard burst, crystal glow",
      access: "crystal/darkstone/gemrock — glass choir trivial, engine deep gates",
    },
    move: { runMul: 1.1, accelMul: 1.15, jumpMul: 1.15, weight: 0.9 },
    heat: { gen: 0.1, cool: 5.0, overheatAt: 100 },
    recoil: 0.7,
    debrisMul: 1.2,
    specials: ["resonancePropagate", "crystalFracture", "crystalStabilize"],
  },
  {
    tier: 7, key: "maw", name: "THE MAW", cls: "maw",
    interval: 0.12, dps: 2200, shape: [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [0, -1], [1, -1], [-2, -1], [2, -1], [0, 1], [-2, 1], [2, 1], [0, 2], [-1, 2], [1, 2], [-2, 2], [2, 2]], reach: 8.0, vacuum: 7.5,
    cost: { money: 80000, mats: { composite: 40, alloy: 30, coolant: 15 }, blueprints: ["lattice"] },
    blurb: "Area deletion. Seven cells of geography per bite. Collection radius measured in screens. The opening layers of this world are a rumor to it now.",
    sound: "maw",
    identity: {
      footprint: "19-cell bite, 5×3 dome + 2 deep, area deletion",
      cadence: "0.12s × 19 cells = 79 c/s on soil, shockwave finishes cracked",
      power: "2200 DPS, 1.15× all families, bedrock only stops it",
      movement: "geological event 0.7× run, 0.6× jump, weight 3.0 — slow start, unstoppable, heavy recoil",
      heat: "very hot 5.0 gen, needs coolant II, vents glow",
      cargo: "7.5 vacuum — screen-wide, bulk trivial",
      terrain: "maw scar permanent, shockwave, collapses granular, ignites, fractures",
      utility: "charge + maw overdrive (shockwave)",
      audio: "maw swallow + shockwave + deep rumble",
      visual: "massive recoil, screen shake, scar texture, debris torrent",
      access: "composite/alloy/bulkhead — everything but bedrock, early strata vapor",
    },
    move: { runMul: 0.7, accelMul: 0.6, jumpMul: 0.6, weight: 3.0 },
    heat: { gen: 5.0, cool: 2.5, overheatAt: 70 },
    recoil: 4.5,
    debrisMul: 3.0,
    specials: ["mawShockwave", "mawScar", "seismicDestabilize", "thermalIgnite", "rotaryClear", "heavyLanding", "charge"],
  },
];

export function tool(tier: number): ToolDef {
  return TOOLS[Math.max(0, Math.min(7, tier))];
}

export type UpgradeFamily = "excavation" | "cargo" | "mobility" | "protection" | "scanner" | "logistics";

export interface UpgradeDef {
  key: string;
  family: UpgradeFamily;
  name: string;
  major: boolean;
  cost: { money: number; mats?: Record<string, number> };
  requires?: string;
  desc: string;
  fx: Partial<{
    cargoCap: number;
    cargoBulkMul: number;
    vacuum: number;
    jump: number;
    run: number;
    damper: boolean;
    winch: boolean;
    heatProt: number;
    pressureProt: number;
    scanTier: number;
    refinery: number;
    lift: boolean;
    caches: boolean;
    chargeCap: number;
  }>;
}

export const UPGRADES: UpgradeDef[] = [
  { key: "hopper1", family: "cargo", name: "Hopper Extension I", major: false, cost: { money: 220, mats: { iron: 6 } }, desc: "Cargo 30 → 48 units.", fx: { cargoCap: 48 } },
  { key: "hopper2", family: "cargo", name: "Hopper Extension II", major: false, cost: { money: 1200, mats: { steel: 8 } }, requires: "hopper1", desc: "Cargo 48 → 80 units.", fx: { cargoCap: 80 } },
  { key: "compress", family: "cargo", name: "Stack Compression", major: true, cost: { money: 3800, mats: { steel: 14, conduit: 10 } }, requires: "hopper2", desc: "Ore is crushed and stacked: every resource's bulk is halved. Trips get longer before the hopper complains.", fx: { cargoBulkMul: 0.5 } },
  { key: "vacuum1", family: "cargo", name: "Loot Vacuum I", major: true, cost: { money: 1500, mats: { iron: 10, conduit: 6 } }, desc: "Loose loot within 4 cells is pulled into the rig. You stop chasing pebbles.", fx: { vacuum: 4 } },
  { key: "vacuum2", family: "cargo", name: "Loot Vacuum II", major: true, cost: { money: 7200, mats: { alloy: 4, composite: 6 } }, requires: "vacuum1", desc: "Collection radius 4 → 6.5 cells, with a hungrier sound.", fx: { vacuum: 6.5 } },
  { key: "treads1", family: "mobility", name: "Aggressive Treads", major: false, cost: { money: 260, mats: { iron: 8 } }, desc: "Top speed +25%. Slopes stop slowing you down.", fx: { run: 10.6 } },
  { key: "treads2", family: "mobility", name: "Overdrive Treads", major: false, cost: { money: 2100, mats: { steel: 10 } }, requires: "treads1", desc: "Top speed +50% over stock.", fx: { run: 12.6 } },
  { key: "boost", family: "mobility", name: "Suspension Boost", major: true, cost: { money: 900, mats: { iron: 12 } }, desc: "Jump clears 4+ cells of shaft. Shafts you dug become ladders.", fx: { jump: 27.5 } },
  { key: "dampers", family: "mobility", name: "Fall Dampers", major: true, cost: { money: 2600, mats: { steel: 12, conduit: 6 } }, requires: "boost", desc: "Landing damage is gone. Gravity is now a suggestion.", fx: { damper: true } },
  { key: "winch", family: "mobility", name: "Emergency Winch", major: true, cost: { money: 4200, mats: { steel: 16, tungsten: 6 } }, requires: "dampers", desc: "Hold SPACE against a wall to winch straight up. Your deepest shaft is always survivable.", fx: { winch: true } },
  { key: "coolant1", family: "protection", name: "Coolant Loop I", major: true, cost: { money: 3200, mats: { conduit: 8, sulfur: 4 } }, desc: "Survives Red Fault ambient heat. Heat vents glow and the rig stops cooking.", fx: { heatProt: 1 } },
  { key: "coolant2", family: "protection", name: "Coolant Loop II", major: false, cost: { money: 12000, mats: { coolant: 6, alloy: 4 } }, requires: "coolant1", desc: "Magma adjacency no longer deals contact damage.", fx: { heatProt: 2 } },
  { key: "hull1", family: "protection", name: "Pressure Hull I", major: true, cost: { money: 3400, mats: { steel: 14, pressglass: 4 } }, desc: "Drowned Fault depth no longer crushes the rig.", fx: { pressureProt: 1 } },
  { key: "hull2", family: "protection", name: "Pressure Hull II", major: false, cost: { money: 11500, mats: { brinepearl: 6, steel: 20 } }, requires: "hull1", desc: "Full-depth pressure immunity, flooded ruins included.", fx: { pressureProt: 2 } },
  { key: "scan1", family: "scanner", name: "Density Ping", major: false, cost: { money: 400, mats: { copper: 10 } }, desc: "RMB pulses a density ring: nearby ore shows as faint shimmer.", fx: { scanTier: 1 } },
  { key: "scan2", family: "scanner", name: "Resource Hints", major: false, cost: { money: 1800, mats: { conduit: 8 } }, requires: "scan1", desc: "The ping names resource categories it finds.", fx: { scanTier: 2 } },
  { key: "scan3", family: "scanner", name: "Vein Outlines", major: true, cost: { money: 5600, mats: { silver: 8, conduit: 10 } }, requires: "scan2", desc: "Ping outlines whole veins within 12 cells on the map.", fx: { scanTier: 3 } },
  { key: "scan4", family: "scanner", name: "Anomaly Detector", major: true, cost: { money: 16000, mats: { voidgem: 4, quartz: 12 } }, requires: "scan3", desc: "Flags geodes, motherlodes and unusual structures near the ping.", fx: { scanTier: 4 } },
  { key: "refinery1", family: "logistics", name: "Refinery", major: true, cost: { money: 2600, mats: { iron: 16, coal: 12 } }, desc: "The works builds a refinery: all sell prices +25%. The surface changes.", fx: { refinery: 1 } },
  { key: "refinery2", family: "logistics", name: "Refinery Expansion", major: false, cost: { money: 14000, mats: { alloy: 5, steel: 24 } }, requires: "refinery1", desc: "Sell prices +50% total. The refinery grows a second stack.", fx: { refinery: 2 } },
  { key: "lift", family: "logistics", name: "Freight Lift Network", major: true, cost: { money: 5200, mats: { steel: 20, railsalvage: 12 } }, desc: "Old lift shafts become a travel network between discovered landings. Return trips stop costing minutes.", fx: { lift: true } },
  { key: "caches", family: "logistics", name: "Deep Supply Caches", major: true, cost: { money: 9800, mats: { conduit: 14, alloy: 3 } }, requires: "lift", desc: "Every discovered lift landing gets repair + charge infrastructure.", fx: { caches: true } },
];

export function upgrade(key: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.key === key);
}
