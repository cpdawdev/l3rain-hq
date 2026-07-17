import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { AgentAsset, Manifest } from '../manifest/schema';
import { ROSTER } from '../data/roster';

/** How a given agent ends up on screen. Placeholders are always labeled. */
export type RenderPath =
  | 'production-sprite' // final full-body art
  | 'portrait-token' // interim: face portrait as a floating token (deviation 3)
  | 'placeholder-sprite' // full-body file exists but status=placeholder → dimmed + tag
  | 'placeholder-silhouette'; // no usable texture → silhouette + tag

/** Pure decision (unit-tested): spec rule — placeholder status is never presented as final. */
export function resolveRenderPath(
  entry: Pick<AgentAsset, 'status' | 'spriteKind'>,
  textureLoaded: boolean,
): RenderPath {
  if (!textureLoaded) return 'placeholder-silhouette';
  if (entry.status === 'production') return 'production-sprite';
  return entry.spriteKind === 'portrait-token' ? 'portrait-token' : 'placeholder-sprite';
}

export interface AgentVisual {
  id: string;
  entry: AgentAsset;
  container: Container;
  /** foot contact Y in world px — the depth key (zIndex) */
  footY: number;
  /** visual height above the foot point in world px (label anchoring) */
  height: number;
  path: RenderPath;
}

export interface AgentLayerResult {
  visuals: Map<string, AgentVisual>;
  errors: string[];
}

/** Reference sprite height (px) the pipeline delivers; worldSpriteScale maps it to world px. */
const SPRITE_SOURCE_HEIGHT = 512;

/**
 * Builds every roster agent into the sprites layer from the manifest.
 * Missing manifest entries render as labeled silhouettes on a fallback row so
 * all 30 agents are always visible and honestly marked.
 */
export async function buildAgentLayer(
  manifest: Manifest,
  layer: Container,
  worldHeight: number,
  onTap?: (id: string) => void,
): Promise<AgentLayerResult> {
  const errors: string[] = [];
  const visuals = new Map<string, AgentVisual>();
  layer.sortableChildren = true;

  const byId = new Map(manifest.agents.map((a) => [a.id, a]));

  // Preload every texture in ONE concurrent batch, then build synchronously.
  // Sequential await-per-agent loads interleaved with an actively rendering
  // Application stall Pixi's texture pipeline (loads stop resolving after
  // ~10 textures) — see docs/IMPLEMENTATION_STATUS.md "Known engine notes".
  const urls = [
    ...manifest.occluders.map((o) => `./${o.file}`),
    ...manifest.agents.map((a) => `./${a.sprite}`),
  ];
  const textures = new Map<string, Texture>();
  const results = await Promise.allSettled(
    urls.map(async (url) => ({ url, texture: await Assets.load<Texture>(url) })),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') textures.set(r.value.url, r.value.texture);
  }

  // Occluders participate in the same depth space (zIndex = depthY).
  for (const occ of manifest.occluders) {
    const texture = textures.get(`./${occ.file}`);
    if (!texture) {
      errors.push(`occluder: failed to load "${occ.file}" — skipped`);
      continue;
    }
    const sprite = new Sprite(texture);
    sprite.position.set(0, 0); // full-canvas PNGs per the pipeline
    sprite.zIndex = occ.depthY;
    layer.addChild(sprite);
  }

  let missingIndex = 0;

  for (const rosterAgent of ROSTER) {
    let entry = byId.get(rosterAgent.id);
    if (!entry) {
      // Fallback row along the bottom edge; crossCheckRoster already reported it.
      entry = {
        id: rosterAgent.id,
        sprite: `characters/${rosterAgent.id}_idle_se.png`,
        anchor: 'bottom-center',
        scale: 1,
        mirrorSafe: true,
        flip: false,
        station: { x: 80 + missingIndex * 90, y: worldHeight - 40 },
        status: 'placeholder',
        spriteKind: 'full-body',
      };
      missingIndex += 1;
    }

    if (entry.flip && !entry.mirrorSafe) {
      errors.push(`agent ${entry.id}: flip requested but mirrorSafe=false (asymmetric design)`);
    }

    const texture = textures.get(`./${entry.sprite}`) ?? null;
    if (texture === null && entry.status !== 'placeholder') {
      errors.push(`agent ${entry.id}: sprite "${entry.sprite}" failed to load — placeholder`);
    }

    const path = resolveRenderPath(entry, texture !== null);
    const container = new Container();
    container.position.set(entry.station.x, entry.station.y);
    container.zIndex = entry.station.y;

    let height = 0;
    switch (path) {
      case 'production-sprite':
      case 'placeholder-sprite': {
        if (!texture) break;
        height = buildFullBody(container, texture, manifest.worldSpriteScale, entry, path);
        break;
      }
      case 'portrait-token': {
        if (!texture) break;
        height = buildPortraitToken(container, texture, manifest.worldSpriteScale, entry);
        break;
      }
      case 'placeholder-silhouette': {
        height = buildSilhouette(container, manifest.worldSpriteScale, entry);
        break;
      }
    }

    container.eventMode = 'static';
    container.cursor = 'pointer';
    if (onTap) {
      container.on('pointertap', () => {
        onTap(entry.id);
      });
    }

    layer.addChild(container);
    visuals.set(entry.id, {
      id: entry.id,
      entry,
      container,
      footY: entry.station.y,
      height,
      path,
    });
  }

  return { visuals, errors };
}

