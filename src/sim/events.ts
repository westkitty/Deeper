/** Minimal typed event bus shared by headless sim and presentation layer. */

export type SimEvent =
  | { type: "dig"; x: number; y: number; mat: number; broke: boolean; tool: number }
  | { type: "break"; x: number; y: number; mat: number; count: number; chain?: boolean }
  | { type: "pickup"; res: string; amount: number; x: number; y: number; vacuum?: boolean }
  | { type: "cargoFull" }
  | { type: "sell"; money: number }
  | { type: "explode"; x: number; y: number; radius: number; big: boolean }
  | { type: "ignite"; x: number; y: number }
  | { type: "steam"; x: number; y: number }
  | { type: "resonance"; x: number; y: number; cells: number }
  | { type: "drillHit"; x: number; y: number; mat: number; effective: boolean; toolTier: number }
  | { type: "blocked"; x: number; y: number; mat: number; toolTier: number }
  | { type: "blockedMarked"; x: number; y: number; mat: number }
  | { type: "nowVulnerable"; count: number; details?: { x: number; y: number; mat: number; requiredTier: number }[] }
  | { type: "landmarkRevealed"; key: string; name: string; x: number; y: number; wow?: string }
  | { type: "stratumRevealed"; stratum: string }
  | { type: "hurt"; amount: number; cause: string }
  | { type: "death" }
  | { type: "emergencyExtract" }
  | { type: "upgradeBought"; key: string }
  | { type: "toolBought"; tier: number }
  | { type: "blueprint"; key: string }
  | { type: "relic"; key: string }
  | { type: "salvage"; x: number; y: number }
  | { type: "coreExtracted" }
  | { type: "finale" }
  | { type: "baseStage"; stage: number }
  | { type: "liftUnlocked"; stop: string }
  | { type: "threatHit"; id: number; x: number; y: number }
  | { type: "threatDeath"; id: number; x: number; y: number; family: string; elite?: boolean }
  | { type: "geode"; x: number; y: number }
  | { type: "motherlode"; x: number; y: number }
  | { type: "wow"; key: string }
  // v1.2 additions
  | { type: "overheat"; tier: number }
  | { type: "overheatEnd" }
  | { type: "digRecoil"; recoil: number; tier: number }
  | { type: "jump"; tier: number; weight: number }
  | { type: "heavyLanding"; tier: number; x: number; y: number }
  | { type: "landing"; impact: number; tier: number; weight: number }
  | { type: "pressureRelease"; x: number; y: number; force: number }
  | { type: "aftermath"; x: number; y: number; kind: string; tier?: number }
  | { type: "hazardWarn"; kind: string; x: number; y: number; severity: number }
  | { type: "threatSteal"; id: number; res: string; amount: number }
  | { type: "crystalStabilize"; x: number; y: number }
  | { type: "drain"; x: number; y: number }
  | { type: "flood"; x: number; y: number };

export type SimListener = (e: SimEvent) => void;

export class EventBus {
  private listeners: SimListener[] = [];
  private log: { t: number; e: SimEvent }[] = [];
  private logCap = 256;
  private counts = new Map<string, number>();
  on(fn: SimListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }
  emit(e: SimEvent) {
    this.log.push({ t: Date.now(), e });
    if (this.log.length > this.logCap) this.log.shift();
    this.counts.set(e.type, (this.counts.get(e.type) ?? 0) + 1);
    for (const fn of this.listeners) fn(e);
  }
  recent(n = 12): SimEvent[] {
    return this.log.slice(-n).map((r) => r.e);
  }
  eventCounts(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
  dumpLog(): { t: number; type: string }[] {
    return this.log.map((r) => ({ t: r.t, type: r.e.type }));
  }
  clearLog() {
    this.log.length = 0;
    this.counts.clear();
  }
}
