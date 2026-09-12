/**
 * DEEPER — surface base ("The Works") progression.
 * The worksite physically grows: six visible stages, each unlocked by real
 * milestones. Unlocked functions correspond to visible structures.
 */

import { stratumAtRow, type StratumId } from "../config";
import type { EventBus } from "./events";

export const BASE_STAGES = [
  { key: "shack", name: "The Shack", need: null as string | null, desc: "A tarp, a buyer with a scale, and a hole in the ground." },
  { key: "workshop", name: "The Workshop", need: "earn:1200", desc: "Walls go up. The buyer gets a canopy. First refinery pad poured." },
  { key: "refinery", name: "Refinery Works", need: "upgrade:refinery1", desc: "The refinery physically stands at the works. Ore sells for more." },
  { key: "machinebay", name: "Machine Bay", need: "tool:4", desc: "A gantry over the shaft. The rig gets proper service space." },
  { key: "freight", name: "Freight Tower", need: "upgrade:lift", desc: "The lift headframe towers over the works. Ore moves by cable now." },
  { key: "campus", name: "Excavation Campus", need: "stratum:enginedeep", desc: "The works is an industrial campus. It started as a tarp." },
] as const;

export class BaseProgress {
  stage = 0;
  bus: EventBus;
  liftStops = new Set<string>();
  valvesUsed = new Set<string>();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /** Evaluate thresholds after any progression event. */
  evaluate(ctx: { lifetimeEarned: number; ownedTools: number; upgrades: Set<string>; deepestStratum: StratumId }) {
    for (let s = this.stage + 1; s < BASE_STAGES.length; s++) {
      const need = BASE_STAGES[s].need;
      if (!need) continue;
      const [kind, arg] = need.split(":");
      const ok =
        (kind === "earn" && ctx.lifetimeEarned >= Number(arg)) ||
        (kind === "tool" && ctx.ownedTools >= Number(arg)) ||
        (kind === "upgrade" && ctx.upgrades.has(arg)) ||
        (kind === "stratum" && stratumRank(ctx.deepestStratum) >= stratumRank(arg as StratumId));
      if (ok) {
        this.stage = s;
        this.bus.emit({ type: "baseStage", stage: s });
      } else break;
    }
  }

  serialize() {
    return { stage: this.stage, stops: [...this.liftStops], valves: [...this.valvesUsed] };
  }
  load(d: { stage?: number; stops?: string[]; valves?: string[] } | undefined) {
    if (!d) return;
    this.stage = d.stage ?? 0;
    this.liftStops = new Set(d.stops ?? []);
    this.valvesUsed = new Set(d.valves ?? []);
  }
}

export function stratumRank(st: StratumId): number {
  return ["surface", "rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"].indexOf(st);
}
