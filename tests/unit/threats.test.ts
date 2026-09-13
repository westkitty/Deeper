import { describe, it, expect } from "vitest";
import { GameSim } from "../../src/sim/game";
import { M } from "../../src/sim/materials";

describe("threat lifecycle", () => {
  it("killing a threat emits threatDeath and drops its loot", () => {
    const sim = new GameSim(77);
    // carve an air pocket so the threat has somewhere to exist
    const cx = Math.floor(sim.rig.x) + 6;
    const cy = Math.floor(sim.rig.y) + 2;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) sim.world.set(cx + dx, cy + dy, M.AIR);
    const t = sim.threats.spawn("grubble", cx, cy);
    expect(t).toBeDefined();
    const deaths: { family: string; x: number; y: number }[] = [];
    sim.bus.on((e) => {
      if (e.type === "threatDeath") deaths.push({ family: e.family, x: e.x, y: e.y });
    });
    sim.threats.damageNear(cx, cy, 3, 999);
    // removal + event fire on the next threat step
    sim.step(1 / 60);
    expect(deaths.length).toBe(1);
    expect(deaths[0].family).toBe("grubble");
    expect(sim.loot.loot.length).toBeGreaterThan(0);
    expect(sim.threats.threats.length).toBe(0);
  });

  it("contact with a threat hurts the rig and reports cause", () => {
    const sim = new GameSim(78);
    const cx = Math.floor(sim.rig.x) + 2;
    const cy = Math.floor(sim.rig.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 2; dx++) sim.world.set(cx + dx, cy + dy, M.AIR);
    sim.threats.spawn("grubble", cx, cy);
    const hp0 = sim.rig.hp;
    const causes: string[] = [];
    sim.bus.on((e) => {
      if (e.type === "hurt") causes.push(e.cause);
    });
    for (let i = 0; i < 90; i++) sim.step(1 / 60); // 1.5 s
    expect(sim.rig.hp).toBeLessThan(hp0);
    expect(causes).toContain("threat");
  });
});
