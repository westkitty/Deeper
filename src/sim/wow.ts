/**
 * DEEPER — wow trigger state machine.
 * Each formal beat has mechanical preconditions and a permanent payoff flag.
 * The presentation layer listens for `wow` events to stage audiovisuals.
 */

import { CHUNK, type StratumId } from "../config";
import { M, mat } from "./materials";
import { stratumRank, type BaseProgress } from "./base";
import type { EventBus } from "./events";
import type { World } from "./world";
import type { LandmarkInstance } from "./worldgen";

export type WowKey =
  | "wow01_vein" // first connected vein broken
  | "wow02_wall" // met an unbreakable wall (via blocked-site marker)
  | "wow03_drill" // first real drill purchased
  | "wow04_excavator" // uncovered the buried excavator
  | "wow05_vault" // broke into the sealed vault
  | "wow06_drain" // opened the drainage route
  | "wow06_bell" // sunken bell exposed
  | "wow07_chain" // large authored chain reaction
  | "wow08_choir" // resonance cascade in the Glass Choir
  | "wow09_base" // base reached industrial stage
  | "wow10_revenge" // returned dominance demonstrated
  | "wow11_maw" // THE MAW purchased
  | "wow12_depth"; // finale cross-section

export class WowState {
  seen = new Set<string>();
  bus: EventBus;
  /** WOW-07 tracking: destruction caused by a single cascade. */
  largestCascade = 0;
  private cascadeWindow = 0;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  trigger(key: WowKey) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.bus.emit({ type: "wow", key });
    return true;
  }

  has(key: WowKey): boolean {
    return this.seen.has(key);
  }

  /** Called on every terrain break; watches cascade size (systemic wow). */
  noteBreak(fromChain: boolean) {
    if (fromChain) this.cascadeWindow += 8;
  }
  /** Call once per tick; decays the cascade window. */
  tickCascade(): number {
    this.cascadeWindow = Math.max(0, this.cascadeWindow - 1);
    if (this.cascadeWindow > this.largestCascade) this.largestCascade = this.cascadeWindow;
    if (this.cascadeWindow >= 40) {
      const fired = this.trigger("wow07_chain");
      if (fired) this.cascadeWindow = 0;
    }
    return this.cascadeWindow;
  }

  /**
   * WOW-04: the excavator counts as revealed once the player has uncovered
   * a meaningful portion of its footprint (views open cells adjacent to it).
   */
  checkExcavator(world: World, inst: LandmarkInstance): boolean {
    if (this.has("wow04_excavator")) return false;
    let open = 0;
    const step = 3;
    for (let y = inst.y; y < inst.y + inst.h; y += step) {
      for (let x = inst.x; x < inst.x + inst.w; x += step) {
        // sample: cell open OR any 4-neighbour open
        if (
          world.get(x, y) === M.AIR ||
          world.get(x + 1, y) === M.AIR || world.get(x - 1, y) === M.AIR ||
          world.get(x, y + 1) === M.AIR || world.get(x, y - 1) === M.AIR
        ) open++;
      }
    }
    const total = Math.ceil(inst.w / step) * Math.ceil(inst.h / step);
    if (open >= total * 0.34) {
      return this.trigger("wow04_excavator");
    }
    return false;
  }

  /** WOW-05: vault entered (interior cell reached). */
  checkVaultEntry(world: World, inst: LandmarkInstance, px: number, py: number): boolean {
    if (this.has("wow05_vault")) return false;
    const cx = inst.x + inst.w / 2;
    const cy = inst.y + inst.h / 2;
    if (Math.abs(px - cx) < inst.w / 2 && Math.abs(py - cy) < inst.h / 2) {
      // confirm interior is actually breached: an open path cell inside
      const i = Math.floor(cx) + Math.floor(cy) * world.w;
      if (world.tiles[i] === M.AIR || mat(world.tiles[i]).tier <= 8) {
        return this.trigger("wow05_vault");
      }
    }
    return false;
  }

  /** WOW-06: water coverage around the sunken bell dropped below 30%. */
  checkBellExposed(world: World, inst: LandmarkInstance): boolean {
    if (this.has("wow06_bell")) return false;
    let wet = 0;
    let total = 0;
    for (let y = inst.y; y < inst.y + inst.h; y++) {
      for (let x = inst.x; x < inst.x + inst.w; x++) {
        if (!world.inBounds(x, y)) continue;
        total++;
        if (world.liquid[x + y * world.w] !== 0 && world.liqLevel[x + y * world.w] >= 3) wet++;
      }
    }
    if (total > 0 && wet / total < 0.3) {
      return this.trigger("wow06_bell");
    }
    return false;
  }

  /** WOW-08: resonance cascade ≥ 60 cells in one pulse. */
  checkResonance(cells: number): boolean {
    if (cells >= 60) {
      return this.trigger("wow08_choir");
    }
    return false;
  }

  /** WOW-09: base became industrial (stage >= refinery). */
  checkBase(base: BaseProgress): boolean {
    if (base.stage >= 2) {
      return this.trigger("wow09_base");
    }
    return false;
  }

  /** WOW-10: late tool destroyed many early-stratum cells recently. */
  checkRevenge(depthRow: number, cellsRecentlyDestroyed: number, stratum: StratumId): boolean {
    if (stratumRank(stratum) <= 1 && cellsRecentlyDestroyed >= 26) {
      return this.trigger("wow10_revenge");
    }
    void depthRow;
    return false;
  }

  serialize(): string[] {
    return [...this.seen];
  }
  load(list: string[] | undefined) {
    this.seen = new Set(list ?? []);
  }
}

/** Map chunk coords for wow markers. */
export function chunkAnchor(x: number, y: number): { cx: number; cy: number } {
  return { cx: (x / CHUNK) | 0, cy: (y / CHUNK) | 0 };
}
