/**
 * DEEPER asset pipeline — threats, loot/resource icons, relics, UI icons, VFX.
 * Silhouette-first: every family and resource must read at 16-24px.
 */

import { Px, RGBA, hex, shade, mix, hashpix, mulberry } from "./pixutil";

// ---------------------------------------------------------------------------
// THREATS — six families, distinct silhouettes + palettes + frames
// ---------------------------------------------------------------------------
const OUT = hex("#14121a");

function threatGrubble(f: number): Px {
  // round burrower, big incisors, dirt-colored
  const p = new Px(24, 20);
  const body = hex("#7d6a4c");
  const bob = f % 2 === 0 ? 0 : 1;
  p.disc(12, 10 + bob, 8, body);
  p.disc(12, 10 + bob, 8, body);
  p.speckle(71, 0.12, 0.8);
  // eyes
  p.set(9, 8 + bob, hex("#f0e0b0")); p.set(15, 8 + bob, hex("#f0e0b0"));
  p.set(9, 9 + bob, DARKPIX()); p.set(15, 9 + bob, DARKPIX());
  // incisors
  p.rect(9, 15 + bob, 2, 3, hex("#e8e0d0"));
  p.rect(13, 15 + bob, 2, 3, hex("#e8e0d0"));
  // claws
  p.rect(4, 14 + bob, 3, 2, shade(body, -0.3));
  p.rect(17, 14 + bob, 3, 2, shade(body, -0.3));
  if (f === 2) { p.rect(8, 14, 8, 2, hex("#e8e0d0")); } // attack: jaws open
  if (f === 3) { p.outline(hex("#f0f0f0", 180)); }
  if (f >= 4) { p.rect(8, 6, 3, 10, shade(body, -0.5)); p.rect(14, 8, 3, 8, shade(body, -0.5)); }
  p.outline(OUT);
  return p;
}

function DARKPIX() { return hex("#1a1810"); }

function threatShellsnout(f: number): Px {
  const p = new Px(24, 20);
  const shell = hex("#6a705c");
  const snout = hex("#8c9478");
  const bob = f % 2 === 0 ? 0 : 1;
  // dome shell
  for (let y = 2; y < 14; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - ((y - 14) / 12) ** 2)) * 10);
    for (let x = 12 - w; x <= 12 + w; x++) p.set(x, y + bob, (x + y) % 5 === 0 ? shade(shell, -0.15) : shell);
  }
  // snout
  p.rect(2, 10 + bob, 8, 5, snout);
  p.set(2, 12 + bob, hex("#f0d060"));
  // legs
  p.rect(6, 15 + bob, 3, 3 + (f % 2), shade(shell, -0.35));
  p.rect(15, 15 + bob, 3, 3 + ((f + 1) % 2), shade(shell, -0.35));
  if (f === 2) { p.rect(0, 8 + bob, 4, 3, hex("#f0d060")); } // spark attack
  if (f === 3) p.outline(hex("#f0f0f0", 180));
  if (f >= 4) { p.line(4, 4, 18, 12, shade(shell, -0.5)); }
  p.outline(OUT);
  return p;
}

function threatCrawler(f: number): Px {
  const p = new Px(28, 20);
  const body = hex("#5d5f6a");
  const leg = hex("#46484f");
  const bob = f % 2;
  p.disc(14, 9 + bob, 7, body);
  p.speckle(31, 0.1, 0.7);
  // rock plates
  for (const [px, py] of [[10, 5], [16, 5], [13, 9]]) p.disc(px, py + bob, 2, shade(body, 0.2));
  // six legs
  for (let i = 0; i < 6; i++) {
    const lx = 4 + i * 4;
    const lift = (i + f) % 2 === 0 ? 2 : 0;
    p.line(lx, 13 + bob, lx - 2, 17 + bob - lift, leg);
    p.line(lx - 2, 17 + bob - lift, lx - 3, 19 + bob - lift, leg);
  }
  // mandibles
  p.set(6, 9 + bob, hex("#d8d0c0")); p.set(22, 9 + bob, hex("#d8d0c0"));
  if (f === 2) { p.rect(4, 8 + bob, 6, 2, hex("#d8d0c0")); p.rect(20, 8 + bob, 6, 2, hex("#d8d0c0")); }
  if (f === 3) p.outline(hex("#f0f0f0", 180));
  if (f >= 4) { p.line(8, 6, 20, 14, shade(body, -0.5)); }
  p.outline(OUT);
  return p;
}

