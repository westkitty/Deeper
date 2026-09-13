# DEEPER — SELF-IMPROVEMENT LOG

Recursive iteration record. Each invocation of the improvement agent performs ONE
iteration (exactly 60 implemented improvements: 15 UI/UX + 15 asset + 15 gameplay +
15 backend/technical), validates, and appends here. Future iterations must read this
file first and must NOT repeat work already done — pick new ground.

Format per iteration: date, baseline commit, the 60 items grouped by category with
the files touched, validation evidence, and known follow-ups.

---

## Iteration 1 — 2026-09-13 (v1.1.0)

- Baseline: `eef0f57` (docs: deployment state — CI green, Pages pending owner enablement)
- Branch: `arena/01a098ef-deeper`
- Result: 396 frames (+59) / 20 animations (+4) / 44 WAVs (+9); 34 unit tests (+12);
  power contract unchanged (1.77 → 36.23 cells/s = 20.5×, gate ≥ 20×).
- Validation: `tsc --noEmit` clean · `vitest run` 34/34 · `assets --check` OK (399 files) ·
  `vite build` 1.58 MB / 431 KB gzip (budget 2.0 MB) · Playwright e2e 6/6 green
  (title/new-game, dig+pickup, pause+settings, map, workshop sell/buy, save/reload/continue).

### UI/UX (15)

1. HUD hull readout: numeric `HULL hp/max` chip + threshold-colored bar (was bar-only). (`src/ui/dom.ts`)
2. HUD cargo percent + depth-progress bar to next stratum with label. (`src/ui/dom.ts`, `src/scenes/WorldScene.ts`, `src/config.ts` STRATUM_DEPTHS)
3. HUD tool selector strip: owned tools as `1–8` chips with active highlight + tooltips. (`src/ui/dom.ts`)
4. Toast system: queue (max 5, 3 concurrent), 3 s dedupe, 8 icon kinds, reduced-motion path, `role=status`. (`src/ui/dom.ts`)
5. Banner system: queue (max 3), reduced-motion path, `role=alert`. (`src/ui/dom.ts`)
6. Workshop: upgrade search filter + affordable-first sort toggle. (`src/ui/menus.ts`)
7. Workshop: per-cargo-row tier dots + bulk units, cartographer/refinery bonus lines, bulk-haul hint. (`src/ui/menus.ts`)
8. Map: zoom controls (1–6×), blocked/vulnerable-only/scans filters, stratum band dividers + labels, scan overlays, death caches, per-stratum break counts. (`src/ui/menus.ts`)
9. Settings: assist mode, high-contrast UI, key-binding display + reset, save export/import/reset. (`src/ui/dom.ts`, `src/scenes/WorldScene.ts`)
10. Title: optional seed input (numeric or hashed string), save summary line (money/depth/time), version footer. (`src/ui/dom.ts`, `src/scenes/WorldScene.ts`, `src/sim/save.ts`)
11. Pause: session stats block (depth/cells/ore/earned/time) + controls recap. (`src/ui/dom.ts`, `src/scenes/WorldScene.ts`)
12. Finale: 6 new stat rows (combos, threats, scans, charges, lifts, recoveries), per-stratum destruction breakdown, CSV export. (`src/ui/menus.ts`, `src/sim/stats.ts`)
13. Accessibility: modal focus traps + aria roles/labels, high-contrast theme, HUD `role=status`. (`src/ui/dom.ts`, `src/ui/menus.ts`, `src/style.css`)
14. Touch controls: on-screen drive/jump/dig/utility/interact buttons on touch devices. (`src/ui/dom.ts`, `src/scenes/WorldScene.ts`, `src/input.ts`, `src/style.css`)
15. Diagnostics overlay v2: 5-line readout (tick/rig, chunks/dirty/particles/threats/loot, env ms/over-budget, world sets/coalesced, top events). (`src/ui/dom.ts`, `src/scenes/WorldScene.ts`)

### Asset (15)

