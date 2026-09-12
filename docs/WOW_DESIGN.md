# DEEPER — WOW_DESIGN

Twelve mandated wow beats. Each is **mechanical first** (a state machine in `src/sim/wow.ts`
with preconditions on world/sim state), presentation second (scene listens for `wow` events and
stages audiovisuals). The ledger of proof lives in `WOW_LEDGER.md`; this document is the design.

| # | Key | Beat | Design intent |
| --- | --- | --- | --- |
| WOW-01 | `wow01_vein` | **First connected vein** — breaking cells that connect into a real ore vein pops a vein fan + the first "the ground PAYS" moment | teach that terrain has structure worth reading |
| WOW-02 | `wow02_wall` | **The wall that laughs at you** — first contact with a tier-gated wall; the rig pings, sparks die, the site is MARKED | teach gating honestly; create a debt the player collects later |
| WOW-03 | `wow03_drill` | **First real drill** — buying Twin-Tooth changes the sound, the swath, and the screen shake | purchase = identity change, not +10% |
| WOW-04 | `wow04_excavator` | **The buried excavator** — uncovering the authored machine in Old Works reveals it as *revealed* when its silhouette is exposed | the world remembers industry |
| WOW-05 | `wow05_vault` | **Sealed vault breach** — reaching the interior cell of the seal vault after earning the blueprint/right tool | payoff for blocked-site memory |
| WOW-06 | `wow06_drain` / `wow06_bell` | **Drainage & the sunken bell** — opening the drainage route drops water; when the bell's coverage falls below 30% it emerges, droning | environmental manipulation reveals a landmark |
| WOW-07 | `wow07_chain` | **Chain reaction** — cascades ≥ 40 destruction units in one window | gas + combustible fluid + physics = player-authored disaster |
| WOW-08 | `wow08_choir` | **Resonance cascade** — a single resonator pulse cracking ≥ 60 connected crystal cells in the Glass Choir | the tool class *is* the level's mechanic |
| WOW-09 | `wow09_base` | **The works goes industrial** — refinery stage reached; the surface physically changed while you were underground | surface growth you did not watch happen |
| WOW-10 | `wow10_revenge` | **Return to the rootbed with THE MAW** — late tool chews early stratum; the ledger counts early-stratum cells destroyed by late tools | the power fantasy, quantified |
| WOW-11 | `wow11_maw` | **THE MAW purchased** — the 8 m invoice with a blueprint gate; its shockwave finishes cracked rock in a 17-cell bite at 4 Hz | endgame identity: a geological event |
| WOW-12 | `wow12_depth` | **Finale cross-section** — reaching Engine Deep's heart composes the **destruction history cross-section**: your entire tunnel network drawn as one image | the game's thesis, rendered |

## Principles

- Every beat has a **sim-side trigger** (no scripting by coordinates alone) and a permanent
  `seen` flag, saved with the game.
- Blocked-site surfacing (WOW-02→05) never teleports; the walk back through your own old
  tunnels *is* the nostalgia engine.
- WOW-10 is deliberately measurable: the power curve is enforced in CI by
  `tests/unit/progression.test.ts` (≥ 20× start→late effective throughput on soft material).