function threatLurker(f: number): Px {
  const p = new Px(30, 18);
  const body = hex("#3a6a72");
  const fin = hex("#2c5258");
  const wob = Math.round(Math.sin(f * 1.2) * 2);
  // eel body S-curve
  for (let x = 2; x < 26; x++) {
    const y = 9 + Math.round(Math.sin(x / 4 + f) * 2.4);
    p.disc(x, y, 3 - x / 14, body);
  }
  // head + eye + teeth
  p.disc(26, 9 + wob * 0.5, 4, shade(body, 0.15));
  p.set(27, 8, hex("#f8e860"));
  p.set(25, 11, hex("#e8f0f0")); p.set(27, 11, hex("#e8f0f0"));
  // dorsal fin
  for (let x = 8; x < 22; x += 2) p.set(x, 4 + Math.round(Math.sin(x / 4 + f) * 2.4), fin);
  if (f === 2) { p.disc(29, 9, 2, hex("#e8f0f0")); }
  if (f === 3) p.outline(hex("#f0f0f0", 180));
  if (f >= 4) { p.line(10, 6, 24, 12, shade(body, -0.5)); }
  p.outline(OUT);
  return p;
}

function threatEmbermite(f: number): Px {
  const p = new Px(20, 18);
  const body = hex("#8a3c28");
  const glow = hex("#f0a040");
  const bob = f % 2;
  p.disc(10, 9 + bob, 6, body);
  p.speckle(17, 0.15, 0.8);
  // glow vents
  for (const [px, py] of [[7, 7], [13, 7], [10, 11]]) {
    p.set(px, py + bob, glow);
    p.set(px + 1, py + bob, shade(glow, -0.3));
  }
  // eyes
  p.set(8, 8 + bob, hex("#f8e8b0")); p.set(12, 8 + bob, hex("#f8e8b0"));
  // legs
  for (let i = 0; i < 3; i++) {
    p.set(4 + i * 5, 14 + bob + ((i + f) % 2), shade(body, -0.35));
    p.set(5 + i * 5, 14 + bob + ((i + f) % 2), shade(body, -0.35));
  }
  if (f === 2) { p.disc(10, 4 + bob, 2, glow); }
  if (f === 3) p.outline(hex("#f0f0f0", 180));
  if (f >= 4) { p.rect(7, 6, 6, 8, shade(body, -0.5)); }
  p.outline(OUT);
  return p;
}

function threatPrismite(f: number): Px {
  const p = new Px(22, 22);
  const c1 = hex("#8ec4d4");
  const c2 = hex("#b8e8f0");
  const bob = f % 2;
  // angular crystal body with legs
  for (let y = 2; y < 14; y++) {
    const w = Math.round((y / 14) * 6);
    for (let x = 11 - w; x <= 11 + w; x++) p.set(x, y + bob, (x + y) % 3 === 0 ? c2 : c1);
  }
  p.line(6, 4 + bob, 11, 1 + bob, c2);
  p.line(16, 4 + bob, 11, 1 + bob, c2);
  // spindly legs
  for (const lx of [6, 11, 16]) {
    p.line(lx, 14 + bob, lx - 1 + ((f + lx) % 2), 19, shade(c1, -0.35));
  }
  // core glow
  p.set(11, 8 + bob, hex("#e8feff"));
  if (f === 2) { p.line(4, 6, 0, 2, c2); p.line(18, 6, 22, 2, c2); }
  if (f === 3) p.outline(hex("#f0f0f0", 180));
  if (f >= 4) { p.line(7, 3, 15, 13, shade(c1, -0.5)); }
  p.outline(OUT);
  return p;
}

