/**
 * DEEPER — economy: selling cargo, upgrade purchases, tool purchases.
 * Three value channels: money, materials, blueprints. No crafting soup.
 */

import { RESOURCES } from "./resources";
import { TOOLS, UPGRADES, upgrade as upgradeDef, type UpgradeDef } from "./tools";
import type { Rig } from "./rig";
import type { EventBus } from "./events";

export class Economy {
  bus: EventBus;
  rig: Rig;
  lifetimeEarned = 0;
  /** Cartographer bonus: +1% sell per 5 landmarks, capped at +15%. */
  landmarksFound = 0;
  /** Price ticker: depth-flavored variance seed (deterministic per session). */
  tickerSeed = 1;

  constructor(rig: Rig, bus: EventBus) {
    this.rig = rig;
    this.bus = bus;
    this.tickerSeed = (Date.now() ^ 0x5f3d) >>> 0;
  }

  refineryMul(): number {
    return 1 + 0.25 * this.rig.fx().refinery;
  }

  cartographerMul(): number {
    return 1 + Math.min(0.15, Math.floor(this.landmarksFound / 5) * 0.01);
  }

  /** Depth-flavored price variance: ±6% deterministic wobble per resource.
   * Surface sales (depthRow <= 8) stay at list price for a stable early game;
   * deep-cache buyers and future outposts use the ticker. */
  tickerMul(res: string, depthRow: number): number {
    if (depthRow <= 8) return 1;
    let h = this.tickerSeed;
    for (let i = 0; i < res.length; i++) h = Math.imul(h ^ res.charCodeAt(i), 2654435761);
    h = Math.imul(h ^ depthRow, 2246822519) >>> 0;
    return 0.94 + (h % 13) / 100;
  }

  /** Sell everything in the hopper at the works. Returns money gained. */
  sellAll(depthRow = 8): number {
    const mul = this.refineryMul() * this.cartographerMul();
    let total = 0;
    let units = 0;
    for (const [res, amount] of this.rig.cargo) {
      total += Math.round(amount * RESOURCES[res].value * mul * this.tickerMul(res, depthRow));
      units += amount;
    }
    if (total <= 0) return 0;
    // bulk bonus: full-hopper hauls pay 10% extra
    if (units >= 50) total = Math.round(total * 1.1);
    this.rig.cargo.clear();
    this.rig.money += total;
    this.lifetimeEarned += total;
    this.bus.emit({ type: "sell", money: total });
    return total;
  }

  canAffordTool(tier: number): boolean {
    const td = TOOLS[tier];
    if (!td) return false;
    if (tier !== this.rig.ownedTools + 1) return false;
    if (this.rig.money < td.cost.money) return false;
    if (td.cost.mats) {
      for (const [res, n] of Object.entries(td.cost.mats)) {
        if ((this.rig.cargo.get(res) ?? 0) < n) return false;
      }
    }
    if (td.cost.blueprints) {
      for (const bp of td.cost.blueprints) {
        if (!this.rig.blueprints.has(bp)) return false;
      }
    }
    return true;
  }

  buyTool(tier: number): boolean {
    if (!this.canAffordTool(tier)) return false;
    const td = TOOLS[tier];
    this.rig.money -= td.cost.money;
    if (td.cost.mats) {
      for (const [res, n] of Object.entries(td.cost.mats)) {
        this.rig.cargo.set(res, (this.rig.cargo.get(res) ?? 0) - n);
        if ((this.rig.cargo.get(res) ?? 0) <= 0) this.rig.cargo.delete(res);
      }
    }
    this.rig.ownedTools = tier;
    this.rig.toolTier = tier;
    this.bus.emit({ type: "toolBought", tier });
    return true;
  }

  upgradeUnlocked(u: UpgradeDef): boolean {
    if (!u.requires) return true;
    return this.rig.upgrades.has(u.requires);
  }

  canAffordUpgrade(key: string): boolean {
    const u = upgradeDef(key);
    if (!u || this.rig.upgrades.has(key) || !this.upgradeUnlocked(u)) return false;
    if (this.rig.money < u.cost.money) return false;
    if (u.cost.mats) {
      for (const [res, n] of Object.entries(u.cost.mats)) {
        if ((this.rig.cargo.get(res) ?? 0) < n) return false;
      }
    }
    return true;
  }

  buyUpgrade(key: string): boolean {
    if (!this.canAffordUpgrade(key)) return false;
    const u = upgradeDef(key)!;
    this.rig.money -= u.cost.money;
    if (u.cost.mats) {
      for (const [res, n] of Object.entries(u.cost.mats)) {
        this.rig.cargo.set(res, (this.rig.cargo.get(res) ?? 0) - n);
        if ((this.rig.cargo.get(res) ?? 0) <= 0) this.rig.cargo.delete(res);
      }
    }
    this.rig.upgrades.add(key);
    this.bus.emit({ type: "upgradeBought", key });
    return true;
  }

  availableUpgrades(): UpgradeDef[] {
    return UPGRADES.filter((u) => !this.rig.upgrades.has(u.key) && this.upgradeUnlocked(u));
  }
}
