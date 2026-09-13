/**
 * DEEPER — DOM UI: HUD, toasts, banners, and helpers.
 * All menus live in the #ui layer above the canvas; keyboard accessible.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, parent?: HTMLElement, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function button(parent: HTMLElement, label: string, onClick: () => void, cls = "btn"): HTMLButtonElement {
  const b = el("button", cls, parent, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

export interface ToastKind {
  text: string;
  color?: string;
  icon?: string;
}

const TOAST_ICONS: Record<string, string> = {
  money: "¤", cargo: "⛁", warn: "⚠", info: "◈", loot: "◆", tool: "⚒", map: "▦", heart: "♥",
};

export interface SettingsState {
  master: number; sfx: number; ambient: number; shake: number; reducedMotion: boolean;
  assistMode: boolean; highContrast: boolean;
}

export class UI {
  hud = document.getElementById("hud") as HTMLElement;
  toastsEl = document.getElementById("toasts") as HTMLElement;
  menuEl = document.getElementById("menu") as HTMLElement;
  attractEl = document.getElementById("attract") as HTMLElement;

  private cargoBar: HTMLElement;
  private cargoText: HTMLElement;
  private moneyText: HTMLElement;
  private depthText: HTMLElement;
  private depthBar: HTMLElement;
  private hpBar: HTMLElement;
  private hpText: HTMLElement;
  private toolText: HTMLElement;
  private toolStrip: HTMLElement;
  private hazardText: HTMLElement;
  private markerText: HTMLElement;
  private comboText: HTMLElement;
  private liftBar: HTMLElement;
  private diag: HTMLElement;
  private toastQueue: ToastKind[] = [];
  private activeToasts = 0;
  private recentToasts = new Map<string, number>();
  private bannerQueue: { title: string; sub: string; ms: number; cls: string }[] = [];
  private bannerActive = false;
  reducedMotion = false;
  /** Touch controls root (created on demand). */
  touchRoot: HTMLElement | null = null;

  constructor() {
    const left = el("div", "hud-left", this.hud);
    left.setAttribute("role", "status");
    left.setAttribute("aria-label", "Rig status");
    const row1 = el("div", "hud-row", left);
    this.moneyText = el("span", "hud-chip", row1);
    this.moneyText.id = "hud-money";
    this.cargoText = el("span", "hud-chip", row1);
    this.cargoText.id = "hud-cargo";
    const cargoWrap = el("div", "bar-wrap", left);
    cargoWrap.title = "Cargo";
    this.cargoBar = el("div", "bar cargo", cargoWrap);
    const hpWrap = el("div", "bar-wrap", left);
    hpWrap.title = "Rig integrity";
    this.hpBar = el("div", "bar hp", hpWrap);
    this.hpText = el("span", "hud-chip hp-num", left);
    this.hpText.id = "hud-hp";
    const row2 = el("div", "hud-row", left);
    this.depthText = el("span", "hud-chip", row2);
    this.toolText = el("span", "hud-chip", row2);
    const depthWrap = el("div", "bar-wrap depth-wrap", left);
    depthWrap.title = "Progress to next stratum";
    this.depthBar = el("div", "bar depth", depthWrap);
    this.hazardText = el("span", "hud-chip hazard", row2);
    this.markerText = el("span", "hud-chip marker", row2);
    this.comboText = el("span", "hud-chip combo", row2);
    const liftWrap = el("div", "bar-wrap lift-wrap", left);
    liftWrap.title = "Lift travel channel";
    this.liftBar = el("div", "bar lift", liftWrap);
    liftWrap.style.display = "none";
    this.liftBar.parentElement!.id = "lift-wrap";
    this.toolStrip = el("div", "tool-strip", left);
    this.toolStrip.setAttribute("role", "toolbar");
    this.toolStrip.setAttribute("aria-label", "Excavation systems");
    const right = el("div", "hud-right", this.hud);
    right.id = "hud-right";
    this.diag = el("div", "diag", this.hud);
    this.diag.id = "diag";
    this.diag.style.display = "none";
  }

  hudUpdate(s: {
    money: number; cargoUsed: number; cargoCap: number; depth: number; stratum: string;
    tool: string; toolTier: number; hp: number; maxHp: number; hazard: string;
    markers: number; vulnerable: number; charges: number;
    ownedTools?: number; depthProgress?: number; nextStratum?: string;
    liftProgress?: number; combo?: number; streak?: number; toolNames?: string[];
  }) {
    this.moneyText.textContent = `¤ ${s.money.toLocaleString()}`;
    const pct = Math.round((s.cargoUsed / Math.max(1, s.cargoCap)) * 100);
    this.cargoText.textContent = `CARGO ${Math.floor(s.cargoUsed)}/${s.cargoCap} (${pct}%)${s.charges ? `  ⛁${s.charges}` : ""}`;
    this.cargoBar.style.width = `${Math.min(100, (s.cargoUsed / s.cargoCap) * 100)}%`;
    this.cargoBar.style.background = s.cargoUsed >= s.cargoCap ? "#e05838" : "#d8a83c";
    this.hpBar.style.width = `${(s.hp / s.maxHp) * 100}%`;
    this.hpBar.style.background = s.hp > s.maxHp * 0.5 ? "#5fae5a" : s.hp > s.maxHp * 0.25 ? "#d8a83c" : "#e05838";
    this.hpText.textContent = `HULL ${Math.ceil(s.hp)}/${s.maxHp}`;
    this.depthText.textContent = `DEPTH ${Math.max(0, s.depth)}m · ${s.stratum.toUpperCase()}`;
    if (s.depthProgress !== undefined) {
      this.depthBar.style.width = `${Math.round(s.depthProgress * 100)}%`;
      (this.depthBar.parentElement as HTMLElement).style.display = "";
      (this.depthBar.parentElement as HTMLElement).title = s.nextStratum ? `Next: ${s.nextStratum}` : "Deepest stratum";
    }
    this.toolText.textContent = `T${s.toolTier} ${s.tool.toUpperCase()}`;
    // tool selector strip (owned tools with hotkeys)
    if (s.toolNames && s.ownedTools !== undefined) {
      if (this.toolStrip.childElementCount !== s.ownedTools + 1) {
        this.toolStrip.innerHTML = "";
        for (let t = 0; t <= s.ownedTools; t++) {
          const chip = el("span", `tool-chip${t === s.toolTier ? " active" : ""}`, this.toolStrip, `${t + 1}`);
          chip.title = s.toolNames[t] ?? `T${t}`;
        }
      } else {
        [...this.toolStrip.children].forEach((c, i) => {
          c.classList.toggle("active", i === s.toolTier);
        });
      }
    }
    this.hazardText.textContent = s.hazard;
    this.hazardText.style.display = s.hazard ? "" : "none";
    this.markerText.textContent = s.vulnerable > 0 ? `${s.vulnerable} marked site${s.vulnerable === 1 ? "" : "s"} now vulnerable` : "";
    this.markerText.style.display = s.vulnerable > 0 ? "" : "none";
    const combo = s.combo ?? 0;
    const streak = s.streak ?? 0;
    this.comboText.textContent = combo > 1 ? `RESONANCE ×${combo}` : streak >= 5 ? `MAGNET STREAK ×${streak}` : "";
    this.comboText.style.display = combo > 1 || streak >= 5 ? "" : "none";
    // lift channel progress
    const lp = s.liftProgress ?? 0;
    (this.liftBar.parentElement as HTMLElement).style.display = lp > 0 ? "" : "none";
    this.liftBar.style.width = `${Math.round(lp * 100)}%`;
  }

  toast(t: ToastKind) {
    // dedupe: same text within 3s is dropped
    const now = Date.now();
    const last = this.recentToasts.get(t.text) ?? 0;
    if (now - last < 3000) return;
    this.recentToasts.set(t.text, now);
    this.toastQueue.push(t);
    if (this.toastQueue.length > 5) this.toastQueue.shift();
    this.pumpToasts();
  }

  private pumpToasts() {
    if (this.activeToasts >= 3) return;
    const t = this.toastQueue.shift();
    if (!t) return;
    this.activeToasts++;
    const icon = t.icon && TOAST_ICONS[t.icon] ? `${TOAST_ICONS[t.icon]} ` : "";
    const d = el("div", "toast", this.toastsEl, `${icon}${t.text}`);
    if (t.color) d.style.borderColor = t.color;
    d.setAttribute("role", "status");
    if (!this.reducedMotion) requestAnimationFrame(() => d.classList.add("show"));
    else d.classList.add("show");
    window.setTimeout(() => {
      d.classList.remove("show");
      window.setTimeout(() => d.remove(), this.reducedMotion ? 0 : 400);
      this.activeToasts--;
      this.pumpToasts();
    }, 3400);
  }

  banner(title: string, sub: string, ms = 3600, cls = "") {
    this.bannerQueue.push({ title, sub, ms, cls });
    if (this.bannerQueue.length > 3) this.bannerQueue.shift();
    this.pumpBanners();
  }

  private pumpBanners() {
    if (this.bannerActive) return;
    const b = this.bannerQueue.shift();
    if (!b) return;
    this.bannerActive = true;
    const d = el("div", `banner ${b.cls}`, this.toastsEl);
    d.setAttribute("role", "alert");
    el("div", "banner-title", d, b.title);
    if (b.sub) el("div", "banner-sub", d, b.sub);
    if (!this.reducedMotion) requestAnimationFrame(() => d.classList.add("show"));
    else d.classList.add("show");
    window.setTimeout(() => {
      d.classList.remove("show");
      window.setTimeout(() => d.remove(), this.reducedMotion ? 0 : 600);
      this.bannerActive = false;
      this.pumpBanners();
    }, b.ms);
  }

  setDiag(text: string | null) {
    if (text === null) {
      this.diag.style.display = "none";
    } else {
      this.diag.style.display = "";
      this.diag.textContent = text;
    }
  }

  clearMenu() {
    this.menuEl.innerHTML = "";
    this.menuEl.classList.remove("open");
    this.attractEl.innerHTML = "";
  }

  /** Focus trap: keeps Tab inside open modals (accessibility). */
  trapFocus(container: HTMLElement) {
    const sel = "button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";
    const els = () => [...container.querySelectorAll<HTMLElement>(sel)].filter((e) => !e.hasAttribute("disabled"));
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const list = els();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    const list = els();
    if (list.length) list[0].focus();
  }

  showTitle(
    onNew: (seed?: number) => void, onContinue: () => void, onSettings: () => void, onCredits: () => void,
    hasSave: boolean, saveInfo?: { money: number; depth: number; playtime: number } | null,
  ) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel title-panel", this.menuEl);
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Title menu");
    const img = el("img", "title-logo", wrap);
    img.src = "assets/logo.png";
    img.alt = "DEEPER";
    el("div", "tagline", wrap, "EVERYTHING EVENTUALLY BREAKS.");
    if (hasSave && saveInfo) {
      const mins = Math.floor(saveInfo.playtime / 60);
      el("div", "save-info", wrap, `Saved rig: ¤${saveInfo.money.toLocaleString()} · ${saveInfo.depth}m deep · ${mins} min underground`);
    }
    const btns = el("div", "title-btns", wrap);
    if (hasSave) button(btns, "CONTINUE", onContinue, "btn primary");
    button(btns, "NEW GAME", () => {
      const v = (document.getElementById("seed-input") as HTMLInputElement | null)?.value.trim();
      onNew(v ? (Number(v) >>> 0 || [...v].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7)) : undefined);
    }, hasSave ? "btn" : "btn primary");
    button(btns, "SETTINGS", onSettings);
    button(btns, "CREDITS", onCredits);
    const seedRow = el("label", "seed-row", wrap);
    el("span", "", seedRow, "SEED (optional): ");
    const seed = el("input", "seed-input", seedRow) as HTMLInputElement;
    seed.id = "seed-input";
    seed.placeholder = "random";
    seed.setAttribute("aria-label", "World seed for new game");
    el("div", "title-hint", wrap, "Keyboard + mouse · Dig. Sell. Upgrade. Go deeper.");
    el("div", "version-foot", wrap, "DEEPER v1.1.0-iter1 · saves in your browser · no accounts");
    this.trapFocus(wrap);
  }

  showPause(
    onResume: () => void, onSettings: () => void, onQuit: () => void,
    stats?: { cells: number; ore: number; money: number; playtime: number; depth: number },
  ) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel", this.menuEl);
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Paused");
    el("h2", "", wrap, "PAUSED");
    if (stats) {
      const mins = Math.floor(stats.playtime / 60);
      const box = el("div", "pause-stats", wrap);
      el("div", "", box, `Depth ${stats.depth}m · ${stats.cells.toLocaleString()} cells broken · ${stats.ore.toLocaleString()} ore`);
      el("div", "", box, `¤${stats.money.toLocaleString()} earned · ${mins} min underground`);
    }
    el("div", "controls-recap", wrap, "LMB dig · RMB utility · E interact · M map · 1–8 tools");
    const btns = el("div", "stack", wrap);
    button(btns, "RESUME", onResume, "btn primary");
    button(btns, "SETTINGS", onSettings);
    button(btns, "SAVE & QUIT TO TITLE", onQuit);
    this.trapFocus(wrap);
  }

  showSettings(
    s: SettingsState,
    onChange: (s: SettingsState) => void,
    onClose: () => void,
    extras?: {
      bindings?: Record<string, string[]>;
      onResetBindings?: () => void;
      onExportSave?: () => void;
      onImportSave?: (json: string) => boolean;
      onResetSave?: () => void;
    },
  ) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel", this.menuEl);
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Settings");
    el("h2", "", wrap, "SETTINGS");
    const stack = el("div", "stack settings", wrap);
    const mkSlider = (label: string, val: number, cb: (v: number) => void) => {
      const row = el("label", "setting-row", stack);
      el("span", "", row, label);
      const input = el("input", "", row) as HTMLInputElement;
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      input.value = String(val);
      input.setAttribute("aria-label", label);
      input.addEventListener("input", () => cb(Number(input.value)));
      const out = el("span", "setting-val", row, `${Math.round(val * 100)}%`);
      input.addEventListener("input", () => (out.textContent = `${Math.round(Number(input.value) * 100)}%`));
    };
    mkSlider("MASTER VOLUME", s.master, (v) => onChange({ ...s, master: v }));
    mkSlider("EFFECTS", s.sfx, (v) => onChange({ ...s, sfx: v }));
    mkSlider("AMBIENCE", s.ambient, (v) => onChange({ ...s, ambient: v }));
    mkSlider("SCREEN SHAKE", s.shake, (v) => onChange({ ...s, shake: v }));
    const mkToggle = (label: string, val: boolean, cb: (v: boolean) => void, hint?: string) => {
      const row = el("label", "setting-row", stack);
      el("span", "", row, label);
      const cbx = el("input", "", row) as HTMLInputElement;
      cbx.type = "checkbox";
      cbx.checked = val;
      cbx.setAttribute("aria-label", label);
      cbx.addEventListener("change", () => cb(cbx.checked));
      if (hint) el("span", "setting-hint", row, hint);
    };
    mkToggle("REDUCED MOTION", s.reducedMotion, (v) => onChange({ ...s, reducedMotion: v }));
    mkToggle("ASSIST MODE (2× hull, softer threats)", s.assistMode, (v) => onChange({ ...s, assistMode: v }));
    mkToggle("HIGH CONTRAST UI", s.highContrast, (v) => onChange({ ...s, highContrast: v }));
    if (extras?.bindings) {
      const b = el("div", "bindings-list", wrap);
      el("h3", "", b, "KEY BINDINGS");
      for (const [action, keys] of Object.entries(extras.bindings)) {
        const r = el("div", "control-row", b);
        el("span", "", r, action);
        el("kbd", "", r, keys.join(" / "));
      }
      if (extras.onResetBindings) button(b, "RESET BINDINGS", extras.onResetBindings, "btn small");
    }
    const controls = el("div", "controls-list", wrap);
    el("h3", "", controls, "CONTROLS");
    for (const c of [
      ["A / D or ←/→", "Drive"], ["SPACE", "Jump / boost"], ["MOUSE", "Aim drill"],
      ["LEFT CLICK", "Excavate"], ["RIGHT CLICK", "Utility (scan / charge / resonance)"],
      ["E", "Interact"], ["1–8", "Select excavation system"], ["M / TAB", "Map"],
      ["F3", "Diagnostics"], ["ESC", "Pause"], ["GAMEPAD", "Stick drive · RT dig · LB utility"],
    ]) {
      const r = el("div", "control-row", controls);
      el("kbd", "", r, c[0]);
      el("span", "", r, c[1]);
    }
    if (extras && (extras.onExportSave || extras.onImportSave || extras.onResetSave)) {
      const saveBox = el("div", "save-tools", wrap);
      el("h3", "", saveBox, "SAVE DATA");
      const row = el("div", "stack", saveBox);
      if (extras.onExportSave) button(row, "EXPORT SAVE (JSON)", extras.onExportSave, "btn small");
      if (extras.onImportSave) {
        button(row, "IMPORT SAVE", () => {
          const ta = document.getElementById("import-box") as HTMLTextAreaElement | null;
          if (ta && ta.value.trim()) {
            const ok = extras.onImportSave!(ta.value.trim());
            this.toast({ text: ok ? "Save imported — reloading." : "Import failed: invalid save.", color: ok ? "#5fe07a" : "#e05838" });
            if (ok) window.setTimeout(() => window.location.reload(), 800);
          }
        }, "btn small");
        const ta = el("textarea", "import-box", saveBox) as HTMLTextAreaElement;
        ta.id = "import-box";
        ta.placeholder = "Paste exported save JSON here…";
        ta.setAttribute("aria-label", "Import save JSON");
      }
      if (extras.onResetSave) button(row, "DELETE SAVE", extras.onResetSave, "btn small danger");
    }
    const btns = el("div", "stack", wrap);
    button(btns, "CLOSE", onClose, "btn primary");
    this.trapFocus(wrap);
  }

  showCredits(onClose: () => void) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel", this.menuEl);
    el("h2", "", wrap, "CREDITS");
    const c = el("div", "credits", wrap);
    c.innerHTML = `
      <p><b>DEEPER</b> — EVERYTHING EVENTUALLY BREAKS.</p>
      <p>Design, code, pixel art and audio generated as original work for this project.</p>
      <p>Built with Phaser 4, TypeScript and Vite. All art and audio generated
      deterministically by the project's own tools (see LICENSES.md).</p>
      <p>No analytics. No accounts. Your saves live in your browser.</p>`;
    button(wrap, "BACK", onClose, "btn primary stack");
  }

  showGameExtracted(onClose: () => void, lostValue: number) {
    const d = el("div", "modal", this.menuEl);
    d.classList.add("open");
    const wrap = el("div", "panel", d);
    el("h2", "", wrap, "EMERGENCY EXTRACTION");
    el("p", "", wrap, `The rig was recovered by winch. Upgrades and the world are intact. ${lostValue > 0 ? `Lost cargo worth ¤${lostValue}.` : "The hopper was empty."}`);
    button(wrap, "BACK TO WORK", onClose, "btn primary");
  }

  diagText(fps: number, chunks: number, particles: number, liquid: number, gas: number, draws: number): string {
    return `FPS ${fps.toFixed(0)} · chunks ${chunks} · particles ${particles} · liquid cells ${liquid} · gas cells ${gas} · draw ${draws}`;
  }

  /** Expanded diagnostics: sim tick, env perf, world metrics, event counts. */
  diagText2(d: {
    fps: number; tick: number; x: number; y: number; chunks: number; dirty: number;
    particles: number; liquid: number; gas: number; threats: number; loot: number;
    envMs: number; envOver: number; cellsSet: number; coalesced: number;
    events: Record<string, number>;
  }): string {
    const top = Object.entries(d.events).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `${k}:${v}`).join(" ");
    return [
      `FPS ${d.fps.toFixed(0)} · tick ${d.tick} · rig (${d.x.toFixed(1)}, ${d.y.toFixed(1)})`,
      `chunks active ${d.chunks} dirty ${d.dirty} · particles ${d.particles} · threats ${d.threats} · loot ${d.loot}`,
      `liquid ${d.liquid} · gas ${d.gas} · env ${d.envMs.toFixed(2)}ms (over ${d.envOver})`,
      `world sets ${d.cellsSet} coalesced ${d.coalesced}`,
      `events: ${top || "—"}`,
    ].join("\n");
  }

  /** On-screen touch controls (drive/dig/jump/utility/interact). */
  showTouchControls(hooks: {
    onLeft: (v: boolean) => void; onRight: (v: boolean) => void;
    onJump: (v: boolean) => void; onDig: (v: boolean) => void;
    onUtility: () => void; onInteract: () => void;
  }) {
    if (this.touchRoot) return;
    const root = el("div", "touch-root", document.getElementById("ui")!);
    root.id = "touch-root";
    const mk = (label: string, cls: string, down: () => void, up?: () => void) => {
      const b = el("button", `touch-btn ${cls}`, root, label);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); down(); });
      b.addEventListener("pointerup", () => up?.());
      b.addEventListener("pointerleave", () => up?.());
      return b;
    };
    mk("◀", "t-left", () => hooks.onLeft(true), () => hooks.onLeft(false));
    mk("▶", "t-right", () => hooks.onRight(true), () => hooks.onRight(false));
    mk("▲", "t-jump", () => hooks.onJump(true), () => hooks.onJump(false));
    mk("⛏", "t-dig", () => hooks.onDig(true), () => hooks.onDig(false));
    mk("◈", "t-util", () => hooks.onUtility());
    mk("E", "t-int", () => hooks.onInteract());
    this.touchRoot = root;
  }

  setHighContrast(on: boolean) {
    document.body.classList.toggle("high-contrast", on);
  }
}
