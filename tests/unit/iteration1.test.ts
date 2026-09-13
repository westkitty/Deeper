/**
 * DEEPER — iteration-1 regression tests.
 * Covers the new mechanics: scan persistence, lift channel, corpse runs,
 * save v2, bulk/cartographer economy, elites, telegraphs, resonance combos,
 * water pressure and magma pre-heat.
 */
import { describe, expect, it } from "vitest";
import { GameSim } from "../../src/sim/game";
import { M } from "../../src/sim/materials";
import { STRATA_START } from "../../src/config";

describe("iteration-1: scanner", () => {
  it("scan detail scales with tier; tier 4 flags anomalies", () => {
    const sim = new GameSim(1001);
    for (let y = 20; y < 26; y++)
      for (let x = 50; x < 56; x++) sim.world.ore[x + y * sim.world.w] = 5; // gold
    sim.world.set(52, 22, M.GEODESHELL);
    sim.rig.upgrades.add("scan1");
    const t1 = sim.scan(53, 23);
    expect(t1.tier).toBe(1);
    expect(t1.hits.length).toBeGreaterThan(0);
    expect(t1.anomalies.length).toBe(0);
    sim.rig.upgrades.add("scan2");
    sim.rig.upgrades.add("scan3");
    sim.rig.upgrades.add("scan4");
    const t4 = sim.scan(53, 23);
    expect(t4.tier).toBe(4);
    expect(t4.anomalies.length).toBeGreaterThan(0);
  });

  it("tier-3+ pings persist as map overlays and expire", () => {
    const sim = new GameSim(1002);
    sim.rig.upgrades.add("scan1");
    sim.rig.upgrades.add("scan2");
    sim.rig.upgrades.add("scan3");
    sim.rig.toolTier = 0; // auger utility = scan
    sim.useUtilityAt(60, 20);
    expect(sim.scanOverlays.length).toBe(1);
    expect(sim.stats.scansPulsed).toBe(1);
    sim.step(26); // expire
    expect(sim.scanOverlays.length).toBe(0);
  });
});

describe("iteration-1: lift channel", () => {
  it("travelTo channels for 2s then teleports; damage interrupts", () => {
    const sim = new GameSim(1003);
    sim.rig.upgrades.add("lift");
    const stop = sim.spawns.find((s) => s.kind === "lift");
    expect(stop).toBeDefined();
    sim.base.liftStops.add(stop!.data!);
    expect(sim.travelTo(stop!.data!)).toBe(true);
    expect(sim.liftChannel).not.toBeNull();
    expect(sim.liftChannelProgress).toBeGreaterThanOrEqual(0);
    sim.step(2.5);
    expect(sim.liftChannel).toBeNull();
    expect(sim.stats.liftsTaken).toBe(1);
    // interrupt path
    expect(sim.travelTo(stop!.data!)).toBe(true);
    sim.rig.hurt(5, "threat");
    expect(sim.liftChannel).toBeNull();
  });

  it("campus stage travels instantly", () => {
    const sim = new GameSim(1004);
    sim.rig.upgrades.add("lift");
    sim.base.stage = 5;
    const stop = sim.spawns.find((s) => s.kind === "lift");
    sim.base.liftStops.add(stop!.data!);
    expect(sim.travelTo(stop!.data!)).toBe(true);
    expect(sim.liftChannel).toBeNull();
    expect(sim.stats.liftsTaken).toBe(1);
  });
});

describe("iteration-1: corpse runs", () => {
  it("emergency extraction drops a recoverable death cache", () => {
    const sim = new GameSim(1005);
    sim.rig.cargo.set("gold", 40);
    sim.rig.cargo.set("iron", 20);
    const dx = sim.rig.x;
    const dy = sim.rig.y;
    sim.rig.emergencyExtract();
    expect(sim.deathCaches.length).toBe(1);
    expect(sim.deathCaches[0].x).toBeCloseTo(dx);
    expect(sim.deathCaches[0].y).toBeCloseTo(dy);
    expect(sim.deathCaches[0].cargo).toEqual([["gold", 10], ["iron", 5]]);
    // walk back and recover
    sim.rig.x = dx;
    sim.rig.y = dy;
    sim.touchCollect();
    expect(sim.deathCaches.length).toBe(0);
    expect(sim.stats.deathsRecovered).toBe(1);
    expect(sim.rig.cargo.get("gold")).toBe(10);
  });
});

describe("iteration-1: save v2", () => {
  it("serialize/load round-trips assist mode and death caches", () => {
    const sim = new GameSim(1006);
    sim.rig.assistMode = true;
    sim.deathCaches.push({ x: 50, y: 60, cargo: [["gold", 7]] });
    const data = sim.serialize();
    expect(data.v).toBe(2);
    expect(data.assistMode).toBe(true);
    const sim2 = new GameSim(1006);
    sim2.load(data);
    expect(sim2.rig.assistMode).toBe(true);
    expect(sim2.deathCaches.length).toBe(1);
    expect(sim2.deathCaches[0].cargo).toEqual([["gold", 7]]);
  });
});

