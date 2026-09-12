/**
 * DEEPER asset pipeline entry point.
 * Generates every PNG the game ships with, plus public/assets/asset-manifest.json.
 * Deterministic: same code + seed → identical bytes.
 *
 * Run: npm run assets
 * Check (CI): npm run assets -- --check  → regenerates in a temp dir and compares
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { Px } from "./pixutil";
import { buildTerrain } from "./art";
import { rigChassis, rigTracks, rigTool, rigLamp, rigCargo, rigVacuum, chargeSprite } from "./art-rig";
import { THREAT_DRAWERS, resourceIcon, relicIcon, uiIcon, blueprintIcon } from "./art-entities";
import { buildProps, buildBase, buildVFX, logo, favicon } from "./art-world";
import { RELICS } from "../src/sim/resources";

const ROOT = path.resolve(__dirname, "..");
const PUB = path.join(ROOT, "public", "assets");
const CHECK = process.argv.includes("--check");

interface FrameInfo { x: number; y: number; w: number; h: number }

class Sheet {
  frames = new Map<string, FrameInfo>();
  private items: { name: string; px: Px }[] = [];
  private cursorX = 1;
  private cursorY = 1;
  private rowH = 0;
  private maxW = 16;
  constructor(public name: string) {}
  add(name: string, px: Px) {
    if (this.cursorX + px.w + 1 > 1024) {
      this.cursorX = 1;
      this.cursorY += this.rowH + 1;
      this.rowH = 0;
    }
    this.frames.set(name, { x: this.cursorX, y: this.cursorY, w: px.w, h: px.h });
    this.items.push({ name, px });
    this.cursorX += px.w + 1;
    this.maxW = Math.max(this.maxW, this.cursorX);
    this.rowH = Math.max(this.rowH, px.h);
  }
  write(outDir: string): { file: string; size: [number, number] } {
    const w = Math.min(1024, this.maxW);
    const h = this.cursorY + this.rowH + 1;
    const out = new Px(w, h);
    for (const { name, px } of this.items) {
      const f = this.frames.get(name)!;
      out.paste(px, f.x, f.y);
    }
    const file = path.join(outDir, this.name + ".png");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out.toPNG());
    return { file: `assets/${this.name}.png`, size: [out.w, out.h] as [number, number] };
  }
}

function main() {
  const outDir = CHECK ? fs.mkdtempSync("/tmp/deeper-assets-") : PUB;
  const sheets: Record<string, Sheet> = {
    terrain: new Sheet("terrain"),
    rig: new Sheet("rig"),
    enemies: new Sheet("enemies"),
    icons: new Sheet("icons"),
    props: new Sheet("props"),
    vfx: new Sheet("vfx"),
  };

  const manifest: {
    generated: string;
    generator: string;
    sheets: Record<string, { file: string; size: [number, number] }>;
    frames: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>;
    animations: Record<string, { sheet: string; frames: string[]; fps: number; loop: boolean }>;
  } = {
    generated: "deterministic",
    generator: "tools/gen-assets.ts",
    sheets: {},
    frames: {},
    animations: {},
  };

  const S = (k: string) => sheets[k];
  const reg = (sheetKey: string) => (name: string, px: Px) => S(sheetKey).add(name, px);
  const anim = (sheetKey: string, key: string, frames: string[], fps: number, loop: boolean) => {
    manifest.animations[key] = { sheet: sheets[sheetKey].name, frames, fps, loop };
  };

  // ---- terrain ------------------------------------------------------------
  buildTerrain(reg("terrain"));

  // ---- rig ------------------------------------------------------------------
  const rig = S("rig");
  rig.add("chassis_0", rigChassis(0));
  rig.add("chassis_1", rigChassis(1));
  rig.add("chassis_2", rigChassis(2));
  rig.add("tracks_0", rigTracks(0));
  rig.add("tracks_1", rigTracks(1));
  rig.add("tracks_2", rigTracks(2));
  rig.add("tracks_3", rigTracks(3));
  rig.add("lamp", rigLamp());
  rig.add("cargo_full", rigCargo());
  rig.add("vacuum_1", rigVacuum(10));
  rig.add("vacuum_2", rigVacuum(14));
  rig.add("charge", chargeSprite());
  const TOOL_KEYS = ["auger", "twin", "hammer", "thermal", "seismic", "rotary", "resonator", "maw"];
  for (const key of TOOL_KEYS) {
    const names: string[] = [];
    const frames = key === "maw" ? 3 : key === "rotary" ? 3 : key === "thermal" ? 2 : 2;
    for (let f = 0; f < frames; f++) {
      const n = `tool_${key}_${f}`;
      rig.add(n, rigTool(key, f));
      names.push(n);
    }
    anim("rig", `tool_${key}`, names, key === "auger" ? 6 : 12, true);
  }
  anim("rig", "tracks_drive", ["tracks_0", "tracks_1", "tracks_2", "tracks_3"], 10, true);

  // ---- enemies ----------------------------------------------------------------
  const enemies = S("enemies");
  for (const [family, draw] of Object.entries(THREAT_DRAWERS)) {
    const move: string[] = [];
    for (const f of [0, 1]) {
      const n = `${family}_move_${f}`;
      enemies.add(n, draw(f));
      move.push(n);
    }
    anim("enemies", `${family}_move`, move, 5, true);
    enemies.add(`${family}_attack`, draw(2));
    enemies.add(`${family}_hit`, draw(3));
    enemies.add(`${family}_death_0`, draw(4));
    enemies.add(`${family}_death_1`, draw(5));
  }

  // ---- icons: resources, relics, UI ----------------------------------------------
  const icons = S("icons");
  for (const key of Object.keys({
    copper: 1, coal: 1, iron: 1, nickel: 1, clay: 1, hardwood: 1, amber: 1, railsalvage: 1,
    aggregate: 1, steel: 1, conduit: 1, silver: 1, gold: 1, tungsten: 1, pressglass: 1,
    brinepearl: 1, sulfur: 1, obsshard: 1, quartz: 1, voidgem: 1, composite: 1, alloy: 1, coolant: 1,
  })) {
    icons.add(`res_${key}`, resourceIcon(key));
  }
  icons.add("res_blueprint", blueprintIcon());
  for (const relic of RELICS) {
    icons.add(`relic_${relic.key}`, relicIcon(relic.key));
  }
  const UI_KEYS = ["money", "cargo", "heart", "scanner", "depth", "marker", "charge", "core", "map", "lift", "temp", "press", "shield", "drill", "skull", "star"];
  for (const key of UI_KEYS) {
    icons.add(`ui_${key}`, uiIcon(key));
  }

  // ---- props + base + bg --------------------------------------------------------
  buildProps(reg("props"));
  buildBase(reg("props"));
  buildVFX(reg("vfx"));

  // ---- standalone images ----------------------------------------------------
  fs.mkdirSync(PUB, { recursive: true });
  const logoPng = logo().toPNG();
  const faviconPng = favicon().toPNG();
  if (!CHECK) {
    fs.writeFileSync(path.join(PUB, "logo.png"), logoPng);
    fs.writeFileSync(path.join(PUB, "favicon.png"), faviconPng);
  } else {
    // check mode regenerates into the temp dir for byte comparison
    fs.writeFileSync(path.join(outDir, "logo.png"), logoPng);
    fs.writeFileSync(path.join(outDir, "favicon.png"), faviconPng);
  }

  // ---- write sheets + manifest -------------------------------------------------
  for (const [key, sheet] of Object.entries(sheets)) {
    const info = sheet.write(outDir);
    manifest.sheets[key] = { file: info.file, size: info.size };
    void key;
  }
  for (const sheet of Object.values(sheets)) {
    for (const [name, f] of sheet.frames) {
      manifest.frames[name] = { sheet: sheet.name, x: f.x, y: f.y, w: f.w, h: f.h };
    }
  }
  const manifestPath = CHECK ? path.join(outDir, "asset-manifest.json") : path.join(PUB, "asset-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));

  const fileCount = Object.keys(manifest.frames).length + 2;
  console.log(`generated ${Object.keys(sheets).length + 2} sheets, ${Object.keys(manifest.frames).length} frames, ${Object.keys(manifest.animations).length} animations → ${outDir}`);

  if (CHECK) {
    // compare against committed assets
    const committed = PUB;
    let mismatches = 0;
    for (const f of fs.readdirSync(committed)) {
      if (!f.endsWith(".png") && f !== "asset-manifest.json") continue;
      const a = fs.readFileSync(path.join(committed, f));
      const bPath = path.join(outDir, f);
      if (!fs.existsSync(bPath)) {
        console.error(`missing generated: ${f}`);
        mismatches++;
        continue;
      }
      const b = fs.readFileSync(bPath);
      if (!a.equals(b)) {
        console.error(`out of date: ${f}`);
        mismatches++;
      }
    }
    fs.rmSync(outDir, { recursive: true, force: true });
    if (mismatches > 0) {
      console.error(`asset check FAILED: ${mismatches} files. Run \`npm run assets\` and commit.`);
      process.exit(1);
    }
    console.log(`asset check OK: ${fileCount} committed files match generator output.`);
  }
}

main();
