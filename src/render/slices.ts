/**
 * DEEPER — texture slicing. Loads the generated sheets and registers every
 * manifest frame as a named Phaser frame so sprites address art by name.
 */

import Phaser from "phaser";
import manifest from "../../public/assets/asset-manifest.json";

export const FRAMES = manifest as unknown as {
  sheets: Record<string, { file: string; size: [number, number] }>;
  frames: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>;
  animations: Record<string, { sheet: string; frames: string[]; fps: number; loop: boolean }>;
};

export function loadSheets(scene: Phaser.Scene) {
  for (const [key, sheet] of Object.entries(FRAMES.sheets)) {
    scene.load.image(`sheet_${key}`, sheet.file);
  }
}

/** Register manifest frames on Phaser textures. Call after load completes. */
export function sliceAll(scene: Phaser.Scene) {
  for (const sheetKey of Object.keys(FRAMES.sheets)) {
    const texKey = `sheet_${sheetKey}`;
    if (!scene.textures.exists(texKey)) continue;
    const tex = scene.textures.get(texKey);
    for (const [name, f] of Object.entries(FRAMES.frames)) {
      if (f.sheet !== sheetKey) continue;
      if (!tex.has(name)) {
        tex.add(name, 0, f.x, f.y, f.w, f.h);
      }
    }
  }
}

/** Frame name lists for animation groups. */
export function animFrames(key: string): string[] {
  return FRAMES.animations[key]?.frames ?? [];
}
