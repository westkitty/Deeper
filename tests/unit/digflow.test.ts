import { describe, expect, it } from "vitest";
import { GameSim } from "../../src/sim/game";
import { M, mat } from "../../src/sim/materials";

/** Player-like aim: find the nearest diggable solid cell under the rig within reach. */
function smartAim(sim: GameSim): { x: number; y: number } | null {
  const rx = Math.floor(sim.rig.x);
  const ry = Math.floor(sim.rig.y);
  for (let dy = 2; dy <= 6; dy++) {
    for (const dx of [0, -1, 1, -2, 2]) {
      const t = sim.world.get(rx + dx, ry + dy);
      if (t !== M.AIR && t !== M.BEDROCK && mat(t).tier <= sim.rig.toolTier) {
        return { x: rx + dx + 0.5, y: ry + dy + 0.5 };
      }
    }
  }
  return null;
}

describe("interactive dig flow (headless)", () => {
  it("rig digs a descending shaft through soft ground, collects cargo", () => {
    const sim = new GameSim(555);
    sim.rig.x = 53;
    sim.rig.y = 6.5;
    sim.input.dig = true;
    for (let i = 0; i < 5400; i++) {
      const aim = smartAim(sim);
      if (aim) {
        sim.input.aimX = aim.x;
        sim.input.aimY = aim.y;
      }
      sim.step(1 / 60);
    }
    console.log("y:", sim.rig.y.toFixed(2), "destroyed:", sim.stats.cellsDestroyed, "cargo:", [...sim.rig.cargo.entries()].slice(0, 5));
    expect(sim.stats.cellsDestroyed).toBeGreaterThan(30);
    expect(sim.rig.y).toBeGreaterThan(11);
    expect(sim.rig.cargo.size).toBeGreaterThan(0);
  });

  it("rig never climbs above its spawn while digging down", () => {
    const sim = new GameSim(777);
    sim.rig.x = 53;
    sim.rig.y = 6.5;
    sim.input.dig = true;
    sim.input.aimX = 53.2;
    sim.input.aimY = 40;
    let minY = 99;
    for (let i = 0; i < 1800; i++) {
      sim.step(1 / 60);
      minY = Math.min(minY, sim.rig.y);
    }
    expect(minY).toBeGreaterThan(4.5);
  });
});
