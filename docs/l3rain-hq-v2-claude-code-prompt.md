# L3RAIN Headquarters V2 — Claude Code Kickoff Prompt (Asset-Based Renderer)

> Paste everything below the line into Claude Code from the root of the repo.
> Before starting, place in the repo:
>
> - `references/l3rain-building-style.png` (building style reference)
> - `references/last-prototype-dashboard.png` (character style reference)
> - `references/previous-attempt.png` (screenshot of the V1 attempt — the failure reference)
> - `assets/` — whatever illustrated assets exist so far (may be empty at kickoff)
> - `assets/manifest.json` — may start minimal; schema defined below

---

# MASTER OPERATING INSTRUCTION

You are the principal engineer and technical art director for **L3RAIN Headquarters V2**,
an isometric anime office dashboard for an AI-agent-run company.

## The one lesson from V1 (read `references/previous-attempt.png`)

V1 failed because the renderer **drew the world procedurally**: vector rooms, box
furniture, badge-avatar characters. The result looked nothing like the illustrated
references. That approach is banned.

**V2 rule: the engine renders illustrated image assets. It never draws world geometry.**

- The building is a **painted backdrop image** (plus optional foreground occluder PNGs).
- Characters are **full-body illustrated sprite PNGs** placed on top of the backdrop.
- Code is responsible ONLY for: compositing layers, positioning sprites, depth
  sorting against occluders, labels, glow/light effects, ambient animation
  (tween/shader — no frame art), camera, panels, and data.
- If an asset does not exist yet, render an explicitly-labeled placeholder
  (dimmed silhouette + "PLACEHOLDER" tag). Never draw substitute art with
  primitives and never present placeholders as final.

If you ever find yourself drawing a desk, a wall, or a floor tile with graphics
primitives, stop — that is the V1 failure mode.

## V1 scope (this build) vs V2 scope (explicitly out)

**In scope now:**

- Painted backdrop rendering with camera: scroll-zoom, drag-pan, double-click reset,
  min/max zoom, fit-on-load, responsive 16:9 framing
- Exactly 30 agents from the roster, each rendered as a sprite at a fixed "station"
  position from the manifest (statically posed — no locomotion)
- Per-agent labels (name + role), dark navy rounded panel, thin cyan border,
  attached above the sprite, collision-aware, fading/clustering at low zoom,
  toggleable (all / names only / selected only)
- Click-to-select with an inspector panel (character, role, department, status)
- Left HUD: phase progress bars, overall completion ring, department status list,
  employee activity counts, live data feed panel — driven by a typed mock data
  module with a clean interface so real data can replace it later
- Department status states (working / waiting / idle / opening / black-lit) that
  tint the corresponding backdrop region via code-driven lighting overlays
- Ambient life, all code-driven: hologram glow pulses, screen flicker, neon edge
  breathing, orchestrator aura (particle/shader), floor-path shimmer, occasional
  speech-bubble icons (?, !, coffee) above random working agents
- Reduced-motion mode, pause, label size control
- Asset manifest loading with Zod validation and graceful placeholder fallback
- Static hosting build (no backend required for v1; keep a thin data-provider
  interface so a Cloudflare Worker/Durable Object source can be added in v2)

**Explicitly OUT of this build (do not implement, do not stub beyond interfaces):**

- Walking, pathfinding, navigation meshes, locomotion animation
- Daily routines, state machines, queueing, restroom logic, scenarios
- Durable Objects, WebSockets, D1, R2, Queues
- Audio

Design module boundaries so those can be added without rewriting the renderer.

## Stack

- TypeScript strict, single language end to end
- Vite + React (HUD, panels, inspector, controls, accessibility)
- PixiJS 8 (backdrop, sprites, labels, effects, camera) — React never renders
  world objects; Pixi never renders UI panels
- TailwindCSS for the HUD
- Zod for the manifest schema
- Vitest + Playwright, ESLint, Prettier
- Plain repo (no monorepo needed at this scope): `src/engine`, `src/hud`,
  `src/data`, `src/manifest`, `assets/`, `references/`, `docs/`

## Asset manifest contract

`assets/manifest.json`, validated with Zod at startup:

```jsonc
{
  "worldSpriteScale": 0.34,
  "backdrop": { "base": "building/base_plate.png", "width": 3840, "height": 2160 },
  "occluders": [{ "file": "building/occluder_boardroom_table.png", "depthY": 1712 }],
  "agents": [
    {
      "id": "sung-jin-woo",
      "sprite": "characters/sung-jin-woo_idle_se.png",
      "anchor": "bottom-center",
      "scale": 1.0,
      "mirrorSafe": true,
      "flip": false,
      "station": { "x": 1920, "y": 1080 },
      "status": "production",
    },
  ],
}
```

