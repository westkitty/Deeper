/**
 * DEEPER — input. Keyboard + mouse, centrally bound, DOM-menu aware.
 * Pointer aim is converted to world cells by the scene.
 */

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

  /** Movement helpers. */
  get left(): boolean {
    return this.keys.has("a") || this.keys.has("arrowleft");
  }
  get right(): boolean {
    return this.keys.has("d") || this.keys.has("arrowright");
  }
  get jump(): boolean {
    return this.keys.has(" ");
  }
  get down(): boolean {
    return this.keys.has("s") || this.keys.has("arrowdown");
  }
  get up(): boolean {
    return this.keys.has("w") || this.keys.has("arrowup");
  }
  /** Utility trigger edge. */
  get utilityPressed(): boolean {
    return this.utilityHeld;
  }

  detach() {
    document.body.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointermove", this.onPointerMove);
  }
}
