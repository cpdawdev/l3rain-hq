# L3RAIN HQ V2 — Implementation Status

Master spec: `docs/l3rain-hq-v2-claude-code-prompt.md` · Art contract: `docs/l3rain-asset-pipeline.md`

## Milestones

| #   | Milestone                                                                              | Status  |
| --- | -------------------------------------------------------------------------------------- | ------- |
| 1   | Scaffold, strict TS, CI, roster + tests, manifest schema + validation, docs skeleton   | done    |
| 2   | Pixi stage: backdrop (or checker placeholder), camera (zoom/pan/reset/fit), resolution | pending |
| 3   | Agent sprites from manifest, placeholder fallback, depth sort, station picker dev mode | pending |
| 4   | Labels + selection + inspector                                                         | pending |
| 5   | HUD panels with data provider; department status tinting overlays                      | pending |
| 6   | Ambient effects; reduced motion; pause                                                 | pending |
| 7   | Diagnostics, helper scripts, contact sheet, Playwright suite, docs complete            | pending |

## Architecture notes

- `src/data/roster.ts` — THE roster (30 agents); `docs/ROSTER.md` mirrors it (test-enforced).
- `src/manifest/` — Zod schema + loader; validation issues surface in diagnostics, never crash.
- `src/data/provider.ts` — `DataProvider` interface; `MockDataProvider` (typed mock) and
  `LiveStatusProvider` (polls the arch-docs stage Worker `/status.json`, mock fallback on
  any failure). Selected with `?data=live|mock`, default `live`.
- Live endpoint: `https://l3rain-arch-docs-stage.cpda-wdev.workers.dev/status.json`
  (CORS `*`, `cache-control: no-store`).
- `vite.config.ts` — `publicDir: 'assets'` (manifest + art served at web root);
  dev-only station-picker write-back middleware at `POST /__station-picker/save`.
- `legacy/v1-dashboard.html` — the previous single-file dashboard, kept for reference
  (source of the interim portrait extraction and the live feed URL).

## Deviations from spec (orchestrator-authorized)

1. Reference images arrive mid-build; placeholder rules apply until then.
2. `references/l3rain-building-style.png` becomes the INTERIM backdrop when it lands.
3. V1 portrait sprites extracted to `assets/characters-portraits/` and rendered as
   interim portrait-tokens (status `placeholder`, `spriteKind: portrait-token`).
4. `LiveStatusProvider` added alongside the spec's mock provider.

## How to run

```bash
pnpm install
pnpm dev            # http://localhost:5173  (?data=mock for mock data, ?dev=1 for dev tools)
pnpm build          # output in dist/ (static hosting)
pnpm preview        # serve dist/
pnpm test           # unit tests
pnpm test:e2e       # Playwright (requires: npx playwright install chromium)
```