describe("iteration-1: economy", () => {
  it("surface prices stay at list (ticker stable); bulk hauls pay +10%", () => {
    const sim = new GameSim(1007);
    sim.rig.cargo.set("copper", 10);
    sim.rig.cargo.set("iron", 8);
    expect(sim.economy.sellAll()).toBe(10 * 6 + 8 * 9);
    sim.rig.cargo.set("iron", 60);
    const bulk = sim.economy.sellAll();
    expect(bulk).toBe(Math.round(60 * 9 * 1.1));
  });

  it("cartographer bonus lifts sell prices per 5 landmarks", () => {
    const sim = new GameSim(1008);
    sim.economy.landmarksFound = 10;
    expect(sim.economy.cartographerMul()).toBeCloseTo(1.02);
    sim.rig.cargo.set("iron", 10);
    expect(sim.economy.sellAll()).toBe(Math.round(10 * 9 * 1.02));
    sim.economy.landmarksFound = 200;
    expect(sim.economy.cartographerMul()).toBeCloseTo(1.15);
  });
});

describe("iteration-1: threats", () => {
  it("elites have 2.2x HP and 3x drops", () => {
    const sim = new GameSim(1009);
    const t = sim.threats.spawn("grubble", 60, 10, true)!;
    expect(t.elite).toBe(true);
    expect(t.maxHp).toBe(Math.round(22 * 2.2));
    const drops = sim.threats.dropsFor(t);
    const total = drops.reduce((a, d) => a + d.amount, 0);
    expect(total).toBeGreaterThanOrEqual(3);
    sim.threats.damageNear(60, 10, 3, 999);
    sim.step(1 / 60);
    expect(sim.stats.threatsKilled).toBe(1);
    expect(sim.stats.elitesKilled).toBe(1);
  });

  it("wounded grubbles flee; jumpers telegraph lunges", () => {
    const sim = new GameSim(1010);
    const cx = Math.floor(sim.rig.x) + 4;
    const cy = Math.floor(sim.rig.y);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 6; dx++) sim.world.set(cx + dx, cy + dy, M.AIR);
    const g = sim.threats.spawn("grubble", cx, cy)!;
    g.elite = false;
    g.hp = 1;
    const j = sim.threats.spawn("shellsnout", cx + 3, cy)!;
    const rig = { x: sim.rig.x, y: sim.rig.y, hurt: () => {} };
    for (let i = 0; i < 120; i++) sim.threats.step(1 / 60, rig as never, () => false);
    expect(g.fleeing).toBe(true);
    // telegraph fires at mid range (either committed or winding up)
    expect(j.telegraph > 0 || j.cooldown > 0).toBe(true);
  });
});

describe("iteration-1: resonance combo", () => {
  it("consecutive pulses build a combo that decays", () => {
    const sim = new GameSim(1011);
    sim.bus.emit({ type: "resonance", x: 60, y: 600, cells: 10 });
    expect(sim.resonanceCombo).toBe(1);
    sim.bus.emit({ type: "resonance", x: 61, y: 600, cells: 12 });
    expect(sim.resonanceCombo).toBe(2);
    expect(sim.stats.bestResonanceCombo).toBe(2);
    sim.step(5);
    expect(sim.resonanceCombo).toBe(0);
  });
});

describe("iteration-1: environment", () => {
  it("deep water pushes entities; magma pre-heat caps at 10%", () => {
    const sim = new GameSim(1012);
    // flood a cell deeply
    const x = 60;
    const y = STRATA_START.drownedfault + 40;
    sim.world.set(x, y, M.AIR);
    const i = x + y * sim.world.w;
    sim.world.liquid[i] = 1;
    sim.world.liqLevel[i] = 8;
    const [px, py] = sim.env.pressurePush(x + 0.5, y + 0.5);
    expect(Math.hypot(px, py)).toBeGreaterThan(0);
    // magma pre-heat
    const mx = 70;
    const my = STRATA_START.redfault + 30;
    sim.world.set(mx, my, M.AIR);
    sim.world.liquid[mx + my * sim.world.w] = 2;
    sim.world.liqLevel[mx + my * sim.world.w] = 8;
    sim.world.set(mx + 1, my, M.BASALT);
    sim.env.box = { x0: 40, y0: my - 10, x1: 100, y1: my + 10 };
    for (let t = 0; t < 300; t += 30) sim.env.step(t);
    const dmg = sim.world.damage[mx + 1 + my * sim.world.w];
    expect(dmg).toBeGreaterThanOrEqual(0);
    expect(dmg).toBeLessThanOrEqual(Math.floor(260 * 0.1) + 2);
  });
});