Rules:

- `station` is in backdrop pixel coordinates; sprite anchor is bottom-center
  (foot contact point)
- Depth sorting: agents and occluders sort by foot/base Y — an agent whose foot Y
  is less than an occluder's `depthY` renders behind it
- `status: "placeholder"` or missing sprite file → labeled placeholder rendering
- Validation errors are listed in a visible dev diagnostics panel, never silent

## Roster

Exactly 30 agents. Use the roster verbatim from `docs/ROSTER.md` (create it from the
list below), one authoritative source, imported everywhere:

Orchestrator: sung-jin-woo (Sung Jin-Woo, Orchestrator).
Engineering: senku (Architect), edward-elric (Module Builder), franky (Worker
Builder), sai (Frontend Builder), kurapika (Data Modeler), gojo-satoru (AI
Engineer), levi (Test Author), sanji (Data Seeder).
Infra & Ops: kisuke-urahara (DevOps), yamato (Infrastructure), trafalgar-law
(Provisioning), reborn (Release Manager), itachi-uchiha (Security Reviewer),
nami (Resource Manager).
Integrations: tanjiro-kamado (Integrations Engineer), finral-roulacase (Email
Specialist), askeladd (Billing Specialist).
Customer: mitsuri-kanroji (Customer Success), thorfinn (Support Engineer),
nico-robin (Docs Writer), riza-hawkeye (Compliance).
Marketing & Design: lelouch-lamperouge (Marketing Strategist), light-yagami
(Marketing Writer), mei-hatsume (Designer), hange-zoe (Prospect Researcher).
C-suite: erwin-smith (CEO), nanami-kento (CFO), armin-arlert (CIO), l (Data Analyst).

Tests must enforce: exactly 30, unique IDs, unique names, one department each,
no duplicate render instances.

## Visual quality bar

The finished screen must be judged against `l3rain-building-style.png` for
atmosphere and `last-prototype-dashboard.png` for characters, and against
`previous-attempt.png` as the anti-goal. Specifically:

- Dark navy environment, cyan accents, restrained department accent colors
- HUD typography and panels at the quality of the V1 attempt's left sidebar
  (that part of V1 was good — keep its visual language)
- No flat vector rooms, no box furniture, no circular avatar badges as bodies
- Labels never cover faces; world text is rendered by code, crisp at all zooms
- Glow effects are restrained: no bloom storms, no party lighting

## Helper tooling to build alongside the app

1. `scripts/cutout.ts` (or shell): batch chroma-key removal, trim, resize-to-512
   for character sprites (document ImageMagick/rembg usage in docs)
2. `scripts/contact-sheet.ts`: compose all current character sprites into one
   grid image at equal height for style-drift QA
3. **Station picker dev mode**: clicking the backdrop in dev logs/copies the pixel
   coordinate and can assign it to a selected agent, writing back to the manifest —
   this is how stations will actually be placed, so build it early
4. Dev diagnostics overlay: manifest errors, FPS, sprite bounds, depth values

## Testing

- Unit: roster invariants, manifest schema, depth-sort ordering, placeholder
  fallback, data-provider interface
- Playwright: app loads, backdrop renders, 30 labels present, selection opens
  inspector, camera controls work, reduced-motion honored, label toggle works

## Milestones (small, committed, resumable)

1. Repo scaffold, strict TS, CI (lint/typecheck/test/build), roster + tests,
   manifest schema + validation, docs skeleton
2. Pixi stage: backdrop loading (or checker placeholder if absent), camera
   (zoom/pan/reset/fit), resolution handling
3. Agent sprites from manifest: anchor/scale/flip, placeholder fallback, depth
   sort vs occluders, station picker dev mode
4. Labels + selection + inspector
5. HUD panels with mock data provider; department status tinting overlays
6. Ambient effects (glow, flicker, aura, path shimmer, speech-bubble icons);
   reduced motion; pause
7. Diagnostics, helper scripts, contact-sheet tool, Playwright suite,
   docs/IMPLEMENTATION_STATUS.md and docs/ART_ASSET_STATUS.md complete

After every milestone: format, lint, typecheck, test, build, update status docs,
commit, report what remains.

## First response required

Do not generate code immediately. First:

1. Verify which reference images and assets exist; report the manifest state
2. Confirm repo state
3. Propose the file layout and the exact files for Milestone 1
4. List any risks you see in the asset contract
5. Then begin Milestone 1 automatically

Do not ask permission unless blocked. Do not deploy anywhere.
