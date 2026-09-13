/**
 * DEEPER — workshop, map and finale overlays.
 * Workshop: sell, tools, upgrades — behavioral descriptions, not just numbers.
 * Map: explored world, landmarks, markers, strata, depth ruler.
 * Finale: full-journey cross-section + destruction history.
 */

import { el, button } from "./dom";
import { TOOLS, UPGRADES, type UpgradeDef } from "../sim/tools";
import { RESOURCES, RELICS } from "../sim/resources";
import { mat } from "../sim/materials";
import type { Economy } from "../sim/economy";
import type { GameSim } from "../sim/game";
import type { BaseProgress } from "../sim/base";
import { WORLD_H, WORLD_W, stratumAtRow } from "../config";

export interface WorkshopHooks {
  onPurchase: () => void;
  onClose: () => void;
}

const STRATA_LABEL: Record<string, string> = {
  surface: "SURFACE — THE WORKS", rootbed: "ROOTBED", oldworks: "OLD WORKS",
  buriedmile: "BURIED MILE", drownedfault: "DROWNED FAULT", redfault: "RED FAULT",
  glasschoir: "GLASS CHOIR", enginedeep: "ENGINE DEEP",
};

export function openWorkshop(
  sim: GameSim, eco: Economy, base: BaseProgress, hooks: WorkshopHooks,
): { refresh: () => void; close: () => void; root: HTMLElement } {
  const modal = el("div", "modal open");
  modal.id = "workshop";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "The Works workshop");
  const panel = el("div", "panel workshop", modal);
  let filter = "";
  let sortAffordableFirst = false;
  const build = () => {
    panel.innerHTML = "";
    const head = el("div", "ws-head", panel);
    const stage = ["THE SHACK", "THE WORKSHOP", "REFINERY WORKS", "MACHINE BAY", "FREIGHT TOWER", "EXCAVATION CAMPUS"][base.stage];
    el("h2", "", head, `THE WORKS — ${stage}`);
    const money = el("div", "ws-money", head, `¤ ${sim.rig.money.toLocaleString()}`);
    void money;
    if (eco.cartographerMul() > 1) {
      el("div", "ws-bonus", head, `Cartographer bonus +${Math.round((eco.cartographerMul() - 1) * 100)}% · Refinery ×${eco.refineryMul().toFixed(2)}`);
    }
    // ---- sell
    const sellBox = el("div", "ws-sell", panel);
    const cargoList = el("div", "ws-cargo-list", sellBox);
    let cargoVal = 0;
    let cargoUnits = 0;
    if (sim.rig.cargo.size === 0) {
      el("div", "muted", cargoList, "Hopper is empty. Go dig.");
    } else {
      for (const [res, amount] of sim.rig.cargo) {
        const def = RESOURCES[res];
        if (!def) continue;
        const line = el("div", "ws-cargo-row", cargoList);
        const dot = el("span", `res-dot tier-${def.tier}`, line);
        dot.textContent = "◆";
        dot.setAttribute("aria-hidden", "true");
        const v = Math.round(amount * def.value * eco.refineryMul() * eco.cartographerMul());
        cargoVal += v;
        cargoUnits += amount;
        el("span", "ws-res", line, `${def.name} ×${amount} (${(amount * def.bulk).toFixed(0)}u)`);
        el("span", "ws-val", line, `¤${v}`);
      }
    }
    if (cargoUnits >= 50) {
      el("div", "ws-bonus", sellBox, "Bulk haul bonus +10% — full hoppers pay extra.");
    }
    const sellBtn = button(sellBox, cargoVal > 0 ? `SELL ALL — ¤${cargoVal.toLocaleString()}` : "SELL ALL", () => {
      const got = eco.sellAll(Math.floor(sim.rig.y));
      if (got > 0) hooks.onPurchase();
      build();
    }, "btn primary");
    sellBtn.disabled = cargoVal <= 0;
    // blueprints found
    const bp = el("div", "ws-bp", sellBox, `Blueprints: ${sim.rig.blueprints.size === 0 ? "none found yet" : [...sim.rig.blueprints].join(", ")}`);

    // ---- tools
    el("h3", "", panel, "EXCAVATION SYSTEMS");
    const toolsBox = el("div", "ws-tools", panel);
    for (const td of TOOLS) {
      const owned = td.tier <= sim.rig.ownedTools;
      const isNext = td.tier === sim.rig.ownedTools + 1;
      const row = el("div", `ws-tool ${owned ? "owned" : isNext ? "next" : "locked"}`, toolsBox);
      el("div", "ws-tool-name", row, owned && sim.rig.toolTier === td.tier ? `▶ ${td.name}` : td.name);
      el("div", "ws-tool-blurb", row, td.blurb);
      if (owned) {
        el("div", "ws-tool-cost owned-tag", row, sim.rig.toolTier === td.tier ? "INSTALLED" : "INSTALLED — PRESS NUMBER KEY");
      } else if (isNext) {
        const cost = el("div", "ws-tool-cost", row);
        const canAfford = eco.canAffordTool(td.tier);
        cost.textContent = `¤${td.cost.money.toLocaleString()}${td.cost.mats ? " · " + Object.entries(td.cost.mats).map(([r, n]) => `${n}× ${RESOURCES[r]?.name ?? r}${(sim.rig.cargo.get(r) ?? 0) >= n ? "" : ` (have ${sim.rig.cargo.get(r) ?? 0})`}`).join(" · ") : ""}${td.cost.blueprints && !td.cost.blueprints.every((b) => sim.rig.blueprints.has(b)) ? " · MISSING BLUEPRINT" : ""}`;
        const btn = button(row, "INSTALL", () => {
          if (eco.buyTool(td.tier)) hooks.onPurchase();
          build();
        }, "btn small");
        btn.disabled = !canAfford;
        row.classList.add(canAfford ? "affordable" : "unaffordable");
      } else {
        el("div", "ws-tool-cost", row, "Requires previous system");
      }
    }

    // ---- upgrades (search + affordable-first sort)
    el("h3", "", panel, "MACHINE UPGRADES");
    const toolsRow = el("div", "ws-tools-row", panel);
    const search = el("input", "ws-search", toolsRow) as HTMLInputElement;
    search.placeholder = "Filter upgrades…";
    search.value = filter;
    search.setAttribute("aria-label", "Filter upgrades");
    search.addEventListener("input", () => { filter = search.value; build(); });
    const sortBtn = button(toolsRow, sortAffordableFirst ? "SORT: AFFORDABLE FIRST ✓" : "SORT: AFFORDABLE FIRST", () => {
      sortAffordableFirst = !sortAffordableFirst;
      build();
    }, "btn small");
    void sortBtn;
    const upsBox = el("div", "ws-upgrades", panel);
    const families: Record<string, UpgradeDef[]> = {};
    for (const u of UPGRADES) {
      (families[u.family] ??= []).push(u);
    }
    for (const [fam, list] of Object.entries(families)) {
      const famBox = el("div", "ws-family", upsBox);
      el("div", "ws-family-name", famBox, fam.toUpperCase());
      let items = list.filter((u) =>
        !filter || u.name.toLowerCase().includes(filter.toLowerCase()) || u.desc.toLowerCase().includes(filter.toLowerCase()));
      if (sortAffordableFirst) {
        items = [...items].sort((a, b) => Number(eco.canAffordUpgrade(b.key)) - Number(eco.canAffordUpgrade(a.key)));
      }
      if (items.length === 0) {
        el("div", "muted", famBox, "No matches.");
        continue;
      }
      for (const u of items) {
        const owned = sim.rig.upgrades.has(u.key);
        const unlocked = eco.upgradeUnlocked(u);
        const row = el("div", `ws-up ${owned ? "owned" : unlocked ? "next" : "locked"}`, famBox);
        el("div", "ws-up-name", row, `${u.major ? "◆ " : "· "}${u.name}`);
        el("div", "ws-up-blurb", row, u.desc);
        if (owned) {
          el("div", "ws-tool-cost owned-tag", row, "INSTALLED");
        } else if (unlocked) {
          const cost = el("div", "ws-tool-cost", row);
          cost.textContent = `¤${u.cost.money.toLocaleString()}${u.cost.mats ? " · " + Object.entries(u.cost.mats).map(([r, n]) => `${n}× ${RESOURCES[r]?.name ?? r}${(sim.rig.cargo.get(r) ?? 0) >= n ? "" : ` (have ${sim.rig.cargo.get(r) ?? 0})`}`).join(" · ") : ""}`;
          const btn = button(row, "INSTALL", () => {
            if (eco.buyUpgrade(u.key)) hooks.onPurchase();
            build();
          }, "btn small");
          btn.disabled = !eco.canAffordUpgrade(u.key);
          row.classList.add(eco.canAffordUpgrade(u.key) ? "affordable" : "unaffordable");
        } else {
          el("div", "ws-tool-cost", row, `Requires ${u.requires ? UPGRADES.find((x) => x.key === u.requires)?.name : ""}`);
        }
      }
    }
    void bp;

    // ---- museum
    el("h3", "", panel, "MUSEUM");
    const museum = el("div", "ws-museum", panel);
    for (const relic of RELICS) {
      const has = sim.rig.relics.has(relic.key);
      const cell = el("div", `museum-cell ${has ? "found" : "missing"}`, museum);
      cell.title = has ? `${relic.name} — ${relic.desc}` : "Not yet found";
      el("div", "museum-name", cell, has ? relic.name : "· · ·");
      if (has) el("div", "museum-desc", cell, relic.desc);
    }
    const foot = el("div", "ws-foot", panel);
    button(foot, "CLOSE (E / ESC)", hooks.onClose, "btn primary");
  };
  build();
  const menuRoot = document.getElementById("menu")!;
  menuRoot.classList.add("open");
  menuRoot.appendChild(modal);
  return { refresh: build, close: hooks.onClose, root: modal };
}

