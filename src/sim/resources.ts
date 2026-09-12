/**
 * DEEPER — resource / loot economy data.
 * Three value channels: currency (sell value), materials (upgrade requirements),
 * blueprints (major capability unlocks). Relics are non-consumable finds.
 */

export interface ResourceDef {
  key: string;
  name: string;
  /** Money per unit at the buyer. */
  value: number;
  /** Cargo units per unit. */
  bulk: number;
  tier: number; // rough stratum tier, for HUD colouring
  desc: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  copper: { key: "copper", name: "Copper", value: 6, bulk: 1, tier: 0, desc: "Common wiring metal. The bottom of every market." },
  coal: { key: "coal", name: "Carbon coal", value: 4, bulk: 1, tier: 0, desc: "Burns long and dirty. Refinery loves it." },
  iron: { key: "iron", name: "Iron", value: 9, bulk: 1, tier: 0, desc: "The honest metal. Half of everything is made of it." },
  nickel: { key: "nickel", name: "Nickel", value: 14, bulk: 1, tier: 1, desc: "Hard, grey, unimpressed by depth." },
  clay: { key: "clay", name: "Clay", value: 3, bulk: 1, tier: 0, desc: "Sticky, heavy, occasionally profitable." },
  hardwood: { key: "hardwood", name: "Old-growth timber", value: 8, bulk: 1, tier: 1, desc: "Wood that grew before the works existed." },
  amber: { key: "amber", name: "Amber", value: 22, bulk: 1, tier: 1, desc: "Rootbed resin with old light trapped inside." },
  railsalvage: { key: "railsalvage", name: "Rail salvage", value: 16, bulk: 1, tier: 1, desc: "Rails that once hauled ore toward a sky you never saw." },
  aggregate: { key: "aggregate", name: "Concrete aggregate", value: 12, bulk: 1, tier: 2, desc: "The city, crushed and sorted." },
  steel: { key: "steel", name: "Salvaged steel", value: 20, bulk: 1, tier: 2, desc: "Structural-grade. The works always needs more." },
  conduit: { key: "conduit", name: "Civic conduit", value: 15, bulk: 1, tier: 2, desc: "Pipe and wiring runs from a grid nobody remembers." },
  silver: { key: "silver", name: "Silver", value: 34, bulk: 1, tier: 1, desc: "Vein metal. Follows water through old fault lines." },
  gold: { key: "gold", name: "Gold", value: 58, bulk: 1, tier: 2, desc: "It made the first mines. It still funds everything." },
  tungsten: { key: "tungsten", name: "Tungsten ore", value: 76, bulk: 1, tier: 3, desc: "Heavy enough that the cargo hopper complains." },
  pressglass: { key: "pressglass", name: "Pressure glass", value: 44, bulk: 1, tier: 3, desc: "Grown by water pressure over centuries." },
  brinepearl: { key: "brinepearl", name: "Brine pearl", value: 52, bulk: 1, tier: 3, desc: "Mineral concretion, cold and perfect." },
  sulfur: { key: "sulfur", name: "Sulfur", value: 26, bulk: 1, tier: 4, desc: "Smells like the Red Fault's opinion of you." },
  obsshard: { key: "obsshard", name: "Obsidian shard", value: 60, bulk: 1, tier: 4, desc: "Volcanic glass, still holding an edge." },
  quartz: { key: "quartz", name: "Resonant quartz", value: 88, bulk: 1, tier: 5, desc: "Hums faintly when several pieces sit together." },
  voidgem: { key: "voidgem", name: "Choir gem", value: 140, bulk: 1, tier: 5, desc: "The Glass Choir grows these the way trees grow fruit." },
  composite: { key: "composite", name: "Machine composite", value: 120, bulk: 1, tier: 6, desc: "Engine Deep builds itself from this. So will you." },
  alloy: { key: "alloy", name: "Machine alloy", value: 150, bulk: 1, tier: 6, desc: "Alloy that outlived its builders." },
  coolant: { key: "coolant", name: "Sealed coolant", value: 70, bulk: 1, tier: 6, desc: "Still circulating. Still cold. Nobody knows the loop's purpose." },
};

export const BLUEPRINTS: Record<string, { key: string; name: string; desc: string }> = {
  cipher: { key: "cipher", name: "Cipher plate", desc: "A machined plate covered in service stamps. Unlocks Thermic-class tooling." },
  capacitor: { key: "capacitor", name: "Seismic capacitor", desc: "Stores a shock big enough to argue with geology. Unlocks the Seismic Rig." },
  servo: { key: "servo", name: "Servo cluster", desc: "Heavy rotary drive components. Unlocks the Rotary Excavator." },
  fork: { key: "fork", name: "Tuning fork, colossal", desc: "Struck once, ever. Unlocks the Resonator." },
  lattice: { key: "lattice", name: "Core lattice", desc: "The last component. Whatever the Engine Deep was for, this was its heart." },
};

export interface RelicDef {
  key: string;
  name: string;
  desc: string;
}

/** 20 relics — compact, distinct, museum-worthy. */
export const RELICS: RelicDef[] = [
  { key: "fern", name: "Fern fossil", desc: "A leaf that gave up mid-unfurling." },
  { key: "trilobite", name: "Trilobite", desc: "Everyone's first fossil. Still a good one." },
  { key: "ammonite", name: "Ammonite", desc: "A spiral you could get lost in." },
  { key: "urn", name: "Clay urn", desc: "Sealed. Whatever's inside waited this long." },
  { key: "coin", name: "Sunken coin", desc: "Currency of a place that no longer has a name." },
  { key: "watch", name: "Pocket watch", desc: "Stopped at 7:42. It kept that promise." },
  { key: "key", name: "Brass key", desc: "Fits a lock somewhere in the Buried Mile." },
  { key: "soldier", name: "Tin soldier", desc: "Still at attention. Guild never broke him." },
  { key: "bottle", name: "Old bottle", desc: "Empty. The label outlasted the drink." },
  { key: "plate", name: "License plate", desc: "GND-337. Somewhere above, that car was somebody's Friday." },
  { key: "typewriter", name: "Typewriter", desc: "The last key typed an 'R' and nothing after." },
  { key: "phone", name: "Rotary phone", desc: "Rings once when the freight lift moves. Probably coincidence." },
  { key: "musicbox", name: "Music box", desc: "Plays four notes if you shake it. Four is enough." },
  { key: "helmet", name: "Diving helmet", desc: "From before the flood. Or during it." },
  { key: "doll", name: "Porcelain doll", desc: "The museum keeps it facing the wall. Staff preference." },
  { key: "egg", name: "Stone egg", desc: "Warm. Nobody at the works wants to discuss it." },
  { key: "gearheart", name: "Gear heart", desc: "A machine part that looks suspiciously like it was beating." },
  { key: "memory", name: "Memory core", desc: "Plugged in once, it whispered a number and went quiet." },
  { key: "globe", name: "Snow globe", desc: "The flakes never settle. There's a tiny city inside." },
  { key: "badge", name: "Works badge #001", desc: "Founder's badge. It was here when you arrived." },
];

/** Relic → which stratum it surfaces in (loot table weighting). */
export const RELIC_STRATUM: Record<string, number> = {
  fern: 0, trilobite: 0, ammonite: 1, urn: 1, coin: 2, watch: 2, key: 2, soldier: 2,
  bottle: 2, plate: 2, typewriter: 3, phone: 3, musicbox: 3, helmet: 3, doll: 3,
  egg: 4, gearheart: 5, memory: 6, globe: 5, badge: 0,
};
