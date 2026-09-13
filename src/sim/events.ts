/** Minimal typed event bus shared by headless sim and presentation layer. */

export type SimEvent =
  | { type: "dig"; x: number; y: number; mat: number; broke: boolean; tool: number }
  | { type: "break"; x: number; y: number; mat: number; count: number; chain?: boolean }
  | { type: "pickup"; res: string; amount: number; x: number; y: number }
  | { type: "cargoFull" }
  | { type: "sell"; money: number }
  | { type: "explode"; x: number; y: number; radius: number; big: boolean }
  | { type: "ignite"; x: number; y: number }
  | { type: "steam"; x: number; y: number }
  | { type: "resonance"; x: number; y: number; cells: number }
  | { type: "drillHit"; x: number; y: number; mat: number; effective: boolean; toolTier: number }
  | { type: "blocked"; x: number; y: number; mat: number; toolTier: number }
  | { type: "blockedMarked"; x: number; y: number; mat: number }
  | { type: "nowVulnerable"; count: number }
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
  | { type: "threatDeath"; id: number; x: number; y: number; family: string }
  | { type: "geode"; x: number; y: number }
  | { type: "motherlode"; x: number; y: number }
  | { type: "wow"; key: string };

export type SimListener = (e: SimEvent) => void;

export class EventBus {
  private listeners: SimListener[] = [];
  on(fn: SimListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }
  emit(e: SimEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
