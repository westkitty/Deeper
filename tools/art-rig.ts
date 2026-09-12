/**
 * DEEPER asset pipeline — the rig (player machine), modular layers.
 * Identity: compact patched worksite vehicle that visibly transforms across
 * eight excavation tiers. Same chassis silhouette throughout; tool heads,
 * tracks, hopper, lamp and vacuum hardware change.
 */

import { Px, RGBA, hex, shade, mix, hashpix, mulberry } from "./pixutil";

const BODY = hex("#b06828"); // works orange
const BODY_D = shade(BODY, -0.25);
const BODY_L = shade(BODY, 0.2);
const METAL = hex("#6a7078");
const METAL_L = hex("#8a929a");
const METAL_D = hex("#454b52");
const DARK = hex("#26282c");
const YELLOW = hex("#d8a83c");
const GLASS = hex("#a8d8e0");
const RUST = hex("#8a4a30");
const TIRE = hex("#2c2c30");
const LIGHT = hex("#f8e8b0");

/** Main chassis — 80x48, drawn per damage variant (0 pristine, 1 worn, 2 battered). */
export function rigChassis(damage: number): Px {
  const p = new Px(80, 48);
  const rnd = mulberry(1000 + damage);
  // main hull
  p.rect(10, 14, 52, 24, BODY);
  p.rect(10, 14, 52, 3, BODY_L);
  p.rect(10, 35, 52, 3, BODY_D);
  // cabin
  p.rect(14, 6, 26, 10, BODY);
  p.rect(14, 6, 26, 2, BODY_L);
  p.rect(16, 8, 20, 6, DARK);
  p.rect(17, 9, 8, 4, GLASS);
  p.rect(27, 9, 8, 4, shade(GLASS, -0.15));
  // exhaust stack
  p.rect(44, 2, 5, 12, METAL);
  p.rect(44, 2, 5, 2, METAL_D);
  p.rect(45, 0, 3, 3, METAL_L);
  // hopper (rear)
  p.rect(62, 10, 14, 22, METAL);
  p.rect(62, 10, 14, 2, METAL_L);
  p.rect(64, 12, 10, 16, METAL_D);
  // hazard stripes on hull skirt
  for (let x = 12; x < 60; x += 6) {
    p.line(x, 34, x + 3, 37, x % 12 === 0 ? YELLOW : DARK);
  }
  // headlamp mount (front left)
  p.rect(6, 16, 5, 8, METAL);
  p.rect(7, 17, 3, 6, LIGHT);
  // patches & wear by damage level
  for (let i = 0; i < damage * 5 + 1; i++) {
    const x = 12 + Math.floor(rnd() * 48);
    const y = 15 + Math.floor(rnd() * 20);
    p.rect(x, y, 2 + Math.floor(rnd() * 3), 2, i % 2 ? RUST : shade(BODY, -0.35));
  }
  if (damage >= 1) {
    p.rect(20, 12, 1, 4, DARK); // crack in cabin frame
    p.rect(52, 22, 4, 1, DARK);
  }
  if (damage >= 2) {
    p.rect(30, 20, 6, 5, METAL_D); // welded plate
    p.line(33, 20, 33, 24, METAL_L);
    p.rect(16, 30, 3, 3, DARK);
  }
  p.outline(hex("#1a130c"));
  return p;
}

/** Tracks — 80x14, two frames (tread phase). */
export function rigTracks(phase: number): Px {
  const p = new Px(80, 14);
  p.rect(8, 1, 58, 11, TIRE);
  for (let x = 8; x < 66; x++) {
    p.set(x, 1, shade(TIRE, 0.2));
    p.set(x, 11, shade(TIRE, -0.3));
  }
  // road wheels
  for (const wx of [16, 30, 44, 58]) {
    p.disc(wx, 6, 3.4, METAL);
    p.disc(wx, 6, 1.6, METAL_D);
    p.set(wx - 1, 5, METAL_L);
  }
  // treads (phase shifts pattern)
  for (let x = 8; x < 66; x += 3) {
    const xx = ((x + phase * 3) - 8) % 58;
    p.set(8 + ((xx % 58) + 58) % 58, 0, METAL_L);
    p.set(8 + ((xx % 58) + 58) % 58, 12, METAL_D);
  }
  p.outline(hex("#101014"));
  return p;
}

