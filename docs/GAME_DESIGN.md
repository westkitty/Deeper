# DEEPER — GAME_DESIGN

**DEEPER — "EVERYTHING EVENTUALLY BREAKS"** is a 2D side-view destructive mining game. You drive a
digging rig, carve a procedural earth 864 cells deep, haul loot back to a surface works that grows
from a tarp into an industrial campus, and buy eight generations of machines that go from "barely
scratches dirt" to "geological event."

Tech: Phaser **4.2.1** (pinned) · TypeScript · Vite · Vitest · Playwright · static GitHub Pages.
No backend, no accounts, no analytics, no monetization.

---

## Core loop

1. **Dig** — hold Left Mouse; the tool chews cells with a per-tool shape, cadence, and damage class.
   Terrain destruction is **permanent** and **authored** (seeded worldgen + saved deltas).
2. **Collect** — broken cells drop material entities; the rig's vacuum radius pulls them in.
   Cargo capacity is a hard constraint that defines trip length.
3. **Sell** — at the surface works (E near base). Money is one of **three economy channels**
   (currency, materials, blueprints); tools cost all three, so "rich" never means "done."
4. **Upgrade** — 8 tool tiers, 22 upgrades across cargo/mobility/scanner/utility families,
   and a surface base with 6 visible growth stages.
5. **Go deeper** — each stratum gates on material tiers you cannot scratch until the right
   machine class is bought. Depth = pressure, water, magma, gas, and better loot.

Failure is cheap by design: dying (threats, magma, suffocation, falls) costs a **portion of
carried cargo only** — never upgrades, never world state, never progress flags. There is no
hunger, no timers, no busywork. Everything eventually breaks — the player is the one who
decides what worth breaking.

## Fantasy contract

- **Old terrain never scales with the player.** Rootbed soil does not gain HP because you own
  THE MAW. Late tools are *grotesquely overqualified* against early material — that is the
  power fantasy, and it is **proven by test**: effective throughput 1.77 → 36.23 cells/s on
  uniform soil, a **20.5×** curve (`tests/unit/progression.test.ts`, gate ≥ 20×).
- **Permanent destruction is the save file.** Only deltas from the seeded world are saved;
  revisited areas are exactly as you left them, rubble and all.
- **Blocked-site memory:** a site you cannot break (e.g. vault wall above your tool tier) is
  marked on the map. When the tool that can break it is purchased, the map surfaces
  **"N marked sites now vulnerable"**. No teleports — you drive back through your own tunnels,
  which is the point.

## Controls (centrally bound, remap-friendly single source `src/input.ts`)

| Input | Action |
| --- | --- |
| A / D or ←/→ | drive |
| W / Space | jump · winch up |
| S / ↓ | dig down assist |
| **Left mouse (hold)** | dig toward pointer |
| Right mouse | utility (scan ping / demolition charge / resonance) |
| E | interact (sell/shop at the works, close panels) |
| M / Tab | map (explored cells only, marked sites) |
| 1–8 | select owned tool |
| Esc | pause / back |
| F3 | dev diagnostics overlay (off by default) |

## Session shape

A full campaign is tuned for **2–4 hours**: Rootbed teaches digging and the economy (minutes),
Old Works teaches tool gating, Buried Mile teaches environmental navigation (a city buried
running), Drowned Fault teaches water management, Red Fault teaches heat and gas, Glass Choir
teaches resonance chains, Engine Deep is the exam. Digging quality, loot, progression,
environmental access, and permanent destruction are never cut for scope; the cut order if time
runs out was: extra enemies → relic descriptions → settings polish → decorative props.

## Accessibility

Volume controls (master/sfx/ambient), screen-shake toggle, reduced-motion toggle (respected by
entity FX), visible keyboard focus, non-color-only hazard signaling (icons + text chips), and
all controls centrally defined in `src/input.ts` so remapping is a single-file change.