function threatDrone(f: number): Px {
  const p = new Px(26, 18);
  const body = hex("#7d8894");
  const dark = hex("#454b52");
  const lens = hex("#e05838");
  // hull
  p.rect(6, 7, 14, 6, body);
  p.rect(6, 7, 14, 1, shade(body, 0.25));
  p.rect(11, 5, 4, 3, dark);
  // rotors (two positions)
  const r = f % 2 === 0 ? 0 : 1;
  p.rect(2 + r, 4, 8, 1, dark);
  p.rect(16 - r, 4, 8, 1, dark);
  p.set(5, 6, dark); p.set(20, 6, dark);
  // lens
  p.disc(13, 12, 1.6, lens);
  p.set(13, 11, hex("#f8d048"));
  // hanging manipulator
  p.line(9, 13, 9, 15 + r, dark);
  p.line(17, 13, 17, 15 + r, dark);
  if (f === 2) { p.disc(13, 14, 2, lens); p.set(13, 16, hex("#f8d048")); }
  if (f === 3) p.outline(hex("#f0f0f0", 180));
  if (f >= 4) { p.line(8, 8, 18, 12, shade(body, -0.5)); p.rect(12, 10, 3, 2, lens); }
  p.outline(OUT);
  return p;
}

export const THREAT_DRAWERS: Record<string, (f: number) => Px> = {
  grubble: threatGrubble,
  shellsnout: threatShellsnout,
  crawler: threatCrawler,
  lurker: threatLurker,
  embermite: threatEmbermite,
  prismite: threatPrismite,
  drone: threatDrone,
};

// ---------------------------------------------------------------------------
// RESOURCE ICONS — silhouette + texture differences per family
// ---------------------------------------------------------------------------
type IconShape = "nugget" | "chunk" | "crystal" | "drop" | "sphere" | "gear" | "bar" | "coil" | "shard";

const RESOURCE_ART: Record<string, { c: string; c2?: string; shape: IconShape }> = {
  copper: { c: "#d07840", shape: "nugget" },
  coal: { c: "#232328", c2: "#3c3c44", shape: "chunk" },
  iron: { c: "#a88878", c2: "#c8a890", shape: "chunk" },
  nickel: { c: "#8aa878", c2: "#a8c498", shape: "nugget" },
  clay: { c: "#9c6c48", shape: "drop" },
  hardwood: { c: "#8d6c40", shape: "bar" },
  amber: { c: "#e8a83c", c2: "#f8d078", shape: "drop" },
  railsalvage: { c: "#6b7078", c2: "#8a4a30", shape: "bar" },
  aggregate: { c: "#9a9ba0", shape: "chunk" },
  steel: { c: "#8e99a5", shape: "bar" },
  conduit: { c: "#7a8088", c2: "#c8a03c", shape: "coil" },
  silver: { c: "#d8dce4", c2: "#f0f4f8", shape: "crystal" },
  gold: { c: "#e8c84a", c2: "#f8e890", shape: "nugget" },
  tungsten: { c: "#a8b4c0", c2: "#d0dae4", shape: "bar" },
  pressglass: { c: "#6fc8c8", c2: "#b0ece8", shape: "crystal" },
  brinepearl: { c: "#e8f0ec", c2: "#ffffff", shape: "sphere" },
  sulfur: { c: "#cab448", shape: "chunk" },
  obsshard: { c: "#3a3450", c2: "#6a5f8a", shape: "shard" },
  quartz: { c: "#a8e8f0", c2: "#e0feff", shape: "crystal" },
  voidgem: { c: "#b070e8", c2: "#e0c0ff", shape: "crystal" },
  composite: { c: "#5c636c", c2: "#8a929a", shape: "gear" },
  alloy: { c: "#9ca4ae", c2: "#c8d0da", shape: "gear" },
  coolant: { c: "#48c8b0", c2: "#a0f0e0", shape: "drop" },
};

