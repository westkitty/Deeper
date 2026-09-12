/**
 * DEEPER — save/load. localStorage persistence:
 * deterministic base world + player deltas + all progression state.
 * Destroyed terrain, collected finds, upgrades, base stage, markers and
 * environmental state survive save/load/reload.
 */

import { SAVE_KEY } from "../config";
import type { GameSim } from "./game";

export interface SaveData {
  v: 1;
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
}

export function saveGame(sim: GameSim): boolean {
  try {
    const data = sim.serialize();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("save failed", e);
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

export function loadSaveData(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch (e) {
    console.warn("load failed", e);
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