const TOOL_SPECS: Record<string, { w: number; h: number; draw: (p: Px, frame: number) => void }> = {
  auger: {
    w: 24, h: 24,
    draw: (p, f) => {
      // small cone auger with rotation flecks
      for (let y = 4; y < 22; y++) {
        const t = (y - 4) / 18;
        const w = Math.max(1, Math.round(9 * (1 - t)));
        for (let x = 12 - w; x <= 12 + w; x++) p.set(x, y, y % 3 === (f % 3) ? METAL_L : METAL);
      }
      p.rect(10, 0, 5, 6, BODY);
      p.rect(10, 0, 5, 2, BODY_L);
      p.set(12, 21, METAL_D);
    },
  },
  twin: {
    w: 28, h: 26,
    draw: (p, f) => {
      for (const cx of [8, 19]) {
        for (let y = 6; y < 24; y++) {
          const t = (y - 6) / 18;
          const w = Math.max(1, Math.round(4.5 * (1 - t)));
          for (let x = cx - w; x <= cx + w; x++) p.set(x, y, (y + cx) % 3 === f % 3 ? METAL_L : METAL);
        }
        p.rect(cx - 2, 2, 5, 6, BODY);
      }
      p.rect(2, 0, 24, 4, METAL);
      p.rect(2, 0, 24, 1, METAL_L);
    },
  },
  hammer: {
    w: 28, h: 26,
    draw: (p, f) => {
      // piston ram
      const ext = f % 2 === 0 ? 0 : 3;
      p.rect(10, 0, 8, 8, BODY);
      p.rect(11, 8 + ext, 6, 10, METAL);
      p.rect(9, 17 + ext, 10, 6, METAL_L);
      p.rect(9, 22 + ext, 10, 2, METAL_D);
      for (let i = 0; i < 3; i++) p.set(12 + i * 2, 19 + ext, DARK);
    },
  },
  thermal: {
    w: 28, h: 26,
    draw: (p, f) => {
      p.rect(10, 0, 8, 8, METAL);
      // nozzle
      for (let y = 8; y < 18; y++) {
        const w = 2 + Math.round((y - 8) / 3);
        for (let x = 14 - w; x <= 14 + w; x++) p.set(x, y, METAL);
      }
      // flame
      const fl = 5 + (f % 2) * 3;
      for (let y = 17; y < 17 + fl; y++) {
        const w = Math.max(1, 3 - Math.floor((y - 17) / 2));
        for (let x = 14 - w; x <= 14 + w; x++) {
          p.set(x, y, y < 19 ? hex("#f8f0b0") : y < 21 ? hex("#f0a040") : hex("#e05828"));
        }
      }
      p.rect(12, 2, 4, 2, hex("#f0a040"));
    },
  },
  seismic: {
    w: 30, h: 28,
    draw: (p, f) => {
      p.rect(8, 2, 14, 10, METAL);
      p.rect(8, 2, 14, 2, METAL_L);
      // capacitor cells glowing by frame
      for (let i = 0; i < 3; i++) {
        p.rect(10 + i * 4, 4, 3, 6, i === f % 3 ? YELLOW : shade(YELLOW, -0.4));
      }
      // driver spike
      p.rect(12, 12, 6, 8, METAL_D);
      p.rect(13, 20, 4, 6, METAL_L);
      p.set(14, 26, DARK); p.set(15, 26, DARK);
    },
  },
  rotary: {
    w: 32, h: 30,
    draw: (p, f) => {
      // wide cutting drum
      p.rect(2, 12, 28, 12, METAL);
      p.rect(2, 12, 28, 2, METAL_L);
      // teeth around drum, rotating
      for (let i = 0; i < 8; i++) {
        const tx = 3 + ((i * 4 + f * 2) % 26);
        p.rect(tx, 10, 2, 3, METAL_L);
        p.rect(tx, 23, 2, 2, METAL_D);
      }
      p.rect(10, 0, 12, 8, BODY);
      p.rect(10, 0, 12, 2, BODY_L);
      p.rect(12, 2, 8, 4, METAL_D);
    },
  },
  resonator: {
    w: 30, h: 28,
    draw: (p, f) => {
      p.rect(11, 0, 8, 8, METAL);
      // tuning fork prongs
      const spread = f % 2 === 0 ? 0 : 1;
      for (const px of [8 - spread, 20 + spread]) {
        p.rect(px, 8, 3, 14, METAL_L);
        p.set(px, 22, hex("#c8f0f8"));
      }
      p.rect(9, 8, 12, 3, METAL);
      // hum glow
      p.set(14, 12, hex("#a8e8f0")); p.set(15, 12, hex("#a8e8f0"));
      p.set(14, 16, hex("#d0f4f8"));
    },
  },
  maw: {
    w: 36, h: 32,
    draw: (p, f) => {
      // housing
      p.rect(8, 0, 20, 10, METAL);
      p.rect(8, 0, 20, 2, METAL_L);
      p.rect(10, 2, 4, 3, hex("#e05828"));
      // giant maw: two tooth rows opening/closing
      const gap = 1 + (f % 2) * 2;
      for (let i = 0; i < 6; i++) {
        const tx = 4 + i * 5;
        // upper teeth
        p.line(tx, 10, tx + 3, 14 + gap, METAL_L);
        p.line(tx, 10, tx + 1, 14 + gap, METAL);
        // lower teeth
        p.line(tx + 4, 30, tx + 1, 24 - gap, METAL_L);
        p.line(tx + 4, 30, tx + 3, 24 - gap, METAL);
      }
      // throat glow
      p.rect(14, 15 + gap, 8, 8 - gap, hex("#e05828", 200));
      p.rect(16, 16 + gap, 4, 4, hex("#f8d048"));
    },
  },
};