/** Full-body sprite, bottom-center anchored at the foot point. Returns world height. */
function buildFullBody(
  container: Container,
  texture: Texture,
  worldSpriteScale: number,
  entry: AgentAsset,
  path: RenderPath,
): number {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  const s = worldSpriteScale * entry.scale * (SPRITE_SOURCE_HEIGHT / texture.height);
  sprite.scale.set(entry.flip ? -s : s, s);
  container.addChild(sprite);
  const height = texture.height * s;
  if (path === 'placeholder-sprite') {
    sprite.alpha = 0.55;
    sprite.tint = 0x8899bb;
    container.addChild(tag('PLACEHOLDER', height, worldSpriteScale * entry.scale));
  }
  return height;
}

/**
 * Interim portrait-token (deviation 3): circular face token floating above the
 * station point with a drop shadow and pointer stem — honestly interim, never
 * presented as a full body.
 */
function buildPortraitToken(
  container: Container,
  texture: Texture,
  worldSpriteScale: number,
  entry: AgentAsset,
): number {
  const r = 140 * worldSpriteScale * entry.scale;
  const cy = -(r + 10 * worldSpriteScale * 5.5);

  // drop shadow at the foot point
  const shadow = new Graphics()
    .ellipse(0, 0, r * 0.75, r * 0.26)
    .fill({ color: 0x000000, alpha: 0.32 });
  container.addChild(shadow);

  // pointer stem from foot to token
  const stem = new Graphics()
    .moveTo(0, -2)
    .lineTo(-r * 0.16, cy + r * 0.75)
    .lineTo(r * 0.16, cy + r * 0.75)
    .closePath()
    .fill({ color: 0x67e8f9, alpha: 0.35 });
  container.addChild(stem);

  // token: dark disc, masked portrait, thin cyan ring
  const disc = new Graphics().circle(0, cy, r).fill({ color: 0x0b1226, alpha: 0.92 });
  container.addChild(disc);

  const portrait = new Sprite(texture);
  portrait.anchor.set(0.5);
  portrait.position.set(0, cy);
  const pr = (r - 2) * 2;
  portrait.scale.set(pr / texture.width, pr / texture.height);
  const mask = new Graphics().circle(0, cy, r - 2).fill(0xffffff);
  portrait.mask = mask;
  container.addChild(mask, portrait);

  const ring = new Graphics()
    .circle(0, cy, r)
    .stroke({ color: 0x67e8f9, width: Math.max(1.2, r * 0.06), alpha: 0.85 });
  container.addChild(ring);

  const height = -cy + r;
  container.addChild(tag('INTERIM', height, worldSpriteScale * entry.scale));
  return height;
}

/** Dimmed capsule silhouette + PLACEHOLDER tag (spec placeholder rule). */
function buildSilhouette(
  container: Container,
  worldSpriteScale: number,
  entry: AgentAsset,
): number {
  const h = SPRITE_SOURCE_HEIGHT * worldSpriteScale * entry.scale;
  const w = h * 0.36;
  const g = new Graphics();
  // body capsule
  g.roundRect(-w / 2, -h * 0.62, w, h * 0.62, w / 2).fill({ color: 0x24324f, alpha: 0.5 });
  // head
  g.circle(0, -h * 0.78, h * 0.16).fill({ color: 0x24324f, alpha: 0.5 });
  g.ellipse(0, 0, w * 0.7, w * 0.22).fill({ color: 0x000000, alpha: 0.28 });
  container.addChild(g);
  container.addChild(tag('PLACEHOLDER', h, worldSpriteScale * entry.scale));
  return h;
}

/** Small explicit status chip below the foot point. World-space by design. */
function tag(label: string, _visualHeight: number, scaleHint: number): Container {
  const c = new Container();
  const fontSize = Math.max(9, 62 * scaleHint);
  const text = new Text({
    text: label,
    style: {
      fill: label === 'INTERIM' ? 0xfacc15 : 0xf87171,
      fontSize,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      letterSpacing: 1,
    },
  });
  text.anchor.set(0.5, 0);
  const padX = fontSize * 0.5;
  const padY = fontSize * 0.22;
  const bg = new Graphics()
    .roundRect(
      -text.width / 2 - padX,
      -padY,
      text.width + padX * 2,
      text.height + padY * 2,
      fontSize * 0.35,
    )
    .fill({ color: 0x0b1226, alpha: 0.78 });
  c.addChild(bg, text);
  c.position.set(0, fontSize * 0.5);
  return c;
}
