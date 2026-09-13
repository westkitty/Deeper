# DEEPER
### *EVERYTHING EVENTUALLY BREAKS*

A 2D side-view **destructive mining / loot / progression** browser game. Drive a digging rig
through 864 cells of procedural earth — seven strata plus the surface — where every broken
cell stays broken, every tunnel is yours forever, and eight machine generations take you from
a shed-sized auger to THE MAW.

- **Play:** https://westkitty.github.io/Deeper/ (GitHub Pages, static, no backend)
- **Docs:** [docs/](docs/) — GAME_DESIGN · WORLD_DESIGN · WOW_DESIGN · WOW_LEDGER ·
  DESIGN_RECON · ART_BIBLE · BALANCE · ARCHITECTURE · TEST_PLAN · OPERATIONAL_STATE ·
  LICENSES · DEEPER_BIBLE · AGENTS
- **Engine:** Phaser 4.2.1 (pinned) · TypeScript · Vite · original deterministic pixel-art
  and audio pipelines

## The pitch

Hold **left mouse** to dig toward the pointer. Loot flows to your hopper; sell at the surface
works (**E**); buy drills, upgrades, and blueprints; go deeper. Water floods, magma burns, gas
waits for a spark, crystal sings back when you pulse it. Sites your machine can't break are
**marked on your map** — and the day you buy the machine that can, the map tells you:
*N marked sites now vulnerable.* Failure costs part of a cargo load, never your world.

The fantasy is **measured, not vibes**: effective digging throughput goes from
**1.77 → 36.23 cells/s (20.5×)** from the Scrap Auger to THE MAW on ordinary soil — and the
starting dirt never gets tougher to keep the early game "fair." Old ground stays old ground.
You just get absurd.

## Features

- **7 strata + surface**, deterministic seeded worldgen (160×864 cells), permanent destruction
  saved as deltas
- **8 excavation tiers** with distinct damage classes, shapes, cadences and utilities
  (scan / charges / resonance pulses)
- **8 material families** (soft, granular, brittle, dense, metal, crystal, liquid, gas),
  40 materials, tier gating
- **Environmental simulation**: falling material, water & drainage, magma, gas pockets,
  combustible fluids, crystal resonance, chain reactions — simulated only where you are
- **12 authored wow beats** (WOW-01…12) incl. buried-city reveal, vault breach, resonance
  cascades, base industrialization, and a finale that renders your **entire destruction
  history as one cross-section**
- **3-channel economy**: currency + materials + blueprints (blueprints only come from
  landmarks you find)
- **28 resources · 20 relics · 7 threat families · 26 landmarks · 22 upgrades · scanner
  tiers 0–4 · 6-stage growing surface base · museum**
- **Explored-only map** with blocked-site memory, zoom + filters + scan overlays,
  save/load v2 (checksum, backup slot, export/import, autosave 30 s), accessibility
  (volumes, shake toggle, reduced motion, focus visibility, non-color-only hazards,
  assist mode, high contrast, remappable keys, gamepad + touch support)
- **Real generated assets**: 9 PNG sheets / 396 frames / 20 animations (byte-deterministic,
  CI-checked, size-budgeted) + 44 synthesized WAVs with per-tool sonic identity,
  per-stratum ambience and full interaction SFX

## Development

```bash
npm ci
npm run dev            # dev server (base /Deeper/)
npm test               # 34 headless sim/unit tests (incl. the 20× power-curve gate)
npm run test:e2e       # 6 Playwright scenarios (needs `npm run preview` running)
npm run build          # production bundle
npm run assets -- --check  # byte-verify generated art (399 files)
npm run audio          # regenerate synthesized WAV bank (44 sounds)
```

Project rules for contributors/agents: [docs/AGENTS.md](docs/AGENTS.md).
License & third-party usage: [docs/LICENSES.md](docs/LICENSES.md). All game content is
original; no telemetry, no accounts, no backend.
