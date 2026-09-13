import { describe, expect, it } from "vitest";
import { GameSim } from "../../src/sim/game";
import { M } from "../../src/sim/materials";
import { STRATA_START, WORLD_H, WORLD_W } from "../../src/config";
import { stratumAtRow } from "../../src/config";

describe("smoke: world generation", () => {
  it("generates a deterministic world from a seed", () => {
    const a = new GameSim(12345);
    const b = new GameSim(12345);
    expect(a.world.tiles).toEqual(b.world.tiles);
    expect(a.landmarks.length).toBeGreaterThan(10);
    expect(a.motherlodes.length).toBeGreaterThanOrEqual(12);
  });

  it("different seeds produce different worlds", () => {
    const a = new GameSim(1);
    const b = new GameSim(2);
    const diff = a.world.tiles.filter((t, i) => t !== b.world.tiles[i]).length;
    expect(diff).toBeGreaterThan(1000);
  });

  it("has sky above ground and bedrock frame", () => {
    const sim = new GameSim(7);
    expect(sim.world.get(10, 2)).toBe(M.AIR);
    expect(sim.world.get(0, 100)).toBe(M.BEDROCK);
    expect(sim.world.get(80, WORLD_H - 2)).toBe(M.BEDROCK);
  });

  it("contains all eight strata with solid ground", () => {
    const sim = new GameSim(99);
    const rows = [STRATA_START.rootbed + 10, STRATA_START.oldworks + 10, STRATA_START.buriedmile + 40, STRATA_START.drownedfault + 60, STRATA_START.redfault + 30, STRATA_START.glasschoir + 40, STRATA_START.enginedeep + 50];
    for (const y of rows) {
      let solid = 0;
      for (let x = 2; x < WORLD_W - 2; x++) if (sim.world.get(x, y) !== M.AIR) solid++;
      expect(solid).toBeGreaterThan(20);
      expect(["rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"]).toContain(stratumAtRow(y));
    }
  });

  it("has water in the drowned fault and magma in the red fault", () => {
    const sim = new GameSim(4242);
    let water = 0;
    for (let y = STRATA_START.drownedfault; y < STRATA_START.redfault; y += 2) {
      for (let x = 2; x < WORLD_W - 2; x += 2) {
        if (sim.world.liquid[x + y * WORLD_W] === 1) water++;
      }
    }
    expect(water).toBeGreaterThan(300);
    let magma = 0;
    for (let y = STRATA_START.redfault; y < STRATA_START.glasschoir; y += 2) {
      for (let x = 2; x < WORLD_W - 2; x += 2) {
        if (sim.world.liquid[x + y * WORLD_W] === 2) magma++;
      }
    }
    expect(magma).toBeGreaterThan(30);
  });
});

describe("smoke: stepping", () => {
  it("steps without crashing and rig is intact at the works", () => {
    const sim = new GameSim(555);
    sim.step(1);
    sim.step(2);
    expect(sim.rig.hp).toBe(100);
    expect(sim.rig.dead).toBe(false);
  });

  it("digging soft soil works with the starting auger", () => {
    const sim = new GameSim(555);
    // place the rig above a soil block and dig straight down
    sim.rig.x = 60;
    sim.rig.y = 7.0;
    const before = sim.world.get(60, 8);
    expect(before).not.toBe(M.AIR);
    sim.input.dig = true;
    sim.input.aimX = 60.5;
    sim.input.aimY = 9.5;
    sim.step(4);
    let broke = false;
    for (let y = 8; y < 12; y++) {
      if (sim.world.get(60, y) === M.AIR) broke = true;
    }
    expect(broke).toBe(true);
    expect(sim.stats.cellsDestroyed).toBeGreaterThan(0);
  });
});