16. Terrain 4th variants for soil/stone/basalt/crystal/concrete/sandstone + 3 fossil decals. (`tools/art.ts`, `src/render/terrain.ts`)
17. Ore sparkle overlays + bright tungsten/quartz/voidgem variants; renderer places them on rich cells. (`tools/art.ts`, `src/render/terrain.ts`)
18. Rig critical damage chassis (`chassis_3`: scorch, cracked glass, exposed wiring, sparks) + idle variant; renderer uses 4 HP bands. (`tools/art-rig.ts`, `tools/gen-assets.ts`, `src/render/entities.ts`)
19. Charge armed-blink frame + blast-preview ring + tool overheat glow; oldest charge highlighted for remote detonate. (`tools/art-rig.ts`, `tools/gen-assets.ts`, `src/render/entities.ts`)
20. Elite + telegraph threat frames for all 7 families (crown/rim-light, white-flash + brackets). (`tools/art-entities.ts`, `tools/gen-assets.ts`, `src/render/entities.ts`)
21. 12 new UI icons: filter, zoom_in/out, export, warn, check, lock, bolt, magnet, skull2, compass, crate. (`tools/art-entities.ts`, `tools/gen-assets.ts`)
22. Interaction props: open valve, engine core, death cache, scan pylon, cache map; caches use them (lift car, drained valve). (`tools/art-world.ts`, `tools/gen-assets.ts`, `src/render/entities.ts`)
23. VFX: scan ring 2f, resonance wavefront 2f, ignite core flash, heal sparkle, elite aura, telegraph brackets + 3 new animations. (`tools/art-world.ts`, `tools/gen-assets.ts`, `src/render/entities.ts`)
24. Monochrome logo variant (`logo-mono.png`) for loading/print/a11y. (`tools/art-world.ts`, `tools/gen-assets.ts`)
25. Favicon kept + PWA manifest + apple-touch icon wiring. (`public/manifest.webmanifest`, `index.html`)
26. 6 new SFX: scan, lift, valve, relic, blueprint, threat_warn — all wired to gameplay events. (`tools/gen-audio.ts`, `src/audio.ts`, `src/scenes/WorldScene.ts`)
27. 3 ambient beds: amb_deep, amb_magma, amb_crystal + per-stratum drone retuning. (`tools/gen-audio.ts`, `src/audio.ts`)
28. Manifest v2: version + license + per-frame tags (terrain/ore/rig/vfx/props/icons/elite). (`tools/gen-assets.ts`)
29. Pipeline `--stats` flag + per-sheet size report + 900 KB budget guard (CI runs it). (`tools/gen-assets.ts`, `.github/workflows/ci.yml`, `package.json`)
30. Pipeline validation: duplicate frame names and out-of-bounds rects fail loudly. (`tools/gen-assets.ts`)

### Gameplay (15)

31. Scanner persistence: tier-3+ pings leave 25 s map+world overlays (max 6). (`src/sim/game.ts`, `src/render/entities.ts`)
32. Charge remote detonate: utility while armed blows the oldest charge; fuse-pop scales the sprite. (`src/sim/game.ts`)
33. Resonance combo counter: pulses within 4 s build ×N (capped display), tracked in stats + HUD + finale. (`src/sim/game.ts`, `src/sim/stats.ts`)
34. Elite threats: 8% chance, 2.2× HP, 1.4× damage, 3× drops, aura sprite, radar warning. (`src/sim/threats.ts`, `src/sim/game.ts`)
35. Threat behavior: wounded grubbles flee; walkers/jumpers telegraph lunges (0.45 s wind-up + brackets). (`src/sim/threats.ts`)
36. Economy: +10% bulk bonus (≥50 units), cartographer bonus (+1%/5 landmarks, cap 15%), sub-surface price ticker (±6%, surface fixed). (`src/sim/economy.ts`, `src/config.ts`)
37. Magnet streak: 5+ quick pickups widen vacuum +1.5 for 2 s (HUD chip, wide ring, best-streak stat). (`src/sim/rig.ts`, `src/sim/game.ts`)
38. Base campus: stage-5 instant lift travel + repair aura (8 HP/s campus, 3 HP/s stage 3+) with heal VFX. (`src/sim/base.ts`, `src/sim/game.ts`)
39. Lift channel: 2 s travel channel interrupted by damage (HUD progress + ring VFX). (`src/sim/game.ts`)
40. Landmark discovery feeds cartographer bonus + tutorial hint. (`src/sim/game.ts`, `src/sim/economy.ts`)
41. Environment: deep-water pressure push on rig; magma pre-heat softens adjacent dense/brittle ≤10% HP. (`src/sim/env.ts`, `src/sim/game.ts`)
42. Corpse runs: death drops 25% cargo as a recoverable world cache (purple map marker + sprite). (`src/sim/rig.ts`, `src/sim/game.ts`)
43. Assist mode: 2× hull, ½ threat damage, ¾ heat/pressure (settings toggle, persisted). (`src/sim/rig.ts`, `src/ui/dom.ts`)
44. Tutorial hints: 7 one-time contextual hints (dig, pickup, cargo, sell, blocked, scan, landmark), 6 s apart. (`src/sim/game.ts`, `src/scenes/WorldScene.ts`)
45. Post-game: finale unlocks endless deep motherlodes (≤40) + accelerating threat spawns. (`src/sim/game.ts`)

