import { AnimatedSprite, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { AgentPose } from '../sim/Simulation';
import { isFrontFacing, isMirrored, type Facing } from '../sim/facing';

/**
 * Animated chibi paper-dolls (M2.1 workstream 3). The head is the existing face
 * portrait; the body is layered, rounded, cel-shaded parts (torso / arms / legs)
 * with a dark outline and a per-agent palette sampled from the portrait — NOT
 * flat rectangles. Real walk cycle (limb swing + bob), four facings
 * (SE, SW = mirror, NE/NW = back of the head), idle breathing/sway.
 *
 * A common `Doll` interface lets the future baked directional-sheet art
 * (spriteKind "directional-sheet") drop in behind the same pose contract.
 */

export interface Doll {
  /** the display object the engine positions (foot at its origin) */
  readonly root: Container;
  /** visual height above the foot point in world px (label anchoring) */
  readonly height: number;
  update(pose: AgentPose): void;
}

export interface ChibiPalette {
  hair: number;
  skin: number;
  shirt: number;
  pants: number;
  outline: number;
}

// ---- design geometry (units; foot at origin, up = -y) -------------------
const HEAD_R = 30;
const HEAD_CY = -104;
const TORSO_TOP = -92;
const TORSO_BOT = -46;
const TORSO_W = 50;
const LEG_HIP = -48;
const LEG_LEN = 48;
const LEG_W = 15;
const ARM_SHOULDER = -86;
const ARM_LEN = 40;
const ARM_W = 11;
const TOP_Y = HEAD_CY - HEAD_R; // -134
/** design units → world px (tuned so a chibi reads ~like the painted figures) */
const CHIBI_K = 3.4;

export class Chibi implements Doll {
  readonly root: Container;
  readonly height: number;
  private readonly body: Container;
  private readonly legL: Graphics;
  private readonly legR: Graphics;
  private readonly armL: Graphics;
  private readonly armR: Graphics;
  private readonly head: Container;
  private readonly face: Container | null;
  private readonly backHead: Graphics;
  private readonly baseScale: number;

  constructor(faceTexture: Texture | null, palette: ChibiPalette, unitScale: number) {
    this.baseScale = unitScale * CHIBI_K;
    this.root = new Container();
    this.root.scale.set(this.baseScale);

    // contact shadow stays on the floor (not bobbed)
    const shadow = new Graphics().ellipse(0, 0, 20, 6).fill({ color: 0x000000, alpha: 0.3 });
    this.root.addChild(shadow);

    this.body = new Container();
    this.root.addChild(this.body);

    // legs (pivot at hip)
    this.legL = leg(palette);
    this.legR = leg(palette);
    this.legL.position.set(-8, LEG_HIP);
    this.legR.position.set(8, LEG_HIP);

    // back arm behind torso, front arm in front
    this.armL = arm(palette);
    this.armR = arm(palette);
    this.armL.position.set(-TORSO_W / 2 - 1, ARM_SHOULDER);
    this.armR.position.set(TORSO_W / 2 + 1, ARM_SHOULDER);

    const torso = buildTorso(palette);

    // head: back-of-head disc (hair) + face token (portrait), swapped by facing
    this.head = new Container();
    this.head.position.set(0, HEAD_CY);
    this.backHead = buildBackHead(palette);
    this.backHead.visible = false;
    this.face = faceTexture ? buildFace(faceTexture) : null;
    const ring = new Graphics()
      .circle(0, 0, HEAD_R)
      .stroke({ color: palette.outline, width: 2.2, alpha: 0.85 });
    this.head.addChild(this.backHead);
    if (this.face) this.head.addChild(this.face);
    this.head.addChild(ring);

    // paint order: back arm, legs, torso, front arm, head
    this.body.addChild(this.armL, this.legL, this.legR, torso, this.armR, this.head);

    this.height = -TOP_Y * this.baseScale;
  }

  update(pose: AgentPose): void {
    const moving = pose.moving;
    const ph = pose.phase;
    const swing = Math.sin(ph);

    // mirror the whole doll for the left-facing variants (face flips with it)
    this.root.scale.x = isMirrored(pose.facing) ? -this.baseScale : this.baseScale;

    // vertical bob: a walk hop, or a slow idle breath
    const bob = moving ? -Math.abs(Math.sin(ph)) * 4 : Math.sin(ph) * 1.2;
    this.body.position.y = bob;

    // striding legs (lift the leg on its half of the gait) + slight x sway
    const lift = moving ? 8 : 0;
    this.legL.position.set(-8 + swing * 3, LEG_HIP - Math.max(0, swing) * lift);
    this.legR.position.set(8 + swing * 3, LEG_HIP - Math.max(0, -swing) * lift);

    // arms swing opposite the legs (a gentle sway at idle)
    const armSwing = moving ? swing * 0.5 : swing * 0.12;
    this.armL.rotation = armSwing;
    this.armR.rotation = -armSwing;

    // face for SE/SW, back of the head for NE/NW
    const front = isFrontFacing(pose.facing);
    if (this.face) this.face.visible = front;
    this.backHead.visible = !front;
  }

  /** True while the back-of-head disc is shown (NE/NW). Then the face is hidden —
   * back views never show a face. Observable hook for the unit test. */
  get showingBack(): boolean {
    return this.backHead.visible;
  }

  /** True while the face portrait is shown (SE/SW). Null when no portrait loaded. */
  get showingFace(): boolean {
    return this.face !== null && this.face.visible;
  }
}

// ---- part builders ------------------------------------------------------

function leg(p: ChibiPalette): Graphics {
  return new Graphics()
    .roundRect(-LEG_W / 2, 0, LEG_W, LEG_LEN, LEG_W / 2)
    .fill({ color: p.pants })
    .stroke({ color: p.outline, width: 2, alpha: 0.9 })
    // shoe toe cel highlight
    .ellipse(0, LEG_LEN - 3, LEG_W / 2, 4)
    .fill({ color: shade(p.pants, -0.35) });
}

function arm(p: ChibiPalette): Graphics {
  return new Graphics()
    .roundRect(-ARM_W / 2, 0, ARM_W, ARM_LEN, ARM_W / 2)
    .fill({ color: p.shirt })
    .stroke({ color: p.outline, width: 2, alpha: 0.9 })
    // hand
    .circle(0, ARM_LEN - 2, ARM_W / 2 - 0.5)
    .fill({ color: p.skin })
    .stroke({ color: p.outline, width: 1.4, alpha: 0.8 });
}

function buildTorso(p: ChibiPalette): Graphics {
  const g = new Graphics()
    .roundRect(-TORSO_W / 2, TORSO_TOP, TORSO_W, TORSO_BOT - TORSO_TOP, 13)
    .fill({ color: p.shirt })
    .stroke({ color: p.outline, width: 2.4, alpha: 0.9 });
  // cel highlight band across the upper chest
  g.roundRect(-TORSO_W / 2 + 4, TORSO_TOP + 4, TORSO_W - 8, 14, 8).fill({
    color: shade(p.shirt, 0.22),
    alpha: 0.6,
  });
  // collar hint
  g.moveTo(-6, TORSO_TOP + 2)
    .lineTo(0, TORSO_TOP + 12)
    .lineTo(6, TORSO_TOP + 2)
    .stroke({ color: shade(p.shirt, -0.3), width: 2, alpha: 0.8 });
  return g;
}

function buildBackHead(p: ChibiPalette): Graphics {
  const g = new Graphics()
    .circle(0, 0, HEAD_R)
    .fill({ color: p.hair })
    .stroke({ color: p.outline, width: 2, alpha: 0.85 });
  // hair-part sheen + a nape suggestion (no face)
  g.ellipse(-HEAD_R * 0.3, -HEAD_R * 0.35, HEAD_R * 0.45, HEAD_R * 0.3).fill({
    color: shade(p.hair, 0.28),
    alpha: 0.7,
  });
  g.roundRect(-HEAD_R * 0.5, HEAD_R * 0.35, HEAD_R, HEAD_R * 0.55, 6).fill({
    color: shade(p.hair, -0.25),
    alpha: 0.9,
  });
  return g;
}

function buildFace(texture: Texture): Container {
  const c = new Container();
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const d = (HEAD_R - 1.5) * 2;
  sprite.width = d;
  sprite.height = d;
  const mask = new Graphics().circle(0, 0, HEAD_R - 1.5).fill(0xffffff);
  sprite.mask = mask;
  c.addChild(mask, sprite);
  return c;
}

// ---- palette sampling ---------------------------------------------------

interface RGB {
  r: number;
  g: number;
  b: number;
}

function toHex({ r, g, b }: RGB): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

export function shade(color: number, f: number): number {
  let r = (color >> 16) & 255;
  let g = (color >> 8) & 255;
  let b = color & 255;
  if (f > 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return toHex({ r: r | 0, g: g | 0, b: b | 0 });
}

/** Cheap saturation proxy (max-min channel spread, 0..1). */
function saturation({ r, g, b }: RGB): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/** Reject chroma-key leftovers (magenta / green backgrounds) so they never tint a body. */
function isChroma({ r, g, b }: RGB): boolean {
  return (r > 165 && b > 165 && g < 115) || (g > 160 && r < 115 && b < 115);
}

/** Blend a color toward its own grey (lower saturation) — for tasteful clothing. */
function desaturate(rgb: RGB, amount: number): RGB {
  const l = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return {
    r: rgb.r + (l - rgb.r) * amount,
    g: rgb.g + (l - rgb.g) * amount,
    b: rgb.b + (l - rgb.b) * amount,
  };
}

function rgbFromHex(color: number): RGB {
  return { r: (color >> 16) & 255, g: (color >> 8) & 255, b: color & 255 };
}

/**
 * Sample a per-agent palette from the portrait: hair from the top band, skin
 * from the centre. The face crops don't reliably contain clothing, so the shirt
 * is a muted, darkened tone derived from the sampled hair (still "from the
 * portrait") unless a clean, distinct, non-chroma shoulder band exists. Chroma
 * backgrounds are rejected. Falls back to a deterministic hashed palette when a
 * region has no usable pixels. Runs once at build; never throws.
 */
export function samplePalette(texture: Texture, seedId: string): ChibiPalette {
  const fallback = hashPalette(seedId);
  const source = (texture.source as { resource?: unknown } | undefined)?.resource;
  if (typeof document === 'undefined' || !source) return fallback;
  try {
    const n = 28;
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(source as CanvasImageSource, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);

    // central columns only — the corners of a face crop are background
    const band = (y0: number, y1: number, x0: number, x1: number): RGB | null => {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = Math.floor(y0 * n); y < Math.floor(y1 * n); y += 1) {
        for (let x = Math.floor(x0 * n); x < Math.floor(x1 * n); x += 1) {
          const i = (y * n + x) * 4;
          if ((data[i + 3] ?? 0) < 140) continue;
          const px = { r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 };
          if (isChroma(px)) continue;
          r += px.r;
          g += px.g;
          b += px.b;
          count += 1;
        }
      }
      if (count < 6) return null;
      return { r: r / count, g: g / count, b: b / count };
    };

    const hair = band(0.06, 0.32, 0.22, 0.78);
    const skin = band(0.44, 0.64, 0.36, 0.64);

    // clothing: prefer a clean, distinct shoulder band; else a muted hair tone
    const shoulder = band(0.82, 0.99, 0.24, 0.76);
    const hairRgb = hair ?? rgbFromHex(fallback.hair);
    let shirtRgb: RGB;
    if (shoulder && saturation(shoulder) > 0.14 && (!skin || dist3(shoulder, skin) > 40)) {
      shirtRgb = shoulder;
    } else {
      // desaturate + darken the hair into a wearable clothing tone
      shirtRgb = rgbFromHex(shade(toHex(desaturate(hairRgb, 0.45)), -0.15));
    }

    return {
      hair: hair ? toHex(hair) : fallback.hair,
      skin: skin ? toHex(skin) : fallback.skin,
      shirt: toHex(shirtRgb),
      pants: shade(toHex(shirtRgb), -0.42),
      outline: 0x0d1420,
    };
  } catch {
    return fallback;
  }
}

function dist3(a: RGB, b: RGB): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Deterministic, distinct-per-agent palette (fallback + tests). */
export function hashPalette(id: string): ChibiPalette {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  // muted, clothing-like tones (never neon)
  const shirt = hslToHex(hue, 0.4, 0.44);
  return {
    hair: hslToHex((hue + 150) % 360, 0.3, 0.3),
    skin: 0xf1c9a5,
    shirt,
    pants: shade(shirt, -0.42),
    outline: 0x0d1420,
  };
}

function hslToHex(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number;
  let g: number;
  let b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

// ---- directional-sheet consumer (future baked art) ---------------------

/**
 * Slice a horizontal strip [idle…][walk…] into per-frame rectangles. Pure so
 * the layout math is unit-tested even before any real sheet exists.
 */
export function sliceFrames(
  frameW: number,
  frameH: number,
  count: number,
  offset = 0,
): Rectangle[] {
  const rects: Rectangle[] = [];
  for (let i = 0; i < count; i += 1) {
    rects.push(new Rectangle((offset + i) * frameW, 0, frameW, frameH));
  }
  return rects;
}

interface SheetTextures {
  se: Texture;
  sw?: Texture | undefined;
  ne: Texture;
  nw?: Texture | undefined;
}

interface SheetSpec {
  idleFrames: number;
  walkFrames: number;
  frameW: number;
  frameH: number;
  unitScale: number;
}

/**
 * Renders baked directional sheets behind the same `Doll` contract as the
 * procedural chibi — so a manifest entry can switch to final art with no engine
 * changes. Builds one AnimatedSprite per (base direction, state).
 */
export class DirectionalDoll implements Doll {
  readonly root: Container;
  readonly height: number;
  private readonly sprites = new Map<string, AnimatedSprite>();
  private current: AnimatedSprite | null = null;
  private readonly baseScale: number;

  constructor(sheets: SheetTextures, spec: SheetSpec) {
    this.root = new Container();
    this.baseScale = spec.unitScale;
    this.root.scale.set(this.baseScale);
    this.height = spec.frameH * this.baseScale;

    const bases: Facing[] = ['se', 'ne']; // sw/nw are mirrors of these
    for (const base of bases) {
      const tex = base === 'se' ? sheets.se : sheets.ne;
      const idle = framesFrom(tex, spec.frameW, spec.frameH, spec.idleFrames, 0);
      const walk = framesFrom(tex, spec.frameW, spec.frameH, spec.walkFrames, spec.idleFrames);
      this.sprites.set(`${base}:idle`, this.makeSprite(idle, 3));
      this.sprites.set(`${base}:walk`, this.makeSprite(walk, 8));
    }
    // explicit sw/nw sheets override the mirror if provided
    if (sheets.sw) this.addExplicit('sw', sheets.sw, spec);
    if (sheets.nw) this.addExplicit('nw', sheets.nw, spec);
  }

  private addExplicit(base: Facing, tex: Texture, spec: SheetSpec): void {
    const idle = framesFrom(tex, spec.frameW, spec.frameH, spec.idleFrames, 0);
    const walk = framesFrom(tex, spec.frameW, spec.frameH, spec.walkFrames, spec.idleFrames);
    this.sprites.set(`${base}:idle`, this.makeSprite(idle, 3));
    this.sprites.set(`${base}:walk`, this.makeSprite(walk, 8));
  }

  private makeSprite(textures: Texture[], fps: number): AnimatedSprite {
    const s = new AnimatedSprite(textures.length ? textures : [Texture.EMPTY]);
    s.anchor.set(0.5, 1);
    s.animationSpeed = fps / 60;
    s.visible = false;
    this.root.addChild(s);
    return s;
  }

  update(pose: AgentPose): void {
    const state = pose.moving ? 'walk' : 'idle';
    // fall back to the mirror base when an explicit sheet is absent
    const explicit = this.sprites.has(`${pose.facing}:${state}`);
    const key = explicit
      ? `${pose.facing}:${state}`
      : `${isMirrored(pose.facing) ? (isFrontFacing(pose.facing) ? 'se' : 'ne') : pose.facing}:${state}`;
    const next = this.sprites.get(key) ?? null;
    if (next !== this.current) {
      if (this.current) {
        this.current.stop();
        this.current.visible = false;
      }
      this.current = next;
      if (next) {
        next.visible = true;
        next.play();
      }
    }
    // mirror only when using a base sheet for a left-facing pose
    const mirror = !explicit && isMirrored(pose.facing);
    this.root.scale.x = mirror ? -this.baseScale : this.baseScale;
  }
}

function framesFrom(
  sheet: Texture,
  frameW: number,
  frameH: number,
  count: number,
  offset: number,
): Texture[] {
  return sliceFrames(frameW, frameH, count, offset).map(
    (frame) => new Texture({ source: sheet.source, frame }),
  );
}
