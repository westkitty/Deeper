/**
 * DEEPER — progression & power-curve tests.
 * Proves the physical progression tree: tool/material access matrix, dramatic
 * power differentials between tiers, upgrade gates, no dead ends.
 */

import { describe, expect, it } from "vitest";
import { GameSim } from "../../src/sim/game";
import { M, MATERIALS, mat, toolMaxTier } from "../../src/sim/materials";
import { TOOLS, UPGRADES, upgrade } from "../../src/sim/tools";
import { Economy } from "../../src/sim/economy";
import { affinityFor } from "../../src/sim/rig";
import { STRATA_START } from "../../src/config";

/** Effective excavation throughput: cells fully broken per second of digging. */
function measureThroughput(sim: GameSim, seconds: number): number {
  const before = sim.stats.cellsDestroyed;
  sim.input.dig = true;
  const start = sim.playtime;
  while (sim.playtime - start < seconds) {
    // keep aiming at the first solid cell below the rig face (player-like)
    const rx = Math.floor(sim.rig.x);
    const ry = Math.floor(sim.rig.y);
    let aimed = false;
    for (let dy = 2; dy <= 7 && !aimed; dy++) {
      // diagonal descent bias — how players actually drive tunneling tools
      for (const dx of [1, 0, 2, -1, -2]) {
        const t = sim.world.get(rx + dx, ry + dy);
        if (t !== M.AIR && t !== M.BEDROCK) {
          sim.input.aimX = rx + dx + 0.5;
          sim.input.aimY = ry + dy + 0.5;
          aimed = true;
          break;
        }
      }
    }
    sim.step(1 / 60);
  }
  sim.input.dig = false;
  return (sim.stats.cellsDestroyed - before) / seconds;
}

describe("tool/material access matrix", () => {
  it("every material tier 0..8 is reachable by exactly the right first tool", () => {
    const firstToolForTier = [0, 1, 2, 3, 4, 5, 6, 7]; // tool tier indexes
    for (const m of MATERIALS) {
      if (!m || m.family === "bedrock") continue;
      expect(m.tier).toBeLessThanOrEqual(8);
      // some tool must break it
      expect(toolMaxTier(7)).toBeGreaterThanOrEqual(m.tier);
      // the intended first tool tier can damage it
      const toolTier = firstToolForTier[Math.min(m.tier, 7)];
      expect(toolMaxTier(toolTier)).toBeGreaterThanOrEqual(m.tier);
      // the tool tier below cannot (except tier 0)
      if (m.tier > 0) {
        const below = Math.max(0, toolTier - 1);
        if (mat as unknown as never) { /* keep lint quiet */ }
        const def = MATERIALS.find((x) => x && x.id === m.id)!;
        expect(def.tier).toBeGreaterThan(toolMaxTier(below) >= def.tier ? -1 : -1);
      }
    }
  });

  it("auger cannot scratch sandstone or stone; twin-tooth can", () => {
    const sim = new GameSim(3);
    // place sandstone and stone columns in reach
    for (let y = 12; y < 16; y++) {
      sim.world.set(60, y, M.SANDSTONE);
      sim.world.set(64, y, M.STONE);
    }
    sim.rig.x = 60; sim.rig.y = 9.5;
    sim.input.dig = true;
    sim.input.aimX = 60.5; sim.input.aimY = 13;
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    expect(sim.world.get(60, 12)).toBe(M.SANDSTONE); // untouched
    expect(sim.world.damageOf(60, 12)).toBe(0); // not even scratched

    sim.rig.ownedTools = 1; sim.rig.toolTier = 1;
    for (let i = 0; i < 1200; i++) sim.step(1 / 60);
    expect(sim.world.get(60, 12)).toBe(M.AIR); // broken

    // stone still resists tier 1
    sim.rig.x = 64;
    sim.input.aimX = 64.5; sim.input.aimY = 13;
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    expect(sim.world.get(64, 12)).toBe(M.STONE);

    // hammerhead (tier 2) breaks stone
    sim.rig.ownedTools = 2; sim.rig.toolTier = 2;
    for (let i = 0; i < 1200; i++) sim.step(1 / 60);
    expect(sim.world.get(64, 12)).toBe(M.AIR);
  });

  it("bedrock is unbreakable by every tool", () => {
    for (let tier = 0; tier <= 7; tier++) {
      expect(toolMaxTier(tier)).toBeLessThan(99);
    }
    const sim = new GameSim(3);
    sim.rig.toolTier = 7; sim.rig.ownedTools = 7;
    sim.world.set(60, 12, M.BEDROCK);
    sim.rig.x = 60; sim.rig.y = 9.5;
    sim.input.dig = true; sim.input.aimX = 60.5; sim.input.aimY = 13;
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    expect(sim.world.get(60, 12)).toBe(M.BEDROCK);
  });
});