### Backend / technical (15)

46. Save v2: checksum + backup slot + v1 migration + export/import + title summary. (`src/sim/save.ts`, `src/sim/game.ts`, `src/config.ts`)
47. World dirty batching: per-tick coalescing + `drainDirty(budget)` + flush metrics. (`src/sim/world.ts`)
48. Env perf budget: 4 ms/step guard + over-budget counter + preheat/spill metrics. (`src/sim/env.ts`)
49. RNG: SplitMix32 stream + `forkStreams()` (world/loot/threats/env isolation). (`src/sim/rng.ts`)
50. EventBus ring log (256) + per-type counts + dump (diagnostics + QA). (`src/sim/events.ts`)
51. Central BALANCE table + STRATUM_DEPTHS + SAVE_VERSION in config. (`src/config.ts`)
52. Strict typecheck clean across all new APIs (explicit types, no `any` leaks). (all files)
53. 12 new unit tests (`tests/unit/iteration1.test.ts`): scan, lift, corpse, save, economy ×2, elites, flee/telegraph, combo, env.
54. CI: asset stats step, vitest summary, 2 MB bundle guard. (`.github/workflows/ci.yml`)
55. Structured logger (levels + session id + ring buffer) + global error boundary. (`src/log.ts`, `src/scenes/WorldScene.ts`, `src/sim/save.ts`)
56. Renderer perf: offscreen chunk culling + FPS auto-degrade (liquid rate, chunk budget). (`src/render/terrain.ts`)
57. Input: remappable bindings (persisted) + gamepad (stick/RT/LB/right-stick aim) + edge debounce + touch state. (`src/input.ts`)
58. Audio: lazy bank (8 critical eager, rest on demand) + mute persistence + loop normalization. (`src/audio.ts`)
59. Docs: OPERATIONAL_STATE/BALANCE deltas, README counts, ARCHITECTURE untouched (no structural change). (`docs/`, `README.md`)
60. PWA shell: webmanifest + theme/mobile meta + version footer + `npm run audio` script. (`public/manifest.webmanifest`, `index.html`, `package.json`)

### Follow-ups for iteration 2 (do NOT repeat iteration-1 work)

- E2E coverage for new UI (workshop filter, map zoom, settings extras, touch controls).
- Vitest coverage provider (`@vitest/coverage-v8`) if CI coverage is wanted.
- Unused: `charge_preview` + `tool_overheat` frames are generated but not yet drawn (aim preview + overheat state).
- `amb_deep/magma/crystal` beds generated but not yet crossfaded (only drone retune is live).
- (Fixed before commit: `threatDeath` now carries `elite` and the kill path increments `elitesKilled`.)
- Consider: damage numbers, minimap, photo mode, seed sharing, daily challenge, modding hooks.
