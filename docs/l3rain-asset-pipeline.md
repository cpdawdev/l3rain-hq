# L3RAIN HQ — Asset Production Pipeline (Route A: Painted Backdrop + Sprite Overlay)

This document defines how to produce the illustrated assets that the new engine will render.
The engine draws **nothing** procedurally except UI, labels, glow effects, and motion.
Everything that should look "illustrated" IS an illustration.

Your two existing images are the anchors for everything:

- `references/last-prototype-dashboard.png` — **character identity + chibi style anchor**
- `references/l3rain-building-style.png` — **building style anchor**

Rule #1 of this entire pipeline: **never generate from text alone.**
Every generation includes one of the two anchor images as an image/character/style reference
(img2img, character reference, style reference, or omni-reference — whatever your tool calls it).
Your anchors already contain the style; you are asking the model to _redraw what it can see_,
not to imagine something new. This is why your recipe already works — keep using it.

---

## PART 1 — CHARACTER SPRITES (30 idle sprites first, nothing else)

### 1.1 Deliverable

For v1, exactly **one file per agent**:

```
assets/characters/{agent-id}_idle_se.png
```

- Full body, head to feet, nothing cropped
- Standing idle pose, relaxed, facing **south-east** (front 3/4 view, matching the isometric camera)
- Transparent background (delivered after cutout — see 1.5)
- Same canvas, same scale, same baseline for all 30 (see 1.3)

That is the entire v1 character workload. 30 images. No walk cycles, no sit poses, no
role animations yet. Replacing the badge-figures with these alone closes most of the
visual gap, because the reference images are static scenes too.

### 1.2 Generation prompt template

Use this per character. Paste the identity line from Section 7 of your original build
prompt (the "Character Identity Locks" list) into the `[IDENTITY]` slot — those lines
are already well written and your tool already understands them.

```
[ATTACH: last-prototype-dashboard.png as character/style reference]

Full-body chibi character, exact same art style as the reference image:
polished 2D anime chibi, large expressive eyes, head larger than torso,
clean dark outlines, crisp digital cel shading.

Character: [IDENTITY — paste the identity-lock line for this agent]

Pose: standing idle, relaxed, arms natural, full body visible head to feet,
facing slightly to the right (front three-quarter view).

Framing: single character only, centered, feet visible and resting on an
implied flat floor, no cropping, no other people, no props on the ground.

Background: solid flat chroma green (#00FF00), no gradient, no shadow on
the background, soft contact shadow under the feet only.

No text, no watermark, no frame, no card, no border.
```

Notes:

