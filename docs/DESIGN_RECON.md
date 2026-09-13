# DEEPER — DESIGN_RECON

What the spec demanded, and where each demand landed. This is the reconciliation pass between
the original design mandate and the shipped tree — including the deliberate deviations.

## Mandated → shipped

| Mandate | Status | Where |
| --- | --- | --- |
| Phaser pinned 4.2.1 | ✅ `dependencies.phaser = "4.2.1"` | package.json |
| TypeScript + Vite, base `/Deeper/` | ✅ | vite.config.ts |
| Vitest units + headless full-progression sim in CI | ✅ 22 unit tests incl. 11-test progression suite (power curve gate) | tests/unit |
| Playwright browser QA | ✅ 6 e2e scenarios (title/new/continue-implicit/dig/pickup/sell/upgrade/save/reload/pause/settings/map) | tests/e2e/qa.spec.ts |
| Static GitHub Pages deploy | ✅ Pages workflow builds and publishes | .github/workflows/deploy.yml |
| No backend / Docker / telemetry / accounts | ✅ none exist; localStorage only | src/sim/save.ts |
| 7 strata + surface | ✅ 8 bands, rows mapped | src/sim/worldgen.ts, WORLD_DESIGN.md |
| 8 excavation tiers with distinct behavior | ✅ classes drill/impact/thermal/seismic/rotary/resonator/maw(+drill), per-class shape/cadence/affinity/shockwave | src/sim/tools.ts, src/sim/rig.ts |
| Material families ×8 | ✅ soft/granular/brittle/dense/metal/crystal/liquid/gas (40 defs) | src/sim/materials.ts |
| Environmental sims | ✅ falling material, water, magma, gas, combustible fluid, resonance, chains | src/sim/env.ts |
| 12 wow beats | ✅ 12/12 implemented, 5 machine-proven | src/sim/wow.ts, WOW_LEDGER.md |
| Blocked-site memory + "N now vulnerable" | ✅ | src/sim/blocked.ts |
| Explored-only map | ✅ fog = unexplored | src/ui/menus.ts `openMap` |
| Scanner tiers 0–4 | ✅ base ping + scan1–scan4 upgrades | src/sim/tools.ts |
| Cargo/vacuum progression | ✅ hopper tiers, compression, vacuum I/II | src/sim/tools.ts |
| 3-channel economy | ✅ money + materials + blueprints on every tool | src/sim/economy.ts, tools.ts |
| 18+ resources / 18+ relics | ✅ 28 / 20 | src/sim/resources.ts |
| 6+ threat families | ✅ 7 | src/sim/threats.ts |
| 2+ landmarks per stratum | ✅ 26 authored + 7 lifts | src/sim/landmarks.ts, worldgen.ts |
| 6 visible surface stages | ✅ sprite-composed growth | src/sim/base.ts, render/entities.ts |
| Museum | ✅ relic collection panel (museum view) | src/ui/menus.ts |
| Destruction history + finale cross-section | ✅ WOW-12 | src/sim/stats.ts, wow.ts, menus.ts |
| Failure = lose portion of cargo only | ✅ extraction/refine-on-death path | src/sim/game.ts, rig.hurt |
| Real PNG sprites, no rectangles/emoji/glyphs | ✅ deterministic code-authored pixel art → committed PNGs; asset check compares bytes | tools/gen-assets.ts, public/assets |
| asset-manifest.json | ✅ | public/assets/asset-manifest.json |
| ART_BIBLE.md | ✅ | docs/ART_BIBLE.md |
| Original audio, per-tier sonic identity | ✅ 35 generated WAVs, `tool_<key>` loops, depth-tinted ambience | tools/gen-audio.ts, src/audio.ts |
| Docs suite | ✅ this suite | docs/ |
| CI green before release | ✅ install→typecheck→assets→unit→e2e→build | .github/workflows/ci.yml |
| Power curve ≥ 20× proven | ✅ 20.5×, CI-enforced | tests/unit/progression.test.ts |

## Deviations & judgment calls (recorded, not hidden)

1. **Deterministic code-authored art** instead of hand-drawn PNGs — chosen approach: Node/TS
   generators (`tools/gen-assets.ts`, pure-JS PNG lib) write committed PNGs; CI verifies the
   bytes. Art is real PNG output, never runtime rectangles.
2. **Phaser 4 idioms** — migration notes (Filters vs FX, native Set/Map, DynamicTexture
   `render()`) applied; see ARCHITECTURE.md.
3. **E2E sim assertions are headless-first** — under SwiftShader the browser runs ~10 sim
   ticks/s, so rate-based checks live in Vitest; the browser suite asserts *wiring*
   (input reaches sim, state persists, panels open).
4. **Failure economics** simplified to "lose a cargo portion" without a full insurance shop —
   the ledger/UI explains exactly what was lost.
5. Music is an **ambient generative soundscape** (mandated "optional music" resolved as
   ambience + stingers; no composed soundtrack).

## Explicitly not built (scope cuts per agreed order)

Extra enemy behaviors beyond the 7 families' core patterns, gamepad input, side upgrades
beyond the 22 defined, decorative props beyond landmark stamps. None of the never-cut list
(digging quality, loot, progression, environmental access, permanent destruction, major tool
behavior, 7 strata, actual sprites, blocked-site memory, environmental interactions, surface
growth, required wow beats, save/load, tests, release quality) was cut.
