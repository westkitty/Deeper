/**
 * DEEPER — save/load. localStorage persistence:
 * deterministic base world + player deltas + all progression state.
 * Destroyed terrain, collected finds, upgrades, base stage, markers and
 * environmental state survive save/load/reload.
 *
 * v2 (iteration 1): checksum + automatic backup slot + migration from v1 +
 * export/import as JSON files. Corrupt saves fall back to the backup.
 */

import { SAVE_KEY, SAVE_VERSION } from "../config";
import type { GameSim } from "./game";
import { log } from "../log";

export interface SaveData {
  v: 1 | 2;
  seed: number;
  playtime: number;
  world: ReturnType<GameSim["serializeWorld"]>;
  rig: {
    x: number; y: number; hp: number; money: number; toolTier: number; ownedTools: number;
    cargo: [string, number][]; blueprints: string[]; relics: string[]; upgrades: string[];
    charges: number;
  };
  economy: { lifetimeEarned: number };
  base: { stage: number; stops: string[]; valves: string[] };
  blocked: ReturnType<GameSim["serializeBlocked"]>;
  wow: string[];
  caches: { id: number; used: boolean }[];
  landmarks: { key: string; x: number; discovered: boolean }[];
  stats: ReturnType<GameSim["serializeStats"]>;
  drainOpen: boolean;
  /** v2 fields */
  checksum?: string;
  savedAt?: number;
  assistMode?: boolean;
  deathCaches?: { x: number; y: number; cargo: [string, number][] }[];
}

const BACKUP_KEY = `${SAVE_KEY}.backup`;

function checksumOf(payload: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h1 ^= payload.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16);
}

function migrate(raw: SaveData): SaveData {
  if (raw.v === 1) {
    log.info("save", "migrating v1 save to v2");
    raw.v = 2;
    raw.savedAt = Date.now();
    raw.assistMode = false;
    raw.deathCaches = [];
  }
  return raw;
}

export function saveGame(sim: GameSim): boolean {
  try {
    const data = sim.serialize() as SaveData;
    data.v = SAVE_VERSION as 2;
    data.savedAt = Date.now();
    const payload = JSON.stringify({ ...data, checksum: undefined });
    data.checksum = checksumOf(payload);
    const out = JSON.stringify(data);
    // rotate current → backup before overwriting
    try {
      const prev = localStorage.getItem(SAVE_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
    } catch { /* ignore */ }
    localStorage.setItem(SAVE_KEY, out);
    return true;
  } catch (e) {
    log.warn("save", "save failed", e);
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

function parseSlot(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.v === 2 && data.checksum) {
      const { checksum, ...rest } = data;
      void checksum;
      const payload = JSON.stringify(rest);
      if (checksumOf(payload) !== data.checksum) {
        log.warn("save", "checksum mismatch — treating slot as corrupt");
        return null;
      }
    }
    return migrate(data);
  } catch (e) {
    log.warn("save", "parse failed", e);
    return null;
  }
}

export function loadSaveData(): SaveData | null {
  try {
    const primary = parseSlot(localStorage.getItem(SAVE_KEY));
    if (primary) return primary;
    log.warn("save", "primary slot unreadable — trying backup");
    const backup = parseSlot(localStorage.getItem(BACKUP_KEY));
    if (backup) {
      // restore backup into primary
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(backup)); } catch { /* ignore */ }
      return backup;
    }
    return null;
  } catch (e) {
    log.warn("save", "load failed", e);
    return null;
  }
}

/** Save summary for the title screen (depth/money/time without full load). */
export function saveSummary(): { money: number; depth: number; playtime: number; savedAt: number } | null {
  const d = loadSaveData();
  if (!d) return null;
  return {
    money: d.rig.money,
    depth: Math.max(0, Math.floor(d.rig.y) - 8),
    playtime: d.playtime,
    savedAt: d.savedAt ?? 0,
  };
}

export function exportSave(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function importSave(json: string): boolean {
  const d = parseSlot(json);
  if (!d) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // ignore
  }
}
