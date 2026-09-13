/**
 * DEEPER — input. Keyboard + mouse, centrally bound, DOM-menu aware.
 * Pointer aim is converted to world cells by the scene.
 */

export interface KeyBindings {
  left: string[]; right: string[]; jump: string[]; down: string[];
  interact: string[]; map: string[]; pause: string[]; diag: string[];
}

const DEFAULT_BINDINGS: KeyBindings = {
  left: ["a", "arrowleft"], right: ["d", "arrowright"], jump: [" "],
  down: ["s", "arrowdown"], interact: ["e"], map: ["m", "tab"],
  pause: ["escape"], diag: ["f3"],
};

export class InputManager {
  keys = new Set<string>();
  digHeld = false;
  utilityHeld = false;
  /** Screen-space pointer. */
  pointerX = 0;
  pointerY = 0;
  /** Consumable edge presses. */
  private pressed: string[] = [];
  enabled = true;
  /** Remappable bindings (persisted to localStorage by the scene). */
  bindings: KeyBindings = structuredClone(DEFAULT_BINDINGS);
  /** Gamepad state (polled). */
  gamepadEnabled = true;
  private gamepadDig = false;
  private gamepadUtil = false;
  private lastEdge = new Map<string, number>();
  /** Touch controls state (set by on-screen buttons). */
  touchLeft = false;
  touchRight = false;
  touchJump = false;
  touchDig = false;
  /** Set false while DOM menus own the keyboard. */
  private handlers: ((k: string) => void)[] = [];

  attach(_el: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    // listen at body level: overlays (HUD chips) must not swallow dig intent
    document.body.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointermove", this.onPointerMove);
    document.body.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.digHeld = false;
      this.utilityHeld = false;
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      return;
    }
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    // avoid browser find-etc hijacks for game keys
    if (["tab", " ", "arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
    if (this.enabled) this.keys.add(k);
    this.pressed.push(k);
    for (const h of this.handlers) h(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onPointerDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("#ui .panel, #ui .modal, #ui button, input, select, textarea, a")) return;
    if (e.button === 0) this.digHeld = true;
    if (e.button === 2) this.utilityHeld = true;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.button === 0) this.digHeld = false;
    if (e.button === 2) this.utilityHeld = false;
  };
  private onPointerMove = (e: PointerEvent) => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
  };

  /** Subscribe to key presses (edges). Returns unsubscribe. */
  onPress(fn: (k: string) => void): () => void {
    this.handlers.push(fn);
    return () => {
      const i = this.handlers.indexOf(fn);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  wasPressed(k: string): boolean {
    const i = this.pressed.indexOf(k);
    if (i >= 0) {
      this.pressed.splice(i, 1);
      return true;
    }
    return false;
  }

  clearPressed() {
    this.pressed.length = 0;
  }

  /** Poll gamepad (call once per frame): sticks drive, RT digs, LB utility. */
  pollGamepad() {
    if (!this.gamepadEnabled) return;
    try {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = [...pads].find((p) => p?.connected);
      if (!gp) { this.gamepadDig = false; this.gamepadUtil = false; return; }
      const ax = gp.axes[0] ?? 0;
      if (ax < -0.35) this.keys.add("__pad_left");
      else this.keys.delete("__pad_left");
      if (ax > 0.35) this.keys.add("__pad_right");
      else this.keys.delete("__pad_right");
      if (gp.buttons[0]?.pressed) this.keys.add("__pad_jump");
      else this.keys.delete("__pad_jump");
      this.gamepadDig = !!(gp.buttons[7]?.pressed || gp.buttons[5]?.pressed);
      this.gamepadUtil = !!gp.buttons[4]?.pressed;
      // right stick aims: nudge pointer toward stick direction
      const rx = gp.axes[2] ?? 0;
      const ry = gp.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.4) {
        this.pointerX = Math.max(0, Math.min(innerWidth, this.pointerX + rx * 14));
        this.pointerY = Math.max(0, Math.min(innerHeight, this.pointerY + ry * 14));
      }
    } catch { /* gamepad unavailable */ }
  }

  /** Edge-debounced press check (ms): ignores key-repeat ghosts. */
  edgeDebounced(k: string, ms = 120): boolean {
    const now = performance.now();
    const last = this.lastEdge.get(k) ?? -1e9;
    if (now - last < ms) return false;
    this.lastEdge.set(k, now);
    return this.wasPressed(k);
  }

  remap(action: keyof KeyBindings, keys: string[]) {
    this.bindings[action] = keys.map((k) => k.toLowerCase());
    try { localStorage.setItem("deeper.bindings", JSON.stringify(this.bindings)); } catch { /* ignore */ }
  }
  loadBindings() {
    try {
      const raw = localStorage.getItem("deeper.bindings");
      if (raw) this.bindings = { ...structuredClone(DEFAULT_BINDINGS), ...JSON.parse(raw) };
    } catch { /* defaults */ }
  }
  resetBindings() {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    try { localStorage.removeItem("deeper.bindings"); } catch { /* ignore */ }
  }

  private hasAny(list: string[]): boolean {
    return list.some((k) => this.keys.has(k));
  }
  /** Movement helpers. */
  get left(): boolean {
    return this.hasAny(this.bindings.left) || this.keys.has("__pad_left") || this.touchLeft;
  }
  get right(): boolean {
    return this.hasAny(this.bindings.right) || this.keys.has("__pad_right") || this.touchRight;
  }
  get jump(): boolean {
    return this.hasAny(this.bindings.jump) || this.keys.has("__pad_jump") || this.touchJump;
  }
  get down(): boolean {
    return this.hasAny(this.bindings.down);
  }
  get up(): boolean {
    return this.keys.has("w") || this.keys.has("arrowup");
  }
  get digActive(): boolean {
    return this.digHeld || this.gamepadDig || this.touchDig;
  }
  /** Utility trigger edge. */
  get utilityPressed(): boolean {
    return this.utilityHeld || this.gamepadUtil;
  }

  detach() {
    document.body.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointermove", this.onPointerMove);
  }
}
