# DEEPER — LICENSES

## Game code, art, audio, design

All original work for the DEEPER project: source code, generated pixel art (PNG sheets,
logo, favicon), generated audio (35 WAVs), documents. No third-party art, fonts-in-art, or
audio samples. Nothing is copied from commercial games; names, strata, machines, and relic
text are original.

## Third-party software (npm, used per its license)

| Package | Version | License | Use |
| --- | --- | --- | --- |
| phaser | 4.2.1 (pinned) | MIT | game engine |
| vite | ^7 | MIT | build |
| typescript | ~5.9 | Apache-2.0 | language |
| vitest | ^3 | MIT | unit tests |
| @playwright/test, playwright, playwright-core | ^1.63 | Apache-2.0 | browser QA |
| @sparticuz/chromium | ^153 | MIT (bundles Chromium under its own BSD-style license) | headless browser binary for QA |
| pngjs | ^7 | MIT | PNG encoding for the asset generators |
| brotli | ^1 | MIT | lib extraction for QA browser |
| tsx | ^4 | MIT | run TS generators |
| @types/node, @types/pngjs | — | MIT | types |

Runtime dependencies at game time: **Phaser only** (MIT). Everything else is devDependency.

## Fonts

In-game DOM UI uses the browser default monospace stack (no webfont shipped, none bundled).

## Distribution

The repository builds to a fully static site (GitHub Pages). No telemetry, no external
requests at runtime: all assets are same-origin files under `/Deeper/`.
