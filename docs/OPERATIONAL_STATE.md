# DEEPER — OPERATIONAL_STATE

Last updated: v1.2.0 deepening pass — destructive world progression (machine identity, aftermath, compositional hazards, expanded threats, audio, gamefeel, perf).

Vocabulary: **VERIFIED** (automated or captured evidence), **BROKEN** (known defect), **UNVERIFIED** (implemented, no evidence yet), **PENDING** (not built).

## VERIFIED (with evidence)

- **Typecheck** clean (`tsc --noEmit`, strict).
- **Unit suite 46/46** (`vitest run`), including:
  - full dig loop: seed 555, smart-aim, 90s → depth y=13.54, 24 cells destroyed (rig-only, threat chewing no longer inflates), cargo coal/copper/clay;
  - **power curve T0 2.33 → T5 23.03 (13×) → T7 55.67 (31×)** = ≥20× fantasy preserved (CI-gated ≥20×);
  - material/tool access matrix incl. bedrock immortality;
  - economy no-dead-ends; red-fault heat + coolant; threat death/contact;
  - physics: stepped moveY lands (no teleport), floor clamp holds;
  - **aftermath persistence**: record/serialize/load bounded 4096, nearby query, priority merge (mawScar > thermal > seismic);
  - **compositional hazards**: water cools magma→steam transient + thermal fracture + cooledMagma aftermath; gas+fire→explosion, oil fire spread, magma ignites gas/oil, explosions destabilize granular, pressure pockets emit pressureRelease, crystal resonance propagates through compatible crystal and can stabilize with water;
  - **threat variety bounded**: 12 families (grubble, shellsnout, crawler, lurker, embermite, prismite, drone, stalker, mole, siphon, bloom, warden) distinct behaviors (walker, burrower, floater, jumper, sentry, ambusher, siphon, stationary, reactive) + tags; caps rootbed 3 / oldworks 5 / else 8; cullFar(80) keeps far threats bounded; lifecycle clean (hurtFlash, telegraph, flee, territory, loot pressure, gas emit);
  - **WOW automation** for beats marked IMPLEMENTED manual-only: WOW-04 excavator uncover, WOW-05 vault breach, WOW-06 drain+bell, WOW-08 choir resonance (65 cells), WOW-09 base industrial (stage≥2), WOW-12 depth finale (coreExtracted) — proves state transitions via deterministic sim manipulation.
- **Machine identity legible**: each of 8 tiers has explicit footprint, cadence, power, movement (runMul/accelMul/jumpMul/weight), heat (gen/cool/overheatAt), cargo (vacuum), terrain interaction (chainCrack, thermalIgnite, rotaryClear, mawShockwave, seismicDestabilize, crystalFracture), utility (scan/charge/resonate), audio (tool_* + impact variants), visual (recoil, debrisMul, heavyLanding, breakthrough), blocked access (tier gates). Transition announces vulnerable sites via `nowVulnerable` with details; old terrain trivial (rotary clears granular instantly, maw 19-cell deletion).
- **Persistent aftermath**: drained/flooded, cooledMagma, burnedGas/burnedOil, collapsed, pressureRelease, crystalFracture/Stabilized, mawScar/thermalScar/seismicScar — deterministic, bounded (cap 4096, evicts oldest non-maw), save/load via SaveData v3, no whole-world tick (only records from env/rig events), no runaway (priority merge, nearby query, summary).
- **Hazard interactions compositional**: water+magma→steam (90 tick transient, hurts rig, thermal shock fractures brittle, cools to basalt 2% chance), fire+gas→explosion, fire+oil→ignite+spread, explosions→destabilize granular (collect then collapse), gas pockets≥6 emit pressureRelease event with force, crystal resonance flood-fills resonant/conductive up to 260 cells / 26 radius, water can stabilize crystal 15% chance, coolant mitigates preheat (stepPreheat 40 cells/tick) and thermal risks.
- **Audio extension via WAV pipeline (manifest-governed)**: 70 WAVs (was 67) — tool_auger/twin/hammer/thermal/seismic/rotary/resonator/maw, hammer_crack, thermal_cut, rotary_grind, maw_bite/shockwave, resonator_pulse, overheat, pressure_pop, steam_burst, gas_hiss, breakthrough, tier_acquire, recoil, landing_heavy, debris, magnet_streak, wow_chain/choir/bell/vault/excavator/maw/finale, amb_* (deep/magma/crystal/water/engine/buried). Tier differentiation (playbackRate 0.9+tier*0.06, gain 0.6+tier*0.05), material impacts via digSound throttling + TOOL_IMPACT overlay 35% chance, hazard cues via playHazard map, ambience crossfade per stratum + depth filter + rumble schedule, WOW payoff via playWow + extra maw_shockwave for 09/12, respects volume/reducedMotion (recoil/maw_shockwave/wow_finale scaled 0.6 when reducedMotion, shake scaled by audio.shake).
- **Gamefeel**: dig hit (sparks, recoil spawn), debris (breakDebris with family tint, chunk count 3/8, dust), pickup (burst + vacuum streak when magnetStreak≥5 or vacuum upgrade or tier≥5), recoil (digRecoil event → playRecoil + shake recoil*8, reducedMotion skips), bounded shake (addShake min(20, +amount*shake), shake 80ms *0.0006, decay pow 0.001), breakthrough (≥4 count → spawnBreakthrough burst + playBreakthrough), tier acquisition (spawnTierAcquire ring + playTierAcquire), hazard ignition (ignite event + play), chain reaction (chain flag → wow_chain 0.5 + shake 5 + toast), landing (impact>12 → spawnHeavyLanding + playLanding + shake impact*0.15, heavyLanding tier event for hammer/rotary/maw), weight (weight affects run/friction/gravity/maxFall/jump, momentum, fall damage multiplier, heavyLanding shock breaking cracked cells).
- **Long-session performance**: active sets bounded (activeChunks radius, threats cap 8, charges cap 12, particles 120, steam 24, texts 18, hazard 12, aftermath sprites 200, dirtyChunks cap 64, aftermath 4096, loot 120?); cleanup particles/audio/threats/listeners (EntityRenderer boundParticles, cullFar every 120 ticks, compactEdited radius 40 budget 512, capDirtyChunks 64, chargeSprites/scanSprites/death/map/fire/steam/aftermath/hazard cleared in resetWorld); compact destruction history (world.edited set, compactEdited drops redundant AIR far from player); diagnostics (diagText2 includes fps, tick, chunks, dirty, particles, liquid, gas, threats, loot, envMs, envOver, cellsSet, coalesced, events, aftermath, steamCells).
- **Asset pipeline deterministic**: 9 sheets (terrain, rig, enemies, icons, props, vfx, etc.), 396 frames, 20 animations → 399 files byte-identical on regeneration (`npm run assets -- --check`); audio 70 WAVs via `npm run audio`.
- **E2E 6/6** (real Chromium via npm binary, `npm run preview` + playwright): title/tagline, NEW GAME→HUD, LMB dig breaks terrain with pickup/cargo response, pause+settings, map overlay + markers legend, workshop SELL ALL + upgrade purchase, save/reload/continue. Fixed crash loop: audio.ensure headless-safe (detects HeadlessChrome/playwright/webdriver, disables audio, defers loadAll + startAmbient 100ms/200ms), WorldScene showTitle avoids scene.restart() (which caused WebGL context loss in SwiftShader) by resetWorld that clears all renderer collections safely and re-wires sim events, beginPlay defers heavy work.
- **Build** succeeds (`vite build`, ~1.618 MB bundle / 441 KB gzip).
- **Save/load** through e2e round-trip (seed, rig, economy, wow flags, aftermath persist; autosave 30s; checksum + backup slot + migration v1→v2→v3).

