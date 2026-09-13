/**
 * DEEPER — destruction history & aggregate statistics (for HUD, finale, pride).
 * Pure counters; no telemetry ever leaves the browser.
 */

import type { StratumId } from "../config";

export class StatsTracker {
  cellsDestroyed = 0;
  oreExtracted = 0;
  moneyEarned = 0;
  largestChain = 0; // largest single cascade cell count
  motherlodes = 0;
  geodes = 0;
  relics = 0;
  deepestRow = 0;
  deepestStratum: StratumId = "surface";
  markedConquered = 0;
  explosionsSurvived = 0;
  playtime = 0; // seconds
  tripsSold = 0;
  strataSeen = new Set<string>(["surface"]);
  // ---- iteration-1 aggregate counters (finale breakdown + diagnostics) ----
  scansPulsed = 0;
  chargesDetonated = 0;
  resonanceCombos = 0;
  bestResonanceCombo = 0;
  elitesKilled = 0;
  threatsKilled = 0;
  deathsRecovered = 0;
  liftsTaken = 0;
  landmarksFound = 0;
  perStratumBreaks: Record<string, number> = {};
  magnetStreakBest = 0;

  noteBreak() {
    this.cellsDestroyed++;
  }
  noteOre(n: number) {
    this.oreExtracted += n;
  }
  noteSell(money: number) {
    this.moneyEarned += money;
    this.tripsSold++;
  }
  noteDepth(row: number, stratum: StratumId) {
    if (row > this.deepestRow) this.deepestRow = row;
    const rank = ["surface", "rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"].indexOf(stratum);
    const curRank = ["surface", "rootbed", "oldworks", "buriedmile", "drownedfault", "redfault", "glasschoir", "enginedeep"].indexOf(this.deepestStratum);
    if (rank > curRank) this.deepestStratum = stratum;
  }

  noteStratumBreak(stratum: string) {
    this.perStratumBreaks[stratum] = (this.perStratumBreaks[stratum] ?? 0) + 1;
  }
  serialize() {
    return {
      cellsDestroyed: this.cellsDestroyed, oreExtracted: this.oreExtracted,
      moneyEarned: this.moneyEarned, largestChain: this.largestChain,
      motherlodes: this.motherlodes, geodes: this.geodes, relics: this.relics,
      deepestRow: this.deepestRow, deepestStratum: this.deepestStratum,
      markedConquered: this.markedConquered, explosionsSurvived: this.explosionsSurvived,
      playtime: this.playtime, tripsSold: this.tripsSold,
      strataSeen: [...this.strataSeen],
      scansPulsed: this.scansPulsed, chargesDetonated: this.chargesDetonated,
      resonanceCombos: this.resonanceCombos, bestResonanceCombo: this.bestResonanceCombo,
      elitesKilled: this.elitesKilled, threatsKilled: this.threatsKilled,
      deathsRecovered: this.deathsRecovered, liftsTaken: this.liftsTaken,
      landmarksFound: this.landmarksFound, perStratumBreaks: { ...this.perStratumBreaks },
      magnetStreakBest: this.magnetStreakBest,
    };
  }
  load(d: ReturnType<StatsTracker["serialize"]> | undefined) {
    if (!d) return;
    Object.assign(this, d);
    this.strataSeen = new Set((d as { strataSeen?: string[] }).strataSeen ?? ["surface"]);
    this.perStratumBreaks = { ...((d as { perStratumBreaks?: Record<string, number> }).perStratumBreaks ?? {}) };
  }
}
