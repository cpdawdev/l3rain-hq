# L3RAIN HQ V2 — Implementation Status

Master spec: `docs/l3rain-hq-v2-claude-code-prompt.md` · Art contract: `docs/l3rain-asset-pipeline.md`

## Milestones — ALL COMPLETE (v1 build scope)

| #   | Milestone                                                                              | Status |
| --- | -------------------------------------------------------------------------------------- | ------ |
| 1   | Scaffold, strict TS, CI, roster + tests, manifest schema + validation, docs skeleton   | done   |
| 2   | Pixi stage: backdrop (or checker placeholder), camera (zoom/pan/reset/fit), resolution | done   |
| 3   | Agent sprites from manifest, placeholder fallback, depth sort, station picker dev mode | done   |
| 4   | Labels + selection + inspector                                                         | done   |
| 5   | HUD panels with data provider; department status tinting overlays                      | done   |
| 6   | Ambient effects; reduced motion; pause                                                 | done   |
| 7   | Diagnostics, helper scripts, contact sheet, Playwright suite, docs complete            | done   |

Explicitly OUT (per spec, interfaces only): locomotion/pathfinding, routines/state
machines, Durable Objects/WebSockets/D1/R2/Queues, audio.

## Architecture

- `src/data/roster.ts` — THE roster (exactly 30 agents, 7 departments); `docs/ROSTER.md`
  mirrors it (test-enforced). Department accents + `agent-cpd-*` slugs live here too.
- `src/manifest/` — Zod contract + loader. Extensions beyond the spec example:
  `backdrop.interim`, `agents[].spriteKind` (`full-body` | `portrait-token`),
  `departmentRegions[]` (status-tint rectangles). Validation issues surface in the
  dev diagnostics panel, never crash, never silent.
- `src/data/provider.ts` — `DataProvider` interface (`snapshot`/`subscribe`/`dispose`).
  - `MockDataProvider` — typed static mock (spec).
  - `LiveStatusProvider` — polls `https://l3rain-arch-docs-stage.cpda-wdev.workers.dev/status.json`
    every 30 s (CORS `*`); ANY failure degrades to the mock snapshot
    (`source: "mock-fallback"`). Selected by `?data=live|mock`, default live.
- `src/engine/` — PixiJS 8 only (React never renders world objects; Pixi never renders
  UI panels). `HqEngine` owns: world layers (backdrop → tint → sprites → fx) + a
  screen-space overlay (labels, diagnostics). Camera math is pure + unit-tested.
  Depth rule: zIndex = foot/base Y; occluders share the space.
- `src/hud/` — React: HUD column (phases, completion ring, departments, activity,
  usage, feed), inspector, controls, station picker (dev), diagnostics panel (dev).
- `src/state/store.ts` — tiny `useSyncExternalStore` store bridging HUD ↔ engine
  (selection, label mode/size, reduced motion, pause).
- `vite.config.ts` — `publicDir: 'assets'`; dev-only station-picker write-back
  middleware at `POST /__station-picker/save`.
- `legacy/v1-dashboard.html` — the previous single-file dashboard (source of the
  interim portraits and the live feed URL). Not part of the build.

## Known engine notes (hard-won — read before touching the loader)

1. **Batch-preload textures.** Sequential `await Assets.load()` per agent, interleaved
   with an actively rendering `Application`, stalls Pixi's texture pipeline after
   ~10 textures (loads stop resolving; no error). Fix: preload every URL in one
   `Promise.allSettled` batch, then build display objects synchronously
   (`src/engine/agents.ts`).
2. **First-frame settle latency.** After `HqEngine.create()` resolves, React's
   engine-wired effects can flush 1–2 s later (30+ texture uploads block the main
   thread). E2e must wait on the `[data-testid="engine-ready"]` beacon and poll
   assertions — never fixed sleeps.
3. The `update-state.yml` workflow is scoped to `main` pushes on this branch; it
   otherwise commits `state.json` on every push and races the branch.

## Dev workflows

```bash
pnpm install
pnpm dev              # http://localhost:5173
                      #   ?data=mock  — typed mock instead of live feed
                      #   ?dev=1      — station picker + diagnostics (FPS, bounds+depth, issues)
pnpm build && pnpm preview   # production build in dist/ (fully static)
pnpm test             # unit (roster, manifest, camera math, depth, providers)
pnpm test:e2e         # Playwright (chromium; builds + serves automatically)
pnpm contact-sheet    # sprite grid for style-drift QA (needs ImageMagick)
pnpm cutout <dir>     # chroma-key/trim/512px batch cutout (needs ImageMagick)
```

Station placement: open `?dev=1`, pick an agent in the STATION PICKER, click the
backdrop (moves live + copies coords), then "Save manifest" writes
`assets/manifest.json` through the dev server.

## Deviations from spec (orchestrator-authorized, all applied)

1. Reference images arrived mid-build (commit `ddb8286` on main) — pulled into v2.
2. `references/l3rain-building-style.png` wired as the INTERIM backdrop
   (`assets/building/interim_base_plate.png`, `interim: true`, banner rendered).
3. V1 portraits extracted to `assets/characters-portraits/` (30/30 valid PNGs) and
   rendered as interim portrait-tokens, honestly tagged.
4. `LiveStatusProvider` added alongside the spec's mock provider (live by default).

## What remains blocked on art (see docs/ART_ASSET_STATUS.md)

1. Empty-building base plate ≥ 3840×2160 (replaces the interim backdrop; re-pick
   stations with `?dev=1`; zero code changes).
2. 30 full-body idle SE sprites (drop into `assets/characters/`, flip manifest
   entries to `spriteKind: "full-body"`, `status: "production"`).
3. Optional L1 occluders.
