/**
 * DEEPER — blocked-site memory.
 * When the rig meaningfully meets something it cannot break, the map remembers.
 * When an upgrade makes old markers vulnerable, the player is told — and gets
 * to choose the revenge tour. This manufactures before/after comparisons.
 */

import { mat } from "./materials";
import { toolMaxTier } from "./materials";
import type { EventBus } from "./events";

export interface BlockedSite {
  x: number;
  y: number;
  mat: number;
  /** Tool tier required to break it (mat tier). */
  requiredTier: number;
  /** Set once a capability makes it vulnerable. */
  vulnerable: boolean;
  /** Cooldown so one wall doesn't spam markers while drilling. */
}

const MARK_COOLDOWN_CELLS = new Set<string>();

export class BlockedSites {
  sites = new Map<string, BlockedSite>();
  bus: EventBus;
  /** Highest tool tier ever announced as "now vulnerable". */
  lastAnnouncedTier = -1;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  key(x: number, y: number): string {
    // cluster into 8x8 cells so one wall = one marker
    return `${x >> 3},${y >> 3}`;
  }

  /** Called when the rig hits a cell its tool cannot scratch. */
  reportBlocked(x: number, y: number, matId: number, toolTier: number) {
    const d = mat(matId);
    if (d.tier > 8 || d.tier <= toolTier) return;
    const k = this.key(x, y);
    if (MARK_COOLDOWN_CELLS.has(k)) return;
    MARK_COOLDOWN_CELLS.add(k);
    if (!this.sites.has(k)) {
      this.sites.set(k, { x, y, mat: matId, requiredTier: d.tier, vulnerable: false });
      this.bus.emit({ type: "blockedMarked", x, y, mat: matId });
    }
  }

  /** After a new capability: re-evaluate markers, emit one summary event. */
  reevaluate(toolTier: number, extraBreakable?: (site: BlockedSite) => boolean): number {
    let count = 0;
    for (const site of this.sites.values()) {
      if (!site.vulnerable && site.requiredTier <= toolTier) {
        site.vulnerable = true;
        count++;
      } else if (!site.vulnerable && extraBreakable?.(site)) {
        site.vulnerable = true;
        count++;
      }
    }
    if (count > 0) this.bus.emit({ type: "nowVulnerable", count });
    this.lastAnnouncedTier = Math.max(this.lastAnnouncedTier, toolTier);
    return count;
  }

  /** Sites that are newly vulnerable and not yet known-broken. */
  pendingVulnerable(): BlockedSite[] {
    return [...this.sites.values()].filter((s) => s.vulnerable);
  }

  serialize(): BlockedSite[] {
    return [...this.sites.values()];
  }
  load(list: BlockedSite[] | undefined) {
    this.sites = new Map();
    if (!list) return;
    for (const s of list) this.sites.set(this.key(s.x, s.y), s);
  }
}

export { toolMaxTier };