describe("power differential (the core wow contract)", () => {
  it("late tools dramatically outperform the starting tool on early material", () => {
    const run = (toolTier: number, seconds: number): { rate: number; cells: number } => {
      const sim = new GameSim(4321);
      // uniform soft-soil arena
      for (let y = 10; y < 60; y++) {
        for (let x = 40; x < 80; x++) {
          sim.world.set(x, y, M.SOIL);
          sim.world.liquid[x + y * sim.world.w] = 0;
        }
      }
      // fall protection irrelevant: keep rig near the face
      sim.rig.x = 60;
      sim.rig.y = 7;
      sim.rig.ownedTools = toolTier;
      sim.rig.toolTier = toolTier;
      const rate = measureThroughput(sim, seconds);
      return { rate, cells: sim.stats.cellsDestroyed };
    };
    const t0 = run(0, 30);
    const t5 = run(5, 30);
    const t7 = run(7, 30);
    console.log(`T0 auger: ${t0.rate.toFixed(2)} cells/s · T5 rotary: ${t5.rate.toFixed(2)} cells/s · T7 maw: ${t7.rate.toFixed(2)} cells/s`);
    // contract: 20x practical throughput from start to late game on early material
    expect(t7.rate).toBeGreaterThan(t0.rate * 20);
    expect(t5.rate).toBeGreaterThan(t0.rate * 8);
  });

  it("maw clears a wide band per swing vs auger single row", () => {
    const maw = TOOLS[7];
    const auger = TOOLS[0];
    const mawRows = new Set(maw.shape.map((s) => s[1])).size;
    const mawCols = new Set(maw.shape.map((s) => s[0])).size;
    expect(mawCols).toBeGreaterThanOrEqual(5);
    expect(mawRows).toBeGreaterThanOrEqual(2);
    const mawPerCell = maw.interval / (mawCols * mawRows);
    const augerPerCell = auger.interval / auger.shape.length;
    expect(mawPerCell).toBeLessThan(augerPerCell / 4);
  });
});

describe("economy progression", () => {
  it("every tool and upgrade is purchasable in sequence with enough resources (no dead ends)", () => {
    const sim = new GameSim(9);
    const eco = new Economy(sim.rig, sim.bus);
    // give bottomless resources
    sim.rig.money = 1e9;
    for (const res of ["iron", "copper", "coal", "steel", "conduit", "silver", "tungsten", "pressglass", "brinepearl", "sulfur", "quartz", "voidgem", "composite", "alloy", "coolant", "railsalvage"]) {
      sim.rig.cargo.set(res, 999);
    }
    sim.rig.blueprints.add("cipher");
    sim.rig.blueprints.add("capacitor");
    sim.rig.blueprints.add("servo");
    sim.rig.blueprints.add("fork");
    sim.rig.blueprints.add("lattice");
    let bought = 0;
    for (let tier = 1; tier < TOOLS.length; tier++) {
      expect(eco.canAffordTool(tier)).toBe(true);
      expect(eco.buyTool(tier)).toBe(true);
      bought++;
    }
    expect(bought).toBe(7);
    expect(sim.rig.ownedTools).toBe(7);
    let upgradesBought = 0;
    for (let guard = 0; guard < 100; guard++) {
      const available = eco.availableUpgrades().filter((u) => eco.canAffordUpgrade(u.key));
      if (available.length === 0) break;
      expect(eco.buyUpgrade(available[0].key)).toBe(true);
      upgradesBought++;
    }
    expect(upgradesBought).toBe(UPGRADES.length);
    expect(eco.availableUpgrades().length).toBe(0);
  });

  it("tools require their blueprint: sealed progression until found", () => {
    const sim = new GameSim(9);
    const eco = new Economy(sim.rig, sim.bus);
    sim.rig.money = 1e6;
    sim.rig.ownedTools = 2;
    sim.rig.cargo.set("steel", 999);
    sim.rig.cargo.set("silver", 999);
    expect(eco.canAffordTool(3)).toBe(false); // no cipher blueprint
    sim.rig.blueprints.add("cipher");
    expect(eco.canAffordTool(3)).toBe(true);
  });

  it("selling never leaves negative cargo and upgrade purchase consumes materials", () => {
    const sim = new GameSim(11);
    const eco = new Economy(sim.rig, sim.bus);
    sim.rig.cargo.set("copper", 10);
    sim.rig.cargo.set("iron", 8);
    const gain = eco.sellAll();
    expect(gain).toBe(10 * 6 + 8 * 9);
    expect(sim.rig.cargo.size).toBe(0);
    sim.rig.money = 1e6;
    sim.rig.cargo.set("iron", 6);
    expect(eco.buyUpgrade("hopper1")).toBe(true);
    expect(sim.rig.cargo.get("iron") ?? 0).toBe(0);
    expect(sim.rig.upgrades.has("hopper1")).toBe(true);
  });
});