function iconShape(p: Px, shape: IconShape, c: RGBA, c2: RGBA) {
  switch (shape) {
    case "nugget":
      p.disc(8, 9, 4.4, c); p.disc(6, 7, 1.6, c2); p.set(10, 11, shade(c, -0.25));
      p.set(5, 11, c); break;
    case "chunk":
      p.rect(4, 6, 8, 7, c); p.rect(5, 5, 5, 1, shade(c, 0.2)); p.rect(5, 6, 3, 2, c2);
      p.set(10, 11, shade(c, -0.3)); break;
    case "crystal":
      for (let y = 3; y < 14; y++) {
        const w = y < 8 ? 1 + ((y - 3) >> 1) : Math.max(1, 3 - ((y - 8) >> 1));
        for (let x = 8 - w; x <= 8 + w; x++) p.set(x, y, x < 8 ? c2 : c);
      }
      p.set(8, 3, shade(c2, 0.3)); break;
    case "drop":
      p.disc(8, 10, 3.6, c); p.set(8, 4, c); p.set(8, 5, c); p.set(7, 5, c); p.set(9, 5, c);
      p.set(7, 8, c2); p.set(8, 7, c2); break;
    case "sphere":
      p.disc(8, 8, 5, c); p.disc(6, 6, 1.6, c2); p.set(11, 11, shade(c, -0.2)); break;
    case "gear":
      p.disc(8, 8, 4.5, c); p.ring(8, 8, 4.5, shade(c, -0.25));
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        p.set(8 + Math.cos(ang) * 6, 8 + Math.sin(ang) * 6, c);
      }
      p.disc(8, 8, 1.6, c2); break;
    case "bar":
      p.rect(3, 6, 10, 4, c); p.rect(3, 6, 10, 1, c2); p.rect(3, 9, 10, 1, shade(c, -0.3));
      p.set(4, 7, c2); break;
    case "coil":
      for (let y = 4; y < 12; y++) {
        p.rect(5, y, 6, 1, y % 2 === 0 ? c : c2);
      }
      p.rect(4, 4, 1, 8, shade(c, -0.3)); p.rect(11, 4, 1, 8, shade(c, -0.3)); break;
    case "shard":
      p.line(5, 13, 9, 3, c); p.line(9, 3, 12, 10, c2); p.line(12, 10, 5, 13, c);
      p.set(9, 6, c2); break;
  }
}

export function resourceIcon(key: string): Px {
  const art = RESOURCE_ART[key] ?? { c: "#c8c8c8", shape: "chunk" as IconShape };
  const p = new Px(16, 16);
  const c = hex(art.c);
  iconShape(p, art.shape, c, art.c2 ? hex(art.c2) : shade(c, 0.35));
  p.outline(hex("#101014", 220));
  return p;
}

export function blueprintIcon(): Px {
  const p = new Px(16, 16);
  p.rect(3, 2, 10, 12, hex("#4a6a9c"));
  p.rect(3, 2, 10, 1, hex("#7a9ccc"));
  for (let y = 4; y < 13; y += 2) for (let x = 5; x < 12; x += 2) p.set(x, y, hex("#a8c8e8"));
  p.rect(5, 12, 6, 1, hex("#e8c84a"));
  p.outline(hex("#101014", 220));
  return p;
}

