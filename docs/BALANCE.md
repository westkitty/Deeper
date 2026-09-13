# DEEPER — BALANCE

Numbers current at v1.1.0 (iteration 1). Everything here is either read directly from
`src/sim/tools.ts`/`rig.ts`/`config.ts` (BALANCE table) or asserted by
`tests/unit/progression.test.ts` + `tests/unit/iteration1.test.ts`.

## Iteration-1 economy deltas (additive; power contract unchanged)

- Bulk haul bonus: ≥50-unit sales pay +10% (`sellBulkBonusThreshold/Mul`).
- Cartographer bonus: +1% sell per 5 landmarks, cap +15%.
- Surface prices fixed at list; deep ticker variance (±6%) applies below row 8.
- Death now drops 25% of cargo as a recoverable corpse-run cache (was: 30% value lost).
- Elites: 2.2× HP, 1.4× damage, 3× drops, 8% spawn chance.

## The power contract

**Effective throughput on uniform soil: T0 1.77 cells/s → T7 36.23 cells/s = 20.5×**
(CI gate: ≥ 20×). Measured per-cell: `interval / (shape cells damaged per swing)` under a
player-like aiming harness (diagonal descent, never aims at air), fixed seed.

| Tier | Tool | Class | Measured c/s on soil | ×T0 | Note |
| --- | --- | --- | --- | --- | --- |
| 0 | Scrap Auger | drill | **1.77** | 1.0× | 3-wide swath, 0.55 s, 34 DPS |
| 1 | Twin-Tooth | drill | 3.05 | 1.7× | wider swath, faster motor |
| 2 | Hammerhead | impact | 4.80 | 2.7× | cracks connected brittle |
| 3 | Thermic Needle | thermal | 4.60 | 2.6× | metal affinity — soil is off-class for it |
| 4 | Seismic Rig | seismic | 1.80 | 1.0× | percussion hates granular soil (by design); charges + rock are its game |
| 5 | Rotary Excavator | rotary | 14.45–15.17 | 8.2× | 0.30 s continuous multi-cell bite |
| 6 | Resonator | resonate | 4.80 | 2.7× | crystal affinity — useless vs dirt, devastating in the Choir |
| 7 | THE MAW | maw | **36.2–40.5** | **20.5–22.9×** | 0.25 s × 17-cell bite @ 1600 DPS; shockwave finishes ≥ 40%-cracked neighbors in r 2.5 |

Two independent measurement runs shown where variance appeared (simulation RNG + physics
stepping); the CI gate uses the progression suite's own run (36.23 ≥ 20 × 1.77). The mid-curve
dips are **affinity-honest, not accidents**: seismic and resonator are the wrong classes for
soft soil, and the game's answer is "buy the right machine for the stratum" — the endpoint
contract (start vs late on soft material) is what the spec mandates and what CI enforces.

Per-class **SHAPE_FACTOR** multiplies splash damage into the rig's dig shape neighbors
(drill 0.5 · impact/thermal/seismic 0.55 · rotary 0.9 · resonator 0.85 · **maw 1.15**).
Per-class **affinity** decides family matchups (drill→soft, impact→brittle, thermal→metal,
resonator→crystal); off-affinity damage still works but slower — gating comes from material
**tier** (HP + tool tier check), not from immunities.

## Economy channels

- **Money ¤** from sales; base price by material tier; refinery stage multiplies.
- **Materials** — tools/upgrades cost specific resources (T3 Thermic Needle: ¤2600 + 18 steel
  + 8 silver + blueprint *cipher*).
- **Blueprints** — authored landmarks grant them (bank vault → servo, cathedral → fork,
  bulkhead gate → lattice, forge → capacitor, …). You cannot buy a blueprint; you must find it.

Dead-end analysis is **CI-tested**: with bottomless resources, all 7 purchasable tools and
every upgrade are buyable in order; `availableUpgrades` drains to zero.

## Cargo & trips

Base hopper 30 → 48 → 80 units → Stack Compression (halves bulk). Vacuum 2.2 → 4 → 6.5 cell
pickup radius. Pickup radius base 2.4. Failure refunds most of the world: death costs a
**portion of current hopper only**.

## Threats (7 families)

| Family | Stratum | HP | Behavior | Drop |
| --- | --- | --- | --- | --- |
| Grubble | rootbed | 22 | burrower | copper |
| Shellsnout | oldworks | 40 | jumper | iron/coal |
| Rock-shell Crawler | buried mile | 55 | walker | aggregate/steel |
| Flood-zone Lurker | drowned fault | 48 | floater | brinepearl/silver |
| Heat Mite | red fault | 34 | jumper | sulfur |
| Crystal Parasite | glass choir | 62 | walker | quartz |
| Sentry Drone | engine deep | 80 | sentry | composite/alloy |

Contact damage 7–16, 1.1 s cooldown; drill/charges damage them (`damageNear`); death drops
loot (event-verified in `tests/unit/threats.test.ts`).

## Depth pressure

Strata rows are tuned so each band's *intended tool* is the one you can just afford from the
previous band's loot: Rootbed pays for T1–T2, Old Works funds T3, Buried Mile funds T4–T5,
Drowned/Red fund T6, Choir/Deep fund T7 + base campus. Old material never scales: rootbed soil
is 1-hit for the maw forever (that is WOW-10, and it is load-bearing).
