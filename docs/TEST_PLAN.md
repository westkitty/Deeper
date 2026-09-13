# DEEPER — TEST_PLAN

Principle: **the simulation is testable without a browser** — no Phaser imports below
`src/scenes/`. Anything gameplay-critical is asserted headlessly; the browser suite asserts
*wiring* (input, UI, persistence), because headless-gl runs the browser at ~10 sim ticks/s
and would make rate assertions flaky.

## Layers

1. **Typecheck** — `tsc --noEmit` (strict).
2. **Asset validation** — `npm run assets -- --check`: regenerate every sheet/manifest into a
   temp dir, byte-compare with committed `public/assets` (339 files). Catches both drift and
   accidental hand-editing of generated art.
3. **Unit / headless sim** — `npx vitest run` (22 tests):
   - `smoke.test.ts` — GameSim boots, ticks, events flow.
   - `digflow.test.ts` — stepped physics lands (no teleport), smart-aim dig descends
     (destroyed > 30, y > 11 in 90 s), cargo flows.
   - `progression.test.ts` (11) — **the full-progression simulation**: material access matrix
     (each tier 0..8 first-breakable by exactly the right tool), bedrock unbreakable at all
     tiers, maw band coverage ≥ 5×2 with per-cell rate < auger/4, economy no-dead-ends (all
     tools + every upgrade purchasable, upgrades drain to 0), sell/upgrade accounting,
     stratum gates present in a seeded world (STONE→T2, CONCRETE→T3, BASALT→T4, CRYSTAL→T5,
     COMPOSITE→T6), red-fault heat harm + coolant negation (bus-event asserted), affinity
     ordering, and the **power-curve contract ≥ 20×** (measured 1.77 → 36.23 c/s).
   - `threats.test.ts` — threat death emits `threatDeath` + loot drops; contact hurts with
     cause "threat".
4. **Browser QA (Playwright, 6)** — `npm run test:e2e`:
   title screen + tagline; NEW GAME → HUD; **real LMB dig breaks terrain & cargo responds**;
   pause + settings open/close; map overlay with markers legend; workshop SELL ALL updates
   money and buys an upgrade (with material restock); save → reload → CONTINUE restores state.
5. **Build** — `vite build` must succeed (bundle ≤ warning limit).

## CI ordering (.github/workflows/ci.yml)

install → typecheck → assets check → unit → e2e → build. All green is the release gate for
v1.0.0; the same workflow is the regression net for any future change.

## Local reproduction

```bash
npm ci
npm run typecheck
npm run assets -- --check
npx vitest run
npm run test:e2e   # starts nothing itself: run `npm run preview` in another shell
npm run build
```

## Known untested-by-automation (manual-play only)

Long-horizon staging of WOW-04/05/06/08/09/12 (they trigger from deep play sequences),
generative ambient layering, and 60-FPS-on-real-GPU feel (dev diagnostics F3 exists; the
sandbox GPU is SwiftShader). These are listed in OPERATIONAL_STATE → UNVERIFIED.
