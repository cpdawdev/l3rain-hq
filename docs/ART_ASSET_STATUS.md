# L3RAIN HQ V2 — Art Asset Status

Contract: `assets/manifest.json` (Zod-validated). Pipeline: `docs/l3rain-asset-pipeline.md`.

## Current state

| Asset                                                         | Status    | Notes                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `references/l3rain-building-style.png`                        | IN REPO   | Building style anchor, 1407×768 (committed from main, ddb8286)                                                                                                                                                                                                                           |
| `references/last-prototype-dashboard.png`                     | IN REPO   | Character identity + chibi style anchor, 1672×941                                                                                                                                                                                                                                        |
| `references/previous-attempt.png`                             | IN REPO   | V1 failure reference (anti-goal), 1920×1080                                                                                                                                                                                                                                              |
| **Interim backdrop** `assets/building/interim_base_plate.png` | INTERIM   | Copy of the building style reference wired as `backdrop.base` (`interim: true`). Characters + HUD are BAKED IN — known, temporary, owner-ordered ("replicate as much as you can"). 1407×768, below the ≥3840×2160 target; world coordinates are in this space until the real plate lands |
| Backdrop base plate (L0, empty building, ≥3840×2160)          | MISSING   | THE blocking asset. When it lands: point `backdrop.base` at it, set real width/height, re-pick stations (`?dev=1`), set `interim: false` — zero code changes                                                                                                                             |
| Foreground occluders (L1)                                     | MISSING   | Optional for v1                                                                                                                                                                                                                                                                          |
| Interim animated chibi paper-dolls (`src/engine/chibi.ts`)    | LIVE      | Procedural cel-shaded body (torso/arms/legs, dark outline, per-agent palette sampled from the portrait) + the portrait as the head; walk cycle (limb swing + bob), 4 facings (SE, SW=mirror, NE/NW=back of head), idle breathing; keeps a small INTERIM chip
| 30 directional walk/idle sheets (`characters/{id}_{dir}.png`) | MISSING   | THE final character art. Contract frozen in pipeline PART 1.7 + `DirectionalSheetSchema` (4 facings × idle + 4-frame walk); drops in with ZERO code changes via `spriteKind: "directional-sheet"`
| 30 full-body idle sprites (`characters/{id}_idle_se.png`)     | MISSING   | Optional alternative drop-in via `spriteKind: "full-body"`                                                                                                                                                                                                                                             |
| 30 portrait tokens (`characters-portraits/{id}.png`)          | EXTRACTED | 96×96 RGBA PNGs recovered from the V1 dashboard bundle; now the HEAD of the interim chibi paper-dolls (`spriteKind: "portrait-token"`, `status: "placeholder"`)                                                                                                                                                                |

## Blocked on art (explicit list)

1. Empty-building base plate (L0), ≥ 3840×2160 — the single most valuable asset.
2. 30 full-body idle SE-facing sprites (512 px height after cutout).
3. (Received 2026-07-16: all three reference images.)

## Interim decisions on record

- The interim backdrop has the V1 cast and a painted HUD baked into the paint. Live
  portrait-tokens float above the painted figures until the empty plate replaces it.
  An "INTERIM BACKDROP" banner renders across its top edge (code-drawn, from the
  manifest `interim: true` flag).
- Stations were placed against the interim backdrop's rooms: Engineering upper-left,
  Infra & Ops upper-center-right, Integrations upper-right, command platform center,
  Customer lower-left, Marketing & Design lower-center, C-suite boardroom lower-right.
- `worldSpriteScale: 0.18` calibrated for 512px-tall sprites against the 768px-tall
  interim world (painted characters read ≈90px tall). Re-run the calibration test
  (pipeline §2.3) when the real base plate lands.
- Portrait tokens are now the **head of an animated chibi paper-doll**: a procedural
  cel-shaded body (per-agent palette sampled from the portrait) with a real walk cycle
  and four facings, driven by the living simulation. Still deliberately interim
  (`status: "placeholder"`, `spriteKind: "portrait-token"`, small INTERIM chip) — never
  presented as final art, per the "never present placeholders as final" rule.
- The final character art path is `spriteKind: "directional-sheet"` (pipeline PART 1.7):
  baked 4-direction idle/walk strips that swap in behind the same pose contract with
  zero code changes. Schema live (`DirectionalSheetSchema`), consumer live
  (`DirectionalDoll` in `src/engine/chibi.ts`), awaiting the art.
