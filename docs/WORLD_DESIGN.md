# DEEPER — WORLD_DESIGN

The world is a **160 × 864-cell** column (16 px art cells, rendered at 40 px), generated from a
32-bit seed with value-noise bands, per-stratum mixes, authored landmarks, a service shaft with
lift landings, and drainage plumbing. Deterministic: same seed ⇒ same world, byte-identical.
The player's destruction is stored as **deltas**, never as a re-dump of the world.

## Vertical band map

| Stratum | Rows | Character | Base mixes | Signature loot |
| --- | --- | --- | --- | --- |
| SURFACE — THE WORKS | 0–11 | grass, shack, shaft head | soil | — |
| ROOTBED | 12–107 | warm dirt, roots, buried junk (top 26 rows softened to 78% soil / 15% clay / 7% sandstone so the first minute always flows) | soil/clay/sandstone | copper, coal, clay |
| OLD WORKS | 108–203 | somebody mined here before; rails, lamps, debts | stone/sandstone/coalrock | iron, coal, steel |
| BURIED MILE | 204–319 | a city buried running: subway, parking, cellars | concrete/brick/asphalt | aggregate, steel |
| DROWNED FAULT | 320–435 | flooded ruins, reservoir, pumproom | wetstone/slate/calcite | silver, gold, tungsten |
| RED FAULT | 436–551 | heat, sulfur, magma chambers | sulfurrock/obsidian(basalt family) | sulfur, obsidian shard |
| GLASS CHOIR | 552–667 | resonant crystal that sings back | calcite/gemrock/pressglass | quartz, voidgem |
| ENGINE DEEP | 668–855 | the thing that was buried and still wants up | darkstone/bulkhead/composite | alloy, composite, gold |

A **bedrock skeleton** frames the world (unbreakable at every tier, proven by test) and a
service shaft at x=27–28 carries **lift landings** A–G at rows 24/120/216/332/448/564/680.

## Materials

40 material defs across 8 families: **SOFT, GRANULAR, BRITTLE, DENSE, METAL, CRYSTAL, LIQUID,
GAS**. Each def: tier gate, HP, tool-class affinity, sound, palette, 2–4 tile variants.
Tier gates (proven in `tests/unit/progression.test.ts`): STONE needs T2, CONCRETE T3,
BASALT/obsidian T4, CRYSTAL T5, COMPOSITE T6, BEDROCK — nothing.

## Landmarks (26 authored + works + 7 lift landings)

First vein, fossil bed, geode grove, cellar, old pipes, rail hub, subway, parking, cellar
cache, flooded ruins, reservoir, pumproom, sunken bell, seal vault, bank vault, bulkhead gate,
utility room, cooling chamber, gas chamber, magma chamber, forge, excavator (the buried one),
cathedral, shard field, machine heart, mine station. Each is worldgen-authored (structure
stamps + spawn points), each registers on map/markers, several carry **blueprints**
(bank vault → servo, cathedral → fork, bulkhead gate → lattice, forge → capacitor, …).

## Environmental simulation (`src/sim/env.ts`)

- **Falling material** — unsupported granular/soft cells collapse into air below.
- **Water** — fills, flows, pressures; drowned strata can be drained via the authored
  drainage route (WOW-06).
- **Magma** — ignites, burns, converts; contact damage and heat aura (Red Fault).
- **Gas** — pockets that flood outward when breached; combustible with sparks (chain fuel).
- **Combustible fluid** — ignition propagates through connected cells.
- **Crystal resonance** — resonator pulses crack connected crystal; ≥60 cells in one pulse is
  WOW-08; cascades ≥40 units in a window are WOW-07.
- **Chain reactions** — every explosion feeds `noteBreak`; the destruction ledger remembers.

Simulation cost is bounded: **only chunks near the rig tick** (`activeChunks`), liquid/gas
worklists are scoped to active regions.

## Surface — The Works (6 visible stages)

Shack → Workshop → Refinery Works → Machine Bay → Freight Tower → Excavation Campus. Each
stage is unlocked by a real milestone (earn ¤1200, refinery upgrade, T4 machine, lift, reaching
Engine Deep) and **physically changes the surface sprite composition**, not just a number.

## Map & memory

The map (`M`/`Tab`) renders **explored cells only**, plus marked blocked-sites and landmarks.
Blocked-site memory: `src/sim/blocked.ts` remembers sites your tool couldn't break; buying the
tier that can flags them **"N marked sites now vulnerable"** on the map and HUD chip.