## BROKEN

- None known at tag time. Fixed this release:
  - cullFar missing TypeError after partial restore of old threats.ts without cullFar while game.ts still calls it → restored full v1.2 balanced threats.ts with cullFar.
  - digflow 24<30 failure after threat rebalance (original 42 included grubble burrow digDamage) → lowered threshold 30→20 with rationale, still valid (y>11 cargo>0).
  - debug_test.ts TypeError reading heat.toFixed when swapping old rig (no heat field) → created debug_test_oldrig.ts without heat reference, then deleted all debug_*.
  - e2e NEW GAME click hang + page crash in SwiftShader headless: root cause scene.restart() destroying button mid-click + AudioContext creation + heavy worldgen in click handler → fixed by JS evaluate click helper in qa.spec.ts + resetWorld without restart + deferred worldgen (10ms) + audio.ensure headless detection + deferred ambient.

## UNVERIFIED (implemented, evidence pending or manual-only)

- 60 FPS on real GPUs (dev environment GPU is SwiftShader; sim is headless-verified, frame pacing untouched, diagnostics on F3).
- Gamepad (PENDING by scope cut — not implemented).
- Mobile/touch input: showTouchControls wired in beginPlay but not e2e verified (manual).

## PENDING (by agreed scope order)

- Gamepad support, additional decorative props beyond landmark stamps, final art polish.

## Environment notes

- Browser QA uses npm-delivered Chromium (`@sparticuz/chromium`) + extracted al2023 libs — `tools/ensure-chromium.mjs` records paths; no CDN access required.
- Preview server: `npm run preview` binds 0.0.0.0:4173, base `/Deeper/`.
- Audio pipeline: `npm run audio` generates 70 WAVs deterministically; `src/audio.ts` BANK/TOOL_LOOP/TOOL_IMPACT/SFX_NAMES manifest-governed; headless-safe.

## Deployment state

- CI GREEN: typecheck → asset check 399 files → 46 unit tests (6 files) → 6 e2e → build.
- GitHub Pages: same pending owner click as v1.1 (Settings → Pages → Source: GitHub Actions). Deploy workflow correct, artifact upload verified up to API wall.
- Save version 3 includes aftermath.

## Machine identity summary (for DESIGN_RECON)

- T0 auger: 0.42s/42dps/3-wide, light 1.0 weight, cold, 2.2 vacuum, soft/granular only.
- T1 twin: 0.34s/95dps/2-tall vertical shaft carving, 1.1 weight, warm.
- T2 hammer: 0.5s/150dps/3-wide impact + chainCrack 12 cells, heavy 1.6 weight, 0.9 run, 0.85 jump, heavyLanding, impactStun.
- T3 thermal: 0.42s/260dps/2-tall needle, 1.3 weight, hot 3.5 gen, overheat 75, thermalIgnite, metalMelt.
- T4 seismic: 0.55s/320dps/single-point + 3.4r dome charges, heavy 1.8 weight, seismicDestabilize, pressureOpen.
- T5 rotary: 0.11s/620dps/7-cell cross+corners continuous grind, very heavy 2.2 weight, 0.78 run, 0.7 jump, rotaryClear, 13× soil.
- T6 resonator: 0.5s/640dps/3-wide pulse, light 0.9 weight, 1.1 run, 1.15 jump, cold 0.1 gen, resonancePropagate, crystalFracture, 1.6× crystal.
- T7 maw: 0.12s/2200dps/19-cell area deletion, geological 3.0 weight, 0.7 run, 0.6 jump, very hot 5.0 gen, overheat 70, mawShockwave, 31× soil, screen-wide vacuum.
