# L3RAIN HQ V2 — Art Asset Status

Contract: `assets/manifest.json` (Zod-validated). Pipeline: `docs/l3rain-asset-pipeline.md`.

## Current state

| Asset                                                     | Status    | Notes                                                                                                                  |
| --------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `references/l3rain-building-style.png`                    | MISSING   | Building style anchor — orchestrator will commit mid-build                                                             |
| `references/last-prototype-dashboard.png`                 | MISSING   | Character style anchor — orchestrator will commit mid-build                                                            |
| `references/previous-attempt.png`                         | MISSING   | V1 failure reference                                                                                                   |
| Backdrop base plate (L0, empty building)                  | MISSING   | Engine renders labeled checkerboard placeholder                                                                        |
| Interim backdrop                                          | PENDING   | When the style reference lands it becomes the interim `backdrop.base` (characters baked in — known, temporary)         |
| Foreground occluders (L1)                                 | MISSING   | Optional for v1                                                                                                        |
| 30 full-body idle sprites (`characters/{id}_idle_se.png`) | MISSING   | All agents render as interim portrait-tokens                                                                           |
| 30 portrait tokens (`characters-portraits/{id}.png`)      | EXTRACTED | 96×96 RGBA PNGs recovered from the V1 dashboard bundle; verified PNG magic bytes; status `placeholder` in the manifest |

## Blocked on art (explicit list)

1. Empty-building base plate (L0), ≥ 3840×2160 — the single most valuable asset.
2. 30 full-body idle SE-facing sprites (512 px height after cutout).
3. `references/previous-attempt.png` (anti-goal reference).

## Interim decisions on record

- Portrait tokens are rendered as floating face-tokens above station points with a
  drop shadow — deliberately NOT presented as full-body art (`status: "placeholder"`,
  `spriteKind: "portrait-token"`), per the "never present placeholders as final" rule.
- When `references/l3rain-building-style.png` lands it will be copied to
  `assets/building/` and wired as `backdrop.base` with `"interim": true` — it has
  characters baked in and will be replaced by the empty base plate without code changes.
- Station coordinates in the manifest are provisional until the interim backdrop lands;
  they will be re-picked with the station-picker dev mode (`?dev=1`).