// ---------------------------------------------------------------------------
// MAP
// ---------------------------------------------------------------------------
const MAT_COLOR: Record<number, string> = {
  0: "#0b0b10",
  [mat(1).id]: "#4d7a33", [mat(2).id]: "#6b4a2f", [mat(3).id]: "#8a5a3c", [mat(4).id]: "#b08d57",
  [mat(5).id]: "#5d4526", [mat(6).id]: "#7a6a5a", [mat(7).id]: "#cbb475", [mat(8).id]: "#857a6a",
  [mat(9).id]: "#6e6154", [mat(10).id]: "#6f6f78", [mat(11).id]: "#7a5a33", [mat(12).id]: "#5a5f66",
  [mat(13).id]: "#3a3a40", [mat(14).id]: "#8f9094", [mat(15).id]: "#9a5a44", [mat(16).id]: "#46464e",
  [mat(17).id]: "#7d8894", [mat(18).id]: "#6a7078", [mat(19).id]: "#9aa4a8", [mat(20).id]: "#4a5e63",
  [mat(21).id]: "#3f4a52", [mat(22).id]: "#6fc8c8", [mat(23).id]: "#cfd8d0", [mat(24).id]: "#3c3840",
  [mat(25).id]: "#b8a13a", [mat(26).id]: "#23202c", [mat(27).id]: "#4a2c28", [mat(28).id]: "#b8e8f0",
  [mat(29).id]: "#26242e", [mat(30).id]: "#3a3048", [mat(31).id]: "#4e545c", [mat(32).id]: "#8a929c",
  [mat(33).id]: "#55606a", [mat(34).id]: "#5a636e", [mat(35).id]: "#17161a", [mat(36).id]: "#6a7480",
  [mat(37).id]: "#8a8292", [mat(38).id]: "#7a5a26", [mat(39).id]: "#565e66",
};

