/**
 * DEEPER asset pipeline — pixel canvas utilities.
 * Deterministic code-authored pixel art: every committed PNG is produced by
 * these generators (see tools/gen-assets.ts). Same seed → identical pixels.
 */

import { PNG } from "pngjs";

export type RGBA = [number, number, number, number];

export function hex(h: string, a = 255): RGBA {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}
export function shade(c: RGBA, amt: number): RGBA {
  if (amt >= 0) return mix(c, [255, 255, 255, c[3]], amt);
  return mix(c, [0, 0, 0, c[3]], -amt);
}

/** Tiny deterministic PRNG for texture work. */
export function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashpix(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Px {
  w: number;
  h: number;
  data: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  set(x: number, y: number, c: RGBA | 0) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (c === 0) {
      this.data[i + 3] = 0;
      return;
    }
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }
  get(x: number, y: number): RGBA | 0 {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    const i = (y * this.w + x) * 4;
    if (this.data[i + 3] === 0) return 0;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  alphaAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA | 0) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  frame(x: number, y: number, w: number, h: number, c: RGBA | 0) {
    for (let xx = x; xx < x + w; xx++) { this.set(xx, y, c); this.set(xx, y + h - 1, c); }
    for (let yy = y; yy < y + h; yy++) { this.set(x, yy, c); this.set(x + w - 1, yy, c); }
  }
  fill(c: RGBA | 0) {
    this.rect(0, 0, this.w, this.h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA | 0) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.set(x0, y0, c);
      if (Math.round(x0) === Math.round(x1) && Math.round(y0) === Math.round(y1)) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGBA | 0) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, c);
      }
    }
  }
  ring(cx: number, cy: number, r: number, c: RGBA | 0) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d <= r * r && d >= (r - 1.2) * (r - 1.2)) this.set(x, y, c);
      }
    }
  }
  /** 1px outline in c around all non-transparent pixels (4-neighbour). */
  outline(c: RGBA) {
    const src = new Uint8Array(this.data);
    const alphaAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : src[(y * this.w + x) * 4 + 3];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (alphaAt(x, y) > 0) continue;
        if (alphaAt(x - 1, y) > 0 || alphaAt(x + 1, y) > 0 || alphaAt(x, y - 1) > 0 || alphaAt(x, y + 1) > 0) {
          this.set(x, y, c);
        }
      }
    }
  }
  paste(src: Px, dx: number, dy: number, opts?: { alpha?: number; flipX?: boolean }) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const sx = opts?.flipX ? src.w - 1 - x : x;
        const c = src.get(sx, y);
        if (!c) continue;
        const a = (opts?.alpha ?? 1) * c[3];
        if (a >= 255) this.set(dx + x, dy + y, c);
        else if (a > 0) {
          const dst = this.get(dx + x, dy + y);
          const t = a / 255;
          if (dst) this.set(dx + x, dy + y, mix(dst as RGBA, c, t));
          else this.set(dx + x, dy + y, [c[0], c[1], c[2], Math.round(a)]);
        }
      }
    }
  }
  /** Value-noise speckle over existing pixels. */
  speckle(seed: number, amt: number, density = 1) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c || c[3] < 200) continue;
        if (hashpix(x, y, seed) < density) {
          const v = (hashpix(x, y, seed + 7) - 0.5) * 2 * amt;
          this.set(x, y, shade(c, v));
        }
      }
    }
  }
  /** Directional bevel: light from top-left. */
  bevel(strength = 0.18) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        const up = this.alphaAt(x, y - 1) === 0;
        const left = this.alphaAt(x - 1, y) === 0;
        const down = this.alphaAt(x, y + 1) === 0;
        const right = this.alphaAt(x + 1, y) === 0;
        let v = 0;
        if (up) v += strength;
        if (left) v += strength * 0.6;
        if (down) v -= strength;
        if (right) v -= strength * 0.6;
        if (v !== 0) this.set(x, y, shade(c, v));
      }
    }
  }
  clone(): Px {
    const p = new Px(this.w, this.h);
    p.data.set(this.data);
    return p;
  }
  toPNG(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    for (let i = 0; i < this.w * this.h; i++) {
      png.data[i * 4] = this.data[i * 4];
      png.data[i * 4 + 1] = this.data[i * 4 + 1];
      png.data[i * 4 + 2] = this.data[i * 4 + 2];
      png.data[i * 4 + 3] = this.data[i * 4 + 3];
    }
    return PNG.sync.write(png);
  }
  /** String-grid sprite: chars map to colors; '.'/' ' transparent. */
  static fromGrid(rows: string[], map: Record<string, RGBA | 0>): Px {
    const w = Math.max(...rows.map((r) => r.length));
    const p = new Px(w, rows.length);
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        const c = map[ch];
        if (c !== undefined && c !== 0) p.set(x, y, c);
      }
    }
    return p;
  }
}

/** Write PNG buffer to disk path. */
export async function writePNG(path: string, buf: Buffer, fs: typeof import("fs")) {
  fs.mkdirSync(path.replace(/\\/g, "/").split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(path, buf);
}