// ---------------------------------------------------------------------------
// RELICS — 20 distinct 16x16 finds
// ---------------------------------------------------------------------------
function relicIcon(key: string): Px {
  const p = new Px(16, 16);
  const bone = hex("#d8d0bc");
  const boneD = shade(bone, -0.25);
  const brass = hex("#b89840");
  const steelC = hex("#8e99a5");
  const wood = hex("#7a5a33");
  const stone = hex("#8a8a92");
  switch (key) {
    case "fern":
      p.line(8, 13, 8, 3, boneD);
      for (let y = 4; y < 13; y += 2) { p.line(8, y, 4, y - 1, bone); p.line(8, y + 1, 12, y, bone); }
      break;
    case "trilobite":
      p.disc(8, 9, 5, bone); p.disc(8, 7, 2, boneD);
      for (let x = 5; x <= 11; x++) p.set(x, 10, boneD);
      break;
    case "ammonite":
      p.ring(8, 8, 5.4, bone); p.ring(8, 8, 3.4, boneD); p.ring(8, 8, 1.6, bone);
      break;
    case "urn":
      p.rect(5, 4, 6, 2, shade(stone, 0.1)); p.rect(4, 6, 8, 7, stone);
      p.rect(4, 6, 2, 7, shade(stone, 0.15)); p.rect(11, 6, 1, 7, shade(stone, -0.2));
      p.rect(6, 8, 4, 1, shade(stone, -0.25)); break;
    case "coin":
      p.disc(8, 8, 5, brass); p.ring(8, 8, 4, shade(brass, -0.3)); p.set(8, 8, shade(brass, 0.3));
      break;
    case "watch":
      p.disc(8, 8, 5, brass); p.disc(8, 8, 3.4, hex("#e8e8e0"));
      p.line(8, 8, 8, 6, hex("#333")); p.line(8, 8, 10, 8, hex("#333"));
      p.rect(7, 2, 2, 2, brass); break;
    case "key":
      p.disc(5, 8, 3, brass); p.rect(7, 7, 6, 2, brass);
      p.rect(10, 9, 1, 2, brass); p.rect(12, 9, 1, 3, brass); break;
    case "soldier":
      p.rect(7, 3, 2, 5, brass); p.disc(8, 2.5, 1.6, brass);
      p.rect(5, 8, 6, 4, hex("#3a5a9c")); p.rect(6, 12, 1, 3, brass); p.rect(9, 12, 1, 3, brass);
      p.line(11, 4, 11, 10, shade(brass, 0.2)); break;
    case "bottle":
      p.rect(7, 2, 2, 3, hex("#5a8a6a")); p.rect(5, 5, 6, 9, hex("#4a7a5c", 220));
      p.rect(6, 6, 2, 6, hex("#6aa87c", 200)); p.rect(5, 8, 6, 1, hex("#d8d0bc")); break;
    case "plate":
      p.rect(2, 5, 12, 6, steelC); p.frame(2, 5, 12, 6, shade(steelC, -0.3));
      p.rect(4, 7, 8, 2, hex("#d8dce4")); break;
    case "typewriter":
      p.rect(3, 6, 10, 6, hex("#3a3a40")); p.rect(4, 4, 8, 2, hex("#4a4a52"));
      for (let x = 4; x < 12; x += 2) p.set(x, 9, hex("#c8c8c0"));
      p.rect(6, 12, 4, 1, hex("#d8dce4")); break;
    case "phone":
      p.rect(3, 4, 10, 9, hex("#8a3030")); p.rect(4, 3, 8, 2, hex("#6a2020"));
      p.disc(8, 9, 3, hex("#d8dce4")); p.disc(8, 9, 1.2, hex("#8a3030")); break;
    case "musicbox":
      p.rect(3, 6, 10, 8, wood); p.rect(3, 6, 10, 2, shade(wood, 0.2));
      p.rect(5, 9, 6, 3, shade(wood, -0.3)); p.set(12, 4, brass); p.set(13, 5, brass); break;
    case "helmet":
      p.disc(8, 9, 5.4, brass); p.disc(8, 9, 3.2, hex("#3a5a6a", 230));
      p.rect(6, 4, 4, 2, shade(brass, 0.2)); p.rect(2, 8, 12, 1, shade(brass, -0.3)); break;
    case "doll":
      p.disc(8, 5, 2.6, hex("#e8dcd0")); p.set(7, 5, hex("#3a4a8a")); p.set(9, 5, hex("#3a4a8a"));
      p.rect(6, 8, 4, 5, hex("#9a4a6a")); p.line(7, 4, 9, 6, hex("#a86a3a")); break;
    case "egg":
      for (let y = 3; y < 14; y++) {
        const w = Math.round(Math.sin(((y - 3) / 11) * Math.PI) * 4) + 1;
        for (let x = 8 - w; x <= 8 + w; x++) p.set(x, y, hex("#a8a49c"));
      }
      p.set(6, 6, hex("#d8d4cc")); p.set(9, 10, hex("#88847c")); break;
    case "gearheart":
      p.disc(8, 8, 5, hex("#8a4a3a")); p.ring(8, 8, 5, hex("#6a3226"));
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        p.set(8 + Math.cos(ang) * 6.4, 8 + Math.sin(ang) * 6.4, hex("#8a4a3a"));
      }
      p.disc(8, 8, 1.8, hex("#f0a040")); break;
    case "memory":
      p.rect(3, 5, 10, 7, hex("#3a4a5a")); p.frame(3, 5, 10, 7, hex("#6a7a8a"));
      for (let x = 5; x < 11; x += 2) p.set(x, 7, hex("#48c8b0"));
      p.rect(4, 11, 8, 1, hex("#48c8b0", 150)); break;
    case "globe":
      p.disc(8, 8, 5, hex("#c8e0f0", 230)); p.disc(6, 6, 1.4, hex("#ffffff"));
      for (let i = 0; i < 5; i++) p.set(4 + i * 2, 5 + ((i * 3) % 7), hex("#88a8c8", 200));
      p.rect(6, 13, 4, 1, steelC); break;
    case "badge":
      for (let y = 3; y < 13; y++) {
        const w = y < 8 ? y - 2 : 13 - y;
        for (let x = 8 - w; x <= 8 + w; x++) p.set(x, y, brass);
      }
      p.set(8, 7, hex("#f8e8b0")); p.set(8, 8, hex("#f8e8b0")); break;
    default:
      p.disc(8, 8, 4, stone);
  }
  p.outline(hex("#101014", 220));
  return p;
}