export function openMap(sim: GameSim, onClose: () => void): { close: () => void } {
  const modal = el("div", "modal open map-modal");
  modal.id = "map";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-label", "Survey map");
  const panel = el("div", "panel map-panel", modal);
  el("h2", "", panel, "SURVEY MAP");
  // zoom + filter controls
  const controls = el("div", "map-controls", panel);
  let scale = 3;
  let showBlocked = true;
  let showVulnerableOnly = false;
  let showScans = true;
  const canvas = el("canvas", "map-canvas", panel) as HTMLCanvasElement;
  const draw = () => {
    canvas.width = WORLD_W * scale;
    canvas.height = WORLD_H * scale;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(WORLD_W, WORLD_H);
    const w = sim.world;
    for (let i = 0; i < WORLD_W * WORLD_H; i++) {
      const x = i % WORLD_W;
      const y = (i / WORLD_W) | 0;
      void x;
      void y;
      let r = 10, g = 10, b = 16;
      if (w.explored[i]) {
        const t = w.tiles[i];
        const hex = MAT_COLOR[t] ?? "#333";
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
        if (w.liquid[i] === 1) { r = 46; g = 93; b = 110; }
        if (w.liquid[i] === 2) { r = 224; g = 88; b = 40; }
        if (w.ore[i] > 0) { r = Math.min(255, r + 90); g = Math.min(255, g + 80); b = 60; }
      }
      const o = i * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    const tmp = document.createElement("canvas");
    tmp.width = WORLD_W; tmp.height = WORLD_H;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, WORLD_W * scale, WORLD_H * scale);
    // stratum band dividers + labels
    const bands: [number, string][] = [[8, "WORKS"], [12, "ROOTBED"], [108, "OLD WORKS"], [204, "BURIED MILE"], [320, "DROWNED"], [436, "RED FAULT"], [552, "GLASS CHOIR"], [668, "ENGINE DEEP"]];
    ctx.fillStyle = "rgba(248,232,176,0.85)";
    ctx.font = `${Math.max(9, scale * 3)}px monospace`;
    for (const [row, label] of bands) {
      ctx.fillRect(0, row * scale, canvas.width, 1);
      ctx.fillText(label, 6, row * scale + 10);
    }
    // landmarks
    for (const l of sim.landmarks) {
      if (!l.discovered || l.stratum === "surface") continue;
      ctx.fillStyle = "#f8d048";
      ctx.fillRect(l.x * scale + scale * 2, l.y * scale + scale * 2, 4, 4);
    }
    // blocked markers (filterable)
    let blocked = 0;
    let vuln = 0;
    for (const s of sim.blocked.sites.values()) {
      if (s.vulnerable) vuln++;
      else blocked++;
      if (!showBlocked) continue;
      if (showVulnerableOnly && !s.vulnerable) continue;
      ctx.fillStyle = s.vulnerable ? "#5fe07a" : "#e05838";
      ctx.fillRect(s.x * scale - 1, s.y * scale - 1, 6, 6);
    }
    void blocked;
    void vuln;
    // persisted scan overlays (tier 3+ vein outlines)
    if (showScans) {
      for (const o of sim.scanOverlays) {
        ctx.strokeStyle = "#48c8b0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(o.x * scale, o.y * scale, 10 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#48c8b0";
        ctx.fillText(`${o.hits.length} veins`, o.x * scale + 4, o.y * scale - 4);
      }
    }
    // death caches (corpse runs)
    for (const dc of sim.deathCaches) {
      ctx.fillStyle = "#b070e8";
      ctx.fillRect(dc.x * scale - 2, dc.y * scale - 2, 6, 6);
    }
    // base + rig
    ctx.fillStyle = "#d8a83c";
    ctx.fillRect(24 * scale - 2, 7 * scale - 2, 10, 6);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sim.rig.x * scale - 2, sim.rig.y * scale - 2, 5, 5);
  };
  const zoomOut = button(controls, "−", () => { scale = Math.max(1, scale - 1); draw(); }, "btn small");
  const zoomIn = button(controls, "+", () => { scale = Math.min(6, scale + 1); draw(); }, "btn small");
  zoomOut.setAttribute("aria-label", "Zoom map out");
  zoomIn.setAttribute("aria-label", "Zoom map in");
  const fBlocked = button(controls, "BLOCKED ✓", () => {
    showBlocked = !showBlocked;
    fBlocked.textContent = showBlocked ? "BLOCKED ✓" : "BLOCKED ✕";
    draw();
  }, "btn small");
  const fVuln = button(controls, "VULNERABLE ONLY", () => {
    showVulnerableOnly = !showVulnerableOnly;
    fVuln.textContent = showVulnerableOnly ? "VULNERABLE ONLY ✓" : "VULNERABLE ONLY";
    draw();
  }, "btn small");
  const fScans = button(controls, "SCANS ✓", () => {
    showScans = !showScans;
    fScans.textContent = showScans ? "SCANS ✓" : "SCANS ✕";
    draw();
  }, "btn small");
  draw();
  // legend + stats
  const info = el("div", "map-info", panel);
  el("div", "map-row", info, `◼ white — you · ◼ gold — The Works · ◼ yellow — landmarks · ◼ red — blocked · ◼ green — VULNERABLE · ◼ teal — scan · ◼ purple — death cache`);
  const nVuln = [...sim.blocked.sites.values()].filter((s) => s.vulnerable).length;
  el("div", "map-row", info, `Depth record: ${Math.max(0, sim.stats.deepestRow - 8)}m · Strata seen: ${sim.stats.strataSeen.size}/8 · Cells: ${sim.stats.cellsDestroyed.toLocaleString()} · Blocked: ${sim.blocked.sites.size} (${nVuln} vulnerable)`);
  const legend = el("div", "map-legend", info);
  for (const st of ["surface", "rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"]) {
    const breaks = sim.stats.perStratumBreaks[st] ?? 0;
    el("div", "map-legend-row", legend, `${STRATA_LABEL[st]}${breaks ? ` — ${breaks.toLocaleString()} broken` : ""}`);
  }
  button(panel, "CLOSE (M / ESC)", onClose, "btn primary");
  const menuRoot = document.getElementById("menu")!;
  menuRoot.classList.add("open");
  menuRoot.appendChild(modal);
  return { close: onClose };
}

