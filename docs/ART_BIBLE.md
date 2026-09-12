# DEEPER — ART_BIBLE

## Law

1. **Real committed PNGs only.** No colored rectangles, no emoji, no text glyphs as sprites,
   no dev primitives, no hotlinked art. The renderer draws exclusively from
   `public/assets/*.png` + `asset-manifest.json` frames.
2. **Deterministic generation.** All sheets are authored by `tools/gen-assets.ts`
   (+ `tools/art-world.ts`, `art-rig.ts`, `art-entities.ts`, `pixutil.ts`, pure-JS PNG via
   `pngjs`). Same code ⇒ byte-identical PNGs. CI runs the generator in a temp dir and diffs
   against committed files (`npm run assets -- --check`, 339 files).
3. **16×16 base tiles**, nearest-neighbor, `image-rendering: pixelated`, smoothing off.
   The rig is a larger modular sprite (~64×48–80×48) composed of hull/treads/arm/tool-head
   parts so tool swaps change silhouette, not just tint.
4. **Per-stratum palettes** — each stratum owns hue/anchor colors; materials within a stratum
   harmonize; transitions dither. Avoid obvious tiling: every material has 2–4 variants and
   variant selection is noise-driven by cell coordinate.

## Palettes (anchor swatches)

| Stratum | Ground | Accent | Notes |
| --- | --- | --- | --- |
| Surface | grass greens, works browns | gold tarp | warmest band |
| Rootbed | warm soil browns | copper/ember roots | speckled organics |
| Old Works | cool stone greys | rust orange, lamp amber | rail/lamp props |
| Buried Mile | concrete greys, brick red-browns | asphalt black, paint chips | urban grid hints |
| Drowned Fault | wet slate blue-greys | brine cyan, pearl white | water overlay gloss |
| Red Fault | burnt sienna → obsidian black | magma orange/yellow | emissive cracks |
| Glass Choir | pale calcite, cold violet | void-gem teal | translucent shimmer |
| Engine Deep | dark iron, bulkhead gunmetal | hot gold core | the deepest warm accent |

## Sheets (public/assets/)

`terrain.png` (all material tiles ×variants), `rig.png` (hull parts ×8 tool heads),
`enemies.png` (7 threat families), `props.png` (landmark stamps, works stages),
`vfx.png` (debris, sparks, gas, splash, shockwave), `icons.png` (HUD/resources/relics),
plus standalone `logo.png`, `favicon.png`. **8 sheets, 337 frames, 16 animations**
recorded in `asset-manifest.json` with frame rects; BootScene loads via the manifest.

## Animation set (16)

Rig: idle, drive, drill-loop (per class family: drill/impact/thermal/seismic/rotary/resonator/maw),
hurt, winch. Enemies: walk/burrow/jump/float loops per family. VFX: debris, splash, spark,
shockwave ring. Works: 6 stage compositions. The generator emits every frame; the manifest is
the single source of frame rects for `BootScene`/`TerrainRenderer`/`EntityRenderer`.

## Audio identity (generated, original)

`tools/gen-audio.ts` synthesizes all **35 WAVs** (procedural WebAudio-style DSP written to
disk): per-tier tool loops with distinct sonic character (auger's ragged motor vs the maw's
sub-heavy chomp), pickups, breaks by family, water/gas/magma layers, UI, stingers, and a
depth-tinted ambient bed. No third-party audio. Recorded in LICENSES.md as original.