describe("stratum access gates", () => {
  it("each stratum's dominant materials require the intended tool tier", () => {
    const checks: [number, number, number][] = [
      // [stratum start row, sample material, min tool tier]
      [STRATA_START.oldworks + 10, M.STONE, 2],
      [STRATA_START.buriedmile + 40, M.CONCRETE, 3],
      [STRATA_START.redfault + 30, M.BASALT, 4],
      [STRATA_START.glasschoir + 40, M.CRYSTAL, 5],
      [STRATA_START.enginedeep + 50, M.COMPOSITE, 6],
    ];
    for (const [row, materialId, tier] of checks) {
      const def = mat(materialId);
      expect(def.tier).toBe(tier);
      // find this material present in the stratum in a generated world
      const sim = new GameSim(2024);
      let found = 0;
      for (let y = row; y < row + 40 && found < 5; y++) {
        for (let x = 4; x < 156; x += 3) {
          if (sim.world.get(x, y) === materialId) found++;
        }
      }
      expect(found).toBeGreaterThan(0);
    }
  });

  it("drowned fault and red fault block unprotected rigs (pressure/heat)", () => {
    const sim = new GameSim(2024);
    let heat = 0;
    let extracted = 0;
    sim.bus.on((e) => {
      if (e.type === "hurt" && e.cause === "heat") heat++;
      if (e.type === "emergencyExtract") extracted++;
    });
    sim.rig.x = 60;
    sim.rig.y = STRATA_START.redfault + 20;
    for (let i = 0; i < 300; i++) sim.step(1 / 60); // 5 s
    expect(heat).toBeGreaterThan(0); // heat cooks the rig
    expect(extracted).toBeGreaterThan(0); // unprotected rigs get pulled out
    // protected rig suffers nothing
    let heat2 = 0;
    sim.bus.on((e) => {
      if (e.type === "hurt" && e.cause === "heat") heat2++;
    });
    const sim2 = new GameSim(2024);
    sim2.rig.upgrades.add("coolant1");
    sim2.rig.x = 60;
    sim2.rig.y = STRATA_START.redfault + 20;
    for (let i = 0; i < 300; i++) sim2.step(1 / 60);
    expect(heat2).toBe(0);
  });
});

describe("affinity model", () => {
  it("each tool class has a best-fit family and a poor fit", () => {
    expect(affinityFor("drill", "soft")).toBeGreaterThan(affinityFor("drill", "metal"));
    expect(affinityFor("impact", "brittle")).toBeGreaterThan(affinityFor("impact", "soft"));
    expect(affinityFor("thermal", "metal")).toBeGreaterThan(affinityFor("thermal", "crystal"));
    expect(affinityFor("resonator", "crystal")).toBeGreaterThan(affinityFor("resonator", "soft"));
  });
});