// ---------------------------------------------------------------------------
// FINALE — WOW-12
// ---------------------------------------------------------------------------
export function openFinale(sim: GameSim, onContinue: () => void) {
  const modal = el("div", "modal open finale-modal");
  const panel = el("div", "panel finale", modal);
  el("h2", "", panel, "LOOK WHAT YOU DID TO THIS WORLD");
  const canvas = el("canvas", "map-canvas finale-canvas", panel) as HTMLCanvasElement;
  const scale = 2;
  canvas.width = WORLD_W * scale;
  canvas.height = WORLD_H * scale;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(WORLD_W, WORLD_H);
  const w = sim.world;
  for (let i = 0; i < WORLD_W * WORLD_H; i++) {
    const t = w.tiles[i];
    let r = 8, g = 8, b = 12;
    if (w.explored[i]) {
      const hex = MAT_COLOR[t] ?? "#333";
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
      if (w.liquid[i] === 1) { r = 46; g = 93; b = 110; }
    }
    const o = i * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  const tmp = document.createElement("canvas");
  tmp.width = WORLD_W; tmp.height = WORLD_H;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  // strata labels
  ctx.fillStyle = "#f8e8b0";
  ctx.font = "bold 11px monospace";
  const bands: [number, string][] = [[8, "THE WORKS"], [12, "ROOTBED"], [108, "OLD WORKS"], [204, "BURIED MILE"], [320, "DROWNED FAULT"], [436, "RED FAULT"], [552, "GLASS CHOIR"], [668, "ENGINE DEEP"]];
  for (const [row, label] of bands) {
    ctx.fillText(label, 6, row * scale + 12);
    ctx.fillRect(0, row * scale, canvas.width, 1);
  }
  // your route: rig shafts visible as explored are already drawn.
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`FINAL DEPTH ${Math.max(0, sim.stats.deepestRow - 8)}m`, canvas.width - 140, canvas.height - 8);
  const stats = el("div", "finale-stats", panel);
  const rows: [string, string][] = [
    ["Final depth", `${Math.max(0, sim.stats.deepestRow - 8)} m`],
    ["Terrain destroyed", sim.stats.cellsDestroyed.toLocaleString()],
    ["Ore extracted", sim.stats.oreExtracted.toLocaleString()],
    ["Money earned", `¤ ${sim.stats.moneyEarned.toLocaleString()}`],
    ["Motherlodes found", String(sim.stats.motherlodes)],
    ["Geodes cracked", String(sim.stats.geodes)],
    ["Relics recovered", String(sim.rig.relics.size)],
    ["Largest chain reaction", `${sim.stats.largestChain} cells`],
    ["Best resonance combo", `×${sim.stats.bestResonanceCombo}`],
    ["Threats destroyed", `${sim.stats.threatsKilled} (${sim.stats.elitesKilled} elite)`],
    ["Scans pulsed", String(sim.stats.scansPulsed)],
    ["Charges detonated", String(sim.stats.chargesDetonated)],
    ["Lifts taken", String(sim.stats.liftsTaken)],
    ["Corpse runs recovered", String(sim.stats.deathsRecovered)],
    ["Marked sites conquered", String(sim.stats.markedConquered)],
    ["Time underground", `${Math.floor(sim.playtime / 60)} min`],
    ["Excavation systems installed", `${sim.rig.ownedTools + 1}/8`],
    ["The world remembers", "every cell you broke"],
  ];
  for (const [k, v] of rows) {
    const r = el("div", "finale-row", stats);
    el("span", "", r, k);
    el("b", "", r, v);
  }
  // per-stratum destruction breakdown
  el("h3", "", panel, "DESTRUCTION BY STRATUM");
  const breakdown = el("div", "finale-breakdown", panel);
  for (const st of ["surface", "rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"]) {
    const n = sim.stats.perStratumBreaks[st] ?? 0;
    const r = el("div", "finale-row", breakdown);
    el("span", "", r, STRATA_LABEL[st]);
    el("b", "", r, n.toLocaleString());
  }
  const btnRow = el("div", "finale-btns", panel);
  button(btnRow, "EXPORT STATS (CSV)", () => {
    const lines = ["metric,value", ...rows.map(([k, v]) => `"${k}","${v}"`)];
    for (const st of Object.keys(sim.stats.perStratumBreaks)) {
      lines.push(`"breaks:${st}","${sim.stats.perStratumBreaks[st]}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `deeper-stats-${sim.seed}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "btn small");
  button(btnRow, "KEEP DIGGING (free play continues)", onContinue, "btn primary");
  const menuRoot = document.getElementById("menu")!;
  menuRoot.classList.add("open");
  menuRoot.appendChild(modal);
}

/** Stratum reveal banner text. */
export function stratumBanner(stratum: string): [string, string] {
  switch (stratum) {
    case "rootbed": return ["ROOTBED", "Warm dirt, old roots, buried junk. It digs easy. It pays worse."];
    case "oldworks": return ["OLD WORKS", "Somebody mined here before you. They left rails, lamps, and debts."];
    case "buriedmile": return ["BURIED MILE", "This isn't geology. A city is down here, and it was buried running."];
    case "drownedfault": return ["DROWNED FAULT", "The water is older than the works. It is under pressure. It is patient."];
    case "redfault": return ["RED FAULT", "Heat, gas, and things that burn. Dig like you mean it."];
    case "glasschoir": return ["GLASS CHOIR", "The crystal hums when you touch it. Connected things break together."];
    case "enginedeep": return ["ENGINE DEEP", "The bottom of the world is BUILT. Coolant is still circulating."];
    default: return ["SURFACE", "The Works."];
  }
}

export { STRATA_LABEL };