export { relicIcon };

// ---------------------------------------------------------------------------
// UI icons
// ---------------------------------------------------------------------------
export function uiIcon(key: string): Px {
  const p = new Px(16, 16);
  const fg = hex("#e8e0d0");
  switch (key) {
    case "money":
      p.disc(8, 8, 5.4, hex("#e8c84a")); p.ring(8, 8, 4, hex("#b09030"));
      p.rect(7, 5, 2, 6, hex("#b09030")); p.rect(6, 6, 4, 1, hex("#b09030"));
      p.rect(6, 9, 4, 1, hex("#b09030")); break;
    case "cargo":
      p.rect(2, 5, 12, 9, hex("#7d5a3a")); p.rect(2, 5, 12, 2, hex("#9a744c"));
      p.rect(4, 3, 8, 2, hex("#8a6444"));
      for (let i = 0; i < 5; i++) p.set(4 + i * 2, 8 + (i % 2), i % 2 ? hex("#e8c84a") : hex("#d07840"));
      break;
    case "heart":
      p.disc(6, 6, 3.2, hex("#d84848")); p.disc(10, 6, 3.2, hex("#d84848"));
      for (let y = 6; y < 12; y++) {
        const w = Math.max(0, 6 - (y - 6));
        p.rect(8 - w, y, w * 2 + 1, 1, hex("#d84848"));
      }
      p.set(5, 5, hex("#f09090")); break;
    case "scanner":
      p.disc(8, 8, 6, 0); p.ring(8, 8, 6, hex("#48c8b0"));
      p.ring(8, 8, 3.4, hex("#48c8b0", 160)); p.set(8, 8, hex("#a0f0e0"));
      break;
    case "depth":
      p.line(8, 2, 8, 12, hex("#8a929a"));
      for (let i = 0; i < 3; i++) p.line(5, 3 + i * 3, 11, 5 + i * 3, hex("#8a929a"));
      p.line(4, 13, 12, 13, fg); break;
    case "marker":
      p.disc(8, 6, 3.6, hex("#e05838")); p.disc(8, 6, 1.6, hex("#f8d048"));
      p.disc(8, 13, 1.6, hex("#e05838")); break;
    case "blueprint":
      return blueprintIcon();
    case "charge":
      p.rect(5, 2, 6, 12, hex("#c03828")); p.rect(5, 2, 6, 2, hex("#e05838"));
      p.rect(7, 5, 2, 6, hex("#f8d048")); break;
    case "core":
      p.disc(8, 8, 5.4, hex("#3a4a5a")); p.ring(8, 8, 5, hex("#6a7a8a"));
      p.disc(8, 8, 2.6, hex("#e05838")); p.set(8, 8, hex("#f8d048")); break;
    case "map":
      p.rect(2, 3, 12, 10, hex("#5a6a4a")); p.rect(2, 3, 12, 1, hex("#7a8a6a"));
      p.line(4, 10, 8, 6, hex("#c8b48a")); p.line(8, 6, 12, 8, hex("#c8b48a"));
      p.set(8, 6, hex("#e05838")); break;
    case "lift":
      p.rect(4, 2, 8, 12, hex("#5a636e")); p.rect(6, 4, 4, 5, hex("#8a929a"));
      p.line(8, 2, 8, 12, hex("#434b56")); break;
    case "temp":
      p.rect(7, 2, 2, 8, hex("#c8ccd0")); p.disc(8, 12, 3, hex("#e05838"));
      p.set(7, 4, hex("#e05838")); break;
    case "press":
      p.disc(8, 8, 5.4, hex("#3a6a8a")); p.ring(8, 8, 3.6, hex("#6fc8c8"));
      p.line(3, 3, 6, 6, hex("#8adcd8")); break;
    case "shield":
      for (let y = 3; y < 12; y++) {
        const w = y < 8 ? y - 1 : 12 - y + 1;
        for (let x = 8 - w; x <= 8 + w; x++) p.set(x, y, hex("#5a7a9a"));
      }
      p.rect(7, 5, 2, 4, hex("#a8d8e0")); break;
    case "drill":
      for (let y = 3; y < 13; y++) {
        const w = Math.max(1, 4 - ((y - 3) >> 1));
        for (let x = 8 - w; x <= 8 + w; x++) p.set(x, y, y % 3 === 0 ? hex("#8e99a5") : hex("#6a7078"));
      }
      p.rect(6, 2, 4, 2, hex("#b06828")); break;
    case "skull":
      p.disc(8, 7, 4.4, hex("#d8d0bc")); p.rect(5, 9, 6, 3, hex("#d8d0bc"));
      p.set(6, 6, hex("#1a1810")); p.set(10, 6, hex("#1a1810"));
      p.set(7, 11, hex("#1a1810")); p.set(9, 11, hex("#1a1810")); break;
    case "star":
      p.set(8, 3, hex("#f8d048")); p.set(8, 4, hex("#f8d048"));
      p.line(3, 8, 13, 8, hex("#f8d048")); p.line(8, 2, 8, 13, hex("#f8d048"));
      p.line(5, 5, 11, 10, hex("#f8d048")); p.line(11, 5, 5, 10, hex("#f8d048"));
      break;
    default:
      p.disc(8, 8, 4, hex("#c8c8c8"));
  }
  if (key !== "blueprint") p.outline(hex("#101014", 200));
  return p;
}
