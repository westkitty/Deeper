# DEEPER — WOW_LEDGER

Status vocabulary: **PROVEN** = mechanical trigger + automated or captured evidence;
**IMPLEMENTED** = trigger + presentation wired, manual-play verified only;
**PARTIAL** = exists but thinned vs design; **PENDING** = not yet.
Implementation status and proof are kept **separate** by rule.

| Beat | Implementation | Proof | Evidence |
| --- | --- | --- | --- |
| WOW-01 first vein | PROVEN | vein break → `wow01_vein` event, fan FX, toast | trigger in `src/sim/wow.ts` + loot vein logic; unit smoke run covers sim boot & events |
| WOW-02 blocked wall memory | PROVEN | `blocked.ts` marks site; map chip + "N marked sites now vulnerable" on tier purchase | unit-tested state transitions; e2e map overlay shows markers legend |
| WOW-03 first drill identity | IMPLEMENTED | purchase swaps sheet frames, loop audio `tool_twin`, swath widens | manual browser verification (e2e covers shop purchase path) |
| WOW-04 excavator reveal | IMPLEMENTED | landmark reveal flag when silhouette cells uncovered | worldgen-authored; manual verification |
| WOW-05 vault breach | IMPLEMENTED | interior-cell reach triggers; vault is a marked blocked site before | same memory system as WOW-02 (PROVEN primitives) |
| WOW-06 drain + bell | IMPLEMENTED | drainage channel authored; bell coverage < 30% check in `wow.ts` | env liquid counting unit-covered; staging manual |
| WOW-07 chain reaction | PROVEN | cascade window ≥ 40 → event; explosions feed `noteBreak` | `largestCascade` tracked; headless chain tests via explode events |
| WOW-08 resonance cascade | IMPLEMENTED | pulse ≥ 60 cracked crystal cells → event | `checkResonance(cells)` wired to env pulse counts |
| WOW-09 base industrial | IMPLEMENTED | stage ≥ refinery → event; surface re-composed | base stage machine unit-covered (needs/upgrade gates) |
| WOW-10 return dominance | PROVEN | ledger counts early-stratum cells broken by late tools | **power curve enforced by CI**: 1.77 → 36.23 cells/s = 20.5× (`tests/unit/progression.test.ts`, gate ≥ 20×) |
| WOW-11 THE MAW | PROVEN | T7 purchase gate (money+materials+blueprint); 17-cell bite @ 4 Hz; shockwave finishes ≥ 40%-cracked neighbors | per-cell rate & band coverage asserted in progression suite |
| WOW-12 finale cross-section | IMPLEMENTED | Engine Deep heart → `wow12_depth`; history cross-section composed from destruction delta | finale modal + cross-section canvas wired (`openFinale`) |

**Strongest beat:** WOW-10 (return dominance) — it is the only beat whose core claim is
machine-checked on every CI run, and the maw's shockwave-finish makes early strata *feel*
exponentially softer, not just numerically.

**Weakest beat:** WOW-06 (drain/bell) — the drainage interaction is real but the bell's
emergence staging is the least exercised path in automated tests; it depends on a long
manual play sequence. Known limitation, scheduled for a dedicated headless sim test.

Counters: 12/12 beats implemented; 5 PROVEN by automated evidence, 7 IMPLEMENTED with
manual verification; 0 PENDING.
