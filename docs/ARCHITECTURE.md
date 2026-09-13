# DEEPER — ARCHITECTURE

```
┌── presentation (Phaser 4.2.1) ──────────────────────────────┐
│ BootScene (manifest load) → WorldScene (loop, input→sim,    │
│ FX staging, autosave, QA hook window.deeper)                │
│ render/terrain.ts (chunked DynamicTexture tiles)            │
│ render/entities.ts (rig, threats, loot, particles, works)   │
│ ui/dom.ts + ui/menus.ts (DOM layer: HUD, title, workshop,   │
│   map, museum, settings, pause, finale)                     │
├── simulation (pure TS, no Phaser imports) ──────────────────┤
│ sim/game.ts (GameSim: owns subsystems, ticks, event wiring) │
│ sim/world.ts (cells, damage, liquid, deltas, activeChunks)  │
│ sim/worldgen.ts (seeded bands, landmarks, shaft, drainage)  │
│ sim/rig.ts (physics, dig, utility, cargo, upgrades fx)      │
│ sim/tools.ts (8 tool defs, 22 upgrades, affinities)         │
│ sim/materials.ts (40 defs, 8 families)  sim/resources.ts    │
│ sim/env.ts (fall/water/magma/gas/combustion/resonance)      │
│ sim/loot.ts (drops, caches, relics)  sim/threats.ts (7 fams)│
│ sim/blocked.ts (site memory)  sim/base.ts (6 works stages)  │
│ sim/wow.ts (12 beat triggers)  sim/stats.ts  sim/save.ts    │
│ sim/economy.ts (3-channel buy/sell)  sim/events.ts (bus)    │
├── content pipeline ─────────────────────────────────────────┤
│ tools/gen-assets.ts (+art-*) → public/assets PNGs+manifest  │
│ tools/gen-audio.ts → public/assets/audio WAVs               │
└─────────────────────────────────────────────────────────────┘
```

## Rules that keep it honest

- **The sim does not know Phaser exists.** All 22 unit tests and the progression sim run in
  plain Node via Vitest. The scene is a *driver*: it copies input into `sim.input`, calls
  `sim.step(dt)`, and stages FX from bus events.
- **Event bus** (`sim/events.ts`) is the only sim→presentation channel (break, explode,
  hurt, pickup, wow, threatDeath, cargoFull, blockedMarked, …).
- **Determinism**: seeded RNG (`sim/rng.ts`), fixed tick (1/60), stepped collision
  (0.2-cell sub-steps). Same seed + same inputs ⇒ same world and dig results.
- **Persistence**: `sim/save.ts` stores seed + playtime + rig + economy + **terrain deltas**
  (only cells that differ from generated), landmarks discovered, wow flags, blocked sites,
  stats. localStorage keys: `deeper.save`, `deeper.settings`. Autosave every 30 s + on pause.
  Unchanged procedural world is never re-serialized.
- **Chunked simulation**: only chunks near the rig are active; liquid/gas flows are
  worklist-scoped. Renderer warmups tile textures per chunk into DynamicTextures
  (`render()` called per Phaser 4 requirements).

## Phaser 4 (4.2.1) integration notes

- Pinned exact version. Migrated idioms: FX→Filters/Actions; `setTintFill`→`setTint` +
  tint mode; `Geom.Point`→`Vector2`; native `Set`/`Map` (Phaser structs gone);
  DynamicTexture requires explicit `render()`; pipelines→render nodes. `Math.TAU` correction
  respected (v3 value was PI/2; use `Math.PI_OVER_2` for the old behavior).
- No preFX/postFX chains; filters attach to cameras/game objects via the filter lists.
- The canvas is the sole pointer surface: input listens at `document.body` level and ignores
  events originating in `#ui` panels; HUD chips are `pointer-events: none` so digging never
  gets swallowed.

## QA surface

`window.deeper` (WorldScene.makeQAHook): `start(seed)`, `state()` (money, tool tier, cargo,
hp, x/y, cells destroyed, markers, wow set, strata seen, tick, started, paused, digHeld,
inputDig), `sim()` accessor, `save()`, `pause(bool)`. The e2e suite drives the real UI
through this hook plus real mouse/keyboard events.

## CI

`.github/workflows/ci.yml`: install → typecheck → asset check (regenerate in temp + byte
diff, 339 files) → unit (22, incl. progression/power-curve gate) → e2e (6, real Chromium via
npm-delivered binary) → build. `.github/workflows/deploy.yml`: on tag `v*` → build → publish
to GitHub Pages (base `/Deeper/`).
