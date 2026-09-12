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

export class UI {
  hud = document.getElementById("hud") as HTMLElement;
  toastsEl = document.getElementById("toasts") as HTMLElement;
  menuEl = document.getElementById("menu") as HTMLElement;
  attractEl = document.getElementById("attract") as HTMLElement;

  private cargoBar: HTMLElement;
  private cargoText: HTMLElement;
  private moneyText: HTMLElement;
  private depthText: HTMLElement;
  private hpBar: HTMLElement;
  private toolText: HTMLElement;
  private hazardText: HTMLElement;
  private markerText: HTMLElement;
  private diag: HTMLElement;

  constructor() {
    const left = el("div", "hud-left", this.hud);
    const row1 = el("div", "hud-row", left);
    this.moneyText = el("span", "hud-chip", row1);
    this.moneyText.id = "hud-money";
    this.cargoText = el("span", "hud-chip", row1);
    this.cargoText.id = "hud-cargo";
    const cargoWrap = el("div", "bar-wrap", left);
    this.cargoBar = el("div", "bar cargo", cargoWrap);
    const hpWrap = el("div", "bar-wrap", left);
    this.hpBar = el("div", "bar hp", hpWrap);
    const row2 = el("div", "hud-row", left);
    this.depthText = el("span", "hud-chip", row2);
    this.toolText = el("span", "hud-chip", row2);
    this.hazardText = el("span", "hud-chip hazard", row2);
    this.markerText = el("span", "hud-chip marker", row2);
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
  }) {
    this.moneyText.textContent = `¤ ${s.money.toLocaleString()}`;
    this.cargoText.textContent = `CARGO ${Math.floor(s.cargoUsed)}/${s.cargoCap}${s.charges ? `  ⛁${s.charges}` : ""}`;
    this.cargoBar.style.width = `${Math.min(100, (s.cargoUsed / s.cargoCap) * 100)}%`;
    this.cargoBar.style.background = s.cargoUsed >= s.cargoCap ? "#e05838" : "#d8a83c";
    this.hpBar.style.width = `${(s.hp / s.maxHp) * 100}%`;
    this.hpBar.style.background = s.hp > 50 ? "#5fae5a" : s.hp > 25 ? "#d8a83c" : "#e05838";
    this.depthText.textContent = `DEPTH ${Math.max(0, s.depth)}m · ${s.stratum.toUpperCase()}`;
    this.toolText.textContent = `T${s.toolTier} ${s.tool.toUpperCase()}`;
    this.hazardText.textContent = s.hazard;
    this.hazardText.style.display = s.hazard ? "" : "none";
    this.markerText.textContent = s.vulnerable > 0 ? `${s.vulnerable} marked site${s.vulnerable === 1 ? "" : "s"} now vulnerable` : "";
    this.markerText.style.display = s.vulnerable > 0 ? "" : "none";
  }

  toast(t: ToastKind) {
    const d = el("div", "toast", this.toastsEl, t.text);
    if (t.color) d.style.borderColor = t.color;
    requestAnimationFrame(() => d.classList.add("show"));
    window.setTimeout(() => {
      d.classList.remove("show");
      window.setTimeout(() => d.remove(), 400);
    }, 3400);
  }

  banner(title: string, sub: string, ms = 3600, cls = "") {
    const d = el("div", `banner ${cls}`, this.toastsEl);
    el("div", "banner-title", d, title);
    if (sub) el("div", "banner-sub", d, sub);
    requestAnimationFrame(() => d.classList.add("show"));
    window.setTimeout(() => {
      d.classList.remove("show");
      window.setTimeout(() => d.remove(), 600);
    }, ms);
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

  showTitle(onNew: () => void, onContinue: () => void, onSettings: () => void, onCredits: () => void, hasSave: boolean) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel title-panel", this.menuEl);
    const img = el("img", "title-logo", wrap);
    img.src = "assets/logo.png";
    img.alt = "DEEPER";
    el("div", "tagline", wrap, "EVERYTHING EVENTUALLY BREAKS.");
    const btns = el("div", "title-btns", wrap);
    if (hasSave) button(btns, "CONTINUE", onContinue, "btn primary");
    button(btns, "NEW GAME", onNew, hasSave ? "btn" : "btn primary");
    button(btns, "SETTINGS", onSettings);
    button(btns, "CREDITS", onCredits);
    el("div", "title-hint", wrap, "Keyboard + mouse · Dig. Sell. Upgrade. Go deeper.");
  }

  showPause(onResume: () => void, onSettings: () => void, onQuit: () => void) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel", this.menuEl);
    el("h2", "", wrap, "PAUSED");
    const btns = el("div", "stack", wrap);
    button(btns, "RESUME", onResume, "btn primary");
    button(btns, "SETTINGS", onSettings);
    button(btns, "SAVE & QUIT TO TITLE", onQuit);
  }

  showSettings(
    s: { master: number; sfx: number; ambient: number; shake: number; reducedMotion: boolean },
    onChange: (s: { master: number; sfx: number; ambient: number; shake: number; reducedMotion: boolean }) => void,
    onClose: () => void,
  ) {
    this.clearMenu();
    this.menuEl.classList.add("open");
    const wrap = el("div", "panel", this.menuEl);
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
      input.addEventListener("input", () => cb(Number(input.value)));
      const out = el("span", "setting-val", row, `${Math.round(val * 100)}%`);
      input.addEventListener("input", () => (out.textContent = `${Math.round(Number(input.value) * 100)}%`));
    };
    mkSlider("MASTER VOLUME", s.master, (v) => onChange({ ...s, master: v }));
    mkSlider("EFFECTS", s.sfx, (v) => onChange({ ...s, sfx: v }));
    mkSlider("AMBIENCE", s.ambient, (v) => onChange({ ...s, ambient: v }));
    mkSlider("SCREEN SHAKE", s.shake, (v) => onChange({ ...s, shake: v }));
    const row = el("label", "setting-row", stack);
    el("span", "", row, "REDUCED MOTION");
    const cb = el("input", "", row) as HTMLInputElement;
    cb.type = "checkbox";
    cb.checked = s.reducedMotion;
    cb.addEventListener("change", () => onChange({ ...s, reducedMotion: cb.checked }));
    const controls = el("div", "controls-list", wrap);
    el("h3", "", controls, "CONTROLS");
    for (const c of [
      ["A / D or ←/→", "Drive"], ["SPACE", "Jump / boost"], ["MOUSE", "Aim drill"],
      ["LEFT CLICK", "Excavate"], ["RIGHT CLICK", "Utility (scan / charge / resonance)"],
      ["E", "Interact"], ["1–8", "Select excavation system"], ["M / TAB", "Map"],
      ["F3", "Diagnostics"], ["ESC", "Pause"],
    ]) {
      const r = el("div", "control-row", controls);
      el("kbd", "", r, c[0]);
      el("span", "", r, c[1]);
    }
    const btns = el("div", "stack", wrap);
    button(btns, "CLOSE", onClose, "btn primary");
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
}