export function rigTool(key: string, frame: number): Px {
  const spec = TOOL_SPECS[key];
  const p = new Px(spec.w, spec.h);
  spec.draw(p, frame);
  p.outline(hex("#181410"));
  return p;
}

/** Headlamp cone (additive). */
export function rigLamp(): Px {
  const p = new Px(48, 40);
  for (let y = 0; y < 40; y++) {
    const w = 2 + (y / 40) * 20;
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, 90 - (y / 40) * 80 - (x / w) * 30);
      p.set(x, y, hex("#ffe8a8", Math.round(a)));
    }
  }
  return p;
}

/** Cargo-full bulge overlay (rear hopper). */
export function rigCargo(): Px {
  const p = new Px(18, 18);
  p.rect(1, 4, 16, 12, hex("#7d5a3a"));
  p.rect(1, 4, 16, 2, hex("#9a744c"));
  for (let i = 0; i < 8; i++) {
    const x = 2 + Math.floor(hashpix(i, 1, 55) * 14);
    const y = 6 + Math.floor(hashpix(1, i, 55) * 8);
    p.set(x, y, i % 2 ? hex("#e8c84a") : hex("#d07840"));
  }
  p.outline(hex("#1a130c"));
  return p;
}

/** Vacuum ring (2 sizes) drawn as arcs. */
export function rigVacuum(size: number): Px {
  const d = size * 2;
  const p = new Px(d, d);
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    const r = size - 1 - (a % 3);
    const x = Math.round(d / 2 + Math.cos(ang) * r);
    const y = Math.round(d / 2 + Math.sin(ang) * r);
    p.set(x, y, hex("#bfe8f0", 120));
  }
  return p;
}

/** Seismic charge (placed item). */
export function chargeSprite(): Px {
  const p = new Px(8, 8);
  p.rect(1, 1, 6, 6, hex("#c03828"));
  p.rect(1, 1, 6, 2, hex("#e05838"));
  p.rect(3, 3, 2, 2, YELLOW);
  p.outline(hex("#180c08"));
  return p;
}
