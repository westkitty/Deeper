# AGENTS.md — working rules for this repository

For humans and automated agents contributing to DEEPER.

## Hard rules

1. **Phaser is pinned 4.2.1.** Do not bump without a migration pass and full green CI.
2. **npm only.** No yarn/pnpm lockfiles.
3. **The sim layer (`src/sim/**`) never imports Phaser or DOM.** If a test can't run it in
   Node, it doesn't belong in sim.
4. **Art/audio are generated, committed, and checked.** Never hand-edit `public/assets/*`;
   change `tools/gen-assets.ts` / `tools/gen-audio.ts` and re-run `npm run assets`.
   `-- --check` must stay byte-identical in CI. No runtime-drawn placeholder rectangles,
   emoji, or text-glyph "sprites" — ever.
5. **No backend, no telemetry, no accounts, no monetization.** Persistence is localStorage.
6. **Claims need evidence.** Update `docs/OPERATIONAL_STATE.md` and `docs/WOW_LEDGER.md` with
   VERIFIED/BROKEN/UNVERIFIED/PENDING — never mark verified without a command output or test.
7. **Old terrain never scales with the player.** Any change to materials/tools must keep the
   ≥ 20× start→late throughput contract green (`tests/unit/progression.test.ts`).
8. **Permanent destruction is sacred.** World edits must preserve delta-only saving and
   determinism (same seed ⇒ same world).
9. **Never-cut list** (from the design contract): digging quality, loot, progression,
   environmental access, permanent destruction, major tool behavior, 7 strata, real sprites,
   blocked-site memory, environmental interactions, surface growth, required wow beats,
   save/load, tests, release quality.
10. **Release flow:** cohesive milestone commits; no force-push; CI must be green before any
    version tag; releases deploy via `.github/workflows/deploy.yml` (Pages).

## Useful commands

```bash
npm run dev            # vite dev server (base /Deeper/)
npm run preview        # serve dist at 0.0.0.0:4173
npm run typecheck      # tsc --noEmit
npm run assets         # regenerate public/assets (deterministic)
npm run assets -- --check
npm test               # vitest (22 unit tests, headless sim)
npm run test:e2e       # ensure-chromium + playwright (needs preview running)
npm run build
```

## Editing notes learned the hard way

- For `src/sim/rig.ts`, batched fuzzy edits have silently mis-applied before: prefer exact
  string replacement (e.g. python3) and always `npm run typecheck` + a targeted grep after.
- After any UI change, run the e2e suite — several past bugs (modal `.open`, HUD pointer
  interception, double key handler) were invisible to unit tests.
- Keep debug scripts out of the tree; `tools/` holds only generators, the chromium resolver,
  and documented dev utilities.
