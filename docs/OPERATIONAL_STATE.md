# DEEPER — OPERATIONAL_STATE

Last updated: v1.0.0 release pass. Vocabulary: **VERIFIED** (automated or captured evidence),
**BROKEN** (known defect), **UNVERIFIED** (implemented, no evidence yet), **PENDING** (not
built). No claims without evidence — anything you don't see here is UNVERIFIED by default.

## VERIFIED (with evidence)

- **Typecheck** clean (`tsc --noEmit`, strict).
- **Unit suite 22/22** (`npx vitest run`), including:
  - full dig loop: seed 555, smart-aim, 90 s → depth y=11.54, 44 cells destroyed,
    cargo {coal 6, copper 8, clay 2};
  - **power curve 1.77 → 36.23 cells/s = 20.5×** (CI-gated ≥ 20×);
  - material/tool access matrix incl. bedrock immortality;
  - economy no-dead-ends; red-fault heat + coolant; threat death/contact;
  - physics: stepped moveY lands (no teleport), floor clamp holds.
- **Asset pipeline deterministic**: 8 sheets + logo + favicon + manifest = **339 files
  byte-identical** on regeneration (`npm run assets -- --check`).
- **E2E 6/6** (real Chromium via npm binary, `npm run preview` + playwright): title/tagline,
  NEW GAME→HUD, **LMB dig breaks terrain with pickup/cargo response**, pause+settings,
  map overlay + markers legend, workshop SELL ALL + upgrade purchase, save/reload/continue.
- **Build** succeeds (`vite build`, ~1.54 MB bundle / 419 KB gzip).
- **Save/load** through e2e round-trip (seed, rig, economy, wow flags persist; autosave 30 s).
- **Browser dig input** fixed and verified: pointer events at body level; HUD cannot swallow
  LMB; `digHeld`/`inputDig` both true while held (QA hook observed in browser).

## BROKEN

- None known at tag time. (Fixed this release: thermal blueprint cost key referenced
  nonexistent `tungsten` (now `silver`); double utility trigger path (single cooldown gate in
  `Rig.useUtility`); duplicate key handler after `scene.restart()` (Escape no-op) — now
  unsubscribed; modals appended into hidden `#menu` (missing `.open`) — map/workshop/finale
  now visible; asset `--check` self-failing on logo/favicon.)

## UNVERIFIED (implemented, evidence pending or manual-only)

- WOW-04/05/06/08/09/12 full staging in one continuous manual campaign (triggers + FX are
  wired and unit-covered at the state-machine level; the long staged sequences are not
  automated). See WOW_LEDGER.
- 60 FPS on real GPUs (dev environment GPU is SwiftShader; sim is headless-verified,
  frame pacing untouched, diagnostics on F3).
- Gamepad (PENDING by scope cut — not implemented).
- Mobile/touch input (PENDING — not implemented).

## PENDING (by agreed scope order)

Gamepad support, additional enemy behavior variety, settings polish beyond
volume/shake/reduced-motion, decorative props beyond landmark stamps.

## Environment notes

- Browser QA uses an npm-delivered Chromium (`@sparticuz/chromium`) + extracted al2023 libs —
  `tools/ensure-chromium.mjs` records paths; no CDN access required.
- Preview server: `npm run preview` binds 0.0.0.0:4173, base `/Deeper/`.

## Deployment state (v1.0.1)

- **CI GREEN**: the `ci` workflow passed end-to-end on a fresh GitHub runner for both the
  release tag and main (typecheck → asset check 339 files → 22 unit/prog-sim → 6 e2e → build).
  Run evidence: PR #1 and #2 checks, tag runs for v1.0.0/v1.0.1.
- **GitHub Pages: PENDING one owner click.** The `deploy-pages` workflow is correct and ran,
  but creating the Pages site (`POST /repos/.../pages`) requires an owner-level credential:
  both the Arena integration token and the workflow GITHUB_TOKEN (with `pages:write` and
  `configure-pages enablement:true`) were rejected (403 / Not Found). Until the owner opens
  **Settings → Pages → Build and deployment → Source: GitHub Actions** (then re-run the
  `deploy-pages` workflow or push any `v*` tag), the game is **not live** — no live URL is
  claimed. Everything else about the deploy (build output, base `/Deeper/`, artifact upload)
  is verified up to the API wall.
- Releases: [v1.0.0](https://github.com/westkitty/Deeper/releases/tag/v1.0.0) and
  v1.0.1 (CI-only patch: deploy workflow Pages enablement attempt).
- Sandbox history note: the working tree survived a sandbox recycle but the local git
  history did not; this tag was cut from the re-committed, fully re-verified tree
  (all suites re-run after restore — the numbers above are post-restore).