- **Magenta (#FF00FF)** instead of green if the character has green in their design
  (Senku's hair, Yamato's flak jacket, Mitsuri's hair tips, Finral's robe).
- If your tool has true transparent-background export, still prefer chroma —
  "transparent" exports from image models often have haloed, semi-transparent edges.
- If the pose comes out too dynamic, add: "neutral standing pose, symmetrical weight,
  like a character select screen."

### 1.3 Canvas, scale, and baseline spec (this is what makes 30 sprites match)

| Property                      | Value                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| Generation canvas             | 1024 × 1024                                                            |
| Character height              | 80–88% of canvas height, consistent across all 30                      |
| Feet baseline                 | feet touch an imaginary line at **y = 92%** of canvas height           |
| Export after cutout           | trim transparent pixels, then resize to **512 px height**, keep aspect |
| Anchor point (for the engine) | bottom-center of the trimmed image = foot contact point                |

Exceptions, on purpose:

- **Reborn** is canonically baby-sized — generate at the same canvas but character
  height ~45–50%. The manifest will carry a per-agent scale anyway.
- **Franky** is canonically huge — allow up to 95% height; the engine scale
  compensates. Do not let the model shrink his head to fit — chibi proportions win.

### 1.4 Facing direction and mirroring

- Generate **SE-facing only** for v1. The engine mirrors horizontally to fake SW.
- Mirroring is _wrong_ for asymmetric designs. Flag these in the manifest as
  `mirrorSafe: false` and either accept the flip for v1 or generate a second
  SW sprite for them later: **Edward Elric** (automail arm), **Sanji** (hair over
  one eye / eyebrow), **Sai** (brush hand), **Trafalgar Law** (sword side),
  **Light Yagami** (notebook hand).
- NE/NW (back views) are v2, only needed once characters walk.

### 1.5 Cutout workflow (10 minutes for all 30, scripted)

1. Chroma-key or auto-remove the background. `rembg` works well:
   ```bash
   pip install rembg
   rembg i sung-jin-woo_raw.png sung-jin-woo_idle_se.png
   ```
   For chroma-green backgrounds, ImageMagick is even cleaner:
   ```bash
   magick input.png -fuzz 12% -transparent "#00FF00" output.png
   ```
2. Trim: `magick output.png -trim +repage trimmed.png`
3. Resize to 512 px height: `magick trimmed.png -resize x512 final.png`
4. Inspect edges at 200% zoom — fix green/magenta halos with
   `-channel A -morphology Erode Disk:1` if needed.

Claude Code can write a single script that does 1–3 for a whole folder; ask it to.

### 1.6 Per-sprite QA checklist (30 seconds each)

- [ ] Recognizably the same character as in the Agent Dashboard image
- [ ] Full body, feet visible, nothing cropped
- [ ] Line weight and shading match the other accepted sprites
- [ ] Head-to-body ratio consistent with the set (compare side by side in a contact sheet)
- [ ] Facing SE (front 3/4), not straight-on, not profile
- [ ] Clean alpha edge, no halo
- [ ] No text, frame, or card fragments

Build a **contact sheet** after every 5–6 sprites (all sprites on one canvas at equal
height) — style drift is invisible one image at a time and obvious in a grid.
Re-roll outliers immediately; do not "fix it later."

---

## PART 1.7 — WALK / DIRECTION SHEETS (final animated art)

Until this art lands, the engine renders **animated chibi paper-dolls**: the face
portrait is the head, the body is procedural cel-shaded parts (per-agent palette
sampled from the portrait), with a real walk cycle and four facings. This section
is the drop-in contract that replaces those paper-dolls with baked art — **zero
code changes** once the files + manifest entry exist (`spriteKind:
"directional-sheet"`, Zod-validated by `DirectionalSheetSchema`).

### 1.7.1 Deliverable — one horizontal strip per direction

```
assets/characters/{agent-id}_se.png   ← front, facing screen-right (REQUIRED)
assets/characters/{agent-id}_ne.png   ← back,  facing screen-right (REQUIRED)
assets/characters/{agent-id}_sw.png   ← front, facing screen-left  (optional)
assets/characters/{agent-id}_nw.png   ← back,  facing screen-left  (optional)
```

- **SW / NW are optional.** If omitted, the engine horizontally mirrors SE / NE —
  the same `mirrorSafe` caveat as 1.4 applies (asymmetric designs: ship the extra
  two strips). NE/NW are the **back of the head** (hair, no face).
- The four facings map to the isometric camera exactly like the chibi: SE/SW show
  the face; NE/NW show the back.

### 1.7.2 Strip layout — `[idle frames…][walk frames…]`

Each direction file is a **single horizontal strip**, all frames the same
`frameSize` (width × height), transparent background (delivered after cutout, 1.5):

```
frame:   0        1        2        3        4
        [idle]   [walk-A][walk-B][walk-C][walk-D]
```

- **idle** = 1 frame minimum (a 2-frame breathing loop is nicer). `states.idle.frames`.
- **walk** = **4 frames**, a standard contact → passing → contact → passing cycle
  (limb swing + a subtle vertical bob). `states.walk.frames`.
- Idle frames come first; walk frames immediately after. The engine slices left to
  right at `frameSize.width` (see `sliceFrames`), idle then walk.

### 1.7.3 Canvas, scale, baseline — same rules as 1.3

- Every frame uses the **same canvas, scale and baseline** as the idle sprites
  (1.3): character 80–88% of frame height, **feet on the y = 92% baseline**, foot
  contact = **bottom-center** (the engine anchors there and depth-sorts by foot Y).
- Keep the foot contact point **rock-steady** across all frames of a walk cycle —
  the bob belongs in the body, not the feet, or the agent will skate.
- Per-agent `scale` in the manifest still applies (Reborn ≈ 0.55, Franky ≈ 1.15).

### 1.7.4 Manifest entry (drops in with zero code changes)

```jsonc
{
  "id": "sung-jin-woo",
  "sprite": "characters-portraits/sung-jin-woo.png", // still the head fallback
  "station": { "x": 752, "y": 388 },
  "scale": 1.0,
  "status": "production",
  "spriteKind": "directional-sheet",
  "directionalSheet": {
    "directions": {
      "se": "characters/sung-jin-woo_se.png",
      "ne": "characters/sung-jin-woo_ne.png"
      // "sw"/"nw" optional → mirrored from se/ne
    },
    "states": { "idle": { "frames": 2 }, "walk": { "frames": 4 } },
    "frameSize": { "width": 256, "height": 384 }
  }
}
```

The engine preloads the strips, builds one `AnimatedSprite` per (direction, state),
and the simulation drives which one plays from the agent's live velocity/facing —
identical pose contract to the interim chibi.

---

## PART 2 — BUILDING BACKDROP (2–3 painted layers)

### 2.1 Layer model

| Layer                         | Content                                                                             | Rendered by                       |
| ----------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| **L0 — Base plate**           | floors, walls, ALL furniture, room structure, hallways, doors                       | one big illustration              |
| **L1 — Foreground occluders** | pieces characters must walk _behind_ (front desks, front walls, plants near camera) | cut out of L0 as transparent PNGs |
| **L2 — Light & glow**         | hologram glows, screen light, neon edges, orchestrator aura                         | **code** (PixiJS), not paint      |

Keeping L2 in code is what makes the scene feel alive with zero animation frames:
screens flicker, holograms rotate, the aura pulses — all shader/tween effects on
top of static paint.

### 2.2 Base plate generation prompt

```
[ATTACH: l3rain-building-style.png as style reference]

Isometric cutaway office headquarters, same art style, camera angle, and
color language as the reference image: dark navy environment, white and
slate-gray architecture, cyan neon edge lighting, futuristic tech-office
atmosphere, detailed illustrated furniture, digital painting, crisp and
clean, premium management-game quality.

Layout (single connected building, open-front cutaway):
- upper-left: engineering office, 8 workstations, blueprint wall displays
- upper-center: server room with dark racks and red-green status lights
- upper-right: integrations office with a wall flow-diagram
- center: circular command platform with a curved desk (leave the room
  visually calmer — glow will be added separately)
- lower-left: customer-support office, warm couch corner
- lower-center: marketing studio, whiteboard wall, drafting desks
- lower-right: executive boardroom, wood floor, long table
- connecting hallways with illuminated floor paths, a small cafeteria with
  coffee machines and tables, a lounge with couches and plants, a restroom
  door with a symbol, a water station, a printer nook

IMPORTANT: completely empty of people. No characters, no humans, no figures.
No text anywhere, no labels, no signs with letters, no UI panels, no logos.
Empty, lit, waiting office.
```

Notes:

- **No people, no text** is critical. Labels, signage, and panels come from code —
  that's exactly what was garbled in your original reference image, and code renders
  them pixel-perfect.
- Generate at your tool's max resolution, 16:9. Upscale to **≥ 3840 × 2160** with a
  good upscaler before slicing. Characters at 512 px height imply a big world; a
  small backdrop will look mushy at zoom.
- Expect 5–15 rolls on this image. It is the single most valuable asset in the
  project — spend the iteration budget here.
- Fix local problems with **inpainting/region edits**, not full re-rolls, once the
  overall composition is right.

### 2.3 Matching backdrop and sprites

After the base plate is accepted, do one **calibration test**: place 3 finished
sprites (a tall one, an average one, Reborn) onto the backdrop in an image editor at
the scale you intend. Check that chairs, desks, and doors read correctly against
character height. If furniture reads too big/small, you adjust the **engine's sprite
scale**, never regenerate the backdrop.

Record the winning ratio in the manifest as `worldSpriteScale`.

### 2.4 Foreground occluders (L1)

In an image editor (or ask Claude Code to help with masks):

1. Identify 8–15 objects characters should pass behind: desk fronts near the camera,
   the boardroom table front edge, plants, the reception counter.
2. Cut each from the base plate into its own transparent PNG, **keeping its exact
   pixel position** — export full-canvas-size PNGs with everything else transparent,
   so placement in the engine is just "draw at 0,0 on a higher layer."
3. Name them `assets/building/occluder_{name}.png` and list each in the manifest with
   the **world Y of its base** (the engine depth-sorts sprites against that Y).

For v1 with statically posed characters you can even skip L1 and place characters
only in positions where occlusion never matters. Ship faster; add occluders in v2.

---

## PART 3 — ASSET MANIFEST (contract between art and code)

Single source of truth at `assets/manifest.json`, Zod-validated by the engine:

```jsonc
{
  "worldSpriteScale": 0.34, // from the calibration test
  "backdrop": {
    "base": "building/base_plate.png",
    "width": 3840,
    "height": 2160,
  },
  "occluders": [{ "file": "building/occluder_boardroom_table.png", "depthY": 1712 }],
  "agents": [
    {
      "id": "sung-jin-woo",
      "sprite": "characters/sung-jin-woo_idle_se.png",
      "anchor": "bottom-center",
      "scale": 1.0, // per-agent multiplier (Reborn ≈ 0.55, Franky ≈ 1.15)
      "mirrorSafe": true,
      "station": { "x": 1920, "y": 1080 }, // pixel position on the backdrop
      "status": "production", // or "placeholder"
    },
    // … 29 more
  ],
}
```

Any agent whose sprite is missing gets `status: "placeholder"` and renders as a
dimmed silhouette with a visible `PLACEHOLDER` tag — never as fake final art.

---

## PART 4 — PRODUCTION ORDER (do it in this order)

1. **Base plate** (L0) — iterate until it beats the reference. Everything depends on it.
2. **Calibration test** — 3 sprites on the backdrop, lock `worldSpriteScale`.
3. **30 idle sprites** — batches of 5–6 with contact-sheet QA between batches.
4. **Engine build** (parallel with #3) — Claude Code builds against the manifest using
   placeholders; art drops in without code changes.
5. **L1 occluders** — only if v1 placements need them.
6. _(v2)_ walk frames for 3–4 hero characters, then the rest if it's worth it.

Total art budget estimate: 1 strong evening for the base plate, 2–4 hours for the
sprite batch once the recipe locks. That is the whole distance between your current
screenshot and your reference images.
